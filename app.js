/* KOM27 Einsatzplanung – Master- und Techniker-Ansicht */
const CFG = Object.assign({ supabaseUrl: '', supabaseAnonKey: '', appUrl: '', senderName: 'Basti', sharepointUrl: '', demoAdmin: 'master@demo.de' }, window.KOM27_CONFIG || {});
const DEMO = !(CFG.supabaseUrl && CFG.supabaseAnonKey);
const APP_URL = () => CFG.appUrl || location.href.split('#')[0].split('?')[0];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtDate = (iso, year) => { const d = new Date(iso + 'T12:00:00'); return WD[d.getDay()] + ' ' + iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + (year ? iso.slice(0, 4) : ''); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));
const nowISO = () => new Date().toISOString();
const STATUS = ['geplant', 'angefragt', 'zugesagt', 'abgesagt'];
const ST_LABEL = { geplant: 'geplant', angefragt: 'angefragt', zugesagt: 'zugesagt ✓', abgesagt: 'abgesagt ✗' };

function toast(msg) {
  if (/row-level security|permission denied|JWT/i.test(String(msg))) msg = 'Keine Berechtigung – vermutlich wurde in einem anderen Tab ein anderes Konto angemeldet. Bitte Seite neu laden und als Master anmelden.';
  const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), msg.length > 80 ? 6000 : 2600); }
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

/* ---------------- Datenschicht ---------------- */
const DemoStore = {
  K: 'kom27-demo-v1', U: 'kom27-demo-user',
  d() { return ls.get(this.K) || { plan: null, techs: [], asg: {} }; },
  w(d) { ls.set(this.K, d); },
  async session() { const e = ls.get(this.U); return e ? { email: e } : null; },
  async signIn(email) { ls.set(this.U, email.trim().toLowerCase()); return { email }; },
  async signUp(email) { return this.signIn(email); },
  async reset() { throw new Error('Im Demo-Modus nicht verfügbar.'); },
  async signOut() { ls.del(this.U); },
  async isAdmin(email) { return email === CFG.demoAdmin; },
  async isViewer(email) { return (this.d().viewers || []).some((v) => v.email === email); },
  async getViewers() { return this.d().viewers || []; },
  async saveViewer(v) { const d = this.d(); d.viewers = (d.viewers || []).filter((x) => x.email !== v.email).concat([v]); this.w(d); },
  async deleteViewer(email) { const d = this.d(); d.viewers = (d.viewers || []).filter((x) => x.email !== email); this.w(d); },
  async loadAll() {
    const d = this.d(); const me = (d.techs || []).find((t) => (t.email || '').toLowerCase() === ls.get(this.U));
    const coll = Object.values(d.asg || {}).filter((a) => me && a.tech_id && a.tech_id !== me.id && ['angefragt', 'zugesagt'].includes(a.status)).map((a) => ({ slot_key: a.slot_key, name: ((d.techs || []).find((t) => t.id === a.tech_id) || {}).name || '', status: a.status }));
    if (!d.kb) { d.kb = KB_DEMO(); this.w(d); }
    const kom = Object.values(d.asg || {}).filter((a) => a.tech_id && ['zugesagt', 'angefragt'].includes(a.status)).map((a) => ({ slot_key: a.slot_key, status: a.status, name: ((d.techs || []).find((t) => t.id === a.tech_id) || {}).name || '?' }));
    const viewer = (d.viewers || []).some((v) => v.email === ls.get(this.U));
    return { plan: d.plan, techs: viewer ? [] : d.techs || [], asg: viewer ? {} : d.asg || {}, unav: viewer ? [] : d.unav || [], coll, offers: d.offers || [], kb: d.kb, kom,
      interest: (d.interest || []).filter((i) => !me || S.admin || i.tech_id === me.id) };
  },
  async saveOffers(rows) { const d = this.d(); d.offers = (d.offers || []).filter((o) => !rows.some((r) => r.slot_key === o.slot_key)).concat(rows); this.w(d); },
  async deleteOffers(keys) { const d = this.d(); d.offers = (d.offers || []).filter((o) => !keys.includes(o.slot_key)); d.interest = (d.interest || []).filter((i) => !keys.includes(i.slot_key)); this.w(d); },
  async addInterest(key, tech_id) { const d = this.d(); d.interest = (d.interest || []).filter((i) => !(i.slot_key === key && i.tech_id === tech_id)); d.interest.push({ slot_key: key, tech_id, created_at: nowISO() }); this.w(d); },
  async removeInterest(key, tech_id) { const d = this.d(); d.interest = (d.interest || []).filter((i) => !(i.slot_key === key && i.tech_id === tech_id)); this.w(d); },
  async logTime(email, key, st, en, brk, note) {
    const d = this.d(); const t = d.techs.find((x) => (x.email || '').toLowerCase() === email); const a = d.asg[key];
    if (!t || !a || a.tech_id !== t.id || a.status !== 'zugesagt') throw new Error('Kein zugesagter Einsatz gefunden.');
    Object.assign(a, { actual_start: st, actual_end: en, break_min: brk, time_note: note || '', time_at: nowISO() }); this.w(d);
  },
  async setUnav(tech_id, day, note) { const d = this.d(); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && u.day === day)); d.unav.push({ tech_id, day, note: note || '', created_at: nowISO() }); this.w(d); },
  async clearUnav(tech_id, day) { const d = this.d(); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && u.day === day)); this.w(d); },
  async setUnavMany(tech_id, days, note) { const d = this.d(); const set = new Set(days); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && set.has(u.day))); days.forEach((day) => d.unav.push({ tech_id, day, note: note || '' })); this.w(d); },
  async clearUnavMany(tech_id, days) { const d = this.d(); const set = new Set(days); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && set.has(u.day))); this.w(d); },
  async savePlan(plan) { const d = this.d(); d.plan = plan; this.w(d); },
  async saveKb(e) { const d = this.d(); d.kb = (d.kb || []).filter((x) => x.id !== e.id).concat([e]); this.w(d); return e; },
  async deleteKb(id) { const d = this.d(); d.kb = (d.kb || []).filter((x) => x.id !== id); this.w(d); },
  async saveTech(t) { const d = this.d(); const i = d.techs.findIndex((x) => x.id === t.id); if (i >= 0) d.techs[i] = t; else d.techs.push(t); this.w(d); return t; },
  async deleteTech(id) { const d = this.d(); d.techs = d.techs.filter((t) => t.id !== id); Object.values(d.asg).forEach((a) => { if (a.tech_id === id) delete d.asg[a.slot_key]; }); this.w(d); },
  async saveAssignments(list) { const d = this.d(); list.forEach((a) => (d.asg[a.slot_key] = a)); this.w(d); },
  async deleteAssignments(keys) { const d = this.d(); keys.forEach((k) => delete d.asg[k]); this.w(d); },
  async savePush() {}, async deletePush() {},
  async techSignal(email, key, ok, note) {
    const d = this.d(); const t = d.techs.find((x) => (x.email || '').toLowerCase() === email); const a = d.asg[key];
    if (!t || !a || a.tech_id !== t.id || !['angefragt', 'geplant'].includes(a.status)) throw new Error('Kein offener Einsatz gefunden.');
    Object.assign(a, { tech_reply: ok ? 'kann' : 'kann_nicht', tech_reply_note: note || '', tech_reply_at: nowISO() }); this.w(d);
  },
  async respond(email, key, status, note) {
    const d = this.d(); const a = d.asg[key];
    const owner = a && d.techs.find((x) => x.id === a.tech_id);
    const own = owner && (owner.email || '').toLowerCase() === email && !(owner.manager_email || '').trim();
    const boss = owner && (owner.manager_email || '').trim().toLowerCase() === email;
    if (!a || !(own || boss)) throw new Error('Kein Einsatz gefunden oder keine Berechtigung.');
    const t = owner;
    a.status = status; a.note = note || ''; a.updated_at = nowISO();
    if (status === 'abgesagt') a.declined = [...new Set([...(a.declined || []), t.id])];
    this.w(d);
  }
};

function makeSupabaseStore() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session ? { email: data.session.user.email.toLowerCase() } : null; },
    async signIn(email, pw) { chk(await sb.auth.signInWithPassword({ email, password: pw })); return { email: email.toLowerCase() }; },
    async signUp(email, pw) { const d = chk(await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: APP_URL() } })); return d.session ? { email: email.toLowerCase() } : null; },
    async reset(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL() })); },
    async setPassword(pw) { chk(await sb.auth.updateUser({ password: pw })); },
    async signOut() { await sb.auth.signOut(); },
    async deleteMe() { chk(await sb.rpc('delete_my_account')); await sb.auth.signOut(); },
    async isAdmin() { return !!chk(await sb.rpc('is_admin')); },
    async isViewer() { const r = await sb.rpc('is_viewer'); return !r.error && !!r.data; },
    async getViewers() { const r = await sb.from('kom_viewers').select('*').order('name'); return r.error ? [] : r.data; },
    async saveViewer(v) { chk(await sb.from('kom_viewers').upsert(v)); },
    async deleteViewer(email) { chk(await sb.from('kom_viewers').delete().eq('email', email)); },
    async loadAll() {
      const [p, t, a] = await Promise.all([sb.from('plan').select('data').eq('id', 1).maybeSingle(), sb.from('technicians').select('*').order('name'), sb.from('assignments').select('*')]);
      const asg = {}; chk(a).forEach((x) => (asg[x.slot_key] = x));
      const u = await sb.from('unavailability').select('tech_id, day, note, created_at'); // fehlt die Tabelle noch, einfach leer
      const [of, oi] = await Promise.all([sb.from('offers').select('*'), sb.from('offer_interest').select('*')]);
      const ps = await sb.from('push_subscriptions').select('email'); // Admin sieht alle, Techniker nur eigene
      const co = await sb.rpc('my_colleagues'); // wer am selben Tag mit im Einsatz ist (fehlt die Funktion: leer)
      const kb = await sb.from('kb_entries').select('*'); // KOM27-Infos (fehlt die Tabelle: leer)
      const ko = await sb.rpc('kom_overview'); // nur für KOM27-Zugänge: wer ist wo eingeteilt (Name + Status)
      return { plan: chk(p) ? p.data.data : null, techs: chk(t), asg, unav: u.error ? [] : u.data, pushEmails: ps.error ? [] : ps.data.map((x) => x.email.toLowerCase()), coll: co.error ? [] : co.data || [], offers: of.error ? [] : of.data, interest: oi.error ? [] : oi.data, kb: kb.error ? [] : kb.data, kom: ko.error ? [] : ko.data || [] };
    },
    async setUnav(tech_id, day, note) { chk(await sb.from('unavailability').upsert({ tech_id, day, note: note || '' })); },
    async clearUnav(tech_id, day) { chk(await sb.from('unavailability').delete().eq('tech_id', tech_id).eq('day', day)); },
    async setUnavMany(tech_id, days, note) { chk(await sb.from('unavailability').upsert(days.map((day) => ({ tech_id, day, note: note || '' })))); },
    async clearUnavMany(tech_id, days) { chk(await sb.from('unavailability').delete().eq('tech_id', tech_id).in('day', days)); },
    async savePlan(plan) { chk(await sb.from('plan').upsert({ id: 1, data: plan, imported_at: plan.importedAt })); },
    async saveTech(t) { return chk(await sb.from('technicians').upsert(Object.assign({}, t, { email: t.email || null })).select().single()); },
    async deleteTech(id) { chk(await sb.from('technicians').delete().eq('id', id)); },
    async saveAssignments(list) { if (list.length) chk(await sb.from('assignments').upsert(list)); },
    async deleteAssignments(keys) { if (keys.length) chk(await sb.from('assignments').delete().in('slot_key', keys)); },
    async respond(_email, key, status, note) { chk(await sb.rpc('respond', { p_slot: key, p_status: status, p_note: note || '' })); },
    async techSignal(_email, key, ok, note) { chk(await sb.rpc('tech_signal', { p_slot: key, p_ok: ok, p_note: note || '' })); },
    async newCalToken() { return chk(await sb.rpc('new_cal_token')); },
    async verifyLink(token_hash, type) { chk(await sb.auth.verifyOtp({ token_hash, type })); },
    async saveOffers(rows) { if (rows.length) chk(await sb.from('offers').upsert(rows)); },
    async deleteOffers(keys) { if (keys.length) chk(await sb.from('offers').delete().in('slot_key', keys)); },
    async addInterest(key, tech_id) { chk(await sb.from('offer_interest').upsert({ slot_key: key, tech_id })); },
    async removeInterest(key, tech_id) { chk(await sb.from('offer_interest').delete().eq('slot_key', key).eq('tech_id', tech_id)); },
    async logTime(_email, key, st, en, brk, note) { chk(await sb.rpc('log_time', { p_slot: key, p_start: st, p_end: en, p_break: brk, p_note: note || '' })); },
    async getSync() { const r = await sb.from('excel_sync').select('share_url, hash, fetched_at, changed_at, last_try, last_error').eq('id', 1).maybeSingle(); return r.error ? null : r.data; },
    async getSyncFile() { return chk(await sb.from('excel_file').select('hash, b64').eq('id', 1).maybeSingle()); },
    async syncNow() { const { data, error } = await sb.functions.invoke('excel-sync', { body: {} }); if (error) throw error; return data || {}; },
    async setShareUrl(u) { chk(await sb.from('excel_sync').upsert({ id: 1, share_url: u || null })); },
    async saveKb(e) { return chk(await sb.from('kb_entries').upsert(e).select().single()); },
    async deleteKb(id) { chk(await sb.from('kb_entries').delete().eq('id', id)); },
    async savePush(row) { chk(await sb.from('push_subscriptions').upsert(row)); },
    async deletePush(endpoint) { chk(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); }
  };
}
const store = DEMO ? DemoStore : makeSupabaseStore();

/* ---------------- Zustand ---------------- */
const S = { user: null, admin: false, plan: null, techs: [], asg: {}, unav: [], tab: 'plan', month: '', onlyOpen: false, recovery: false };

async function reload() { const d = await store.loadAll(); S.plan = d.plan && window.KOM27Parser && KOM27Parser.mergeDays ? Object.assign({}, d.plan, { days: KOM27Parser.mergeDays(d.plan.days) }) : d.plan; S.techs = d.techs; S.asg = d.asg; S.unav = d.unav || []; S.pushEmails = new Set(d.pushEmails || []); S.coll = d.coll || []; S.offers = d.offers || []; S.interest = d.interest || []; S.kb = d.kb || []; S.komAsg = {}; (d.kom || []).forEach((x) => (S.komAsg[x.slot_key] = x)); S.viewers = (S.admin || S.viewer) && store.getViewers ? await store.getViewers() : []; S.sync = S.admin && store.getSync ? await store.getSync().catch(() => null) : null; }
const offerOf = (key) => (S.offers || []).find((o) => o.slot_key === key);
const interestOf = (key) => (S.interest || []).filter((i) => i.slot_key === key);

/* ---------------- Flüssige Darstellung ---------------- */
// Signatur der fachlichen Daten (ohne Zeitstempel) – ändert sich nichts, wird nicht neu gezeichnet
function dataSig() {
  const a = Object.values(S.asg || {}).map((x) => [x.slot_key, x.tech_id, x.status, x.note || '', (x.declined || []).join(','), x.actual_start || '', x.actual_end || '', x.break_min ?? '', x.tech_reply || '']).sort().join('|');
  const u = (S.unav || []).map((x) => x.tech_id + x.day + (x.note || '')).sort().join('|');
  const t = (S.techs || []).map((x) => [x.id, x.name, x.email, x.active, x.aliases, x.manager_email, x.company].join(',')).join('|');
  const kms = Object.values(S.komAsg || {}).map((x) => x.slot_key + x.status + x.name).sort().join('|');
  const kbs = kms + (S.kb || []).map((x) => x.id + (x.updated_at || '')).sort().join('|');
  const o = (S.offers || []).map((x) => x.slot_key).sort().join('|') + '#' + (S.interest || []).map((x) => x.slot_key + x.tech_id).sort().join('|');
  return [a, u, t, o, kbs, S.plan ? S.plan.importedAt + '/' + rmCount(S.plan) : '', S.sync ? (S.sync.hash || '') + (S.sync.last_error || '') + (S.sync.share_url ? 1 : 0) : '', (S.coll || []).map((c) => c.slot_key + c.name + c.status).sort().join('|')].join('§');
}
// neu zeichnen, ohne dass die Seite springt: ein Element (anchor) bleibt an derselben Stelle im Bildschirm
function paint(anchorSel) {
  const anc = anchorSel ? document.querySelector(anchorSel) : null;
  const top = anc ? anc.getBoundingClientRect().top : null; const y = window.scrollY;
  S.admin && !S.preview ? renderMaster() : S.viewer ? renderKom() : renderTech();
  const n = anchorSel ? document.querySelector(anchorSel) : null;
  if (n && top !== null) window.scrollBy(0, n.getBoundingClientRect().top - top); else window.scrollTo(0, y);
  S.sig = dataSig();
}
const calm = (ms) => (S.calmUntil = Date.now() + (ms || 2500)); // kurz nach eigener Änderung kein Live-Neuzeichnen
// Änderung sofort anzeigen, im Hintergrund speichern; bei Fehler zurückdrehen
async function optimistic(apply, save, anchorSel, undo) {
  calm(); apply(); paint(anchorSel);
  try { await save(); calm(1500); return true; } catch (e) { if (undo) undo(); paint(anchorSel); toast('Nicht gespeichert: ' + e.message); return false; }
}
// kleines Auswahlmenü für den Status (statt Durchklicken)
function closeMenu() { document.querySelectorAll('.stmenu').forEach((x) => x.remove()); document.removeEventListener('keydown', menuKey); }
function menuKey(e) { if (e.key === 'Escape') closeMenu(); }
function statusMenu(btn, key, pick) {
  closeMenu();
  const a = S.asg[key]; if (!a) return; const r = btn.getBoundingClientRect();
  const m = document.createElement('div'); m.className = 'stmenu'; m.setAttribute('role', 'menu');
  m.innerHTML = STATUS.map((st) => `<button role="menuitem" data-st="${st}" class="${a.status === st ? 'on' : ''}"><span class="lg ${st}"></span>${ST_LABEL[st]}${a.status === st ? ' ✓' : ''}</button>`).join('')
    + (a.note ? `<div class="stm-note">💬 ${esc(a.note)}</div>` : '') + (a.updated_at ? `<div class="stm-note muted">zuletzt ${esc(ago(a.updated_at))}</div>` : '');
  document.body.appendChild(m);
  const w = m.offsetWidth; const h = m.offsetHeight;
  let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'; m.style.top = top + 'px';
  m.querySelectorAll('[data-st]').forEach((x) => (x.onclick = (e) => { e.stopPropagation(); closeMenu(); pick(x.dataset.st); }));
  m.onclick = (e) => e.stopPropagation();
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  document.addEventListener('keydown', menuKey);
  const y0 = window.scrollY; const onScroll = () => { if (!document.querySelector('.stmenu')) return window.removeEventListener('scroll', onScroll); if (Math.abs(window.scrollY - y0) > 60) { closeMenu(); window.removeEventListener('scroll', onScroll); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  m.querySelector('button.on, button').focus();
}
function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (isNaN(min)) return ''; if (min < 1) return 'gerade eben'; if (min < 60) return 'vor ' + min + ' Min.';
  const h = Math.round(min / 60); if (h < 24) return 'vor ' + h + ' Std.'; const d = Math.round(h / 24); return d === 1 ? 'gestern' : 'vor ' + d + ' Tagen';
}
// unbesetzte Einsätze an alle ausschreiben
async function offerSlots(keys, anchorSel) {
  if (!keys.length) return;
  const rows = keys.map((k) => ({ slot_key: k, note: '' })); const po = S.offers;
  const ok = await optimistic(() => { S.offers = (S.offers || []).filter((o) => !keys.includes(o.slot_key)).concat(rows.map((r) => Object.assign({ created_at: nowISO() }, r))); }, () => store.saveOffers(rows), anchorSel, () => (S.offers = po));
  if (!ok) return;
  const dates = [...new Set(allSlots().filter((x) => keys.includes(x.key)).map((x) => x.date))].sort();
  const ids = S.techs.filter((t) => t.active !== false && t.email).map((t) => t.id);
  notify('techs', ids, 'Offener Einsatz KOM27 – hast du Zeit?', `${dates.slice(0, 4).map((d) => fmtDate(d)).join(', ')}${dates.length > 4 ? ' …' : ''} · in der App auf „Ich hätte Zeit“ tippen`, 'offer');
  toast(`${keys.length === 1 ? 'Einsatz' : keys.length + ' Einsätze'} ausgeschrieben – Push an alle mit 🔔`);
}

/* ---------------- Tage / Plätze von Hand entfernen ---------------- */
// Entfernte Einträge stehen in plan.removed und werden bei jedem neuen Einlesen wieder herausgenommen.
const rmCount = (p) => (p && p.removed ? p.removed.days.length + p.removed.slots.length : 0);
// Fingerabdruck eines Platzes/Tages: ändert sich die Excel dort, gilt das Entfernen nicht mehr
const slotSig = (s) => [s.zeit || '', s.va || '', s.excelName || ''].join('|');
const daySig = (d) => d.slots.map(slotSig).sort().join('¦');
function applyRemovals(plan, rem) {
  const rd = {}; ((rem && rem.days) || []).forEach((x) => (rd[x.date] = x)); const rs = {}; ((rem && rem.slots) || []).forEach((x) => (rs[x.key] = x));
  const out = { days: [], slots: [] }; const back = [];
  plan.days = plan.days.filter((d) => {
    const r = rd[d.date]; if (!r) return true;
    if (r.sig && r.sig !== daySig(d)) { back.push(`${fmtDate(d.date)}: Tag war entfernt, hat sich in der Excel geändert – wieder eingeblendet`); return true; }
    out.days.push({ date: d.date, day: d, sig: daySig(d) }); return false;
  });
  plan.days.forEach((d) => { d.slots = d.slots.filter((s) => {
    const r = rs[s.key]; if (!r) return true;
    if (r.sig && r.sig !== slotSig(s)) { back.push(`${fmtDate(d.date)}: entfernter Platz hat sich in der Excel geändert (jetzt ${s.excelName ? s.excelName + ', ' : ''}${s.zeit || 'Zeit offen'}) – wieder eingeblendet`); return true; }
    out.slots.push({ key: s.key, date: d.date, slot: s, sig: slotSig(s) }); return false;
  }); });
  plan.removed = out; return back;
}
async function removeFromPlan(kind, id) {
  const p = JSON.parse(JSON.stringify(S.plan)); const rem = p.removed || { days: [], slots: [] };
  let keys = []; let what = '';
  if (kind === 'day') {
    const d = p.days.find((x) => x.date === id); if (!d) return;
    keys = d.slots.map((s) => s.key); what = fmtDate(id); rem.days.push({ date: id, day: d, sig: daySig(d) }); p.days = p.days.filter((x) => x !== d);
  } else {
    const d = p.days.find((x) => x.slots.some((s) => s.key === id)); if (!d) return;
    const sl = d.slots.find((s) => s.key === id); keys = [id]; what = `${fmtDate(d.date)} ${sl.zeit || ''}`.trim();
    rem.slots.push({ key: id, date: d.date, slot: sl, sig: slotSig(sl) }); d.slots = d.slots.filter((s) => s.key !== id);
  }
  const asg = keys.map((k) => S.asg[k]).filter(Boolean);
  const active = asg.filter((a) => a.tech_id && a.status !== 'abgesagt');
  if (active.length) {
    const names = [...new Set(active.map((a) => ((techById(a.tech_id) || {}).name || '?').split(' ')[0]))].join(', ');
    if (!confirm(`${what}: ${names} ist dafür eingeteilt.\n\nDie Einteilung wird gelöscht${active.some((a) => a.status !== 'geplant') ? ' und per Push Bescheid gegeben' : ''}. Entfernen?`)) return;
  }
  p.removed = rem;
  const prevPlan = S.plan; const prevAsg = Object.assign({}, S.asg);
  const ok = await optimistic(() => { S.plan = p; keys.forEach((k) => delete S.asg[k]); },
    async () => { await store.savePlan(p); if (asg.length) await store.deleteAssignments(asg.map((a) => a.slot_key)); }, null,
    () => { S.plan = prevPlan; S.asg = prevAsg; });
  if (!ok) return;
  active.filter((a) => a.status !== 'geplant').forEach((a) => notify('techs', [a.tech_id], 'Einsatz entfällt – KOM27', `${what}: Der Einsatz wurde aus der Planung genommen.`, 'rm-' + a.slot_key));
  toast(`${kind === 'day' ? 'Tag' : 'Platz'} ${what} entfernt – rückgängig über „🗑 Entfernt“ oben`);
}
async function restoreToPlan(kind, id) {
  const p = JSON.parse(JSON.stringify(S.plan)); const rem = p.removed; if (!rem) return;
  if (kind === 'day') {
    const r = rem.days.find((x) => x.date === id); if (!r) return;
    rem.days = rem.days.filter((x) => x !== r); p.days.push(r.day); p.days.sort((a, b) => a.date.localeCompare(b.date));
  } else {
    const r = rem.slots.find((x) => x.key === id); if (!r) return;
    const d = p.days.find((x) => x.date === r.date); if (!d) return toast('Erst den ganzen Tag wiederherstellen.');
    rem.slots = rem.slots.filter((x) => x !== r); d.slots.push(r.slot); d.slots.sort((a, b) => (a.idx || 0) - (b.idx || 0));
  }
  const prev = S.plan;
  if (await optimistic(() => (S.plan = p), () => store.savePlan(p), null, () => (S.plan = prev))) toast('Wiederhergestellt ✓');
}
function removedBar() {
  const r = S.plan && S.plan.removed; if (!rmCount(S.plan)) return '';
  const list = r.days.map((x) => ({ t: x.date, h: `<b>${esc(fmtDate(x.date))}</b> · ganzer Tag (${x.day.slots.length} ${x.day.slots.length === 1 ? 'Platz' : 'Plätze'})`, b: `data-rsday="${x.date}"` }))
    .concat(r.slots.map((x) => ({ t: x.date, h: `<b>${esc(fmtDate(x.date))}</b> · Platz ${esc(x.slot.zeit || '')} ${esc(x.slot.va || '')}`, b: `data-rsslot="${esc(x.key)}"` })))
    .sort((a, b) => a.t.localeCompare(b.t));
  return `<details class="removed"><summary>🗑 Entfernt (${list.length}) – bleiben auch beim nächsten Einlesen draußen</summary>
    <ul>${list.map((x) => `<li><span>${x.h}</span><button class="btn small" ${x.b}>Wiederherstellen</button></li>`).join('')}</ul></details>`;
}
function wireRemove() {
  document.querySelectorAll('[data-rmday]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); removeFromPlan('day', b.dataset.rmday); }));
  document.querySelectorAll('[data-rmslot]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); removeFromPlan('slot', b.dataset.rmslot); }));
  document.querySelectorAll('[data-rsday]').forEach((b) => (b.onclick = () => restoreToPlan('day', b.dataset.rsday)));
  document.querySelectorAll('[data-rsslot]').forEach((b) => (b.onclick = () => restoreToPlan('slot', b.dataset.rsslot)));
}

/* ---------------- Excel-Abgleich beim Neu-Einlesen ---------------- */
function diffPlans(old, neu) {
  const today = todayISO();
  const oS = {}; old.days.forEach((d) => d.slots.forEach((x) => (oS[x.key] = Object.assign({ cancelled: d.cancelled }, x))));
  const nS = {}; const nDay = {}; neu.days.forEach((d) => { nDay[d.date] = d; d.slots.forEach((x) => (nS[x.key] = Object.assign({ cancelled: d.cancelled }, x))); });
  const items = []; const moves = []; const drops = [];
  const taken = new Set(Object.values(S.asg).filter((a) => a.tech_id && nS[a.slot_key]).map((a) => a.slot_key));
  const nm = (id) => ((techById(id) || {}).name || '?').split(' ')[0];
  Object.values(S.asg).filter((a) => a.tech_id && a.status !== 'abgesagt').forEach((a) => {
    const o = oS[a.slot_key]; const n = nS[a.slot_key];
    if (!o || o.date < today) return;
    if (!n) { // Platz gibt es so nicht mehr – passenden neuen Platz am selben Tag suchen
      const c0 = (nDay[o.date] ? nDay[o.date].slots : []).filter((x) => !taken.has(x.key));
      const c = c0.find((x) => x.zeit === o.zeit && x.va === o.va) || c0.find((x) => x.zeit === o.zeit) || c0.find((x) => x.va && x.va === o.va) || (c0.length === 1 ? c0[0] : null);
      if (c) {
        taken.add(c.key); moves.push({ from: a.slot_key, to: c.key });
        if ((c.zeit || '') !== (o.zeit || '')) items.push({ type: 'time', key: c.key, tech_id: a.tech_id, notify: true, text: `${fmtDate(o.date)} · ${nm(a.tech_id)}: Zeit ${o.zeit || '?'} → ${c.zeit || '?'}` });
        else items.push({ type: 'moved', key: c.key, tech_id: a.tech_id, text: `${fmtDate(o.date)} · ${nm(a.tech_id)}: Eintrag in der Excel geändert, Einteilung übernommen` });
      } else if (Object.values(S.asg).some((b) => b !== a && b.tech_id === a.tech_id && b.status !== 'abgesagt' && nS[b.slot_key] && nS[b.slot_key].date === o.date)) {
        drops.push(a.slot_key); // derselbe Techniker ist an dem Tag schon eingeteilt (parallele VAs = ein Einsatz)
        items.push({ type: 'moved', key: a.slot_key, tech_id: a.tech_id, text: `${fmtDate(o.date)} · ${nm(a.tech_id)}: doppelte Einteilung zusammengeführt (parallele Veranstaltungen)` });
      } else items.push({ type: 'gone', key: a.slot_key, tech_id: a.tech_id, notify: true, text: `${fmtDate(o.date)} ${o.zeit || ''} ${o.va || ''}: Einsatz von ${nm(a.tech_id)} steht nicht mehr in der Excel` });
      return;
    }
    if ((n.zeit || '') !== (o.zeit || '')) items.push({ type: 'time', key: n.key, tech_id: a.tech_id, notify: true, text: `${fmtDate(n.date)} · ${nm(a.tech_id)}: Zeit ${o.zeit || '?'} → ${n.zeit || '?'}` });
    if (n.cancelled && !o.cancelled) items.push({ type: 'cancel', key: n.key, tech_id: a.tech_id, notify: true, text: `${fmtDate(n.date)} ${n.va || ''}: Veranstaltung abgesagt – ${nm(a.tech_id)} war eingeteilt` });
  });
  const added = Object.keys(nS).filter((k) => !oS[k] && nS[k].date >= today && !moves.some((m) => m.to === k));
  const ad = [...new Set(added.map((k) => nS[k].date))].sort();
  if (added.length) items.unshift({ type: 'new', text: `${added.length} ${added.length === 1 ? 'neuer Platz' : 'neue Plätze'} für Techniker: ${ad.slice(0, 6).map((d) => fmtDate(d)).join(', ')}${ad.length > 6 ? ' …' : ''}` });
  return { items, moves, drops };
}
const CHG_ICON = { new: '➕', time: '🕑', moved: '↪', gone: '❗', cancel: '🚫' };
function changesBanner() {
  const c = S.plan && S.plan.changes; if (!c || !c.items || !c.items.length || ls.get('kom27-chg-seen') === c.at) return '';
  const aff = [...new Set(c.items.filter((i) => i.notify && i.tech_id).map((i) => i.tech_id))];
  return `<div class="changes" id="chg"><div class="chg-head"><b>🔄 Änderungen in der Excel seit dem letzten Einlesen</b><span class="spacer"></span>
    ${aff.length ? `<button class="btn small primary" id="chgNotify">📲 Betroffene informieren (${aff.length})</button>` : ''}<button class="btn small" id="chgHide">Ausblenden</button></div>
    <ul>${c.items.map((i) => `<li class="chg-${i.type}">${CHG_ICON[i.type] || '•'} ${esc(i.text)}${i.type === 'gone' && S.asg[i.key] ? ` <button class="linkbtn danger" data-chgdel="${esc(i.key)}">Einteilung löschen</button>` : ''}</li>`).join('')}</ul></div>`;
}
function wireChanges() {
  if (!$('#chg')) return; const c = S.plan.changes;
  $('#chgHide').onclick = () => { ls.set('kom27-chg-seen', c.at); renderMaster(); };
  if ($('#chgNotify')) $('#chgNotify').onclick = () => {
    const by = {}; c.items.filter((i) => i.notify && i.tech_id).forEach((i) => (by[i.tech_id] = by[i.tech_id] || []).push(i.text.replace(/ · [^:]+:/, ':')));
    Object.entries(by).forEach(([id, l]) => notify('techs', [id], 'Änderung im KOM27-Plan', l.slice(0, 3).join(' · ') + (l.length > 3 ? ' …' : ''), 'chg-' + c.at));
    toast(`${Object.keys(by).length} Techniker per Push informiert (wer 🔔 aktiviert hat)`);
  };
  document.querySelectorAll('[data-chgdel]').forEach((b) => (b.onclick = () => { const k = b.dataset.chgdel; const prev = S.asg[k]; optimistic(() => delete S.asg[k], () => store.deleteAssignments([k]), '#chg', () => (S.asg[k] = prev)); }));
}
const unavOf = (techId, day) => S.unav.find((u) => u.tech_id === techId && u.day === day);
const allDays = () => (S.plan ? S.plan.days : []);
const allSlots = () => allDays().flatMap((d) => d.slots.map((s) => Object.assign({ day: d }, s)));
const techById = (id) => S.techs.find((t) => t.id === id);
const myTech = () => S.techs.find((t) => (t.email || '').toLowerCase() === S.user.email);
// Techniker mit eigenem Chef: die verbindliche Zusage gibt der Projektleiter
const mgrMail = (t) => ((t && t.manager_email) || '').trim().toLowerCase();
const hasMgr = (t) => !!mgrMail(t);
const mgrLabel = (t) => (t && t.company ? t.company : mgrMail(t) || 'deinem Projektleiter');
const myTeam = () => S.techs.filter((t) => hasMgr(t) && mgrMail(t) === S.user.email);

function matchTech(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const al = (t) => (t.aliases || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  const hit = S.techs.find((t) => t.name.toLowerCase() === n || al(t).includes(n));
  if (hit) return hit;
  const first = n.split(/\s+/)[0].replace(/\.$/, '');
  const c = S.techs.filter((t) => t.name.toLowerCase().split(/\s+/)[0] === first);
  return c.length === 1 ? c[0] : null;
}

/* ---------------- Auto-Einteilung ---------------- */
function autoAssign() {
  const today = todayISO();
  const slots = allSlots().filter((s) => s.date >= today && !s.day.cancelled && !s.day.free);
  const active = S.techs.filter((t) => t.active !== false);
  const changes = {};
  const cur = (k) => changes[k] || S.asg[k];
  const isOpen = (a) => !a || !a.tech_id || a.status === 'abgesagt';
  const busy = {}; const load = {};
  const mark = (date, id) => { (busy[date] = busy[date] || new Set()).add(id); load[id] = (load[id] || 0) + 1; };
  slots.forEach((s) => { const a = S.asg[s.key]; if (a && a.tech_id && a.status !== 'abgesagt') mark(s.date, a.tech_id); });
  const declined = (s) => new Set((cur(s.key) || {}).declined || []);
  const tl = timelines();
  const restOk = (s, id) => !conflictsFor(id, s, tl).some((c) => c.kind === 'rest' || c.kind === 'overlap');
  const freeBasic = (s, id) => !(busy[s.date] && busy[s.date].has(id)) && !declined(s).has(id) && !unavOf(id, s.date);
  const free = (s, id) => freeBasic(s, id) && restOk(s, id);
  const set = (s, id) => { const prev = S.asg[s.key] || {}; changes[s.key] = { slot_key: s.key, tech_id: id, status: 'geplant', note: '', declined: prev.declined || [], requested_at: null, updated_at: nowISO() }; mark(s.date, id); (tl[id] = tl[id] || []).push({ key: s.key, date: s.date, zeit: s.zeit, sp: spanAbs(s) }); };
  const byLoad = () => active.map((t) => t.id).sort((a, b) => (load[a] || 0) - (load[b] || 0));

  // 1) Namen, die schon in der Excel stehen
  slots.forEach((s) => { if (!isOpen(cur(s.key))) return; const t = matchTech(s.excelName); if (t && t.active !== false && freeBasic(s, t.id)) set(s, t.id); }); // Excel-Vorgabe gilt, Ruhezeit wird ggf. als Hinweis angezeigt
  // 2) Mehrtägige Veranstaltungen: gleiche Person über alle Tage
  const groups = {}; slots.forEach((s) => { if (s.group) (groups[s.group] = groups[s.group] || []).push(s); });
  Object.values(groups).forEach((g) => {
    const byDate = {}; g.forEach((s) => (byDate[s.date] = byDate[s.date] || []).push(s));
    const dates = Object.keys(byDate).sort();
    const lanes = Math.max(...dates.map((d) => byDate[d].length));
    for (let l = 0; l < lanes; l++) {
      const lane = dates.map((d) => byDate[d][l]).filter(Boolean);
      const open = lane.filter((s) => isOpen(cur(s.key)));
      if (!open.length) continue;
      const existing = lane.map((s) => cur(s.key)).filter((a) => a && a.tech_id && a.status !== 'abgesagt').map((a) => a.tech_id);
      const cands = [...new Set([...existing, ...byLoad()])];
      const all = cands.find((id) => open.every((s) => free(s, id)));
      if (all) open.forEach((s) => set(s, all));
      else open.forEach((s) => { const id = cands.find((x) => free(s, x)); if (id) set(s, id); });
    }
  });
  // 3) Einzelne Tage – möglichst gleichmäßig verteilen
  slots.forEach((s) => { if (!isOpen(cur(s.key))) return; const id = byLoad().find((x) => free(s, x)); if (id) set(s, id); });
  return Object.values(changes);
}

/* ---------------- Render: Login ---------------- */
// Datenschutz / Impressum / Konto löschen – unten auf jeder Seite
const legalFoot = () => `<nav class="legal-links"><a href="datenschutz.html">Datenschutz</a>${S.user && !DEMO && !S.preview ? '<span>·</span><button type="button" class="linkbtn" data-delacc>Konto löschen</button>' : ''}</nav>`;
function privacyNote() {
  if (ls.get('kom27-info-ok') || document.querySelector('.privbar')) return;
  const d = document.createElement('div'); d.className = 'privbar'; d.setAttribute('role', 'note');
  d.innerHTML = '<span>🔒 Keine Cookies, kein Tracking. Die App speichert nur, was technisch nötig ist – z. B. damit du angemeldet bleibst. <a href="datenschutz.html">Datenschutz</a></span><button type="button" class="btn small">Verstanden</button>';
  d.querySelector('button').onclick = () => { ls.set('kom27-info-ok', 1); d.remove(); };
  document.body.appendChild(d);
}
document.addEventListener('click', async (ev) => {
  if (!ev.target.closest('[data-delacc]')) return;
  if (!confirm('Konto wirklich löschen?\n\nDeine Anmeldung und Push-Benachrichtigungen werden sofort gelöscht. Deine Einsätze und Arbeitszeiten bleiben bei der Planung, soweit sie für die Abrechnung nötig sind.\n\nDu kannst später jederzeit ein neues Konto anlegen.')) return;
  try { await store.deleteMe(); S.user = null; ls.del('kom27-last-email'); renderLogin('Dein Konto wurde gelöscht.'); } catch (e) { toast('Löschen hat nicht geklappt: ' + (e.message || e)); }
});
// Logo antippen = zurück zur Startseite (Master: Planung, Techniker/KOM27: Einsätze)
document.addEventListener('click', (ev) => {
  const h = ev.target.closest('[data-home]'); if (!h || ev.metaKey || ev.ctrlKey) return;
  ev.preventDefault();
  const sh = document.getElementById('sheet'); if (sh) sh.remove(); document.body.classList.remove('noscroll');
  S.tab = 'plan'; S.techTab = 'jobs'; S.filter = 'alle'; S.keep = new Set(); S.view2 = undefined; S.komWeek = undefined; S.view = undefined;
  if (S.user) paint(); window.scrollTo({ top: 0, behavior: 'smooth' });
});
function renderLogin(msg) {
  document.body.classList.remove('is-master');
  const demoTechs = DEMO ? (DemoStore.d().techs || []).filter((t) => t.email) : [];
  if (DEMO) [...new Set((DemoStore.d().techs || []).map(mgrMail).filter(Boolean))].forEach((m) => demoTechs.push({ email: m, name: 'Projektleiter ' + m.split('@')[0] }));
  $('#app').innerHTML = `
  <div class="card login">
    <h1>KOM27 Einsatzplanung</h1>
    <div class="muted">Medientechnik · ÖPP Mauerstraße</div>
    ${S.recovery ? `
      <label>Neues Passwort</label><input id="pw1" type="password" autocomplete="new-password">
      <div class="row"><button class="btn primary" id="setpw">Passwort speichern</button></div>` : `
      <label for="em">E-Mail oder Benutzername</label><input id="em" type="text" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" value="${esc(ls.get('kom27-last-email') || '')}">
      <label for="pw">Passwort</label><input id="pw" type="password" autocomplete="current-password">
      <div class="row">
        <button class="btn primary" id="in">Anmelden</button>
        <button class="btn" id="up">Erstes Mal? Konto anlegen</button>
      </div>
      <div class="row"><button class="btn small" id="forgot">Passwort vergessen</button></div>`}
    <div class="err" id="err">${esc(msg || '')}</div>
    ${DEMO ? `<div class="demo"><b>Demo-Modus</b> – noch keine Datenbank verbunden, alles bleibt in diesem Browser.<div class="row">
      <button class="btn small" data-demo="${esc(CFG.demoAdmin)}">Als Master testen</button>
      ${demoTechs.map((t) => `<button class="btn small" data-demo="${esc(t.email)}">Als ${esc(t.name)}</button>`).join('')}
      ${(DEMO ? DemoStore.d().viewers || [] : []).map((v) => `<button class="btn small" data-demo="${esc(v.email)}">Als ${esc(v.name)} (KOM27)</button>`).join('')}
    </div></div>` : ''}
  </div>${legalFoot()}`;
  privacyNote();
  // Fehlermeldungen von Supabase verständlich machen
  const deMsg = (m) => {
    m = String(m || '');
    if (/rate limit|over_email_send|429|security purposes/i.test(m)) return '⏳ Gerade wurden zu viele E-Mails verschickt. Bitte ca. 30–60 Minuten warten und dann nur EINMAL tippen. Wenn du schon eine Bestätigungs-Mail bekommen hast: die gilt weiterhin, einfach dort tippen.';
    if (/error sending (recovery|confirmation|magic link|invite)? ?e?mail|smtp|535/i.test(m)) return '📭 Der E-Mail-Versand ist gerade gestört. Bitte kurz ' + CFG.senderName + ' Bescheid geben – der kümmert sich darum.';
    if (/invalid login credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht. Noch kein Konto? Dann „Erstes Mal? Konto anlegen“.';
    if (/email not confirmed/i.test(m)) return 'Bitte zuerst den Link in der Bestätigungs-Mail antippen (auch im Spam-Ordner schauen).';
    if (/already registered|already been registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto – bitte einfach anmelden oder „Passwort vergessen“ antippen.';
    if (/valid email|invalid format/i.test(m)) return 'Bitte eine gültige E-Mail-Adresse eintragen.';
    return m;
  };
  const err = (e) => ($('#err').textContent = deMsg(e.message || e));
  // Vor jeder Mail: Adresse prüfen (Tippfehler kosten sonst eine der wenigen Mails pro Stunde)
  const TYPO = [[/@gmial\.|@gmal\.|@gamil\.|@gmai\.|@gnail\./i, '@gmail.'], [/@gmail\.(de|co|con|cm)$/i, '@gmail.com'], [/@(web|gmx|t-online)\.(dee|d|ed)$/i, '@$1.de'], [/@kom27\.(com|d|dee)$/i, '@kom27.de'], [/@kom-27\./i, '@kom27.'], [/\.con$/i, '.com']];
  const mailCheck = (e) => {
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) { err('Bitte eine gültige E-Mail-Adresse eintragen.'); return false; }
    const fix = TYPO.reduce((x, [re, to]) => x.replace(re, to), e);
    if (fix !== e && confirm(`Meinst du vielleicht ${fix}?\n\n„OK“ = ${fix} verwenden\n„Abbrechen“ = so lassen wie eingegeben`)) { $('#em').value = fix; e = fix; ls.set('kom27-last-email', fix); }
    return confirm(`Die E-Mail geht an:\n\n${e}\n\nIst die Adresse richtig geschrieben? Pro Stunde können nur sehr wenige E-Mails verschickt werden – ein Tippfehler sperrt den Versand für alle.`) ? e : false;
  };
  // Schutz gegen Mehrfach-Tippen: während einer Anfrage alles sperren, nach einer Mail 2 Minuten warten
  const MAIL_WAIT = 120000;
  const mailLeft = () => Math.max(0, (+ls.get('kom27-mail-at') || 0) + MAIL_WAIT - Date.now());
  const lockMail = () => { const b = [$('#up'), $('#forgot')].filter(Boolean); const left = mailLeft(); b.forEach((x) => (x.disabled = left > 0)); if (left > 0) setTimeout(lockMail, Math.min(left, 5000) + 50); };
  const busy = (fn, mail) => async () => {
    if (mail && mailLeft() > 0) return err('Die E-Mail ist schon unterwegs – bitte im Postfach (auch Spam) nachsehen. Nochmal schicken geht in ' + Math.ceil(mailLeft() / 60000) + ' Min.');
    const bs = [...document.querySelectorAll('.login button')]; bs.forEach((x) => (x.disabled = true));
    try { await fn(); } finally { bs.forEach((x) => (x.disabled = false)); lockMail(); }
  };
  // Benutzername (z. B. „admin“ fürs iPad) → hinterlegte Login-Adresse
  const loginMail = (x) => { x = x.trim(); if (x.includes('@')) return x.toLowerCase(); const n = x.toLowerCase().replace(/[^a-z0-9._-]/g, ''); return n && CFG.userAlias ? CFG.userAlias.replace('{name}', n) : x; };
  const creds = () => { const em = $('#em').value.trim(); ls.set('kom27-last-email', em); return [loginMail(em), $('#pw').value]; };
  if (S.recovery) {
    $('#setpw').onclick = async () => { try { await store.setPassword($('#pw1').value); S.recovery = false; toast('Passwort geändert'); boot(); } catch (e) { err(e); } };
    return;
  }
  $('#in').onclick = busy(async () => { try { const [e, p] = creds(); S.user = await store.signIn(e, p); boot(); } catch (e) { err(e); } });
  lockMail();
  $('#pw').onkeydown = (ev) => { if (ev.key === 'Enter') $('#in').click(); };
  $('#up').onclick = busy(async () => {
    try { const [e, p] = creds(); if (!e) throw new Error('Bitte erst die E-Mail eintragen.'); if (p.length < 8) throw new Error('Passwort bitte mit mindestens 8 Zeichen.'); const e2 = mailCheck(e); if (!e2) return; const u = await store.signUp(e2, p); ls.set('kom27-mail-at', String(Date.now())); if (u) { S.user = u; boot(); } else err('Fast fertig! Wir haben dir eine E-Mail mit dem Betreff „KOM27 Einsatzplanung – E-Mail bestätigen“ geschickt. Tippe dort auf „E-Mail bestätigen“ – danach bist du drin. (Nichts gekommen? Bitte im Spam-Ordner schauen.)'); } catch (e) { err(e); }
  }, true);
  $('#forgot').onclick = busy(async () => { try { const [e] = creds(); if (!e) throw new Error('Bitte erst die E-Mail eintragen.'); const e2 = mailCheck(e); if (!e2) return; await store.reset(e2); ls.set('kom27-mail-at', String(Date.now())); err('Link zum Zurücksetzen wurde per E-Mail geschickt. Bitte auch im Spam-Ordner schauen.'); } catch (e) { err(e); } }, true);
  document.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => { S.user = await store.signIn(b.dataset.demo); boot(); }));
}

/* ---------------- Render: Master ---------------- */
// Live-Uhr oben im Kopf
const clockHtml = () => { const d = new Date(); return `<b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.</small>`; };
setInterval(() => { const c = document.getElementById('clock'); if (c) { const h = clockHtml(); if (c.innerHTML !== h) c.innerHTML = h; } }, 5000);
function header(extra) {
  return `<header class="top"><div class="top-inner">
    <a class="brand" href="./" data-home title="Zur Startseite"><span class="b-t">KOM27<span class="b-x"> Einsatzplanung</span></span><small>${DEMO ? 'Demo' : esc(S.user.email)}</small></a>
    <span class="live ${DEMO || S.liveState === 'SUBSCRIBED' ? 'on' : ''}" id="liveDot" title="Live: Änderungen erscheinen automatisch"><i></i>live</span>
    ${extra || ''}<div class="spacer"></div>
    <span class="clock" id="clock" aria-label="Aktuelle Uhrzeit">${clockHtml()}</span>
    <button class="btn small" id="logout" title="Abmelden"><span class="lo-t">Abmelden</span><span class="lo-i" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg></span></button></div></header>`;
}

function renderMaster() {
  const nInt = (S.interest || []).filter((i) => offerOf(i.slot_key)).length;
  const tabs = [['plan', 'Planung' + (nInt ? ` <span class="tbadge" title="Meldungen auf ausgeschriebene Einsätze">🙋${nInt}</span>` : '')], ['req', 'Anfragen'], ['hours', 'Stunden'], ['techs', 'Techniker'], ['kb', 'Infos']];
  const IC = { plan: '📋', req: '📨', hours: '⏱', techs: '👥', kb: '📘' };
  const nav = `<nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><i class="tic">${IC[k]}</i><span>${l}</span></button>`).join('')}</nav>`;
  $('#app').innerHTML = header(nav) + `<main id="main"></main>`;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { const same = S.tab === b.dataset.tab; S.tab = b.dataset.tab; renderMaster(); if (!same) window.scrollTo(0, 0); }));
  document.body.classList.add('is-master');
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  ({ plan: renderPlan, req: renderReq, hours: renderHours, techs: renderTechs, kb: () => { $('#main').innerHTML = kbHtml(); wireKb($('#main')); } })[S.tab]();
  $('#main').insertAdjacentHTML('beforeend', legalFoot());
  privacyNote();
}

function importBar() {
  const when = S.plan ? new Date(S.plan.importedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return `<div class="importline" id="drop">
      <span class="dot ${S.plan ? 'ok' : ''}"></span>
      <span>${when ? 'Excel-Stand: <b>' + esc(when) + '</b>' : '<b>Noch keine Excel eingelesen</b>'}</span>
      <span class="muted hide-sm">· neue Datei einfach hierher ziehen oder</span>
      <span class="spacer"></span>
      ${CFG.sharepointUrl ? `<a class="btn small" href="${esc(CFG.sharepointUrl)}" target="_blank" rel="noopener">SharePoint ↗</a>` : ''}
      <label class="btn small">Excel einlesen<input type="file" id="file" accept=".xlsx" hidden></label>
    </div>${syncBar()}`;
}
// automatischer Abgleich mit SharePoint (nur online, nur Master)
function syncBar() {
  if (DEMO || !store.getSync) return '';
  const y = S.sync; const t = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
  if (!y || !y.share_url) return `<div class="syncline muted"><span>🔗 Automatischer Abgleich mit SharePoint ist aus.</span><span class="spacer"></span><button class="btn small" id="syncCfg">Link hinterlegen</button></div>`;
  const neu = y.hash && (!S.plan || S.plan.sourceHash !== y.hash);
  const veraltet = !neu && y.hash && S.plan && (S.plan.pv || 0) < (window.KOM27Parser.VERSION || 0);
  if (veraltet) return `<div class="syncline new"><span>✨ <b>Das Einlesen wurde verbessert</b> – Excel einmal neu übernehmen, damit alles angezeigt wird</span><span class="spacer"></span><button class="btn small primary" id="syncApply">Neu übernehmen</button></div>`;
  if (neu) return `<div class="syncline new"><span>📥 <b>Neue Version auf SharePoint</b> (geändert ${esc(t(y.changed_at))})</span><span class="spacer"></span><button class="btn small primary" id="syncApply">Übernehmen</button></div>`;
  return `<div class="syncline ${y.last_error ? 'err' : 'muted'}"><span>${y.last_error ? '⚠️ Abruf fehlgeschlagen: ' + esc(y.last_error) : '✓ Aktuell mit SharePoint · zuletzt geprüft ' + esc(t(y.last_try))}</span><span class="spacer"></span><button class="btn small ghost" id="syncNow">Jetzt prüfen</button><button class="btn small ghost" id="syncApply" title="Die zuletzt abgeholte Excel noch einmal einlesen">Neu einlesen</button><button class="btn small ghost" id="syncCfg" title="SharePoint-Link ändern">⚙</button></div>`;
}
const sha256hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('');
async function applySync() {
  toast('Hole Excel von SharePoint …');
  const f = await store.getSyncFile(); if (!f || !f.b64) throw new Error('Noch keine Datei abgeholt');
  const bin = atob(f.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  await importFile(new File([u], 'VA-Kalender (SharePoint).xlsx'), f.hash);
}

let excelLib;
async function loadExcelJS() {
  if (window.ExcelJS) return;
  if (!excelLib) excelLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/exceljs.min.js'; s.onload = res; s.onerror = () => rej(new Error('ExcelJS konnte nicht geladen werden')); document.head.appendChild(s); });
  await excelLib;
}
async function importFile(file, srcHash) {
  try {
    toast('Lese Excel …');
    await loadExcelJS();
    const buf = await file.arrayBuffer();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const plan = window.KOM27Parser.parseWorkbook(wb);
    plan.fileName = file.name;
    try { plan.sourceHash = srcHash || await sha256hex(buf); } catch (e) {}
    plan.pv = window.KOM27Parser.VERSION || 0;
    const old = S.plan; const back = applyRemovals(plan, old && old.removed);
    const ch = old && old.days ? diffPlans(old, plan) : null;
    if (ch && back.length) ch.items.unshift(...back.map((text) => ({ type: 'new', text })));
    if (ch) plan.changes = { at: plan.importedAt, items: ch.items };
    await store.savePlan(plan);
    S.plan = plan;
    if (ch && ch.moves.length) { // Einteilungen auf die neuen Plätze umhängen
      const rows = ch.moves.map((mv) => Object.assign({}, S.asg[mv.from], { slot_key: mv.to }));
      await store.saveAssignments(rows); await store.deleteAssignments(ch.moves.map((mv) => mv.from));
      ch.moves.forEach((mv) => delete S.asg[mv.from]); rows.forEach((r) => (S.asg[r.slot_key] = r));
    }
    if (ch && ch.drops.length) { await store.deleteAssignments(ch.drops); ch.drops.forEach((k) => delete S.asg[k]); }
    const n = plan.days.reduce((a, d) => a + d.slots.length, 0);
    toast(`Excel eingelesen: ${plan.days.length} Tage, ${n} Techniker-Einsätze${ch && ch.items.length ? ` · ${ch.items.length} Änderung${ch.items.length > 1 ? 'en' : ''} erkannt` : ''}`);
    renderMaster();
  } catch (e) { console.error(e); toast('Fehler beim Einlesen: ' + e.message); }
}
function wireImport() {
  const btn = (id, fn) => { const b = $(id); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast('Fehler: ' + (e.message || e)); } finally { b.disabled = false; } }; };
  btn('#syncApply', applySync);
  btn('#syncNow', async () => { toast('Prüfe SharePoint …'); const r = await store.syncNow(); S.sync = await store.getSync(); toast(r.error ? 'Abruf fehlgeschlagen: ' + r.error : r.changed ? 'Neue Version gefunden 📥' : 'Keine Änderung – alles aktuell ✓'); renderMaster(); });
  btn('#syncCfg', async () => { const u = prompt('SharePoint-Link der Excel („Jeder mit dem Link kann anzeigen“). Leer lassen zum Ausschalten:', (S.sync && S.sync.share_url) || ''); if (u === null) return; await store.setShareUrl(u.trim()); if (u.trim()) await store.syncNow(); S.sync = await store.getSync(); renderMaster(); });
  const drop = $('#drop'); const zone = $('#main'); if (!drop || !zone) return;
  $('#file').onchange = (e) => e.target.files[0] && importFile(e.target.files[0]);
  zone.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  zone.ondragleave = (e) => { if (!zone.contains(e.relatedTarget)) drop.classList.remove('over'); };
  zone.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importFile(f); };
}

function monthsAvailable() { return [...new Set(allDays().map((d) => d.date.slice(0, 7)))].sort(); }

function isoWeek(iso) {
  const d = new Date(iso + 'T12:00:00Z'); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y) / 86400000 + 1) / 7);
}
const roomsOf = (info) => [...new Set((info || '').match(/(Saal \d|Seminar \d|Foyer)/g) || [])].join(', ');
const slotState = (s) => { const a = S.asg[s.key]; return a && a.tech_id ? a.status : 'leer'; };
const FILTERS = [['alle', 'Alle'], ['leer', 'Unbesetzt'], ['geplant', 'Nicht angefragt'], ['angefragt', 'Wartet auf Antwort'], ['zugesagt', 'Zugesagt'], ['abgesagt', 'Abgesagt']];

function gridHtml(days, today) {
  const techs = S.techs.filter((t) => t.active !== false);
  const map = {}; const need = {}; const cntD = {}; const sum = {}; const tot = { n: 0, z: 0 };
  days.forEach((d) => { if (d.cancelled) return; d.slots.forEach((s) => {
    need[d.date] = (need[d.date] || 0) + 1; tot.n++;
    const a = S.asg[s.key]; const c = (cntD[d.date] = cntD[d.date] || { zugesagt: 0, angefragt: 0, geplant: 0 });
    if (a && a.tech_id && a.status !== 'abgesagt') {
      c[a.status] = (c[a.status] || 0) + 1; if (a.status === 'zugesagt') tot.z++;
      ((map[a.tech_id] = map[a.tech_id] || {})[d.date] = map[a.tech_id][d.date] || []).push({ s, a });
      const su = (sum[a.tech_id] = sum[a.tech_id] || { z: 0, p: 0 }); if (a.status === 'zugesagt') su.z++; else su.p++;
    }
  }); });
  const th = days.map((d) => { const f = fmtDate(d.date); return `<th class="${d.free ? 'we' : ''} ${d.date === today ? 'today' : ''}"><span>${f.slice(0, 2)}</span>${d.date.slice(8, 10)}</th>`; }).join('');
  const needRow = days.map((d) => {
    const n = need[d.date] || 0; const c = cntD[d.date] || { zugesagt: 0, angefragt: 0, geplant: 0 };
    if (!n) return `<td class="${d.free ? 'we' : ''}"></td>`;
    const z = c.zugesagt; const f = z + c.angefragt + c.geplant; const open = Math.max(0, n - f);
    const cls = z >= n ? 'full' : f >= n ? 'pend' : 'miss';
    const tip = `${n} ${n === 1 ? 'Platz' : 'Plätze'}: ${z} zugesagt` + (c.angefragt ? `, ${c.angefragt} angefragt` : '') + (c.geplant ? `, ${c.geplant} geplant (noch nicht angefragt)` : '') + (open ? `, ${open} offen` : '');
    return `<td class="${d.free ? 'we' : ''}"><button class="need ${cls}" data-jump="${d.date}" title="${esc(tip)}">${z}/${n}</button></td>`;
  }).join('');
  const slotDay = {}; days.forEach((d) => { if (!d.cancelled && d.slots.length) slotDay[d.date] = true; });
  const rowsH = techs.map((t) => `<tr><th class="name">${esc(t.name)}</th>${days.map((d) => {
    const e = (map[t.id] || {})[d.date]; const u = unavOf(t.id, d.date); const gc = `data-gc="${t.id}|${d.date}"`;
    if (!e) {
      return `<td class="${d.free ? 'we' : ''}"><button class="gadd ${u ? 'blocked' : ''} ${slotDay[d.date] ? '' : 'noslot'}" ${gc} title="${esc(u ? 'Kann nicht' + (u.note ? ': ' + u.note : '') : slotDay[d.date] ? t.name + ' eintragen oder „kann nicht“ setzen' : '„Kann nicht“ für ' + t.name + ' eintragen')}">${u ? '✗' : '+'}</button></td>`;
    }
    const worst = ['abgesagt', 'geplant', 'angefragt', 'zugesagt'].find((st) => e.some((x) => x.a.status === st));
    const tip = e.map((x) => `${x.s.zeit || ''} ${x.s.va || ''} – ${ST_LABEL[x.a.status]}`).join('\n');
    return `<td class="${d.free ? 'we' : ''}"><button class="gcell ${worst} ${e.length > 1 || u ? 'dbl' : ''}" ${gc} title="${esc(tip + (u ? '\n⛔ hat sich für diesen Tag abgemeldet' : ''))}">${esc((e[0].s.zeit || '•').slice(0, 2))}${e.length > 1 ? '²' : ''}</button></td>`;
  }).join('')}<td class="sum" title="${sum[t.id] ? esc(sum[t.id].z + ' zugesagt' + (sum[t.id].p ? ', ' + sum[t.id].p + ' geplant/angefragt' : '')) : 'keine Einsätze'}">${sum[t.id] ? `${sum[t.id].z}${sum[t.id].p ? `<small>+${sum[t.id].p}</small>` : ''}` : '–'}</td></tr>`).join('');
  return `<div class="legend"><span class="lg zugesagt"></span>zugesagt <span class="lg angefragt"></span>angefragt <span class="lg geplant"></span>geplant <span class="lg miss"></span>Platz offen <span class="lg blocked"></span>kann nicht · Zahl = Arbeitsbeginn · <b>Feld antippen = eintragen / ändern</b> · Besetzt = zugesagt / Bedarf</div>
    <div class="card gridwrap"><table class="grid"><thead><tr><th class="name">Techniker</th>${th}<th class="sum" title="Einsätze im Monat: zugesagt (+ geplant/angefragt)">Σ</th></tr></thead>
    <tbody><tr class="needrow"><th class="name">Besetzt / Bedarf</th>${needRow}<td class="sum" title="Im Monat: ${tot.z} von ${tot.n} Plätzen zugesagt">${tot.z}/${tot.n}</td></tr>${rowsH || `<tr><td colspan="${days.length + 2}" class="empty-msg">Noch keine Techniker angelegt.</td></tr>`}</tbody></table></div>`;
}

// Menü im Raster: Techniker an einem Tag eintragen, Status ändern oder austragen
function gridMenu(btn, techId, date, act) {
  closeMenu();
  const t = techById(techId); const day = allDays().find((d) => d.date === date) || { date, slots: [] }; if (!t) return;
  const TL = timelines(); const u = unavOf(techId, date);
  const slots = day.cancelled ? [] : day.slots || [];
  const busy = slots.some((s) => { const a = S.asg[s.key]; return a && a.tech_id === techId && a.status !== 'abgesagt'; });
  const rows = slots.map((s) => {
    const a = S.asg[s.key]; const mine = a && a.tech_id === techId && a.status !== 'abgesagt';
    const other = a && a.tech_id && a.tech_id !== techId && a.status !== 'abgesagt' ? techById(a.tech_id) : null;
    const dec = ((a || {}).declined || []).includes(techId);
    const cf = mine ? [] : conflictsFor(techId, s, TL).filter((c) => c.kind !== 'day');
    const head = `<div class="gm-slot"><b>${esc(niceTime(s.zeit))}</b><small>${esc(s.va || 'Einsatz')}${other ? ' · jetzt: ' + esc(other.name.split(' ')[0]) + ' (' + ST_LABEL[a.status] + ')' : mine ? '' : ' · unbesetzt'}</small></div>`;
    if (mine) return head + `<div class="gm-st">${STATUS.map((st) => `<button data-gst="${st}" data-k="${esc(s.key)}" class="${a.status === st ? 'on' : ''}"><span class="lg ${st}"></span>${ST_LABEL[st]}</button>`).join('')}</div><button class="gm-act danger" data-grm="${esc(s.key)}">✕ ${esc(t.name.split(' ')[0])} austragen</button>`;
    return head + (dec ? `<div class="gm-warn">✗ hat für diesen Einsatz abgesagt</div>` : '') + cf.map((c) => `<div class="gm-warn">⚠ ${esc(c.txt)}</div>`).join('')
      + `<button class="gm-act" data-gset="${esc(s.key)}">＋ ${esc(t.name.split(' ')[0])} eintragen${other ? ' (ersetzt ' + esc(other.name.split(' ')[0]) + ')' : ''}</button>`;
  }).join('<hr>');
  const m = document.createElement('div'); m.className = 'stmenu gmenu'; m.setAttribute('role', 'menu');
  const unavHtml = u
    ? `<div class="gm-un on">⛔ <b>Kann nicht</b>${u.note ? ' – ' + esc(u.note) : ''}</div><button class="gm-act" data-gunoff>„Kann nicht“ entfernen</button>`
    : `<div class="gm-un"><input type="text" id="gmNote" placeholder="Grund (optional), z. B. Urlaub" maxlength="80"></div><button class="gm-act danger" data-gunon>⛔ ${esc(t.name.split(' ')[0])} kann an diesem Tag nicht</button>${busy ? '<div class="gm-warn">Achtung: ist an diesem Tag eingeteilt – Einteilung bleibt bestehen.</div>' : ''}`;
  m.innerHTML = `<div class="gm-h"><b>${esc(t.name)}</b><small>${esc(longDate(date))}</small></div>${rows || '<div class="gm-slot"><small>Kein Einsatz an diesem Tag.</small></div>'}<hr>${unavHtml}${slots.length ? `<hr><button class="gm-act ghost" data-gjump="${date}">Tag in der Liste öffnen ›</button>` : ''}`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(); const w = m.offsetWidth; const h = m.offsetHeight;
  let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  m.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)) + 'px'; m.style.top = top + 'px';
  m.onclick = (e) => e.stopPropagation();
  m.querySelectorAll('[data-gset]').forEach((b) => (b.onclick = () => { closeMenu(); act('set', b.dataset.gset, techId); }));
  m.querySelectorAll('[data-grm]').forEach((b) => (b.onclick = () => { closeMenu(); act('rm', b.dataset.grm, techId); }));
  m.querySelectorAll('[data-gst]').forEach((b) => (b.onclick = () => { closeMenu(); act('st', b.dataset.k, b.dataset.gst); }));
  m.querySelectorAll('[data-gjump]').forEach((b) => (b.onclick = () => { closeMenu(); act('jump', b.dataset.gjump); }));
  const on = m.querySelector('[data-gunon]'); if (on) on.onclick = () => { const n = (m.querySelector('#gmNote') || {}).value || ''; closeMenu(); act('unav', date, techId, n.trim()); };
  const ni = m.querySelector('#gmNote'); if (ni) ni.onkeydown = (e) => { if (e.key === 'Enter') on.click(); };
  const off = m.querySelector('[data-gunoff]'); if (off) off.onclick = () => { closeMenu(); act('unavdel', date, techId); };
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  document.addEventListener('keydown', menuKey);
  const y0 = window.scrollY; const onScroll = () => { if (!document.querySelector('.stmenu')) return window.removeEventListener('scroll', onScroll); if (Math.abs(window.scrollY - y0) > 60) { closeMenu(); window.removeEventListener('scroll', onScroll); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  const f = m.querySelector('.gm-act, button'); if (f) f.focus();
}

/* ---------------- Ruhezeit & Konflikte ---------------- */
const REST_H = 11; // Mindest-Ruhezeit nach Arbeitszeitgesetz
const spanAbs = (s) => { const p = parseSpan(s.zeit); if (!p) return null; const base = Date.parse(s.date + 'T00:00:00Z') / 36e5; return [base + p[0], base + p[1]]; };
function timelines(extra) { // techId -> sortierte Einsätze (ohne Absagen)
  const tl = {};
  allSlots().forEach((s) => { const a = (extra && extra[s.key]) || S.asg[s.key]; if (!a || !a.tech_id || a.status === 'abgesagt' || s.day.cancelled) return; const sp = spanAbs(s); (tl[a.tech_id] = tl[a.tech_id] || []).push({ key: s.key, date: s.date, zeit: s.zeit, sp }); });
  return tl;
}
function conflictsFor(techId, slot, tl) {
  const out = []; const me = spanAbs(slot);
  (tl[techId] || []).forEach((e) => {
    if (e.key === slot.key) return;
    if (!me || !e.sp) { if (e.date === slot.date) out.push({ kind: 'day', txt: 'noch ein Einsatz am selben Tag' }); return; }
    if (me[0] < e.sp[1] && e.sp[0] < me[1]) { out.push({ kind: 'overlap', txt: `überschneidet sich mit ${fmtDate(e.date)} ${e.zeit}` }); return; }
    const gap = e.sp[1] <= me[0] ? me[0] - e.sp[1] : e.sp[0] - me[1];
    if (gap < REST_H) out.push({ kind: 'rest', h: Math.round(gap * 10) / 10, txt: `nur ${String(Math.round(gap * 10) / 10).replace('.', ',')} h Ruhezeit ${e.sp[1] <= me[0] ? 'nach' : 'vor'} ${fmtDate(e.date)} ${e.zeit}` });
  });
  return out;
}

// Übersicht oben in der Master-Planung: Heute, nächste 7 Tage, Handlungsbedarf, fehlende Zeiten
function masterOverview(today) {
  const sl = allSlots().filter((s) => !s.day.cancelled);
  const tn = (s) => { const a = S.asg[s.key]; return a && a.tech_id ? ((techById(a.tech_id) || {}).name || '?').split(' ')[0] : null; };
  const short = (z) => { const sp = parseSpan(z); if (!sp) return ''; const f = (x) => { const m = Math.round((x % 24) * 60); return pad(Math.floor(m / 60)) + (m % 60 ? ':' + pad(m % 60) : ''); }; return f(sp[0]) + '–' + f(sp[1]); };
  // 1) Heute
  const tod = sl.filter((s) => s.date === today);
  const nextD = sl.filter((s) => s.date > today).map((s) => s.date).sort()[0];
  const c1 = tod.length
    ? `<button class="ov ov-today" data-jump="${today}"><span class="ov-l">Heute im Haus</span>
        <div class="ov-ppl">${tod.map((s) => { const n = tn(s); const st = slotState(s); return `<span class="ov-p st-${st}"><b>${n ? esc(n) : 'unbesetzt'}</b><small>${esc(short(s.zeit))}</small></span>`; }).join('')}</div>
        <small class="ov-sub">${esc(roomsOf(tod[0].day.info) || 'KOM27')}</small></button>`
    : `<button class="ov ov-today" ${nextD ? `data-jump="${nextD}"` : ''}><span class="ov-l">Heute im Haus</span><b class="ov-n ov-quiet">Kein Einsatz</b><small class="ov-sub">${nextD ? 'Nächster: ' + esc(fmtDate(nextD)) + ' · ' + untilTxt(nextD) : 'Keine weiteren Termine'}</small></button>`;
  // 2) Nächste 7 Tage
  const wk = sl.filter((s) => s.date >= today && s.date <= addDays(today, 6));
  const k = { zugesagt: 0, angefragt: 0, geplant: 0, leer: 0 }; wk.forEach((s) => { const st = slotState(s); k[st === 'abgesagt' ? 'leer' : st]++; });
  const pc = (n) => (wk.length ? (n / wk.length) * 100 : 0);
  const c2 = `<div class="ov"><span class="ov-l">Nächste 7 Tage</span><b class="ov-n">${k.zugesagt}<small>/${wk.length} zugesagt</small></b>
    <div class="ov-bar">${['zugesagt', 'angefragt', 'geplant', 'leer'].map((x) => k[x] ? `<i class="b-${x}" style="width:${pc(k[x])}%" title="${k[x]} ${ST_LABEL[x] || 'offen'}"></i>` : '').join('')}</div>
    <small class="ov-sub">${[k.angefragt ? k.angefragt + ' angefragt' : '', k.geplant ? k.geplant + ' nicht angefragt' : '', k.leer ? k.leer + ' unbesetzt' : ''].filter(Boolean).join(' · ') || 'Alles besetzt 👍'}</small></div>`;
  // 3) Zu erledigen (ab heute, alle Monate)
  const fut = sl.filter((s) => s.date >= today);
  const of = (st) => fut.filter((s) => (st === 'leer' ? ['leer', 'abgesagt'].includes(slotState(s)) : slotState(s) === st));
  const todo = [['leer', 'unbesetzt', of('leer')], ['geplant', 'nicht angefragt', of('geplant')], ['angefragt', 'warten auf Antwort', of('angefragt')]];
  const old = of('angefragt').filter((s) => { const r = S.asg[s.key].requested_at; return r && Date.now() - new Date(r) > 2 * 864e5; }).length;
  const c3 = `<div class="ov ov-todo"><span class="ov-l">Zu erledigen</span>
    ${todo.map(([st, l, list]) => `<button class="ov-row ${list.length ? 'has' : ''}" data-ovf="${st}" data-ovm="${list.length ? list[0].date.slice(0, 7) : ''}" ${list.length ? '' : 'disabled'}><b class="t-${st}">${list.length}</b><span>${l}</span>${list.length ? `<small>ab ${esc(fmtDate(list[0].date))}</small>` : ''}</button>`).join('')}
    ${old ? `<small class="ov-sub warn">⏰ ${old} ${old === 1 ? 'Anfrage wartet' : 'Anfragen warten'} schon über 2 Tage</small>` : ''}</div>`;
  // 4) Arbeitszeiten
  const past = sl.filter((s) => s.date <= today && s.date >= addDays(today, -45) && S.asg[s.key] && S.asg[s.key].status === 'zugesagt');
  const miss = past.filter((s) => !S.asg[s.key].actual_start && s.date < today);
  const c4 = `<button class="ov" data-ovtab="hours"><span class="ov-l">Arbeitszeiten</span><b class="ov-n ${miss.length ? 't-leer' : 't-zugesagt'}">${miss.length || '✓'}</b><small class="ov-sub">${miss.length ? (miss.length === 1 ? 'Zeit fehlt noch' : 'Zeiten fehlen noch') + ' · ' + esc([...new Set(miss.map(tn).filter(Boolean))].join(', ')) : 'Alle Zeiten eingetragen'}</small></button>`;
  return `<section class="ovw">${c1}${c2}${c3}${c4}</section>`;
}
function renderPlan() {
  const m = $('#main');
  const today = todayISO();
  if (!S.month) S.month = today.slice(0, 7);
  if (!S.filter) S.filter = 'alle';
  if (!S.view) S.view = ls.get('kom27-view') || 'raster'; // Startansicht: Raster (zuletzt gewählte Ansicht wird gemerkt)
  const months = monthsAvailable();
  const mi = months.indexOf(S.month);
  const monthDays = allDays().filter((d) => d.date.startsWith(S.month));
  const fromDate = S.showPast ? '' : today;
  const visDays = monthDays.filter((d) => d.date >= fromDate && !d.free);
  const cnt = { alle: 0, leer: 0, geplant: 0, angefragt: 0, zugesagt: 0, abgesagt: 0 };
  visDays.forEach((d) => !d.cancelled && d.slots.forEach((s) => { cnt[slotState(s)]++; cnt.alle++; }));
  // Wer ist an welchem Tag schon eingeteilt? (für Konflikthinweise in der Auswahl)
  const busyOn = {}; const loadM = {};
  monthDays.forEach((d) => d.slots.forEach((x) => { const a = S.asg[x.key]; if (a && a.tech_id && a.status !== 'abgesagt') { (busyOn[d.date] = busyOn[d.date] || {})[a.tech_id] = x.key; loadM[a.tech_id] = (loadM[a.tech_id] || 0) + 1; } }));
  const TL = timelines();
  const techOpts = (sel, slot) => {
    const dec = new Set(((S.asg[slot.key] || {}).declined) || []);
    const list = S.techs.filter((t) => t.active !== false || t.id === sel);
    const busy = (t) => busyOn[slot.date] && busyOn[slot.date][t.id] && busyOn[slot.date][t.id] !== slot.key;
    const opt = (t, suffix) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}${t.id === sel ? '' : suffix}</option>`;
    const away = (t) => !!unavOf(t.id, slot.date);
    const restBad = (t) => conflictsFor(t.id, slot, TL).find((c) => c.kind === 'rest' || c.kind === 'overlap');
    const free = list.filter((t) => !busy(t) && !dec.has(t.id) && !away(t)).sort((a, b) => (!!restBad(a) - !!restBad(b)) || (loadM[a.id] || 0) - (loadM[b.id] || 0));
    const taken = list.filter((t) => busy(t) && !dec.has(t.id) && !away(t));
    const off = list.filter((t) => away(t) && !dec.has(t.id));
    const no = list.filter((t) => dec.has(t.id));
    return `<option value="">– unbesetzt –</option>`
      + (free.length ? `<optgroup label="Frei an diesem Tag (wenigste Einsätze zuerst)">${free.map((t) => { const r = restBad(t); return opt(t, r ? (r.kind === 'rest' ? `  ⚠ nur ${String(r.h).replace('.', ',')} h Ruhezeit` : '  ⚠ Zeiten überschneiden sich') : `  · ${loadM[t.id] || 0} im Monat`); }).join('')}</optgroup>` : '')
      + (taken.length ? `<optgroup label="Schon eingeteilt an diesem Tag">${taken.map((t) => opt(t, '  ⚠ doppelt')).join('')}</optgroup>` : '')
      + (off.length ? `<optgroup label="Hat sich für diesen Tag abgemeldet">${off.map((t) => opt(t, '  ⛔ kann nicht' + (unavOf(t.id, slot.date).note ? ' (' + unavOf(t.id, slot.date).note + ')' : ''))).join('')}</optgroup>` : '')
      + (no.length ? `<optgroup label="Hat für diesen Einsatz abgesagt">${no.map((t) => opt(t, '  ✗ abgesagt')).join('')}</optgroup>` : '');
  };

  // Tage aller Mehrtages-Gruppen (für „Tag 1/3“)
  const gDays = {};
  allDays().forEach((d) => d.slots.forEach((s) => { if (s.group) (gDays[s.group] = gDays[s.group] || new Set()).add(d.date); }));
  Object.keys(gDays).forEach((k) => (gDays[k] = [...gDays[k]].sort()));

  // Zeilen: je Tag und Veranstaltung eine Zeile
  let html = ''; let lastWeek = null; let rows = 0;
  visDays.forEach((d) => {
    const groups = [];
    d.slots.forEach((s) => { const k = s.va || s.label || '–'; let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, slots: [] })); g.slots.push(s); });
    if (!groups.length) {
      if (S.filter !== 'alle' || !d.vas.length) return;
      groups.push({ k: [...new Set(d.vas)].join(' · '), slots: [], none: true });
    }
    const keep = S.keep || new Set();
    const show = S.filter === 'alle' ? groups : groups.filter((g) => g.slots.some((s) => slotState(s) === S.filter || keep.has(s.key)));
    if (!show.length) return;
    const wk = isoWeek(d.date);
    if (wk !== lastWeek) { html += `<div class="week">KW ${wk}</div>`; lastWeek = wk; }
    show.forEach((g, gi) => {
      rows++;
      const s0 = g.slots[0] || {};
      const lbl = (g.slots.map((s) => s.label).find((l) => /aufbau|abbau/i.test(l)) || '').match(/aufbau|abbau/i);
      const gd = s0.group ? gDays[s0.group] : null;
      const tag = gd ? `<span class="tag">Tag ${gd.indexOf(d.date) + 1}/${gd.length}</span>` : '';
      const room = roomsOf(d.info);
      html += `<div ${gi === 0 ? `id="d-${d.date}"` : ''} class="row ${d.date < today ? 'past' : ''} ${d.date === today ? 'today' : ''} ${d.cancelled ? 'cancel' : ''} ${g.none ? 'none' : ''}">
        <div class="c-date">${gi === 0 ? `<b>${fmtDate(d.date).slice(0, 2)}</b> ${fmtDate(d.date).slice(3)}` : ''}</div>
        <div class="c-va ${s0.color ? 'c-' + s0.color : ''}">
          <div class="va-id">${esc(g.k)}${(() => { const al = [...new Set(g.slots.flatMap((s) => s.also || []))]; return al.length ? ` <span class="also" title="parallele Veranstaltung, gleicher Einsatz">+ ${esc(al.join(' + '))}</span>` : ''; })()} ${tag} ${lbl ? `<span class="tag">${esc(lbl[0][0].toUpperCase() + lbl[0].slice(1).toLowerCase())}</span>` : ''} ${d.cancelled ? '<span class="tag red">abgesagt</span>' : ''}<button class="rm" data-rmday="${d.date}" title="Ganzen Tag aus der Planung entfernen" aria-label="Tag entfernen">🗑</button></div>
          <div class="va-sub">${[d.vazeit ? 'VA ' + esc(d.vazeit) : '', esc(room), d.kom && d.kom.length && gi === 0 ? '🏢 ' + esc(d.kom.join(', ')) : ''].filter(Boolean).join(' · ')}
            ${d.info && gi === 0 ? `<details class="more"><summary>Details</summary><div>${esc(d.info)}</div></details>` : ''}</div>
        </div>
        <div class="c-slots">${g.none ? '<span class="muted small">kein Techniker angefordert</span>' : g.slots.map((s) => {
          const a = S.asg[s.key]; const st = slotState(s); const t = a && a.tech_id ? techById(a.tech_id) : null;
          const excelDiff = s.excelName && (!t || matchTech(s.excelName) !== t);
          const cf = t && a.status !== 'abgesagt' && !d.cancelled ? conflictsFor(t.id, s, TL) : [];
          const off = !t || st === 'abgesagt' ? offerOf(s.key) : null; const ints = off ? interestOf(s.key) : [];
          const canOffer = (!t || st === 'abgesagt') && !off && d.date >= today && !d.cancelled;
          return `<div class="slot st-${st}" data-sk="${esc(s.key)}">${g.slots.length > 1 || d.slots.length > 1 ? `<button class="rm rm-slot" data-rmslot="${esc(s.key)}" title="Nur diesen Platz entfernen" aria-label="Platz entfernen">✕</button>` : ''}
            <select data-slot="${esc(s.key)}" aria-label="Techniker">${techOpts(t ? t.id : '', s)}</select>
            <div class="slot-foot"><span class="time">${esc(s.zeit || 'Zeit offen')}</span>
              ${t ? `<button class="pill ${a.status}" data-stm="${esc(s.key)}" title="Status ändern${a.note ? ' – Notiz: ' + esc(a.note) : ''}">${ST_LABEL[a.status]}${a.note ? ' 💬' : ''} ▾</button>` : '<span class="pill leer">unbesetzt</span>'}</div>
            ${cf.map((c) => `<div class="hint warn">⚠ ${esc(c.txt)}</div>`).join('')}
            ${t && hasMgr(t) ? `<div class="hint boss" title="Zusage gibt ${esc(mgrMail(t))}">🏢 ${esc(mgrLabel(t))}${a.status === 'angefragt' ? (a.tech_reply === 'kann' ? ' · 👍 ' + esc(t.name.split(' ')[0]) + ' könnte – Freigabe offen' : a.tech_reply === 'kann_nicht' ? ' · ✗ ' + esc(t.name.split(' ')[0]) + ' kann nicht' : ' · Freigabe offen') : ''}</div>` : ''}
            ${a && a.actual_start ? `<div class="hint ok" title="vom Techniker bestätigte Arbeitszeit">⏱ ${esc(a.actual_start)}–${esc(a.actual_end)}${a.break_min ? ', ' + a.break_min + ' min Pause' : ''}</div>` : ''}
            ${canOffer ? `<button class="linkbtn offer-btn" data-offer="${esc(s.key)}">📣 ausschreiben</button>` : ''}
            ${off ? `<div class="offer-box"><span>📣 ausgeschrieben${ints.length ? '' : ' – noch keine Meldung'}</span>${ints.map((i) => { const it = techById(i.tech_id); return it ? `<button class="take" data-take="${esc(s.key)}" data-tid="${it.id}" title="${esc(it.name)} einteilen (gilt als zugesagt)">🙋 ${esc(it.name.split(' ')[0])} einteilen</button>` : ''; }).join('')}<button class="linkbtn" data-unoffer="${esc(s.key)}">zurückziehen</button></div>` : ''}
            ${t && unavOf(t.id, d.date) ? `<div class="hint warn">⛔ ${esc(t.name.split(' ')[0])} hat sich abgemeldet${unavOf(t.id, d.date).note ? ': ' + esc(unavOf(t.id, d.date).note) : ''}</div>` : ''}
            ${excelDiff ? `<div class="hint" title="So steht es in der KOM27-Excel">Excel: ${esc(s.excelName)}</div>` : ''}
          </div>`;
        }).join('')}</div>
      </div>`;
    });
  });

  m.innerHTML = importBar() + (S.plan ? `
    ${removedBar()}
    ${changesBanner()}
    ${S.techs.length ? masterOverview(today) : ''}
    ${S.techs.length ? '' : `<div class="banner">Lege zuerst unter <b>Techniker</b> dein Stamm-Team an (Namen aus der Excel lassen sich mit einem Klick übernehmen).</div>`}
    <div class="toolbar">
      <div class="monthnav">
        <button class="btn small" id="mPrev" ${mi <= 0 ? 'disabled' : ''} aria-label="Vormonat">‹</button>
        <select id="month">${months.map((x) => `<option value="${x}" ${x === S.month ? 'selected' : ''}>${MON[+x.slice(5, 7) - 1]} ${x.slice(0, 4)}</option>`).join('')}</select>
        <button class="btn small" id="mNext" ${mi >= months.length - 1 ? 'disabled' : ''} aria-label="Nächster Monat">›</button>
      </div>
      <div class="seg" role="tablist"><button data-view="liste" class="${S.view !== 'raster' ? 'on' : ''}">Liste</button><button data-view="raster" class="${S.view === 'raster' ? 'on' : ''}">Raster</button></div>
      <div class="spacer"></div>
      <div class="tb-actions">
      ${(() => { const n = visDays.filter((d) => !d.cancelled).reduce((acc, d) => acc + d.slots.filter((x) => (slotState(x) === 'leer' || slotState(x) === 'abgesagt') && !offerOf(x.key)).length, 0); return n ? `<button class="btn" id="offerAll" title="Alle unbesetzten Einsätze dieses Monats an alle Techniker schicken – wer Zeit hat, meldet sich">📣 Offene ausschreiben (${n})</button>` : ''; })()}
      <button class="btn" id="copy">Zusagen kopieren</button>
      <button class="btn" id="pdfMonth" title="Monatsplan als PDF / zum Drucken">🖨 PDF</button>
      <button class="btn primary" id="auto">Auto-Einteilung</button>
      </div>
    </div>
    ${S.view === 'raster' ? gridHtml(monthDays, today) : `<div class="chips">${FILTERS.map(([k, l]) => `<button class="chip f-${k} ${S.filter === k ? 'on' : ''}" data-filter="${k}">${l}<b>${cnt[k]}</b></button>`).join('')}
      <label class="pastsw"><input type="checkbox" id="showPast" ${S.showPast ? 'checked' : ''}> vergangene Tage</label></div>
    <div class="card plan">${rows ? html : `<div class="empty-msg">${S.filter === 'alle' ? 'Keine Einsätze in diesem Zeitraum.' : 'Nichts mit diesem Status. 👍'}</div>`}</div>`}
    <p class="note">Farbiger Balken = mehrtägige Veranstaltung (wie in der Excel). Status anklicken, um ihn von Hand zu ändern, z. B. nach einer telefonischen Zusage.</p>
  ` : '');
  wireImport();
  if (!S.plan) return;
  const go = (i) => { if (months[i]) { S.month = months[i]; renderMaster(); } };
  $('#mPrev').onclick = () => go(mi - 1);
  $('#mNext').onclick = () => go(mi + 1);
  document.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { S.filter = b.dataset.filter; S.keep = new Set(); renderMaster(); }));
  document.querySelectorAll('[data-ovf]').forEach((b) => (b.onclick = () => { S.view = 'liste'; S.filter = b.dataset.ovf; if (b.dataset.ovm) S.month = b.dataset.ovm; S.keep = new Set(); renderMaster(); const c = document.querySelector('.card.plan'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
  document.querySelectorAll('[data-ovtab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.ovtab; renderMaster(); window.scrollTo(0, 0); }));
  if ($('#showPast')) $('#showPast').onchange = (e) => { S.showPast = e.target.checked; renderMaster(); };
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { S.view = b.dataset.view; ls.set('kom27-view', S.view); renderMaster(); }));
  document.querySelectorAll('[data-gc]').forEach((c) => (c.onclick = (ev) => { ev.stopPropagation(); const [tid, dt] = c.dataset.gc.split('|');
    gridMenu(c, tid, dt, (kind, x, y, z) => {
      if (kind === 'jump') { S.view = 'liste'; S.filter = 'alle'; if (x < today) S.showPast = true; renderMaster(); const el = document.getElementById('d-' + x); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } return; }
      if (kind === 'unav' || kind === 'unavdel') {
        const dt = x; const tid = y; const prevU = S.unav;
        return optimistic(() => { S.unav = S.unav.filter((u) => !(u.tech_id === tid && u.day === dt)); if (kind === 'unav') S.unav = [...S.unav, { tech_id: tid, day: dt, note: z || '' }]; },
          async () => { if (kind === 'unav') await store.setUnav(tid, dt, z || ''); else await store.clearUnav(tid, dt); }, null, () => (S.unav = prevU));
      }
      const key = x; const prev = S.asg[key];
      if (kind === 'rm') return optimistic(() => delete S.asg[key], () => store.deleteAssignments([key]), null, () => (S.asg[key] = prev));
      if (kind === 'st') { if (!prev || prev.status === y) return; const a = Object.assign({}, prev, { status: y, updated_at: nowISO() }, y === 'angefragt' && !prev.requested_at ? { requested_at: nowISO() } : {}); return optimistic(() => (S.asg[key] = a), () => store.saveAssignments([a]), null, () => (S.asg[key] = prev)); }
      if (kind === 'set') {
        if (prev && prev.tech_id && prev.tech_id !== y && ['angefragt', 'zugesagt'].includes(prev.status) && !confirm(`${(techById(prev.tech_id) || {}).name || 'Jemand'} ist hier schon ${prev.status}. Trotzdem ersetzen?`)) return;
        const a = { slot_key: key, tech_id: y, status: 'geplant', note: '', declined: (prev || {}).declined || [], requested_at: null, updated_at: nowISO() };
        const hadOffer = offerOf(key); const prevOffers = S.offers;
        optimistic(() => { S.asg[key] = a; if (hadOffer) S.offers = S.offers.filter((o) => o.slot_key !== key); },
          async () => { await store.saveAssignments([a]); if (hadOffer) await store.deleteOffers([key]); toast(`${firstName(techById(y))} eingetragen (geplant) – Anfrage über „Anfragen“`); }, null, () => { if (prev) S.asg[key] = prev; else delete S.asg[key]; S.offers = prevOffers; });
      }
    });
  }));
  document.querySelectorAll('[data-jump]').forEach((c) => (c.onclick = () => {
    S.view = 'liste'; S.filter = 'alle'; if (c.dataset.jump < today) S.showPast = true; renderMaster();
    const el = document.getElementById('d-' + c.dataset.jump); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }));
  const days = monthDays;
  $('#month').onchange = (e) => { S.month = e.target.value; S.keep = new Set(); renderMaster(); };
  wireChanges();
  wireRemove();
  const anchor = (key) => `[data-sk="${CSS.escape(key)}"]`;
  const keepKey = (key) => { (S.keep = S.keep || new Set()).add(key); };
  document.querySelectorAll('select[data-slot]').forEach((sel) => (sel.onchange = () => {
    const key = sel.dataset.slot; const id = sel.value; const prev = S.asg[key]; sel.blur();
    keepKey(key);
    if (!id) return optimistic(() => delete S.asg[key], () => store.deleteAssignments([key]), anchor(key), () => (S.asg[key] = prev));
    const a = { slot_key: key, tech_id: id, status: 'geplant', note: '', declined: (prev || {}).declined || [], requested_at: null, updated_at: nowISO() };
    const hadOffer = offerOf(key); const prevOffers = S.offers;
    optimistic(() => { S.asg[key] = a; if (hadOffer) S.offers = S.offers.filter((o) => o.slot_key !== key); },
      async () => { await store.saveAssignments([a]); if (hadOffer) await store.deleteOffers([key]); }, anchor(key), () => { if (prev) S.asg[key] = prev; else delete S.asg[key]; S.offers = prevOffers; });
  }));
  document.querySelectorAll('[data-stm]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); statusMenu(b, b.dataset.stm, (st) => {
    const key = b.dataset.stm; const prev = S.asg[key]; if (!prev || prev.status === st) return;
    const a = Object.assign({}, prev, { status: st, updated_at: nowISO() }, st === 'angefragt' && !prev.requested_at ? { requested_at: nowISO() } : {});
    keepKey(key);
    optimistic(() => (S.asg[key] = a), () => store.saveAssignments([a]), anchor(key), () => (S.asg[key] = prev));
  }); }));
  document.querySelectorAll('[data-offer]').forEach((b) => (b.onclick = () => offerSlots([b.dataset.offer], anchor(b.dataset.offer))));
  if ($('#offerAll')) $('#offerAll').onclick = () => {
    const keys = visDays.filter((d) => !d.cancelled).flatMap((d) => d.slots.filter((x) => (slotState(x) === 'leer' || slotState(x) === 'abgesagt') && !offerOf(x.key)).map((x) => x.key));
    if (confirm(`${keys.length} offene Einsätze an alle aktiven Techniker ausschreiben? Wer Zeit hat, meldet sich – du entscheidest dann, wer ihn bekommt.`)) offerSlots(keys);
  };
  document.querySelectorAll('[data-unoffer]').forEach((b) => (b.onclick = () => {
    const key = b.dataset.unoffer; const po = S.offers; const pi = S.interest;
    optimistic(() => { S.offers = S.offers.filter((o) => o.slot_key !== key); S.interest = S.interest.filter((i) => i.slot_key !== key); }, () => store.deleteOffers([key]), anchor(key), () => { S.offers = po; S.interest = pi; });
  }));
  document.querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => {
    const key = b.dataset.take; const t = techById(b.dataset.tid); const prev = S.asg[key]; const po = S.offers; const pi = S.interest;
    const a = { slot_key: key, tech_id: t.id, status: hasMgr(t) ? 'angefragt' : 'zugesagt', note: 'über Ausschreibung', declined: (prev || {}).declined || [], requested_at: nowISO(), updated_at: nowISO() };
    const sl = allSlots().find((x) => x.key === key);
    optimistic(() => { S.asg[key] = a; S.offers = S.offers.filter((o) => o.slot_key !== key); S.interest = S.interest.filter((i) => i.slot_key !== key); },
      async () => { await store.saveAssignments([a]); await store.deleteOffers([key]); notify('techs', [t.id], hasMgr(t) ? 'Einsatz – Freigabe beim Projektleiter' : 'Du bist eingeteilt ✓', `KOM27 ${sl ? fmtDate(sl.date) + ', ' + (sl.zeit || '') : ''} – danke!`, 'take-' + key); toast(`${firstName(t)} ist eingeteilt`); },
      anchor(key), () => { if (prev) S.asg[key] = prev; else delete S.asg[key]; S.offers = po; S.interest = pi; });
  }));
  $('#auto').onclick = async () => {
    if (!S.techs.length) return toast('Bitte zuerst Techniker anlegen.');
    const ch = autoAssign();
    if (!ch.length) return toast('Alles besetzt – nichts zu tun.');
    const prev = Object.assign({}, S.asg);
    await optimistic(() => ch.forEach((a) => (S.asg[a.slot_key] = a)), () => store.saveAssignments(ch), null, () => (S.asg = prev));
    toast(`${ch.length} Einsätze eingeteilt (Status „geplant“). Jetzt unter „Anfragen“ verschicken.`);
  };
  $('#pdfMonth').onclick = () => printMonth(S.month);
  $('#copy').onclick = async () => {
    const lines = days.map((d) => { const n = d.slots.map((s) => S.asg[s.key]).filter((a) => a && a.tech_id && a.status === 'zugesagt').map((a) => techById(a.tech_id)?.name).filter(Boolean); return n.length ? fmtDate(d.date) + '\t' + n.join(', ') : null; }).filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(`${lines.length} Tage in die Zwischenablage kopiert`); } catch (e) { toast('Kopieren nicht möglich'); }
  };
}

function slotsOfTech(id, from) {
  return allSlots().filter((s) => (!from || s.date >= from) && S.asg[s.key] && S.asg[s.key].tech_id === id).sort((a, b) => a.date.localeCompare(b.date));
}
const slotLine = (s) => `${fmtDate(s.date, true)}, ${s.zeit || 'Zeit folgt'}${s.va ? ' – ' + s.va : ''}${s.group ? ' (mehrtägig)' : ''}`;

function mailFor(t, slots, reminder) {
  const body = `Hallo ${t.name.split(' ')[0]},\n\n${reminder ? 'kurze Erinnerung – ich brauche noch deine Rückmeldung zu diesen Einsätzen' : 'ich habe neue Einsatzanfragen für dich'} im KOM27 (ÖPP Mauerstraße, Medientechnik):\n\n${slots.map((s) => '• ' + slotLine(s)).join('\n')}\n\nBitte bestätige kurz hier, ob du kannst:\n${APP_URL()}\n\nDanke & Gruß\n${CFG.senderName}`;
  const subj = (reminder ? 'Erinnerung: ' : '') + 'KOM27 Einsatzanfrage – ' + (slots.length === 1 ? fmtDate(slots[0].date, true) : slots.length + ' Termine');
  const cc = hasMgr(t) ? `&cc=${encodeURIComponent(mgrMail(t))}` : '';
  const body2 = hasMgr(t) ? body.replace('Bitte bestätige kurz hier, ob du kannst:', `Die verbindliche Zusage gibt ${mgrLabel(t)} (in Kopie) – bitte dort oder hier freigeben:`) : body;
  return `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(subj)}${cc}&body=${encodeURIComponent(body2)}`;
}

/* ---------------- Neuigkeiten ---------------- */
function feedHtml() {
  const ev = []; const sk = {}; allSlots().forEach((x) => (sk[x.key] = x));
  const since = Date.now() - 14 * 864e5; const nm = (id) => (techById(id) || {}).name;
  Object.values(S.asg).forEach((a) => {
    const n = nm(a.tech_id); const x = sk[a.slot_key]; if (!n || !x) return;
    if ((a.status === 'zugesagt' || a.status === 'abgesagt') && a.updated_at) ev.push({ at: a.updated_at, ic: a.status === 'zugesagt' ? '✅' : '❌', txt: `<b>${esc(n)}</b> ${a.status === 'zugesagt' ? 'zugesagt' : 'abgesagt'} · ${fmtDate(x.date)} ${esc(x.zeit || '')}${a.note ? ' – „' + esc(a.note) + '“' : ''}` });
    if (a.tech_reply_at && a.status === 'angefragt') ev.push({ at: a.tech_reply_at, ic: a.tech_reply === 'kann' ? '👍' : '✋', txt: `<b>${esc(n)}</b> meldet: ${a.tech_reply === 'kann' ? 'könnte' : 'kann nicht'} · ${fmtDate(x.date)} – Freigabe durch ${esc(mgrLabel(techById(a.tech_id)))} offen` });
    if (a.time_at) ev.push({ at: a.time_at, ic: '⏱', txt: `<b>${esc(n)}</b> hat Arbeitszeit bestätigt · ${fmtDate(x.date)} (${fmtH(actualHours(a) || 0)})` });
  });
  (S.interest || []).forEach((i) => { const n = nm(i.tech_id); const x = sk[i.slot_key]; if (n && x && i.created_at) ev.push({ at: i.created_at, ic: '🙋', txt: `<b>${esc(n)}</b> hätte Zeit · ${fmtDate(x.date)} ${esc(x.zeit || '')}${offerOf(i.slot_key) ? '' : ' (erledigt)'}` }); });
  const ug = {}; (S.unav || []).forEach((u) => { if (!u.created_at) return; const k = u.tech_id + u.created_at.slice(0, 16); (ug[k] = ug[k] || { at: u.created_at, id: u.tech_id, days: [], note: u.note }).days.push(u.day); });
  Object.values(ug).forEach((g) => { const n = nm(g.id); if (!n) return; g.days.sort(); ev.push({ at: g.at, ic: '⛔', txt: `<b>${esc(n)}</b> kann nicht · ${g.days.length > 1 ? shortDate(g.days[0]) + ' – ' + shortDate(g.days[g.days.length - 1]) + ' (' + g.days.length + ' Tage)' : fmtDate(g.days[0])}${g.note ? ' – ' + esc(g.note) : ''}` }); });
  const list = ev.filter((e) => new Date(e.at) >= since).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  return `<div class="card feed"><h3>🕑 Neuigkeiten <span class="muted small">letzte 14 Tage</span></h3>${list.length ? `<ul>${list.map((e) => `<li><span class="fi">${e.ic}</span><span class="ft">${e.txt}</span><span class="fa">${esc(ago(e.at))}</span></li>`).join('')}</ul>` : '<p class="muted small">Noch keine Rückmeldungen.</p>'}</div>`;
}

/* ---------------- Stunden (Master) ---------------- */
function renderHours() {
  const m = $('#main'); const today = todayISO();
  if (!S.month) S.month = today.slice(0, 7);
  const months = monthsAvailable(); if (!months.includes(S.month) && months.length) months.push(S.month), months.sort();
  const sl = allSlots().filter((x) => x.date.startsWith(S.month) && S.asg[x.key] && S.asg[x.key].tech_id && S.asg[x.key].status === 'zugesagt' && !x.day.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const per = {}; sl.forEach((x) => (per[S.asg[x.key].tech_id] = per[S.asg[x.key].tech_id] || []).push(x));
  const sum = (l, f) => l.reduce((acc, x) => acc + (f(x) || 0), 0);
  const miss = sl.filter((x) => x.date <= today && !S.asg[x.key].actual_start);
  const missT = [...new Set(miss.map((x) => S.asg[x.key].tech_id))];
  const totP = sum(sl, planHours); const totI = sum(sl, (x) => actualHours(S.asg[x.key]));
  const cards = S.techs.filter((t) => per[t.id]).map((t) => {
    const l = per[t.id]; const p = sum(l, planHours); const done = l.filter((x) => S.asg[x.key].actual_start); const i = sum(done, (x) => actualHours(S.asg[x.key]));
    const mi = l.filter((x) => x.date <= today && !S.asg[x.key].actual_start).length;
    return `<details class="card hcard" ${S.openHours === t.id ? 'open' : ''} data-ht="${t.id}"><summary><b>${esc(t.name)}</b>
      <span class="hs"><span>${l.length} Einsätze</span><span>Plan ${fmtH(p)}</span><span class="${done.length ? 'ok' : 'muted'}">Ist ${fmtH(i)} <small>(${done.length}/${l.length} bestätigt)</small></span>${mi ? `<span class="warn">⏱ ${mi} offen</span>` : ''}</span></summary>
      <table class="list htab"><thead><tr><th>Datum</th><th>VA</th><th>Plan</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Ist</th></tr></thead><tbody>
      ${l.map((x) => { const a = S.asg[x.key]; const [ps, pe] = planFrom(x); const ih = actualHours(a); const diff = ih !== null ? ih - planHours(x) : null;
        return `<tr data-hk="${esc(x.key)}" class="${x.date > today ? 'future' : ''}"><td class="h-d">${fmtDate(x.date)}</td><td class="small h-va">${esc(x.va || '')}</td><td class="small h-pl" data-l="Plan">${esc(x.zeit || '')}</td>
        <td class="h-st" data-l="Beginn"><input type="time" data-h="st" value="${esc(a.actual_start || '')}" placeholder="${ps}"></td><td class="h-en" data-l="Ende"><input type="time" data-h="en" value="${esc(a.actual_end || '')}" placeholder="${pe}"></td>
        <td class="h-br" data-l="Pause"><select data-h="br">${['', 0, 15, 30, 45, 60, 90].map((v) => `<option value="${v}" ${String(a.break_min ?? '') === String(v) ? 'selected' : ''}>${v === '' ? '–' : v + ' min'}</option>`).join('')}</select></td>
        <td class="h-ist" data-l="Ist">${ih !== null ? `<b>${fmtH(ih)}</b>${diff && Math.abs(diff) >= 0.25 ? ` <small class="${diff > 0 ? 'warn' : 'muted'}">${diff > 0 ? '+' : ''}${String(Math.round(diff * 100) / 100).replace('.', ',')}</small>` : ''}${a.time_note ? ` <span title="${esc(a.time_note)}">💬</span>` : ''}` : x.date <= today ? '<span class="warn small">fehlt</span>' : '<span class="muted small">kommt noch</span>'}</td></tr>`; }).join('')}
      </tbody></table></details>`;
  }).join('');
  m.innerHTML = `<div class="toolbar">
      <div class="monthnav"><select id="hMonth">${months.map((x) => `<option value="${x}" ${x === S.month ? 'selected' : ''}>${MON[+x.slice(5, 7) - 1]} ${x.slice(0, 4)}</option>`).join('')}</select></div>
      <div class="spacer"></div>
      ${missT.length ? `<button class="btn" id="hRemind">⏰ Fehlende Zeiten anfragen (${miss.length})</button>` : ''}
      <button class="btn" id="hPdf" ${sl.length ? '' : 'disabled'}>🖨 PDF</button>
      <button class="btn primary" id="hCsv" ${sl.length ? '' : 'disabled'}>⬇ CSV für Abrechnung</button></div>
    <div class="sumrow wide"><div class="sumbox"><b>${sl.length}</b><span>zugesagte Einsätze</span></div><div class="sumbox"><b>${String(Math.round(totP * 10) / 10).replace('.', ',')}</b><span>Plan-Stunden*</span></div>
      <div class="sumbox ok"><b>${String(Math.round(totI * 10) / 10).replace('.', ',')}</b><span>bestätigte Ist-Stunden</span></div><div class="sumbox ${miss.length ? 'warn' : ''}"><b>${miss.length}</b><span>Zeiten fehlen noch</span></div></div>
    ${cards || '<div class="card"><div class="empty-msg">In diesem Monat noch keine zugesagten Einsätze.</div></div>'}
    <p class="note">* Plan-Stunden = Einsatzzeit aus der Excel abzüglich gesetzlicher Pause (über 6 h: 30 min, über 9 h: 45 min). Ist-Zeiten tragen die Techniker selbst ein – du kannst sie hier auch direkt ändern.</p>`;
  $('#hMonth').onchange = (e) => { S.month = e.target.value; renderMaster(); };
  m.querySelectorAll('details[data-ht]').forEach((d) => (d.ontoggle = () => { if (d.open) S.openHours = d.dataset.ht; else if (S.openHours === d.dataset.ht) S.openHours = null; }));
  m.querySelectorAll('tr[data-hk] [data-h]').forEach((inp) => (inp.onchange = () => {
    const tr = inp.closest('tr'); const key = tr.dataset.hk; const prev = S.asg[key]; const v = (k) => tr.querySelector(`[data-h="${k}"]`).value;
    const st = v('st'); const en = v('en'); const br = v('br');
    const a = Object.assign({}, prev, { actual_start: st || null, actual_end: en || null, break_min: br === '' ? null : +br, time_at: st && en ? (prev.time_at || nowISO()) : null });
    if ((st && !en) || (!st && en)) return; // erst speichern, wenn beides da ist
    optimistic(() => (S.asg[key] = a), () => store.saveAssignments([a]), `tr[data-hk="${CSS.escape(key)}"]`, () => (S.asg[key] = prev));
  }));
  if ($('#hRemind')) $('#hRemind').onclick = () => {
    missT.forEach((id) => { const n = miss.filter((x) => S.asg[x.key].tech_id === id); notify('techs', [id], 'Bitte Arbeitszeit bestätigen ⏱', `${n.length === 1 ? '1 Einsatz' : n.length + ' Einsätze'} ohne Zeit: ${n.slice(0, 3).map((x) => fmtDate(x.date)).join(', ')} – kurz in der App eintragen`, 'time'); });
    toast(`Push an ${missT.length} Techniker geschickt (wer 🔔 aktiviert hat)`);
  };
  $('#hPdf').onclick = () => printHours(S.month);
  $('#hCsv').onclick = () => {
    const num = (h) => (h === null || h === undefined ? '' : String(Math.round(h * 100) / 100).replace('.', ','));
    const q = (x) => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    const head = ['Datum', 'Tag', 'Techniker', 'Veranstaltung', 'Raum', 'Plan Beginn', 'Plan Ende', 'Plan Std', 'Ist Beginn', 'Ist Ende', 'Pause min', 'Ist Std', 'Anmerkung'];
    const lines = sl.map((x) => { const a = S.asg[x.key]; const [ps, pe] = planFrom(x); const t = techById(a.tech_id) || {};
      return [x.date.split('-').reverse().join('.'), fmtDate(x.date).slice(0, 2), t.name, x.va || '', roomsOf(x.day.info), ps, pe, num(planHours(x)), a.actual_start || '', a.actual_end || '', a.break_min ?? '', num(actualHours(a)), a.time_note || ''].map(q).join(';'); });
    const blob = new Blob(['\ufeff' + head.map(q).join(';') + '\r\n' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = `KOM27-Stunden-${S.month}.csv`; document.body.appendChild(el); el.click(); el.remove();
  };
}

/* ---------------- Eigene Push-Nachricht an Techniker ---------------- */
function msgGroups() {
  const today = todayISO(); const tom = addDays(today, 1);
  const act = S.techs.filter((t) => t.active !== false && t.email);
  const on = (d) => act.filter((t) => allSlots().some((s) => s.date === d && !s.day.cancelled && S.asg[s.key] && S.asg[s.key].tech_id === t.id && ['zugesagt', 'angefragt'].includes(S.asg[s.key].status)));
  return { alle: act, heute: on(today), morgen: on(tom), wahl: act.filter((t) => (S.msgPick || new Set()).has(t.id)) };
}
function msgBoxHtml() {
  const g = msgGroups(); const to = S.msgTo || 'alle'; const list = g[to];
  const push = (t) => S.pushEmails && S.pushEmails.has((t.email || '').toLowerCase());
  const nPush = list.filter(push).length;
  const opt = (k, l) => `<button class="chip ${to === k ? 'on' : ''}" data-msgto="${k}">${l}${k !== 'wahl' ? ` <b>${g[k].length}</b>` : ''}</button>`;
  return `<div class="card msgbox" id="msgBox"><h3>📲 Nachricht an Techniker</h3>
    <div class="chips">${opt('alle', 'Alle')}${opt('heute', 'Heute im Einsatz')}${opt('morgen', 'Morgen im Einsatz')}${opt('wahl', 'Auswählen …')}</div>
    ${to === 'wahl' ? `<div class="msg-pick">${g.alle.map((t) => `<label class="pick ${(S.msgPick || new Set()).has(t.id) ? 'on' : ''}"><input type="checkbox" data-mpick="${t.id}" ${(S.msgPick || new Set()).has(t.id) ? 'checked' : ''}> <span>${esc(t.name)}</span><span title="${push(t) ? 'Mitteilungen an' : 'Mitteilungen nicht eingeschaltet'}">${push(t) ? '🔔' : '🔕'}</span></label>`).join('')}</div>` : ''}
    <input type="text" id="msgTitle" maxlength="60" placeholder="Betreff (optional) – sonst „Nachricht von ${esc(CFG.senderName)}“" value="${esc((S.msgDraft || {}).title || '')}">
    <textarea id="msgBody" rows="3" maxlength="300" placeholder="Deine Nachricht, z. B. „Morgen bitte schon um 7:30 da sein – Umbau Saal 2“">${esc((S.msgDraft || {}).body || '')}</textarea>
    <div class="msg-foot"><span class="note">${list.length ? `🔔 erreicht <b>${nPush} von ${list.length}</b>${nPush < list.length ? ` – ${list.length - nPush} ${list.length - nPush === 1 ? 'hat' : 'haben'} Mitteilungen noch nicht eingeschaltet` : ''}` : 'Keine Empfänger ausgewählt'}</span>
      <button class="btn primary" id="msgSend" ${nPush ? '' : 'disabled'}>📲 Senden</button></div>
  </div>`;
}
function wireMsgBox(m) {
  const keep = () => { S.msgDraft = { title: $('#msgTitle').value, body: $('#msgBody').value }; };
  m.querySelectorAll('[data-msgto]').forEach((b) => (b.onclick = () => { keep(); S.msgTo = b.dataset.msgto; paint('#msgBox'); }));
  m.querySelectorAll('[data-mpick]').forEach((c) => (c.onchange = () => { keep(); const p = S.msgPick || (S.msgPick = new Set()); c.checked ? p.add(c.dataset.mpick) : p.delete(c.dataset.mpick); paint('#msgBox'); }));
  const sendBtn = m.querySelector('#msgSend'); if (!sendBtn) return;
  sendBtn.onclick = async () => {
    const title = $('#msgTitle').value.trim() || `Nachricht von ${CFG.senderName}`; const body = $('#msgBody').value.trim();
    if (!body) { $('#msgBody').focus(); return toast('Bitte eine Nachricht eingeben'); }
    const list = msgGroups()[S.msgTo || 'alle'];
    if (!confirm(`An ${list.length} Techniker senden?\n\n${title}\n${body}`)) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Sende …';
    const r = await notify('techs', list.map((t) => t.id), title, body, 'msg-' + Date.now());
    S.msgDraft = null; paint('#msgBox');
    toast(DEMO ? 'Demo: würde jetzt gesendet' : r && typeof r.sent === 'number' ? `Gesendet ✓ – auf ${r.sent} ${r.sent === 1 ? 'Gerät' : 'Geräten'} angekommen` : 'Senden hat nicht geklappt – bitte nochmal versuchen');
  };
}

function renderReq() {
  const m = $('#main'); const today = todayISO();
  const rows = S.techs.map((t) => {
    const sl = slotsOfTech(t.id, today);
    return { t, neu: sl.filter((s) => S.asg[s.key].status === 'geplant'), wait: sl.filter((s) => S.asg[s.key].status === 'angefragt'), no: sl.filter((s) => S.asg[s.key].status === 'abgesagt') };
  }).filter((r) => r.neu.length || r.wait.length || r.no.length);
  const hasPush = (t) => t.email && S.pushEmails && S.pushEmails.has(t.email.toLowerCase());
  m.innerHTML = `<div id="pushBox"></div>${msgBoxHtml()}${feedHtml()}<div class="bar"><span class="note">🔔 Erinnerung: Jeden Abend um 18 Uhr bekommt jeder Techniker eine Mitteilung, wenn er am nächsten Tag einen zugesagten Einsatz hat.</span>${DEMO ? '' : '<button class="btn small" id="remindNow">Jetzt für morgen senden</button>'}</div><div class="bar"><div class="note">„📲 Push senden“ schickt eine Mitteilung direkt aufs Handy des Technikers (wenn er sie aktiviert hat, erkennbar am 🔔). „✉️ E-Mail“ öffnet zusätzlich eine fertige Mail. Danach stehen die Einsätze auf „angefragt“.</div></div>
  <div class="card">${rows.map(({ t, neu, wait, no }) => `<div class="req">
    <h3>${esc(t.name)} ${hasPush(t) ? '<span title="Push-Mitteilungen aktiv">🔔</span>' : ''} <span class="note">${esc(t.email || 'keine E-Mail hinterlegt')}</span></h3>
    ${hasMgr(t) ? `<div class="hint boss">🏢 ${esc(mgrLabel(t))} – Zusage gibt der Projektleiter (${esc(mgrMail(t))}). Push & E-Mail gehen auch an ihn.</div>` : ''}
    ${neu.length ? `<div><b>Neu (${neu.length})</b><ul>${neu.map((s) => `<li>${esc(slotLine(s))}</li>`).join('')}</ul></div>` : ''}
    ${wait.length ? `<div class="muted"><b>Wartet auf Antwort (${wait.length})</b><ul>${wait.map((s) => `<li>${esc(slotLine(s))}</li>`).join('')}</ul></div>` : ''}
    ${no.length ? `<div style="color:var(--st-abgesagt)"><b>Abgesagt – Ersatz einteilen (${no.length})</b><ul>${no.map((s) => `<li>${esc(slotLine(s))}${S.asg[s.key].note ? ' – „' + esc(S.asg[s.key].note) + '“' : ''}</li>`).join('')}</ul></div>` : ''}
    <div class="bar" style="margin:0">
      ${neu.length && hasPush(t) ? `<button class="btn primary" data-push="${t.id}">📲 Push senden (${neu.length})</button>` : ''}
      ${neu.length ? `<button class="btn ${hasPush(t) ? '' : 'primary'}" data-send="${t.id}" ${t.email ? '' : 'disabled'}>✉️ ${hasPush(t) ? 'E-Mail' : 'Anfrage per E-Mail'} (${neu.length})</button>` : ''}
      ${wait.length ? `<button class="btn" data-remind="${t.id}" ${t.email ? '' : 'disabled'}>Erinnern</button>` : ''}
      ${no.length ? `<button class="btn" data-replace="${t.id}">Ersatz automatisch suchen</button>` : ''}
    </div></div>`).join('') || '<div class="req muted">Nichts offen. Neue Einsätze erscheinen hier, sobald sie in der Planung eingeteilt sind.</div>'}</div>`;
  const markAsked = async (r, viaMail) => {
    if (viaMail) location.href = mailFor(r.t, r.neu, false);
    const ch = r.neu.map((s) => Object.assign({}, S.asg[s.key], { status: 'angefragt', requested_at: nowISO(), updated_at: nowISO() }));
    try {
      await store.saveAssignments(ch); ch.forEach((a) => (S.asg[a.slot_key] = a));
      const n = r.neu.length;
      notify('techs', [r.t.id], 'Neue Einsatzanfrage KOM27', `${n === 1 ? '1 neuer Termin' : n + ' neue Termine'}: ${r.neu.slice(0, 3).map((s) => fmtDate(s.date)).join(', ')}${n > 3 ? ' …' : ''} – bitte zu- oder absagen.`, 'req');
      if (!viaMail) toast(`Push an ${firstName(r.t)} gesendet`);
      calm(); paint();
    } catch (e) { toast(e.message); }
  };
  m.querySelectorAll('[data-send]').forEach((b) => (b.onclick = () => markAsked(rows.find((x) => x.t.id === b.dataset.send), true)));
  m.querySelectorAll('[data-push]').forEach((b) => (b.onclick = () => markAsked(rows.find((x) => x.t.id === b.dataset.push), false)));
  m.querySelectorAll('[data-remind]').forEach((b) => (b.onclick = () => {
    const r = rows.find((x) => x.t.id === b.dataset.remind);
    notify('techs', [r.t.id], 'Erinnerung: KOM27 Einsatzanfrage', `Bitte gib noch Bescheid zu ${r.wait.length === 1 ? '1 Termin' : r.wait.length + ' Terminen'}: ${r.wait.slice(0, 3).map((s) => fmtDate(s.date)).join(', ')}`, 'req');
    if (hasPush(r.t)) toast(`Erinnerung per Push an ${firstName(r.t)} gesendet`);
    location.href = mailFor(r.t, r.wait, true);
  }));
  fillPushBox(true);
  wireMsgBox(m);
  if ($('#remindNow')) $('#remindNow').onclick = async () => {
    try { const { data, error } = await store.sb.functions.invoke('notify', { body: { action: 'remind' } }); if (error) throw error; toast(data && data.sent ? `Erinnerung an ${data.techs} Techniker gesendet (${data.sent} Geräte)` : 'Morgen hat niemand mit aktivierten Mitteilungen einen zugesagten Einsatz.'); }
    catch (e) { toast('Erinnerung fehlgeschlagen: ' + (e.message || e)); }
  };
  m.querySelectorAll('[data-replace]').forEach((b) => (b.onclick = async () => {
    const ch = autoAssign(); if (!ch.length) return toast('Kein freier Ersatz gefunden.');
    try { await store.saveAssignments(ch); ch.forEach((a) => (S.asg[a.slot_key] = a)); toast(`${ch.length} Einsätze neu eingeteilt`); renderMaster(); } catch (e) { toast(e.message); }
  }));
}

function renderTechs() {
  const m = $('#main'); const today = todayISO();
  const known = new Set();
  allSlots().forEach((s) => { if (s.excelName && !matchTech(s.excelName)) known.add(s.excelName); });
  const sugg = [...known].sort();
  m.innerHTML = `
  ${sugg.length ? `<div class="bar"><span class="note">In der Excel gefunden, noch nicht angelegt:</span>${sugg.map((n) => `<button class="btn small" data-addname="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
  <div class="card"><table class="list techs">
    <thead><tr><th>Name</th><th>E-Mail (= Login)</th><th>Firma</th><th>Freigabe durch<br><small>E-Mail Projektleiter</small></th><th>Andere Schreibweisen in der Excel</th><th>Aktiv</th><th>Einsätze ab heute</th><th></th></tr></thead>
    <tbody>${S.techs.map((t) => `<tr data-id="${t.id}">
      <td data-l="Name"><input type="text" data-f="name" value="${esc(t.name)}"></td>
      <td data-l="E-Mail (= Login)"><input type="email" data-f="email" value="${esc(t.email || '')}" placeholder="name@…"></td>
      <td data-l="Firma"><input type="text" data-f="company" value="${esc(t.company || '')}" placeholder="leer = eigenes Team"></td>
      <td data-l="Freigabe durch (Projektleiter)"><input type="email" data-f="manager_email" value="${esc(t.manager_email || '')}" placeholder="leer = sagt selbst zu"></td>
      <td data-l="Andere Schreibweisen"><input type="text" data-f="aliases" value="${esc(t.aliases || '')}" placeholder="z. B. Kevin R., Kevin Rehfeld"></td>
      <td data-l="Aktiv"><input type="checkbox" data-f="active" ${t.active !== false ? 'checked' : ''}></td>
      <td data-l="Einsätze ab heute">${slotsOfTech(t.id, today).length}</td>
      <td class="td-del"><button class="btn small" data-del="${t.id}">Entfernen</button></td></tr>`).join('')}
      <tr class="tr-add"><td colspan="8"><button class="btn" id="addTech">+ Techniker hinzufügen</button></td></tr>
    </tbody></table></div>
  <p class="note"><b>Techniker mit eigenem Chef:</b> Bei „Freigabe durch“ die E-Mail des Projektleiters eintragen. Der Techniker sieht seine Anfragen und meldet „könnte / kann nicht“, die verbindliche Zusage gibt der Projektleiter – er meldet sich mit dieser E-Mail selbst an und sieht nur sein Team.</p>
  <h2 class="sec">🏢 KOM27-Zugänge (nur ansehen) <button class="btn small" id="pvKom">👁 So sieht es für Jens & Felix aus</button></h2>
  <p class="note">Für die Medientechnik des KOM27 (z. B. Jens, Felix): sieht alle Termine, wer eingeteilt ist, Aufbaulisten und die KOM27-Infos – kann aber nichts zusagen oder einteilen. Anmelden wie die Techniker: mit dieser E-Mail auf „Konto anlegen“.</p>
  <div class="card"><table class="list viewers"><thead><tr><th>Name</th><th>E-Mail (= Login)</th><th></th></tr></thead><tbody>
    ${(S.viewers || []).map((v) => `<tr><td data-l="Name">${esc(v.name)}</td><td data-l="E-Mail">${esc(v.email)}</td><td class="td-del"><button class="btn small" data-vdel="${esc(v.email)}">Entfernen</button></td></tr>`).join('')}
    <tr class="tr-add"><td><input type="text" id="vName" placeholder="Name, z. B. Jens"></td><td><input type="email" id="vMail" placeholder="E-Mail"></td><td><button class="btn" id="vAdd">+ Zugang anlegen</button></td></tr>
  </tbody></table></div>
  <p class="note">Jeder Techniker meldet sich mit genau dieser E-Mail an. Beim ersten Mal klickt er auf „Konto anlegen“ und wählt sein Passwort selbst. Er sieht nur seine eigenen Einsätze.</p>`;
  const save = async (t) => { try { const r = await store.saveTech(t); const i = S.techs.findIndex((x) => x.id === r.id); if (i >= 0) S.techs[i] = r; else S.techs.push(r); } catch (e) { toast(e.message); } };
  m.querySelectorAll('tr[data-id] input').forEach((inp) => (inp.onchange = async () => {
    const t = Object.assign({}, techById(inp.closest('tr').dataset.id));
    const f = inp.dataset.f; t[f] = f === 'active' ? inp.checked : f === 'email' || f === 'manager_email' ? inp.value.trim().toLowerCase() : inp.value.trim();
    if (f === 'manager_email' && t[f] && t[f] === (t.email || '').toLowerCase()) { toast('Projektleiter-E-Mail darf nicht die eigene sein.'); inp.value = ''; return; }
    await save(t); toast('Gespeichert');
  }));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const t = techById(b.dataset.del);
    if (!confirm(`${t.name} entfernen? Seine Einteilungen werden gelöscht.`)) return;
    try { await store.deleteTech(t.id); await reload(); renderMaster(); } catch (e) { toast(e.message); }
  }));
  const add = async (name) => { await save({ id: uid(), name, email: '', aliases: '', active: true, company: '', manager_email: null }); renderMaster(); };
  $('#addTech').onclick = () => add('Neuer Techniker');
  $('#pvKom').onclick = () => { S.preview = true; S.viewer = true; S.techTab = 'jobs'; paint(); window.scrollTo(0, 0); };
  $('#vAdd').onclick = async () => {
    const name = $('#vName').value.trim(); const email = $('#vMail').value.trim().toLowerCase();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return toast('Bitte Name und gültige E-Mail eintragen');
    if (S.techs.some((t) => (t.email || '').toLowerCase() === email)) return toast('Diese E-Mail gehört schon einem Techniker');
    try { await store.saveViewer({ email, name }); S.viewers = await store.getViewers(); renderMaster(); toast(`${name} kann sich jetzt mit ${email} anmelden („Konto anlegen“)`); } catch (e) { toast(e.message); }
  };
  m.querySelectorAll('[data-vdel]').forEach((b) => (b.onclick = async () => { if (!confirm(`Zugang ${b.dataset.vdel} entfernen?`)) return; try { await store.deleteViewer(b.dataset.vdel); S.viewers = await store.getViewers(); renderMaster(); } catch (e) { toast(e.message); } }));
  m.querySelectorAll('[data-addname]').forEach((b) => (b.onclick = () => add(b.dataset.addname)));
}

/* ---------------- Render: Techniker ---------------- */
const MON_S = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dateBox = (iso) => { const d = new Date(iso + 'T12:00:00'); return `<div class="dbox"><span>${WD[d.getDay()]}</span><b>${d.getDate()}</b><span>${MON_S[d.getMonth()]}</span></div>`; };
const niceTime = (z) => (z ? z.replace(/\s*-\s*/, ' – ') + ' Uhr' : 'Zeit folgt');

function icsFor(slots, t) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const stamp = (iso, hm) => iso.replace(/-/g, '') + 'T' + (hm || '0800').replace(':', '').padEnd(4, '0') + '00';
  const ev = slots.map((s) => {
    const m = /(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/.exec(s.zeit || '');
    const st = m ? pad2(m[1]) + m[2] : '0800'; const en = m ? pad2(m[3]) + m[4] : '1700';
    return ['BEGIN:VEVENT', 'UID:' + s.key.replace(/[^\w-]/g, '') + '@kom27-einsatzplanung', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART:' + stamp(s.date, st), 'DTEND:' + stamp(s.date, en), 'SUMMARY:KOM27 Einsatz ' + (s.va || ''), 'LOCATION:KOM27 Mauerstraße\\, Berlin',
      'DESCRIPTION:' + ('Einsatzzeit ' + (s.zeit || '') + (s.day.vazeit ? ' · VA ' + s.day.vazeit : '')).replace(/,/g, '\\,'), 'END:VEVENT'].join('\r\n');
  });
  const blob = new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KOM27 Einsatzplanung//DE\r\n' + ev.join('\r\n') + '\r\nEND:VCALENDAR\r\n'], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'KOM27-Einsaetze-' + t.name.split(' ')[0] + '.ics'; document.body.appendChild(a); a.click(); a.remove();
}

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const daysBetween = (a, b) => { const out = []; for (let x = a; x <= b && out.length < 400; x = addDays(x, 1)) out.push(x); return out; };
const shortDate = (iso) => Number(iso.slice(8, 10)) + '.' + Number(iso.slice(5, 7)) + '.';
function unavRanges(techId, from) {
  const list = S.unav.filter((u) => u.tech_id === techId && u.day >= from).sort((a, b) => a.day.localeCompare(b.day));
  const out = [];
  list.forEach((u) => { const last = out[out.length - 1]; if (last && addDays(last.to, 1) === u.day && last.note === (u.note || '')) { last.to = u.day; last.days.push(u.day); } else out.push({ from: u.day, to: u.day, note: u.note || '', days: [u.day] }); });
  return out;
}

function techCalHtml(t) {
  const today = todayISO();
  if (!S.calMonth) S.calMonth = today.slice(0, 7);
  const [y, mo] = S.calMonth.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const offset = (first.getDay() + 6) % 7; const n = new Date(y, mo, 0).getDate();
  const jobs = {}; allSlots().forEach((s) => { const a = S.asg[s.key]; if (a && a.tech_id === t.id && (a.status === 'zugesagt' || a.status === 'angefragt')) jobs[s.date] = a.status; });
  const mine = S.unav.filter((u) => u.tech_id === t.id && u.day.startsWith(S.calMonth)).sort((a, b) => a.day.localeCompare(b.day));
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= n; d++) {
    const iso = S.calMonth + '-' + String(d).padStart(2, '0'); const wd = (offset + d - 1) % 7;
    const u = unavOf(t.id, iso); const j = jobs[iso];
    cells += `<button class="cday ${u ? 'off' : ''} ${j ? 'job-' + j : ''} ${wd > 4 ? 'we' : ''} ${iso === today ? 'today' : ''}" data-day="${iso}" ${iso < today ? 'disabled' : ''} title="${u ? esc('Kann nicht' + (u.note ? ': ' + u.note : '')) : j === 'zugesagt' ? 'Einsatz zugesagt' : j ? 'Anfrage offen' : 'antippen = kann nicht'}">${d}</button>`;
  }
  const curIdx = (y * 12 + mo) - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)));
  return `<div class="calcard" id="cal">
    <div class="cal-head"><button class="btn small" data-cal="-1" ${curIdx <= 0 ? 'disabled' : ''} aria-label="Vormonat">‹</button><b>${MON[mo - 1]} ${y}</b><button class="btn small" data-cal="1" ${curIdx >= 5 ? 'disabled' : ''} aria-label="Nächster Monat">›</button></div>
    <div class="cal-grid"><i>Mo</i><i>Di</i><i>Mi</i><i>Do</i><i>Fr</i><i>Sa</i><i>So</i>${cells}</div>
    <div class="cal-note"><input type="text" id="unavNote" placeholder="Grund (optional), z. B. Urlaub – gilt für die nächsten angetippten Tage" value="${esc(S.unavNote || '')}"></div>
    <details class="cal-range" ${S.rangeOpen ? 'open' : ''}><summary>📆 Zeitraum eintragen, z. B. Tour oder Urlaub</summary>
      <div class="range-row"><label>Von<input type="date" id="rFrom" min="${today}" value="${esc(S.rFrom || '')}"></label><label>Bis<input type="date" id="rTo" min="${today}" value="${esc(S.rTo || '')}"></label></div>
      <input type="text" id="rNote" placeholder="Grund, z. B. Tour mit …" value="${esc(S.rNote || '')}">
      <button class="big no solid" id="rAdd">Ganzen Zeitraum als „kann nicht“ eintragen</button>
    </details>
    <div class="cal-legend"><span class="lgd off"></span>kann nicht <span class="lgd l-ok"></span>Einsatz zugesagt <span class="lgd l-ask"></span>Anfrage offen</div>
    <div class="cal-sum">${(() => { const rs = unavRanges(t.id, today); return rs.length ? `<b>Deine eingetragenen Abwesenheiten</b>${rs.map((r) => `<div class="rline"><span>${r.from === r.to ? shortDate(r.from) : shortDate(r.from) + ' – ' + shortDate(r.to)} <small>${r.days.length} Tag${r.days.length > 1 ? 'e' : ''}${r.note ? ' · ' + esc(r.note) : ''}</small></span><button class="linkbtn danger" data-rdel="${r.days.join(',')}">löschen</button></div>`).join('')}` : 'Noch keine Tage eingetragen.'; })()}</div>
  </div>`;
}

function wireTechCal(t) {
  const box = $('#cal'); if (!box) return;
  const redraw = () => { box.outerHTML = techCalHtml(t); wireTechCal(t); };
  box.querySelectorAll('[data-cal]').forEach((b) => (b.onclick = () => {
    const [y, m] = S.calMonth.split('-').map(Number); const d = new Date(y, m - 1 + Number(b.dataset.cal), 1);
    S.calMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); redraw();
  }));
  $('#unavNote').oninput = (e) => (S.unavNote = e.target.value);
  box.querySelector('.cal-range').ontoggle = (e) => (S.rangeOpen = e.target.open);
  ['rFrom', 'rTo', 'rNote'].forEach((id) => ($('#' + id).oninput = (e) => {
    S[id] = e.target.value;
    if (id === 'rFrom' && (!$('#rTo').value || $('#rTo').value < e.target.value)) { $('#rTo').value = e.target.value; S.rTo = e.target.value; }
  }));
  $('#rAdd').onclick = async () => {
    const from = $('#rFrom').value; const to = $('#rTo').value || from; const note = $('#rNote').value.trim();
    if (!from) return toast('Bitte ein Startdatum wählen.');
    if (to < from) return toast('„Bis“ liegt vor „Von“.');
    if (from < todayISO()) return toast('Der Zeitraum darf nicht in der Vergangenheit beginnen.');
    const days = daysBetween(from, to);
    if (days.length > 120) return toast('Bitte höchstens 120 Tage auf einmal eintragen.');
    const clash = allSlots().filter((x) => days.includes(x.date) && S.asg[x.key] && S.asg[x.key].tech_id === t.id && S.asg[x.key].status === 'zugesagt');
    if (clash.length && !confirm(`In diesem Zeitraum hast du ${clash.length} Einsatz/Einsätze schon zugesagt. Trotzdem eintragen? Bitte sag dann auch ${CFG.senderName} Bescheid.`)) return;
    const btn = $('#rAdd'); btn.disabled = true;
    try {
      await store.setUnavMany(t.id, days, note);
      notify('admins', [], `${firstName(t)} kann nicht`, `${shortDate(from)}${from !== to ? ' – ' + shortDate(to) : ''}${note ? ' (' + note + ')' : ''}`, 'unav-' + t.id);
      const set = new Set(days); S.unav = S.unav.filter((u) => !(u.tech_id === t.id && set.has(u.day))).concat(days.map((day) => ({ tech_id: t.id, day, note })));
      S.rFrom = S.rTo = S.rNote = ''; S.calMonth = from.slice(0, 7);
      toast(`${days.length} Tag${days.length > 1 ? 'e' : ''} eingetragen (${shortDate(from)}${from !== to ? ' – ' + shortDate(to) : ''})`);
      redraw();
    } catch (e) { btn.disabled = false; toast(e.message); }
  };
  box.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
    const days = b.dataset.rdel.split(',');
    if (days.length > 1 && !confirm(`Diese ${days.length} Tage wieder freigeben?`)) return;
    try { await store.clearUnavMany(t.id, days); const set = new Set(days); S.unav = S.unav.filter((u) => !(u.tech_id === t.id && set.has(u.day))); redraw(); } catch (e) { toast(e.message); }
  }));
  box.querySelectorAll('[data-day]').forEach((b) => (b.onclick = async () => {
    const day = b.dataset.day; const had = unavOf(t.id, day);
    if (!had && b.classList.contains('job-zugesagt') && !confirm('An diesem Tag hast du schon einen Einsatz zugesagt. Trotzdem als „kann nicht“ eintragen? Bitte sag dann auch ' + CFG.senderName + ' Bescheid.')) return;
    b.disabled = true;
    try {
      if (had) { await store.clearUnav(t.id, day); S.unav = S.unav.filter((u) => !(u.tech_id === t.id && u.day === day)); }
      else { const note = (S.unavNote || '').trim(); await store.setUnav(t.id, day, note); S.unav.push({ tech_id: t.id, day, note }); notify('admins', [], `${firstName(t)} kann nicht`, fmtDate(day, true) + (note ? ' (' + note + ')' : ''), 'unav-' + t.id); }
      redraw();
    } catch (e) { b.disabled = false; toast(e.message); }
  }));
}


/* ---------------- Einsatz-Details (Techniker) ---------------- */
const WD_L = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const longDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return WD_L[d.getDay()] + ', ' + d.getDate() + '. ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
const daysUntil = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
const untilTxt = (iso) => { const n = daysUntil(iso); return n === 0 ? 'heute' : n === 1 ? 'morgen' : n === 2 ? 'übermorgen' : n > 0 ? 'in ' + n + ' Tagen' : 'vorbei'; };
const parseSpan = (z) => { const m = /(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/.exec(z || ''); if (!m) return null; const a = +m[1] + m[2] / 60; let b = +m[3] + m[4] / 60; if (b <= a) b += 24; return [a, b]; };
const hm = (h) => String(Math.floor(h) % 24).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
const DONE_K = 'kom27-done';
const doneGet = () => ls.get(DONE_K) || {};
const isImportant = (l) => /probe|!|achtung|wichtig|signal|umbau|nach va|vor va|ggf|klärung/i.test(l);

function colleaguesOf(s) {
  if (S.viewer) return Object.values(S.komAsg || {}).filter((k) => k.slot_key.startsWith(s.date + '#') && k.slot_key !== s.key).map((k) => { const x = allSlots().find((y) => y.key === k.slot_key) || {}; return { name: k.name, status: k.status, zeit: x.zeit, same: x.va === s.va }; });
  const mine = S.asg[s.key]; const myId = mine && mine.tech_id;
  if (S.admin || S.mgrMode) return allSlots().filter((x) => x.date === s.date && x.key !== s.key && S.asg[x.key] && S.asg[x.key].tech_id && S.asg[x.key].tech_id !== myId && ['angefragt', 'zugesagt'].includes(S.asg[x.key].status))
    .map((x) => ({ name: (techById(S.asg[x.key].tech_id) || {}).name || '?', status: S.asg[x.key].status, zeit: x.zeit, same: x.va === s.va }));
  return (S.coll || []).filter((c) => c.slot_key.startsWith(s.date + '#')).map((c) => {
    const x = allSlots().find((y) => y.key === c.slot_key) || {};
    return { name: c.name, status: c.status, zeit: x.zeit, same: x.va === s.va };
  });
}

function timeline(s) {
  const det = s.det || {};
  const rows = [[S.viewer ? 'Techniker' : 'Dein Einsatz', s.zeit, 'tl-me'], ['Raum gebucht', det.buch, 'tl-b'], ['Veranstaltung', det.vazeit || s.day.vazeit, 'tl-va']].map(([l, z, c]) => [l, z, c, parseSpan(z)]).filter((r) => r[3]);
  if (rows.length < 2) return '';
  const lo = Math.floor(Math.min(...rows.map((r) => r[3][0]))); const hi = Math.ceil(Math.max(...rows.map((r) => r[3][1]))); const span = Math.max(hi - lo, 1);
  const ticks = []; for (let h = lo; h <= hi; h += span > 10 ? 2 : 1) ticks.push(`<i style="left:${((h - lo) / span) * 100}%">${hm(h).slice(0, 2)}</i>`);
  return `<div class="tl">${rows.map(([l, z, c, [a, b]]) => `<div class="tl-row"><span class="tl-l">${l}</span><div class="tl-track"><div class="tl-bar ${c}" style="left:${((a - lo) / span) * 100}%;width:${((b - a) / span) * 100}%"></div></div></div>`).join('')}
    <div class="tl-row"><span class="tl-l"></span><div class="tl-ticks">${ticks.join('')}</div></div></div>`;
}

// Zellentext aus der Excel in Aufbau-Punkte zerlegen. In der Excel ist der Text oft von Hand umbrochen –
// Folgezeilen (nach „für“, „dem“, „v.“, offener Klammer …) gehören zum Punkt davor, „(…)“ ist ein Hinweis zum Punkt davor.
const CONT_END = /(?:\s(?:für|v\.|von|vom|dem|den|der|die|das|des|im|in|am|an|auf|aus|bei|mit|nach|vor|zur|zum|und|oder|sowie|inkl\.|incl\.|ca\.|bzw\.|evtl\.|ggf\.|je|pro)|[A-Za-zÄÖÜäöüß]-)$/i;
function equipItems(text) {
  const out = []; let hard = true;
  const opn = (t) => (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length;
  String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
    const l = raw.replace(/\t+/g, ' ').replace(/\s*\|\s*Stück\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!l) { hard = true; return; }
    const prev = out[out.length - 1]; const last = prev ? (prev.sub != null ? prev.sub : prev.t) : '';
    if (prev && !hard && (opn(last) || CONT_END.test(' ' + last))) { if (prev.sub != null) prev.sub += ' ' + l; else prev.t += ' ' + l; }
    else if (prev && !hard && l[0] === '(') prev.sub = prev.sub ? prev.sub + ' ' + l : l;
    else out.push({ t: l, sub: null });
    hard = false;
  });
  if (out.length === 1 && !out[0].sub && out[0].t.split(',').length > 2) return out[0].t.split(',').map((x) => ({ t: x.trim(), sub: null })).filter((x) => x.t);
  return out;
}
function equipHtml(s) {
  const det = s.det || {};
  let rooms = det.rooms && det.rooms.length ? det.rooms : null;
  if (!rooms && s.day.info) rooms = s.day.info.split(' · ').map((x) => { const i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : ['', x]; });
  if (!rooms) return `<p class="muted">Für diesen Tag steht in der Excel noch nichts zum Aufbau.</p>`;
  const done = doneGet()[s.key] || [];
  return rooms.map(([room, text], ri) => {
    const items = equipItems(text);
    return `<div class="room"><div class="room-h">📍 ${esc(room || 'Raum')}</div><ul class="check">${items.map((it, ii) => { const id = ri + '.' + ii; const on = done.includes(id);
      return `<li class="${on ? 'done' : ''} ${isImportant(it.t + ' ' + (it.sub || '')) ? 'imp' : ''}"><label><input type="checkbox" data-chk="${id}" ${on ? 'checked' : ''}><span>${esc(it.t)}${it.sub ? `<small class="sub">${esc(it.sub)}</small>` : ''}</span></label></li>`; }).join('')}</ul></div>`;
  }).join('');
}

function openJob(key, list) {
  const s = allSlots().find((x) => x.key === key); if (!s) return;
  const a = S.asg[s.key] || {}; const det = s.det || {};
  const grp = s.group ? allSlots().filter((x) => x.group === s.group && S.asg[x.key] && S.asg[x.key].tech_id === a.tech_id) : [s];
  const gi = grp.findIndex((x) => x.key === s.key);
  const coll = colleaguesOf(s);
  const isOffer = !S.admin && !S.viewer && !a.tech_id && !!offerOf(s.key);
  const meIn = isOffer && (S.interest || []).some((i) => i.slot_key === s.key);
  const ko = S.viewer ? komOf(s.key) : null;
  const status = S.viewer ? (ko ? ko.status : 'leer') : isOffer ? 'offen' : a.status || 'geplant';
  const stTxt = S.viewer ? (ko ? `${ko.name} · ${ko.status === 'zugesagt' ? 'zugesagt ✓' : 'angefragt'}` : 'Noch nicht besetzt')
    : { angefragt: 'Wartet auf deine Antwort', zugesagt: 'Zugesagt ✓', abgesagt: 'Abgesagt', geplant: 'Geplant', offen: meIn ? 'Du hast dich gemeldet ✓' : 'Offener Einsatz' }[status];
  const fact = (lbl, val, big) => val ? `<div class="fact ${big ? 'big' : ''}"><small>${lbl}</small><b>${esc(niceTime(val))}</b></div>` : '';
  const old = !s.det;
  const html = `<div class="sheet-bg" id="sheet"><div class="sheet" role="dialog" aria-modal="true" aria-label="Einsatz-Details">
    <div class="sh-top"><button class="sh-x" data-close aria-label="Schließen">✕</button><span class="pill st-${status}">${stTxt}</span></div>
    <div class="sh-head">
      <div class="sh-date">${dateBox(s.date)}<div><h2>${esc(longDate(s.date))}</h2><span class="until">${untilTxt(s.date)}</span></div></div>
      <div class="sh-va">${esc(s.va || 'Einsatz')}${s.label && s.label.replace(/\s/g, '') !== (s.va || '') ? ' · ' + esc(s.label) : ''}</div>
      ${grp.length > 1 ? `<div class="sh-days"><span>Tag ${gi + 1} von ${grp.length}</span>${grp.map((x) => `<button class="chip ${x.key === s.key ? 'on' : ''}" data-jump="${esc(x.key)}">${shortDate(x.date)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="facts">${fact(isOffer || S.viewer ? 'Einsatzzeit' : 'Deine Einsatzzeit', s.zeit || '–', true)}${fact('Veranstaltung (VA-Zeit)', det.vazeit || s.day.vazeit)}${fact('Einlass', det.einlass)}${fact('Raum gebucht', det.buch)}</div>
    ${timeline(s)}
    ${s.note ? `<div class="hint">📝 ${esc(s.note)}</div>` : ''}
    <h3>🛠 ${S.viewer ? 'Aufbau' : 'Das baust du auf'}</h3>
    ${equipHtml(s)}
    ${old ? `<p class="muted small">Tipp für ${esc(CFG.senderName)}: Excel einmal neu einlesen, dann erscheint hier die Liste Punkt für Punkt.</p>` : `<p class="muted small">Abhaken ist nur für dich – praktisch beim Aufbau.</p>`}
    ${(det.extras || []).length ? `<h3>ℹ️ Weitere Infos</h3><dl class="extras">${det.extras.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>` : ''}
    ${a.actual_start ? `<div class="hint ok">⏱ Bestätigte Arbeitszeit: ${esc(a.actual_start)}–${esc(a.actual_end)}${a.break_min ? ', ' + a.break_min + ' min Pause' : ''} = ${fmtH(actualHours(a))}</div>` : ''}
    ${isOffer ? '' : `<h3>👥 ${S.viewer ? 'Weitere Techniker an dem Tag' : 'Mit dir im Haus'}</h3>`}
    ${isOffer ? '' : coll.length ? `<div class="coll">${coll.map((c) => `<span class="cchip ${c.status}">${esc(c.name)}${c.zeit ? ' <small>' + esc(c.zeit) + '</small>' : ''}${c.status === 'angefragt' ? ' <small>(angefragt)</small>' : ''}</span>`).join('')}</div>` : `<p class="muted">${S.viewer ? 'Sonst ist niemand eingeteilt.' : 'Nach aktuellem Stand bist du allein eingeteilt.'}</p>`}
    <h3>🏢 Medientechnik KOM27 vor Ort</h3>
    ${!s.day.kom ? `<p class="muted small">Erscheint nach dem nächsten Einlesen der Excel.</p>` : s.day.kom.length ? `<div class="coll">${s.day.kom.map((n) => `<span class="cchip kom">${esc(n)}</span>`).join('')}</div>` : `<p class="muted">Laut Excel ist an dem Tag niemand von der KOM27-Medientechnik eingetragen.</p>`}
    <h3>📍 Ort</h3>
    <p>KOM27, Mauerstraße, Berlin · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('KOM27 Mauerstraße Berlin')}" target="_blank" rel="noopener">Route öffnen</a></p>
    <div class="sh-actions">
      ${status === 'angefragt' && !S.admin && !S.viewer && !(hasMgr(myTech()) && !S.mgrMode && a.tech_reply) ? (S.mgrMode ? `<button class="big yes" data-ans="zugesagt">✓ Zusagen für ${esc(((techById(a.tech_id) || {}).name || '').split(' ')[0])}</button><button class="big no" data-ans="abgesagt">✗ Absagen</button>` : `<button class="big yes" data-ans="zugesagt">${hasMgr(myTech()) ? '👍 Ich könnte' : '✓ Ich kann'}</button><button class="big no" data-ans="abgesagt">✗ Kann nicht</button>`) : ''}
      ${status === 'zugesagt' && !S.viewer ? `<button class="big ghost" data-ics>📅 In meinen Kalender</button>` : ''}
      ${isOffer ? (meIn ? `<button class="big ghost" data-oint="off">Meldung zurückziehen</button>` : `<button class="big yes" data-oint="on">🙋 Ich hätte Zeit</button>`) : ''}
    </div>
  </div></div>`;
  const old_ = $('#sheet'); if (old_) old_.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.classList.add('noscroll');
  const box = $('#sheet');
  const close = () => { box.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector('[data-close]').onclick = close;
  box.querySelectorAll('[data-jump]').forEach((b) => (b.onclick = () => openJob(b.dataset.jump)));
  box.querySelectorAll('[data-chk]').forEach((c) => (c.onchange = () => {
    const all = doneGet(); const cur = new Set(all[s.key] || []); c.checked ? cur.add(c.dataset.chk) : cur.delete(c.dataset.chk);
    all[s.key] = [...cur]; ls.set(DONE_K, all); c.closest('li').classList.toggle('done', c.checked);
  }));
  const ics = box.querySelector('[data-ics]'); if (ics) ics.onclick = () => icsFor([s], myTech() || { name: 'KOM27' });
  box.querySelectorAll('[data-oint]').forEach((b) => (b.onclick = () => { close(); if (window.__interest) window.__interest([s.key], b.dataset.oint === 'on'); }));
  box.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = async () => {
    let note = '';
    if (b.dataset.ans === 'abgesagt') { const r = prompt('Kurzer Grund (optional):', ''); if (r === null) return; note = r.trim(); }
    close(); if (window.__answer) window.__answer([s.key], b.dataset.ans, note);
  }));
}

/* ---------------- Arbeitszeiten ---------------- */
const toH = (x) => { const m = /(\d{1,2})[:.](\d{2})/.exec(x || ''); return m ? +m[1] + m[2] / 60 : null; };
const legalBreak = (h) => (h > 9 ? 45 : h > 6 ? 30 : 0); // Pause nach ArbZG in Minuten
function planHours(s) { const p = parseSpan(s.zeit); if (!p) return 0; const g = p[1] - p[0]; return g - legalBreak(g) / 60; }
function actualHours(a) { if (!a || !a.actual_start) return null; const st = toH(a.actual_start); let en = toH(a.actual_end); if (st === null || en === null) return null; if (en <= st) en += 24; return Math.max(0, en - st - (a.break_min || 0) / 60); }
const fmtH = (h) => (Math.round(h * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' h';
const planFrom = (s) => { const m = /(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/.exec(s.zeit || ''); return m ? [pad(+m[1]) + ':' + m[2], pad(+m[3]) + ':' + m[4]] : ['', '']; };
function timeForm(s, a) {
  const [ps, pe] = planFrom(s); const st = a.actual_start || ps; const en = a.actual_end || pe;
  const g = (() => { const x = toH(st); let y = toH(en); if (x === null || y === null) return 0; if (y <= x) y += 24; return y - x; })();
  const brk = a.break_min ?? legalBreak(g);
  return `<div class="tform" data-tk="${esc(s.key)}">
    <div class="tf-row"><label>Beginn<input type="time" data-f="st" value="${esc(st)}"></label><label>Ende<input type="time" data-f="en" value="${esc(en)}"></label>
      <label>Pause<select data-f="br">${[0, 15, 30, 45, 60, 90].map((v) => `<option value="${v}" ${v === brk ? 'selected' : ''}>${v} min</option>`).join('')}</select></label></div>
    <input type="text" data-f="nt" placeholder="Anmerkung (optional), z. B. länger wegen Abbau" value="${esc(a.time_note || '')}">
    <div class="tf-foot"><span class="tf-sum"></span><button class="btn primary" data-tsave>Zeit bestätigen ✓</button></div></div>`;
}
function wireTimeForms(root, saveFn) {
  root.querySelectorAll('.tform').forEach((f) => {
    const v = (k) => f.querySelector(`[data-f="${k}"]`).value;
    const upd = () => { const h = actualHours({ actual_start: v('st'), actual_end: v('en'), break_min: +v('br') }); f.querySelector('.tf-sum').textContent = h === null ? '' : '= ' + fmtH(h) + ' Arbeitszeit'; };
    f.querySelectorAll('input,select').forEach((x) => (x.oninput = upd)); upd();
    f.querySelector('[data-tsave]').onclick = () => { if (!v('st') || !v('en')) return toast('Bitte Beginn und Ende eintragen.'); saveFn(f.dataset.tk, v('st'), v('en'), +v('br'), v('nt').trim()); };
  });
}

/* ---------------- Kalender-Abo ---------------- */
const calUrl = (t) => (!DEMO && t && t.cal_token && CFG.supabaseUrl ? `${CFG.supabaseUrl.replace(/\/$/, '')}/functions/v1/ics?t=${t.cal_token}` : '');
function calSheet(t, yes) {
  const url = calUrl(t); const web = url.replace(/^https?:/, 'webcal:');
  const html = `<div class="sheet-bg" id="sheet"><div class="sheet" role="dialog" aria-modal="true" aria-label="Kalender">
    <div class="sh-top"><button class="sh-x" data-close aria-label="Schließen">✕</button></div>
    <h2 style="margin:0 0 6px">📅 Einsätze im Kalender</h2>
    ${url ? `<p class="muted">Einmal abonnieren – danach erscheinen neue Einsätze, Zeitänderungen und Absagen automatisch in deinem Handy-Kalender. Anfragen stehen mit ❓ drin, bis sie zugesagt sind.</p>
      <div class="cal-opts">
        <a class="big yes" href="${esc(web)}">🍎 iPhone / Mac: Kalender abonnieren</a>
        <button class="big ghost" data-copy>🔗 Link kopieren (Google / Outlook)</button>
      </div>
      <details class="cal-help"><summary>So geht’s bei Google Kalender</summary><ol><li>Link oben kopieren</li><li>calendar.google.com am Computer öffnen → links „Weitere Kalender +“ → „Per URL“</li><li>Link einfügen → „Kalender hinzufügen“. Er erscheint danach auch in der Google-Kalender-App.</li></ol></details>
      <p class="muted small">Der Link ist persönlich – bitte nicht weitergeben. <button class="linkbtn danger" data-renew>Link erneuern</button> (der alte funktioniert dann nicht mehr)</p>` : `<p class="muted">Das Kalender-Abo ist bald verfügbar. Bis dahin kannst du deine Einsätze einmalig in den Kalender übernehmen.</p>`}
    <button class="big ghost" data-dl ${yes.length ? '' : 'disabled'}>⬇ Einmalig herunterladen (${yes.length} Einsätze)</button>
  </div></div>`;
  const old = $('#sheet'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html); document.body.classList.add('noscroll');
  const box = $('#sheet'); const close = () => { box.remove(); document.body.classList.remove('noscroll'); };
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector('[data-close]').onclick = close;
  box.querySelector('[data-dl]').onclick = () => icsFor(yes, t);
  const cp = box.querySelector('[data-copy]');
  if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link kopiert ✓'); } catch (e) { prompt('Link kopieren:', url); } };
  const rn = box.querySelector('[data-renew]');
  if (rn) rn.onclick = async () => { if (!confirm('Neuen Link erstellen? Der alte Kalender-Link funktioniert dann nicht mehr – du musst neu abonnieren.')) return; try { t.cal_token = await store.newCalToken(); close(); calSheet(t, yes); toast('Neuer Link erstellt'); } catch (e) { toast(e.message); } };
}

/* ---------------- Druckansicht / PDF ---------------- */
function printDoc(title, body) {
  const w = window.open('', '_blank'); if (!w) return toast('Bitte Pop-ups für diese Seite erlauben.');
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
    body{font:12px/1.4 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1c1f24;margin:18px}h1{font-size:18px;margin:0 0 2px}.sub{color:#69707c;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border-bottom:1px solid #dde1e7;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f4f7;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
    tr.wk td{background:#f7f8fa;font-weight:700;color:#69707c}.st{font-size:11px;font-weight:600;border-radius:99px;padding:1px 6px;color:#fff;white-space:nowrap}
    .zugesagt{background:#16884a}.angefragt{background:#1f6feb}.geplant{background:#7a828f}.abgesagt{background:#d1342f}.leer{background:#c27c00}.r{text-align:right}.muted{color:#69707c}
    .bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;border-bottom:1px solid #dde1e7}.bar button{font-size:14px;padding:8px 14px;border-radius:8px;border:0;background:#1f5eff;color:#fff}
    @media print{.bar{display:none}body{margin:0}tr{break-inside:avoid}}</style></head><body>
    <div class="bar"><button onclick="window.print()">🖨 Drucken / als PDF sichern</button></div>${body}
    <p class="muted">Erstellt ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · KOM27 Einsatzplanung</p></body></html>`);
  w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
}
function printMonth(month) {
  const days = allDays().filter((d) => d.date.startsWith(month) && (d.slots.length || d.vas.length) && !d.free);
  let lastWk = null; let rows = '';
  days.forEach((d) => {
    const wk = isoWeek(d.date); if (wk !== lastWk) { rows += `<tr class="wk"><td colspan="6">KW ${wk}</td></tr>`; lastWk = wk; }
    const sl = d.slots.length ? d.slots : [null];
    sl.forEach((x, i) => { const a = x && S.asg[x.key]; const t = a && a.tech_id ? techById(a.tech_id) : null; const st = x ? slotState(x) : '';
      rows += `<tr><td>${i === 0 ? fmtDate(d.date) : ''}</td><td>${esc(x ? x.va || '' : [...new Set(d.vas)].join(', '))}${d.cancelled ? ' <b>(abgesagt)</b>' : ''}</td><td>${i === 0 ? esc(roomsOf(d.info)) : ''}</td><td>${esc(x ? x.zeit || '' : '')}</td><td>${t ? esc(t.name) + (hasMgr(t) ? ' <span class="muted">(' + esc(mgrLabel(t)) + ')</span>' : '') : x ? '–' : '<span class="muted">kein Techniker</span>'}</td><td>${x ? `<span class="st ${st}">${st === 'leer' ? 'offen' : ST_LABEL[st]}</span>` : ''}</td></tr>`; });
  });
  printDoc(`KOM27 Einsatzplan ${MON[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`, `<h1>Medientechnik KOM27 – Einsatzplan ${MON[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}</h1><p class="sub">ÖPP Mauerstraße · Excel-Stand ${S.plan ? new Date(S.plan.importedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</p>
    <table><thead><tr><th>Datum</th><th>Veranstaltung</th><th>Raum</th><th>Einsatzzeit</th><th>Techniker</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Keine Einsätze</td></tr>'}</tbody></table>`);
}
function printHours(month) {
  const sl = allSlots().filter((x) => x.date.startsWith(month) && S.asg[x.key] && S.asg[x.key].tech_id && S.asg[x.key].status === 'zugesagt' && !x.day.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const per = {}; sl.forEach((x) => (per[S.asg[x.key].tech_id] = per[S.asg[x.key].tech_id] || []).push(x));
  const n = (h) => (h === null || h === undefined ? '–' : String(Math.round(h * 100) / 100).replace('.', ','));
  let tot = [0, 0]; let body = '';
  S.techs.filter((t) => per[t.id]).forEach((t) => {
    const l = per[t.id]; let p = 0; let ist = 0;
    const rows = l.map((x) => { const a = S.asg[x.key]; const ih = actualHours(a); p += planHours(x); ist += ih || 0;
      return `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.va || '')}</td><td>${esc(x.zeit || '')}</td><td>${a.actual_start ? esc(a.actual_start) + '–' + esc(a.actual_end) : '–'}</td><td class="r">${a.break_min ?? '–'}</td><td class="r">${n(planHours(x))}</td><td class="r"><b>${n(ih)}</b></td><td>${esc(a.time_note || '')}</td></tr>`; }).join('');
    tot = [tot[0] + p, tot[1] + ist];
    body += `<h2 style="font-size:14px;margin:12px 0 4px">${esc(t.name)}${t.company ? ' <span class="muted">· ' + esc(t.company) + '</span>' : ''}</h2><table><thead><tr><th>Datum</th><th>VA</th><th>Plan</th><th>Ist</th><th class="r">Pause</th><th class="r">Plan h</th><th class="r">Ist h</th><th>Anmerkung</th></tr></thead>
      <tbody>${rows}<tr><td colspan="5"><b>Summe ${l.length} Einsätze</b></td><td class="r"><b>${n(p)}</b></td><td class="r"><b>${n(ist)}</b></td><td></td></tr></tbody></table>`;
  });
  printDoc(`KOM27 Stunden ${MON[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`, `<h1>Medientechnik KOM27 – Stundenübersicht ${MON[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}</h1><p class="sub">${sl.length} zugesagte Einsätze · Plan ${n(tot[0])} h · bestätigt ${n(tot[1])} h (Plan = Einsatzzeit abzüglich gesetzlicher Pause)</p>${body || '<p>Keine zugesagten Einsätze.</p>'}`);
}

/* ---------------- Projektleiter (Techniker mit eigenem Chef) ---------------- */
function renderManager(team, me) {
  document.body.classList.remove('is-master');
  S.mgrMode = true;
  const today = todayISO(); const ids = new Set(team.map((x) => x.id));
  $('#app').innerHTML = header() + `<main class="mine is-dash" id="main"></main>`;
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  const m = $('#main');
  const sl = allSlots().filter((x) => x.date >= today && S.asg[x.key] && ids.has(S.asg[x.key].tech_id) && !x.day.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const st = (x) => S.asg[x.key].status;
  const groups = []; const gi = {};
  sl.filter((x) => st(x) === 'angefragt').forEach((x) => { const tid = S.asg[x.key].tech_id; const k = tid + '|' + (x.group || x.key); if (!(k in gi)) { gi[k] = groups.length; groups.push({ k, t: techById(tid), va: x.va, slots: [] }); } groups[gi[k]].slots.push(x); });
  const yes = sl.filter((x) => st(x) === 'zugesagt');
  const company = [...new Set(team.map((x) => x.company).filter(Boolean))].join(', ');
  const sig = (a) => (a.tech_reply === 'kann' ? '<span class="sig ok">👍 kann</span>' : a.tech_reply === 'kann_nicht' ? '<span class="sig no">✗ kann nicht</span>' : '<span class="sig">– noch keine Meldung</span>');
  const card = (g) => `<article class="job-card" data-mg="${esc(g.k)}">
      <div class="jc-head"><span class="jc-who">👤 ${esc(g.t ? g.t.name : '?')}</span>${g.slots.length > 1 ? `<span class="jc-badge">${g.slots.length} Tage</span>` : ''}</div>
      <div class="jc-where">${esc(g.va || 'Einsatz')} · KOM27 Mauerstraße${roomsOf(g.slots[0].day.info) ? ' · ' + esc(roomsOf(g.slots[0].day.info)) : ''}</div>
      <div class="jc-days">${g.slots.map((x) => `<div class="jc-day" data-k="${esc(x.key)}">${dateBox(x.date)}<button class="jc-time jc-open" data-open="${esc(x.key)}"><b>${esc(niceTime(x.zeit))}</b><small>${sig(S.asg[x.key])}${S.asg[x.key].tech_reply_note ? ' „' + esc(S.asg[x.key].tech_reply_note) + '“' : ''}${unavOf(g.t.id, x.date) ? ' · ⛔ als „kann nicht“ eingetragen' : ''}</small><span class="jc-more">Details ›</span></button></div>`).join('')}</div>
      <div class="jc-actions"><button class="big yes" data-mok="${esc(g.slots.map((x) => x.key).join(','))}">✓ Zusagen${g.slots.length > 1 ? ' – alle Tage' : ''}</button><button class="big no" data-mno="${esc(g.slots.map((x) => x.key).join(','))}">✗ Absagen</button></div>
    </article>`;
  const ranges = team.map((x) => ({ t: x, r: unavRanges(x.id, today) }));
  const nAbs = ranges.reduce((n, x) => n + x.r.length, 0);
  const clash = (tid, days) => allSlots().filter((x) => days.includes(x.date) && S.asg[x.key] && S.asg[x.key].tech_id === tid && ['angefragt', 'zugesagt'].includes(S.asg[x.key].status));
  const span = (x) => (x.from === x.to ? fmtDate(x.from) : `${fmtDate(x.from)} – ${fmtDate(x.to)}`);
  const absList = ranges.map(({ t, r }) => `<div class="ab-t"><div class="ab-h"><b>${esc(t.name)}</b><span>${r.length ? r.reduce((n, x) => n + x.days.length, 0) + ' Tag' + (r.reduce((n, x) => n + x.days.length, 0) > 1 ? 'e' : '') + ' abwesend' : 'keine Abwesenheit'}</span></div>
      ${r.map((x) => { const c = clash(t.id, x.days); return `<div class="ab-r"><div><b>${esc(span(x))}</b><small>${x.days.length} Tag${x.days.length > 1 ? 'e' : ''}${x.note ? ' · ' + esc(x.note) : ''}</small>${c.length ? `<small class="ab-warn">⚠ eingeteilt am ${esc(c.map((y) => fmtDate(y.date)).join(', '))}</small>` : ''}</div><button class="ab-del" data-mdel="${t.id}|${x.days.join(',')}" aria-label="Abwesenheit löschen" title="löschen">✕</button></div>`; }).join('')}</div>`).join('');
  m.innerHTML = `
    <section class="hello hi-line hi-mgr">
      <h1>Freigaben für dein Team</h1>
      <p>KOM27 Mauerstraße · Medientechnik${company ? ' · ' + esc(company) : ''}</p>
      <div id="pushBox"></div>
      <div class="sumrow">
        <a href="#openSec" class="sumbox ${groups.length ? 'warn' : ''}"><b>${sl.filter((x) => st(x) === 'angefragt').length}</b><span>Anfragen warten auf Freigabe</span></a>
        <div class="sumbox ok"><b>${yes.length}</b><span>zugesagte Einsätze</span></div>
        <a href="#absSec" class="sumbox"><b>${nAbs}</b><span>${nAbs === 1 ? 'Abwesenheit' : 'Abwesenheiten'} eingetragen</span></a>
      </div>
    </section>
    ${me ? `<button class="big ghost" id="toMe">🙋 Zu meinen eigenen Einsätzen</button>` : ''}
    <div class="dash"><div class="dash-main">
    ${groups.length ? `<h2 class="sec" id="openSec">Bitte freigeben <span class="sec-n">${groups.reduce((n, g) => n + g.slots.length, 0)}</span></h2><p class="sec-help">Deine Techniker sehen die Anfragen auch und melden, ob sie könnten. Die verbindliche Zusage gibst du.</p>${groups.map(card).join('')}` : `<div class="allgood" id="openSec">✓ Keine offenen Anfragen<small>Neue Anfragen bekommst du per Push oder E-Mail.</small></div>`}
    </div><aside class="dash-side">
    <section class="dpanel abs" id="absSec">
      <h2 class="sec">⛔ Abwesenheiten im Team</h2>
      <p class="sec-help">An diesen Tagen wird niemand aus deinem Team eingeplant.</p>
      <div class="ab-list">${absList}</div>
      <details class="ab-add" ${S.absOpen ? 'open' : ''}><summary>＋ Abwesenheit eintragen</summary>
        <div class="ab-form">
          <label class="f2">Techniker<select id="mT">${team.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
          <label>Von<input type="date" id="mFrom" min="${today}"></label>
          <label>Bis<input type="date" id="mTo" min="${today}"></label>
          <label class="f2">Grund (optional)<input type="text" id="mNote" placeholder="z. B. anderes Projekt, Urlaub" maxlength="80"></label>
          <button class="big no solid f2" id="mAdd">⛔ Als „kann nicht“ eintragen</button>
        </div>
      </details>
    </section>
    ${yes.length ? `<section class="dpanel"><h2 class="sec">Kommende Einsätze deines Teams</h2><div class="mini-list">${yes.map((x) => `<div class="mini-line">${dateBox(x.date)}<button class="ml-txt jc-open" data-open="${esc(x.key)}"><b>${esc((techById(S.asg[x.key].tech_id) || {}).name || '')} · ${esc(niceTime(x.zeit))}</b><small>${esc(x.va || '')} · ${untilTxt(x.date)}</small><span class="jc-more">Details ›</span></button></div>`).join('')}</div></section>` : ''}
    </aside></div>
    <p class="note center">Fragen? ${esc(CFG.senderName)} erreichst du über die Anfrage-Mail.</p>${legalFoot()}`;
  const ad = m.querySelector('.ab-add'); if (ad) ad.ontoggle = () => (S.absOpen = ad.open);
  const decide = async (keys, status, note) => {
    const prev = keys.map((k) => S.asg[k]); const t = techById(S.asg[keys[0]].tech_id);
    const ok = await optimistic(() => keys.forEach((k) => (S.asg[k] = Object.assign({}, S.asg[k], { status, note: note || '', updated_at: nowISO() }))),
      () => Promise.all(keys.map((k) => store.respond(S.user.email, k, status, note || ''))), '#openSec', () => keys.forEach((k, i) => (S.asg[k] = prev[i])));
    if (!ok) return;
    const dates = allSlots().filter((x) => keys.includes(x.key)).map((x) => fmtDate(x.date)).join(', ');
    notify('admins', [], `${t ? t.name : 'Techniker'}: ${status === 'zugesagt' ? 'zugesagt ✓' : 'abgesagt ✗'} (Projektleiter)`, dates + (note ? ' – „' + note + '“' : ''), 'mgr-' + (t ? t.id : ''));
    if (t) notify('techs', [t.id], status === 'zugesagt' ? 'Einsatz bestätigt ✓' : 'Einsatz abgesagt', `KOM27 ${dates}${status === 'zugesagt' ? ' – dein Projektleiter hat zugesagt.' : ''}`, 'mgr-t-' + t.id);
    toast(status === 'zugesagt' ? 'Zusage gespeichert ✓' : 'Absage gespeichert');
  };
  window.__answer = (keys, status, note) => decide(keys, status, note);
  m.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openJob(b.dataset.open)));
  m.querySelectorAll('[data-mok]').forEach((b) => (b.onclick = () => decide(b.dataset.mok.split(','), 'zugesagt')));
  m.querySelectorAll('[data-mno]').forEach((b) => (b.onclick = () => { const r = prompt('Kurzer Grund (optional):', ''); if (r === null) return; decide(b.dataset.mno.split(','), 'abgesagt', r.trim()); }));
  if ($('#toMe')) $('#toMe').onclick = () => { S.view2 = 'me'; S.mgrMode = false; paint(); window.scrollTo(0, 0); };
  $('#mFrom').oninput = (e) => { if (!$('#mTo').value || $('#mTo').value < e.target.value) $('#mTo').value = e.target.value; };
  $('#mAdd').onclick = async () => {
    const tid = $('#mT').value; const from = $('#mFrom').value; const to = $('#mTo').value || from; const note = $('#mNote').value.trim();
    if (!from) return toast('Bitte ein Startdatum wählen.'); if (to < from) return toast('„Bis“ liegt vor „Von“.');
    const days = daysBetween(from, to); if (days.length > 120) return toast('Bitte höchstens 120 Tage auf einmal.');
    const prev = S.unav; S.absOpen = false;
    const ok = await optimistic(() => { const set = new Set(days); S.unav = S.unav.filter((u) => !(u.tech_id === tid && set.has(u.day))).concat(days.map((day) => ({ tech_id: tid, day, note, created_at: nowISO() }))); },
      () => store.setUnavMany(tid, days, note), null, () => (S.unav = prev));
    if (ok) { notify('admins', [], `${(techById(tid) || {}).name || 'Techniker'} kann nicht`, `${shortDate(from)}${from !== to ? ' – ' + shortDate(to) : ''}${note ? ' (' + note + ')' : ''} · eingetragen vom Projektleiter`, 'unav-' + tid); toast('Eingetragen'); }
  };
  m.querySelectorAll('[data-mdel]').forEach((b) => (b.onclick = () => {
    const [tid, list] = b.dataset.mdel.split('|'); const days = list.split(','); const set = new Set(days); const prev = S.unav;
    optimistic(() => (S.unav = S.unav.filter((u) => !(u.tech_id === tid && set.has(u.day)))), () => store.clearUnavMany(tid, days), null, () => (S.unav = prev));
  }));
  fillPushBox(false);
}

/* ---------------- Heute-Karte für Techniker ---------------- */
function roomsOfSlot(s) {
  const det = s.det || {};
  if (det.rooms && det.rooms.length) return det.rooms;
  return s.day.info ? s.day.info.split(' · ').map((x) => { const i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : ['', x]; }) : [];
}
// Kein Einsatz heute/morgen: kleine Karte mit dem nächsten zugesagten Termin
function nextCard(t) {
  const today = todayISO();
  const s = slotsOfTech(t.id, addDays(today, 1)).filter((x) => x.date > today && S.asg[x.key].status === 'zugesagt' && !x.day.cancelled).sort((a, b) => (a.date + (a.zeit || '')).localeCompare(b.date + (b.zeit || '')))[0];
  if (!s) return '';
  const det = s.det || {};
  return `<button class="tnext" data-open="${esc(s.key)}">
    <span class="tn-lbl">Nächster Einsatz · ${esc(untilTxt(s.date))}</span>
    <span class="tn-time">${esc(fmtDate(s.date))} · ${esc(niceTime(s.zeit))}</span>
    <span class="tn-where">📍 ${esc(roomsOf(s.day.info) || 'KOM27')}${(det.vazeit || s.day.vazeit) ? ' · Veranstaltung ' + esc(det.vazeit || s.day.vazeit) : ''}</span>
    <span class="jc-more">Details ›</span>
  </button>`;
}
function todayCard(t) {
  const today = todayISO(); const tom = addDays(today, 1);
  const on = (d) => slotsOfTech(t.id, d).filter((s) => s.date === d && S.asg[s.key].status === 'zugesagt' && !s.day.cancelled);
  const now = new Date(); const h = now.getHours() + now.getMinutes() / 60;
  let list = on(today); let which = 'heute';
  const endToday = list.length ? (parseSpan(list[list.length - 1].zeit) || [0, 24])[1] : 0;
  if ((!list.length && now.getHours() >= 14) || (list.length && h > endToday + 1)) { const l2 = on(tom); if (l2.length) { list = l2; which = 'morgen'; } else if (!list.length) return ''; }
  if (!list.length) return '';
  const s = list[0]; const det = s.det || {}; const span = parseSpan(s.zeit);
  const hm2 = (x) => { const m = Math.round((x % 24) * 60); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  const dur = (x) => { const m = Math.max(0, Math.round(x * 60)); return m >= 60 ? Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : '') : m + ' Min.'; };
  let state = '', cls = '';
  if (which === 'morgen') state = 'Morgen' + (span ? ' ab ' + hm2(span[0]) + ' Uhr' : '');
  else if (!span) state = 'Heute';
  else if (h < span[0]) { state = 'Beginnt in ' + dur(span[0] - h); cls = h > span[0] - 1.5 ? 'tc-soon' : ''; }
  else if (h < span[1]) { state = 'Läuft · noch bis ' + hm2(span[1]) + ' Uhr'; cls = 'tc-live'; }
  else { state = 'Geschafft 👍'; cls = 'tc-done'; }
  const rooms = roomsOfSlot(s);
  const items = rooms.flatMap(([, txt]) => equipItems(txt));
  const nDone = (doneGet()[s.key] || []).length;
  const hints = items.filter((i) => /probe|achtung|wichtig|signal|!/i.test(i.t) && i.t.length < 90).slice(0, 3);
  const coll = colleaguesOf(s).filter((c) => c.status === 'zugesagt');
  const kom = s.day.kom || [];
  const needTime = which === 'heute' && cls === 'tc-done' && !S.asg[s.key].actual_start;
  return `<section class="tcard ${cls} tc-${which}">
    <div class="td-top"><span class="td-tag">${which === 'heute' ? 'HEUTE' : 'MORGEN'}</span><span class="td-state">${cls === 'tc-live' ? '<i class="pulse"></i>' : ''}${esc(state)}</span></div>
    <div class="td-time">${esc(niceTime(s.zeit))}</div>
    <div class="td-where">📍 ${esc(roomsOf(s.day.info) || 'KOM27')}${(det.vazeit || s.day.vazeit) ? ' · Veranstaltung ' + esc(det.vazeit || s.day.vazeit) : ''}${det.einlass ? ' · Einlass ' + esc(det.einlass) : ''}</div>
    ${hints.map((i) => `<div class="td-hint">⚠️ ${esc(i.t)}</div>`).join('')}
    <div class="td-people">${kom.length ? `<span>🏢 KOM27: <b>${esc(kom.join(', '))}</b></span>` : ''}${coll.length ? `<span>👥 Mit dir: <b>${esc(coll.map((c) => c.name.split(' ')[0]).join(', '))}</b></span>` : ''}</div>
    <button class="big td-go" data-open="${esc(s.key)}">🛠 Aufbauliste & Details${items.length ? ` <small>${nDone}/${items.length} erledigt</small>` : ''}</button>
    <div class="td-more">
      ${needTime ? `<button class="td-link" data-gotime>⏱ Arbeitszeit eintragen</button>` : ''}
      <button class="td-link" data-gokb>📘 KOM27-Infos</button>
      <a class="td-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('KOM27 Mauerstraße Berlin')}" target="_blank" rel="noopener">🗺 Route</a>
      ${list.length > 1 ? `<button class="td-link" data-open="${esc(list[1].key)}">+ ${list.length - 1} weiterer Einsatz</button>` : ''}
    </div>
  </section>`;
}

/* ---------------- KOM27-Infos (gemeinsame Wissenssammlung) ---------------- */
const KB_CATS = [['bedienung', '⚙️', 'Einschalten & Bedienung'], ['zugang', '🔑', 'Zugänge & Logins'], ['raum', '📍', 'Räume & Wege'], ['kontakt', '☎️', 'Kontakte & Notfall'], ['sonst', '💡', 'Tipps & Sonstiges']];
const kbCat = (k) => KB_CATS.find((c) => c[0] === k) || KB_CATS[4];
const KB_DEMO = () => { const n = new Date().toISOString(); const e = (cat, title, body, extra) => Object.assign({ id: 'kb' + Math.random().toString(36).slice(2, 9), cat, title, body, login_user: '', login_pass: '', pinned: false, created_by: 'master@demo.de', created_at: n, updated_by: 'master@demo.de', updated_at: n }, extra || {});
  return [
    e('bedienung', 'LED-Wand Saal 2 einschalten (Beispiel)', '1. Am Touchpanel neben der Bühne „System an“ drücken\n2. ca. 2 Minuten warten, bis die Wand hochgefahren ist\n3. Quelle „HDMI Rednerpult“ wählen\n\nAusschalten immer über das Panel, nie am Hauptschalter!', { pinned: true }),
    e('bedienung', 'Mikrofone: Akkus laden (Beispiel)', 'Ladeschale steht im Technikraum, Regal links. Nach jeder VA alle Handsender zurück in die Schale – Akkus halten ca. 6 Std.'),
    e('zugang', 'Präsentations-Laptop (Beispiel)', 'Laptops liegen im Schrank im Technikraum.', { login_user: 'praesentation', login_pass: 'beispiel123' }),
    e('zugang', 'Gäste-WLAN (Beispiel)', 'Für Referentinnen und Referenten. Zugangsdaten stehen auch auf dem Aufsteller am Empfang.', { login_user: 'KOM27-Gast', login_pass: 'beispiel-wlan' }),
    e('raum', 'Technikraum & Lager (Beispiel)', 'Technikraum: 1. OG, hinter Saal 2 (Schlüssel am Empfang).\nKabel & Adapter: Kisten mit Beschriftung im Lager.'),
    e('kontakt', 'Haustechnik / Hausmeister (Beispiel)', 'Bei Strom, Licht, Klima: Haustechnik über den Empfang anrufen lassen.', { created_by: 'marcel@test.de', updated_by: 'basti@test.de', updated_at: new Date(Date.now() - 864e5).toISOString() }),
  ]; };
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>'); }
const whoName = (email) => { if (!email) return '?'; const em = String(email).toLowerCase(); const t = S.techs.find((x) => (x.email || '').toLowerCase() === em); if (t) return t.name.split(' ')[0]; if (em === CFG.demoAdmin) return CFG.senderName; return em.split('@')[0]; };
function kbHtml() {
  const q = (S.kbQ || '').trim().toLowerCase(); const cat = S.kbCat || '';
  const all = (S.kb || []).slice();
  const hit = (e) => !q || [e.title, e.body, e.login_user, kbCat(e.cat)[2]].join(' ').toLowerCase().includes(q);
  const list = all.filter((e) => (!cat || e.cat === cat) && hit(e));
  const byCat = KB_CATS.map((c) => [c, list.filter((e) => e.cat === c[0]).sort((a, b) => (b.pinned - a.pinned) || a.title.localeCompare(b.title))]).filter(([, l]) => l.length);
  const when = (e) => fmtDate((e.updated_at || e.created_at || '').slice(0, 10));
  const card = (e) => `<details class="kb-card ${e.pinned ? 'pin' : ''}" data-kb="${esc(e.id)}" ${q || S.kbOpen === e.id ? 'open' : ''}>
      <summary><span class="kb-t">${e.pinned ? '📌 ' : ''}${esc(e.title)}</span>${e.login_user || e.login_pass ? '<span class="kb-key" title="mit Zugangsdaten">🔑</span>' : ''}</summary>
      <div class="kb-body">${linkify(e.body || '')}</div>
      ${e.login_user || e.login_pass ? `<div class="kb-login">
        ${e.login_user ? `<div><small>Benutzer</small><code>${esc(e.login_user)}</code><button class="btn small ic" data-copy="${esc(e.login_user)}" title="kopieren" aria-label="Benutzer kopieren">📋</button></div>` : ''}
        ${e.login_pass ? `<div><small>Passwort</small><code class="pw" data-pw="${esc(e.login_pass)}">••••••••</code><button class="btn small ic" data-reveal title="anzeigen" aria-label="Passwort anzeigen">👁</button><button class="btn small ic" data-copy="${esc(e.login_pass)}" title="kopieren" aria-label="Passwort kopieren">📋</button></div>` : ''}
      </div>` : ''}
      <div class="kb-foot"><span>${e.updated_by && e.updated_by !== e.created_by ? `von ${esc(whoName(e.created_by))} · zuletzt geändert ${esc(when(e))} von ${esc(whoName(e.updated_by))}` : `von ${esc(whoName(e.created_by))} · ${esc(when(e))}`}</span><button class="linkbtn" data-kbedit="${esc(e.id)}">✏️ bearbeiten</button></div>
    </details>`;
  return `<section class="kb">
    <div class="kb-head"><div><h1>📘 KOM27-Infos</h1><p class="muted">Wie man was einschaltet, Logins, Räume, Tipps – alle sehen das und können es ergänzen.</p></div>
      <button class="btn primary" id="kbNew">＋ Neuer Eintrag</button></div>
    <input type="search" id="kbQ" class="kb-q" placeholder="Suchen … z. B. LED-Wand, WLAN, Mikro" value="${esc(S.kbQ || '')}">
    <div class="chips kb-cats"><button class="chip ${!cat ? 'on' : ''}" data-kbcat="">Alle <b>${all.length}</b></button>${KB_CATS.map(([k, ic, l]) => { const n = all.filter((e) => e.cat === k).length; return n ? `<button class="chip ${cat === k ? 'on' : ''}" data-kbcat="${k}">${ic} ${esc(l)} <b>${n}</b></button>` : ''; }).join('')}</div>
    ${byCat.length ? byCat.map(([[, ic, l], es]) => `<h2 class="sec">${ic} ${esc(l)}</h2><div class="kb-list">${es.map(card).join('')}</div>`).join('') : `<div class="empty-msg">${q ? 'Nichts gefunden zu „' + esc(S.kbQ) + '“. Magst du es eintragen?' : 'Noch keine Einträge – fang einfach an!'}</div>`}
  </section>`;
}
function wireKb(m) {
  const q = m.querySelector('#kbQ');
  if (q) q.oninput = () => { S.kbQ = q.value; const pos = q.selectionStart; paint(); const n = document.querySelector('#kbQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  m.querySelectorAll('[data-kbcat]').forEach((b) => (b.onclick = () => { S.kbCat = b.dataset.kbcat; paint(); }));
  const nb = m.querySelector('#kbNew'); if (nb) nb.onclick = () => kbEdit(null);
  m.querySelectorAll('[data-kbedit]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); kbEdit(b.dataset.kbedit); }));
  m.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async (ev) => { ev.preventDefault(); try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert ✓'); } catch (e) { toast('Kopieren nicht möglich – bitte von Hand markieren'); } }));
  m.querySelectorAll('[data-reveal]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); const c = b.parentElement.querySelector('.pw'); const shown = c.textContent !== '••••••••'; c.textContent = shown ? '••••••••' : c.dataset.pw; b.textContent = shown ? '👁' : '🙈'; }));
  m.querySelectorAll('details.kb-card').forEach((d) => d.addEventListener('toggle', () => { if (d.open) S.kbOpen = d.dataset.kb; }));
}
function kbEdit(id) {
  const e = id ? (S.kb || []).find((x) => x.id === id) : null;
  const me = S.user.email; const t = myTech();
  const canDel = e && (S.admin || (e.created_by || '').toLowerCase() === me);
  const html = `<div class="sheet-bg" id="sheet"><div class="sheet kb-ed" role="dialog" aria-modal="true" aria-label="Eintrag bearbeiten">
    <div class="sh-top"><button class="sh-x" data-close aria-label="Schließen">✕</button><b>${e ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</b></div>
    <label>Bereich</label><select id="kbC">${KB_CATS.map(([k, ic, l]) => `<option value="${k}" ${(e ? e.cat : S.kbCat || 'bedienung') === k ? 'selected' : ''}>${ic} ${esc(l)}</option>`).join('')}</select>
    <label>Titel</label><input id="kbT" maxlength="120" placeholder="z. B. LED-Wand Saal 2 einschalten" value="${esc(e ? e.title : '')}">
    <label>Beschreibung</label><textarea id="kbB" rows="8" placeholder="Schritt für Schritt – so, dass es auch jemand versteht, der zum ersten Mal da ist.">${esc(e ? e.body : '')}</textarea>
    <details class="kb-logins" ${e && (e.login_user || e.login_pass) ? 'open' : ''}><summary>🔑 Zugangsdaten hinzufügen (optional)</summary>
      <div class="kb-row"><div><label>Benutzername</label><input id="kbU" autocomplete="off" value="${esc(e ? e.login_user || '' : '')}"></div><div><label>Passwort</label><input id="kbP" autocomplete="off" value="${esc(e ? e.login_pass || '' : '')}"></div></div>
      <p class="muted small">Sehen alle angemeldeten Techniker. Bitte nur dienstliche Zugänge fürs KOM27 eintragen – keine privaten Passwörter.</p></details>
    ${S.admin ? `<label class="chk"><input type="checkbox" id="kbPin" ${e && e.pinned ? 'checked' : ''}> 📌 oben anheften (wichtig)</label>` : ''}
    <label class="chk"><input type="checkbox" id="kbPush"> 📲 ${S.admin ? 'Alle Techniker' : CFG.senderName} per Push informieren</label>
    <div class="sh-actions"><button class="big yes" id="kbSave">Speichern</button><button class="big ghost" data-close>Abbrechen</button></div>
    ${canDel ? `<button class="linkbtn danger" id="kbDel">Eintrag löschen</button>` : ''}
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const sh = $('#sheet'); const close = () => sh.remove();
  sh.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close)); sh.onclick = (ev) => { if (ev.target === sh) close(); };
  if (!e) setTimeout(() => $('#kbT') && $('#kbT').focus(), 50);
  $('#kbSave').onclick = async () => {
    const title = $('#kbT').value.trim(); if (!title) { $('#kbT').focus(); return toast('Bitte einen Titel eingeben'); }
    const now = nowISO();
    const row = Object.assign({}, e || { id: (crypto.randomUUID ? crypto.randomUUID() : 'kb' + Date.now()), created_by: me, created_at: now }, {
      cat: $('#kbC').value, title, body: $('#kbB').value.trim(), login_user: ($('#kbU').value || '').trim(), login_pass: ($('#kbP').value || '').trim(),
      pinned: S.admin ? $('#kbPin').checked : !!(e && e.pinned), updated_by: me, updated_at: now });
    const push = $('#kbPush').checked; close();
    const prev = S.kb;
    const ok = await optimistic(() => { S.kb = (S.kb || []).filter((x) => x.id !== row.id).concat([row]); S.kbOpen = row.id; }, () => store.saveKb(row), null, () => (S.kb = prev));
    if (!ok) return;
    toast(e ? 'Gespeichert ✓ – alle sehen die Änderung' : 'Eintrag angelegt ✓ – alle sehen ihn sofort');
    if (push) { const ids = S.techs.filter((x) => x.active !== false && x.email && (!t || x.id !== t.id)).map((x) => x.id); notify(S.admin ? 'techs' : 'admins', ids, '📘 KOM27-Infos: ' + title, (e ? 'Aktualisiert von ' : 'Neu von ') + whoName(me), 'kb-' + row.id); }
  };
  if ($('#kbDel')) $('#kbDel').onclick = async () => {
    if (!confirm(`„${e.title}“ wirklich löschen? Das betrifft alle.`)) return;
    close(); const prev = S.kb;
    if (await optimistic(() => (S.kb = (S.kb || []).filter((x) => x.id !== e.id)), () => store.deleteKb(e.id), null, () => (S.kb = prev))) toast('Gelöscht');
  };
}

/* ---------------- KOM27-Ansicht (Jens, Felix): alle Termine ansehen, nichts zusagen ---------------- */
const komOf = (key) => (S.komAsg || {})[key] || null;
// Alle Veranstaltungen eines Tages – auch die ohne PAM-Techniker
function vaListOf(d) {
  if (!d) return [];
  const ids = [...new Set([...(d.vas || []), ...(d.slots || []).map((s) => s.va).filter(Boolean)])];
  const parts = String(d.vazeit || '').split(' / ');
  return ids.map((va, i) => {
    const s = (d.slots || []).find((x) => x.va === va);
    const zeit = (s && s.det && s.det.vazeit) || (parts.length === ids.length ? parts[i] : parts.length === 1 ? parts[0] : '') || '';
    return { va, zeit, pam: !!s, key: s ? s.key : null };
  });
}
function komTodayCard() {
  const today = todayISO(); const tom = addDays(today, 1); const now = new Date();
  const daySl = (d) => allSlots().filter((s) => s.date === d && !s.day.cancelled);
  let which = 'heute'; let list = daySl(today);
  if (!list.length && now.getHours() >= 14) { list = daySl(tom); which = 'morgen'; }
  if (!list.length) {
    const dv = allDays().find((d) => d.date === today && !d.cancelled && (d.vas || []).length) || (now.getHours() >= 14 ? allDays().find((d) => d.date === tom && !d.cancelled && (d.vas || []).length) : null);
    if (!dv) return '';
    const w = dv.date === today ? 'heute' : 'morgen';
    return `<section class="tcard tc-${w}">
    <div class="td-top"><span class="td-tag">${w === 'heute' ? 'HEUTE IM HAUS' : 'MORGEN IM HAUS'}</span><span class="td-state">${esc(longDate(dv.date))}</span></div>
    <div class="td-where" style="margin-top:8px">📍 ${esc(roomsOf(dv.info) || 'KOM27')}</div>
    <div class="tk-list">${vaListOf(dv).map((x) => `<div class="tk-row"><b>${esc(x.va)}</b><span>${x.zeit ? esc(niceTime(x.zeit)) : ''}</span></div>`).join('')}</div>
    <p class="td-note">Kein PAM-Techniker angefordert.</p>
    <div class="td-more"><button class="td-link" data-gokb>📘 KOM27-Infos</button></div>
  </section>`;
  }
  const d0 = list[0].day;
  const ppl = list.map((s) => { const k = komOf(s.key); return `<div class="tk-row"><b>${k ? esc(k.name.split(' ')[0]) : '❗ noch offen'}</b><span>${esc(niceTime(s.zeit))}${k && k.status === 'angefragt' ? ' · angefragt' : ''}</span></div>`; }).join('');
  return `<section class="tcard tc-${which} ${which === 'heute' ? '' : ''}">
    <div class="td-top"><span class="td-tag">${which === 'heute' ? 'HEUTE IM HAUS' : 'MORGEN IM HAUS'}</span><span class="td-state">${esc(longDate(d0.date))}</span></div>
    <div class="td-where" style="margin-top:8px">📍 ${esc(roomsOf(d0.info) || 'KOM27')}${d0.vazeit ? ' · VA ' + esc(d0.vazeit) : ''}</div>
    <div class="tk-list">${ppl}</div>
    <button class="big td-go" data-open="${esc(list[0].key)}">🛠 Aufbau & Details ansehen</button>
    <div class="td-more"><button class="td-link" data-gokb>📘 KOM27-Infos</button></div>
  </section>`;
}
// Wochenraster für KOM27: Spalten = Tage, Zeilen = wer da ist
const mondayOf = (iso) => { const d = new Date(iso + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); };
function komWeekGrid(today, seg) {
  const mon = S.komWeek || mondayOf(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const byDate = {}; allDays().forEach((d) => (byDate[d.date] = d));
  const sl = (dt) => ((byDate[dt] || {}).slots || []).filter(() => !(byDate[dt] || {}).cancelled);
  const names = [...new Set(dates.flatMap((dt) => sl(dt).map((s) => komOf(s.key)).filter(Boolean).map((k) => k.name)))].sort((a, b) => a.localeCompare(b, 'de'));
  const hasOpen = dates.some((dt) => sl(dt).some((s) => !komOf(s.key)));
  const hasKom = dates.some((dt) => ((byDate[dt] || {}).kom || []).length);
  const short = (z) => { const sp = parseSpan(z); if (!sp) return 'Zeit?'; const f = (x) => { const m = Math.round((x % 24) * 60); return pad(Math.floor(m / 60)) + (m % 60 ? ':' + pad(m % 60) : ''); }; return f(sp[0]) + '–' + f(sp[1]); };
  const chip = (s, st) => `<button class="kr-chip st-${st}" data-open="${esc(s.key)}" title="${esc((s.va || '') + ' · ' + (s.zeit || ''))}">${esc(short(s.zeit))}</button>`;
  const head = dates.map((dt) => { const d = byDate[dt]; const n = sl(dt).length; const ok = sl(dt).filter((s) => komOf(s.key)).length; const wd = new Date(dt + 'T12:00:00').getDay();
    return `<th class="${dt === today ? 'is-today' : ''} ${wd === 0 || wd === 6 ? 'we' : ''}"><span>${WD[wd]}</span><b>${dt.slice(8, 10)}.${dt.slice(5, 7)}.</b>${n ? `<i class="kr-need ${ok < n ? 'open' : ''}">${ok}/${n}</i>` : d && d.cancelled ? '<i class="kr-need">abgesagt</i>' : ''}</th>`; }).join('');
  const row = (label, cls, cell) => `<tr class="${cls}"><th>${label}</th>${dates.map((dt) => `<td class="${dt === today ? 'is-today' : ''}">${cell(dt)}</td>`).join('')}</tr>`;
  const hasVa = dates.some((dt) => byDate[dt] && !byDate[dt].cancelled && vaListOf(byDate[dt]).length);
  let rows = '';
  if (hasVa) rows += row('Veranstaltung', 'kr-vas', (dt) => (byDate[dt] && !byDate[dt].cancelled ? vaListOf(byDate[dt]) : []).map((x) => `<${x.key ? `button data-open="${esc(x.key)}"` : 'span'} class="kr-va ${x.pam ? '' : 'nopam'}" title="${esc(x.va + (x.zeit ? ' · ' + x.zeit : '') + (x.pam ? '' : ' · ohne PAM-Techniker'))}"><b>${esc(x.va.replace(/^VA/, ''))}</b><small>${x.zeit ? esc(short(x.zeit)) : ''}${x.pam ? '' : ' · ohne PAM'}</small></${x.key ? 'button' : 'span'}>`).join(''));
  if (hasKom) rows += row('🏢 KOM27', 'kr-kom', (dt) => ((byDate[dt] || {}).kom || []).map((n) => `<span class="kr-kom-n">${esc(n.split(' ')[0])}</span>`).join(''));
  names.forEach((n) => (rows += row(esc(n), '', (dt) => sl(dt).filter((s) => komOf(s.key) && komOf(s.key).name === n).map((s) => chip(s, komOf(s.key).status)).join(''))));
  if (hasOpen) rows += row('❗ noch offen', 'kr-open', (dt) => sl(dt).filter((s) => !komOf(s.key)).map((s) => chip(s, 'leer')).join(''));
  const rooms = `<tr class="kr-rooms"><th>Räume</th>${dates.map((dt) => `<td class="${dt === today ? 'is-today' : ''}">${esc(roomsOf((byDate[dt] || {}).info || '') || '')}</td>`).join('')}</tr>`;
  return `<section class="kr">
    <div class="kr-nav"><button class="btn small" data-kw="-7" aria-label="Woche zurück">‹</button><b>KW ${isoWeek(mon)}</b><button class="btn small" data-kw="7" aria-label="Woche vor">›</button><span class="muted">${fmtDate(mon)} – ${fmtDate(addDays(mon, 6))}</span>${mon !== mondayOf(today) ? '<button class="linkbtn" data-kw="0">diese Woche</button>' : ''}<span class="kr-sp"></span>${seg || ''}</div>
    ${names.length || hasOpen || hasKom || hasVa ? `<div class="kr-scroll"><table class="kr-grid"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}${rooms}</tbody></table></div>
    <div class="kr-lgd"><span><i class="lg zugesagt"></i>zugesagt</span><span><i class="lg angefragt"></i>angefragt</span><span><i class="lg leer"></i>noch offen</span><span><i class="lg nopam"></i>ohne PAM-Techniker</span><span class="muted">Antippen = Details</span></div>` : '<div class="empty-msg">In dieser Woche sind keine Veranstaltungen eingetragen.</div>'}
  </section>`;
}
const pvBar = () => (S.preview ? `<div class="pv-bar"><span>👁 <b>Vorschau:</b> So sehen Jens & Felix die App</span><button class="btn small" id="pvEnd">Zurück zum Master</button></div>` : '');
function renderKom() {
  document.body.classList.remove('is-master'); privacyNote();
  const today = todayISO();
  $('#app').innerHTML = header() + `<main class="mine is-dash" id="main"></main>`;
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  const m = $('#main');
  const vt = `<div class="viewtabs" role="tablist"><button data-vt="jobs" class="${S.techTab !== 'kb' ? 'on' : ''}">📅 Alle Termine</button><button data-vt="kb" class="${S.techTab === 'kb' ? 'on' : ''}">📘 KOM27-Infos <small>${(S.kb || []).length}</small></button></div>`;
  const wire = () => {
    m.querySelectorAll('[data-vt]').forEach((b) => (b.onclick = () => { S.techTab = b.dataset.vt; paint(); window.scrollTo(0, 0); }));
    m.querySelectorAll('[data-gokb]').forEach((b) => (b.onclick = () => { S.techTab = 'kb'; paint(); window.scrollTo(0, 0); }));
    m.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openJob(b.dataset.open)));
    const sp = m.querySelector('#komPast'); if (sp) sp.onchange = () => { S.komPast = sp.checked; paint(); };
    m.querySelectorAll('[data-kv]').forEach((b) => (b.onclick = () => { S.komView = b.dataset.kv; paint(); }));
    m.querySelectorAll('[data-kw]').forEach((b) => (b.onclick = () => { const n = +b.dataset.kw; S.komWeek = n ? addDays(S.komWeek || mondayOf(today), n) : mondayOf(today); paint(); }));
    const pe = m.querySelector('#pvEnd'); if (pe) pe.onclick = () => { S.preview = false; S.viewer = false; S.techTab = 'jobs'; S.tab = 'techs'; paint(); window.scrollTo(0, 0); };
  };
  if (S.techTab === 'kb') { m.innerHTML = pvBar() + vt + kbHtml() + legalFoot(); wire(); wireKb(m); return; }
  const from = S.komPast ? addDays(today, -60) : today;
  const days = allDays().filter((d) => d.date >= from && (d.slots.length || (d.vas || []).length) && !d.free);
  const week = days.filter((d) => d.date >= today && d.date <= addDays(today, 6));
  const wSl = week.flatMap((d) => d.slots);
  const wOk = wSl.filter((s) => komOf(s.key) && komOf(s.key).status === 'zugesagt').length;
  const wOpen = wSl.filter((s) => !komOf(s.key)).length;
  const me = (S.user.email || '').split('@')[0];
  const v = S.preview ? ((S.viewers || [])[0] || { name: 'Jens' }) : (S.viewers || []).find((x) => x.email === S.user.email) || { name: me.charAt(0).toUpperCase() + me.slice(1) };
  let lastMon = '';
  const dayCard = (d) => {
    const mon = d.date.slice(0, 7); const head = mon !== lastMon ? `<h2 class="sec">${MON[+mon.slice(5, 7) - 1]} ${mon.slice(0, 4)}</h2>` : ''; lastMon = mon;
    const rows = d.slots.length ? d.slots.map((s) => { const k = komOf(s.key);
      return `<button class="kom-slot ${k ? 'st-' + k.status : 'st-leer'}" data-open="${esc(s.key)}"><span class="ks-who">${k ? esc(k.name) : 'noch nicht besetzt'}</span><span class="ks-st">${k ? (k.status === 'zugesagt' ? '✓ zugesagt' : '⏳ angefragt') : '❗ offen'}</span><span class="ks-time">${esc(niceTime(s.zeit))}${s.va ? ' · ' + esc(s.va) : ''}</span><span class="jc-more">Details ›</span></button>`; }).join('')
      : '';
    const noPam = vaListOf(d).filter((x) => !x.pam);
    const extra = noPam.length ? `<div class="kd-nopam"><span>${d.slots.length ? 'Außerdem ohne PAM-Techniker' : 'Ohne PAM-Techniker'}</span>${noPam.map((x) => `<b>${esc(x.va)}${x.zeit ? ' <small>' + esc(niceTime(x.zeit)) + '</small>' : ''}</b>`).join('')}</div>` : (d.slots.length ? '' : '<p class="muted small">Kein PAM-Techniker angefordert</p>');
    return `${head}<article class="job-card kom-day ${d.date === today ? 'is-today' : ''} ${d.date < today ? 'past' : ''} ${d.cancelled ? 'cancel' : ''}">
      <div class="kd-head">${dateBox(d.date)}<div><b>${esc(longDate(d.date))}</b> <span class="until">${untilTxt(d.date)}</span><small>${[roomsOf(d.info), d.vazeit ? 'VA ' + d.vazeit + ' Uhr' : ''].filter(Boolean).map(esc).join(' · ')}${d.cancelled ? ' · <b class="warn">abgesagt</b>' : ''}</small></div></div>
      ${rows}${extra}</article>`;
  };
  const tc = komTodayCard();
  const raster = (S.komView || 'raster') === 'raster';
  const seg = `<div class="seg kv-seg"><button data-kv="raster" class="${raster ? 'on' : ''}">Woche</button><button data-kv="liste" class="${raster ? '' : 'on'}">Liste</button></div>`;
  m.innerHTML = pvBar() + vt + (tc ? `<div class="only-m">${tc}</div>` : '') + `
    <section class="hello hi-kom">
      <h1>Hallo ${esc(v && v.name ? v.name.split(' ')[0] : me)} 👋</h1>
      <p>Medientechnik KOM27 · hier siehst du alle Einsätze der PAM-Techniker</p>
      <div class="sumrow">
        <div class="sumbox"><b>${wSl.length}</b><span>Einsätze in den nächsten 7 Tagen</span></div>
        <div class="sumbox ok"><b>${wOk}</b><span>davon zugesagt</span></div>
        <div class="sumbox ${wOpen ? 'warn' : ''}"><b>${wOpen}</b><span>noch offen</span></div>
      </div>
    </section>
    <div class="dash kom-dash"><div class="dash-main">
    ${raster ? komWeekGrid(today, seg) : `<div class="kl-head">${seg}<label class="pastsw"><input type="checkbox" id="komPast" ${S.komPast ? 'checked' : ''}> vergangene Tage zeigen</label></div>
    ${days.length ? days.map(dayCard).join('') : '<div class="empty-msg">Keine Termine.</div>'}`}
    </div><aside class="dash-side only-d">${tc}
      <section class="dpanel"><h2 class="sec">Nächste 7 Tage</h2>${week.length ? week.map((d) => `<button class="kn-row" ${d.slots[0] ? `data-open="${esc(d.slots[0].key)}"` : `data-komday="${d.date}"`}>${dateBox(d.date)}<span><b>${d.slots.map((s) => komOf(s.key) ? esc(komOf(s.key).name.split(' ')[0]) : '❗ offen').join(', ') || '<span class="muted">ohne PAM-Techniker</span>'}</b><small>${esc(roomsOf(d.info) || '')}${d.vazeit ? ' · VA ' + esc(d.vazeit) : ''}</small></span></button>`).join('') : '<p class="muted">Keine Termine.</p>'}</section>
    </aside></div>
    <p class="note center">Fragen zur Einteilung? Einfach ${esc(CFG.senderName)} anrufen.</p>${legalFoot()}`;
  wire();
}

function renderTech() {
  document.body.classList.remove('is-master'); privacyNote();
  const t = myTech();
  const today = todayISO();
  $('#app').innerHTML = header() + `<main class="mine is-dash" id="main"></main>`;
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  const m = $('#main');
  const team = myTeam().filter((x) => !t || x.id !== t.id);
  if (team.length && (!t || S.view2 !== 'me')) return renderManager(team, t);
  S.mgrMode = false;
  if (!t) { m.innerHTML = `<section class="hello"><h1>Fast geschafft</h1><p>Dein Login <b>${esc(S.user.email)}</b> ist noch keinem Techniker zugeordnet. Bitte gib ${esc(CFG.senderName)} kurz Bescheid, dann siehst du hier deine Einsätze.</p></section>`; return; }

  const sl = slotsOfTech(t.id, today).filter((s) => S.asg[s.key].status !== 'geplant');
  const st = (s) => S.asg[s.key].status;
  // nach Veranstaltung gruppieren
  const groupsOf = (list) => { const out = []; const idx = {}; list.forEach((s) => { const g = s.group || s.key; if (!(g in idx)) { idx[g] = out.length; out.push({ id: g, va: s.va, slots: [] }); } out[idx[g]].slots.push(s); }); return out; };
  const boss = hasMgr(t);
  const replied = (s) => boss && S.asg[s.key].tech_reply;
  const open = groupsOf(sl.filter((s) => st(s) === 'angefragt' && !replied(s)));
  const waiting = sl.filter((s) => st(s) === 'angefragt' && replied(s));
  const yes = sl.filter((s) => st(s) === 'zugesagt');
  const no = sl.filter((s) => st(s) === 'abgesagt');
  const nOpen = open.reduce((a, g) => a + g.slots.length, 0);
  // ausgeschriebene Einsätze, für die man sich melden kann
  const TLm = timelines();
  const offered = groupsOf(allSlots().filter((x) => offerOf(x.key) && x.date >= today && !x.day.cancelled && !(S.asg[x.key] && S.asg[x.key].tech_id)).sort((a, b) => a.date.localeCompare(b.date)));
  const mine = (key) => (S.interest || []).some((i) => i.slot_key === key && i.tech_id === t.id);
  // Arbeitszeit bestätigen: zugesagte Einsätze bis heute ohne Zeit
  const past = slotsOfTech(t.id, addDays(today, -45)).filter((x) => x.date <= today && S.asg[x.key].status === 'zugesagt' && !x.day.cancelled);
  const toLog = past.filter((x) => !S.asg[x.key].actual_start || S.editTime === x.key);
  const logged = past.filter((x) => S.asg[x.key].actual_start && S.editTime !== x.key).reverse();
  const mon = today.slice(0, 7);
  const monSl = slotsOfTech(t.id).filter((x) => x.date.startsWith(mon) && S.asg[x.key].status === 'zugesagt' && !x.day.cancelled);
  const monH = monSl.reduce((acc, x) => acc + (actualHours(S.asg[x.key]) ?? planHours(x)), 0);

  const where = (s) => ['KOM27 Mauerstraße', roomsOf(s.day.info), s.day.vazeit ? 'Veranstaltung ' + s.day.vazeit + ' Uhr' : ''].filter(Boolean).map(esc).join(' · ');
  const card = (g) => {
    const multi = g.slots.length > 1; const s0 = g.slots[0];
    return `<article class="job-card" data-g="${esc(g.id)}">
      <div class="jc-head"><span class="jc-va">${esc(g.va || 'Einsatz')}</span>${multi ? `<span class="jc-badge">${g.slots.length} Tage hintereinander</span>` : ''}</div>
      <div class="jc-where">${where(s0)}</div>
      <div class="jc-days">${g.slots.map((s) => `<div class="jc-day" data-k="${esc(s.key)}">${dateBox(s.date)}
        <button class="jc-time jc-open" data-open="${esc(s.key)}"><b>${esc(niceTime(s.zeit))}</b><small>deine Einsatzzeit${(s.det && s.det.vazeit) || s.day.vazeit ? ' · VA ' + esc((s.det && s.det.vazeit) || s.day.vazeit) : ''}</small><span class="jc-more">Details ›</span></button>
        <div class="jc-one hidden"><button class="mini yes" data-one="zugesagt" data-k="${esc(s.key)}" aria-label="Kann ich">✓</button><button class="mini no" data-one="abgesagt" data-k="${esc(s.key)}" aria-label="Kann nicht">✗</button></div>
      </div>`).join('')}</div>
      <button class="jc-detail" data-open="${esc(s0.key)}">🛠 Was baue ich auf? · Zeiten & Details ›</button>
      ${boss ? `<div class="hint boss">🏢 Die verbindliche Zusage gibt <b>${esc(mgrLabel(t))}</b>. Sag hier, ob du grundsätzlich kannst – die Meldung geht direkt dorthin.</div>` : ''}
      <div class="jc-actions">
        <button class="big yes" data-all="zugesagt">${boss ? '👍 Ich könnte' : '✓ Ich kann'}${multi ? ` – alle ${g.slots.length} Tage` : ''}</button>
        <button class="big no" data-askno>✗ Kann nicht</button>
      </div>
      <div class="jc-reason hidden"><label>Kurzer Grund (optional)</label><input type="text" placeholder="z. B. Urlaub, anderer Job …"><div class="jc-actions"><button class="big no solid" data-all="abgesagt">Absage senden</button><button class="big ghost" data-cancel>Zurück</button></div></div>
      ${multi ? `<button class="linkbtn" data-split>Ich kann nur an einzelnen Tagen</button>` : ''}
    </article>`;
  };
  const line = (s, kind) => `<div class="mini-line">${dateBox(s.date)}<button class="ml-txt jc-open" data-open="${esc(s.key)}"><b>${esc(niceTime(s.zeit))} <span class="until">${untilTxt(s.date)}</span></b><small>${esc(s.va || '')}${roomsOf(s.day.info) ? ' · ' + esc(roomsOf(s.day.info)) : ''}${S.asg[s.key].note ? ' · „' + esc(S.asg[s.key].note) + '“' : ''}${kind === 'wait' ? ' · du hast gemeldet: ' + (S.asg[s.key].tech_reply === 'kann' ? '👍 kann' : '✗ kann nicht') : ''}</small><span class="jc-more">Details ›</span></button>
      ${kind === 'wait' ? `<button class="linkbtn" data-resig="${esc(s.key)}">ändern</button>` : boss ? '' : kind === 'yes' ? `<button class="linkbtn danger" data-change="abgesagt" data-k="${esc(s.key)}">doch absagen</button>` : `<button class="linkbtn" data-change="zugesagt" data-k="${esc(s.key)}">doch zusagen</button>`}</div>`;

  const vt = `<div class="viewtabs" role="tablist"><button data-vt="jobs" class="${S.techTab !== 'kb' ? 'on' : ''}">📋 Meine Einsätze</button><button data-vt="kb" class="${S.techTab === 'kb' ? 'on' : ''}">📘 KOM27-Infos <small>${(S.kb || []).length}</small></button></div>`;
  const wireVt = () => m.querySelectorAll('[data-vt]').forEach((b) => (b.onclick = () => { S.techTab = b.dataset.vt; paint(); window.scrollTo(0, 0); }));
  if (S.techTab === 'kb') { m.innerHTML = vt + kbHtml() + legalFoot(); wireVt(); wireKb(m); return; }
  m.innerHTML = vt + `
    <section class="hello hi-line">
      <h1>Hallo ${esc(t.name.split(' ')[0])} 👋</h1>
      <p>${yes.length} ${yes.length === 1 ? 'Einsatz' : 'Einsätze'} zugesagt · ${String(Math.round(monH * 10) / 10).replace('.', ',')} Std. im ${MON[+mon.slice(5, 7) - 1]}</p>
      <div id="pushBox"></div>
      <div class="dash-kpis">
        <a href="#openSec" class="kpi ${nOpen ? 'warn' : ''}"><b>${nOpen}</b><span>${nOpen === 1 ? 'offene Anfrage' : 'offene Anfragen'}</span></a>
        <div class="kpi ok"><b>${yes.length}</b><span>zugesagt</span></div>
        <div class="kpi"><b>${String(Math.round(monH * 10) / 10).replace('.', ',')}</b><span>Std. im ${MON[+mon.slice(5, 7) - 1]}</span></div>
        ${toLog.length ? `<a href="#timeSec" class="kpi warn"><b>${toLog.length}</b><span>Arbeitszeit eintragen</span></a>` : `<div class="kpi"><b>✓</b><span>Zeiten vollständig</span></div>`}
      </div>
    </section>
    <div class="dash"><div class="dash-main">
    ${todayCard(t) || nextCard(t)}
    ${open.length ? `<h2 class="sec" id="openSec">Bitte gib Bescheid <span class="sec-n">${nOpen}</span></h2>${open.map(card).join('')}` : `<div class="allgood" id="openSec">✓ Alles beantwortet – danke!<small>Neue Anfragen bekommst du per Push oder E-Mail.</small></div>`}
    ${team.length ? `<button class="big ghost" id="toTeam">👥 Zu den Freigaben für dein Team</button>` : ''}
    ${waiting.length ? `<h2 class="sec">⏳ Wartet auf Freigabe durch ${esc(mgrLabel(t))}</h2><div class="mini-list">${waiting.map((s) => line(s, 'wait')).join('')}</div>` : ''}
    ${boss && yes.length ? `<p class="sec-help">Änderungen an zugesagten Einsätzen bitte über ${esc(mgrLabel(t))}.</p>` : ''}
    ${toLog.length ? `<h2 class="sec" id="timeSec">⏱ Arbeitszeit bestätigen</h2><p class="sec-help">Kurz eintragen, wie lange du wirklich da warst – ${esc(CFG.senderName)} braucht das für die Abrechnung. Vorausgefüllt mit der geplanten Zeit.</p>
      ${toLog.map((x) => `<article class="time-card"><div class="tc-top">${dateBox(x.date)}<div class="tc-head"><b>${esc(x.va || 'Einsatz')}</b><small>${esc(longDate(x.date))} · geplant ${esc(x.zeit || '–')}</small></div></div>${timeForm(x, S.asg[x.key])}</article>`).join('')}` : ''}
    ${offered.length ? `<h2 class="sec" id="offerSec">📣 Offene Einsätze – hast du Zeit?</h2><p class="sec-help">Diese Einsätze sind noch nicht besetzt. Melde dich, wenn du kannst – ${esc(CFG.senderName)} entscheidet dann und du bekommst Bescheid.</p>
      ${offered.map((g) => { const s0 = g.slots[0]; const all = g.slots.every((x) => mine(x.key));
        const warn = g.slots.map((x) => unavOf(t.id, x.date) ? `${fmtDate(x.date)}: du hast „kann nicht“ eingetragen` : (conflictsFor(t.id, x, TLm)[0] || {}).txt).filter(Boolean);
        return `<article class="offer-card ${all ? 'is-in' : ''}" data-og="${esc(g.id)}">
        <div class="jc-head"><span class="jc-va">${esc(g.va || 'Einsatz')}</span>${g.slots.length > 1 ? `<span class="jc-badge">${g.slots.length} Tage</span>` : ''}</div>
        <div class="jc-days">${g.slots.map((x) => `<div class="jc-day">${dateBox(x.date)}<button class="jc-time jc-open" data-open="${esc(x.key)}"><b>${esc(niceTime(x.zeit))}</b><small>${esc(roomsOf(x.day.info) || 'KOM27')}</small><span class="jc-more">Details ›</span></button></div>`).join('')}</div>
        ${warn.map((w) => `<div class="hint warn">⚠ ${esc(w)}</div>`).join('')}
        <div class="jc-actions">${all ? `<span class="in-msg">✓ Du hast dich gemeldet</span><button class="big ghost" data-int="off" data-keys="${esc(g.slots.map((x) => x.key).join(','))}">zurückziehen</button>` : `<button class="big yes" data-int="on" data-keys="${esc(g.slots.map((x) => x.key).join(','))}">🙋 Ich hätte Zeit${g.slots.length > 1 ? ' – alle Tage' : ''}</button>`}</div>
      </article>`; }).join('')}` : ''}
    </div><aside class="dash-side"><section class="dpanel">
    <h2 class="sec">Wann kannst du nicht?</h2>
    <p class="sec-help">Tippe die Tage an, an denen du nicht verfügbar bist. Nochmal tippen nimmt es wieder raus. ${esc(CFG.senderName)} sieht das sofort und plant dich dann nicht ein.</p>
    ${techCalHtml(t)}
    </section><section class="dpanel dp-next">
    ${yes.length ? `<h2 class="sec">Deine nächsten Einsätze <button class="linkbtn" id="ics">📅 Kalender-Abo</button></h2><div class="mini-list">${yes.map((s) => line(s, 'yes')).join('')}</div>` : ''}
    ${no.length ? `<details class="nolist"><summary>Abgesagt (${no.length})</summary><div class="mini-list">${no.map((s) => line(s, 'no')).join('')}</div></details>` : ''}
    ${logged.length ? `<details class="nolist"><summary>Bestätigte Arbeitszeiten (${logged.length})</summary><div class="mini-list">${logged.map((x) => { const a = S.asg[x.key]; return `<div class="mini-line">${dateBox(x.date)}<div class="ml-txt"><b>${esc(a.actual_start)}–${esc(a.actual_end)} · ${fmtH(actualHours(a))}</b><small>${esc(x.va || '')}${a.break_min ? ' · ' + a.break_min + ' min Pause' : ''}${a.time_note ? ' · „' + esc(a.time_note) + '“' : ''}</small></div><button class="linkbtn" data-tedit="${esc(x.key)}">ändern</button></div>`; }).join('')}</div></details>` : ''}
    </section></aside></div>
    <p class="note center">Fragen? Einfach ${esc(CFG.senderName)} anrufen oder auf die Anfrage-Mail antworten.</p>${legalFoot()}`;

  const collapse = (el) => new Promise((res) => {
    if (!el) return res();
    el.style.height = el.offsetHeight + 'px'; el.style.overflow = 'hidden'; void el.offsetHeight;
    el.classList.add('leaving'); el.style.height = '0px';
    setTimeout(res, 230);
  });
  const answer = async (keys, status, note) => {
    const prev = keys.map((k) => S.asg[k]);
    const card = document.querySelector(`.jc-day[data-k="${CSS.escape(keys[0])}"]`);
    const jc = card && card.closest('.job-card');
    const whole = jc && jc.querySelectorAll('.jc-day').length === keys.length;
    const ml = document.querySelector(`[data-change][data-k="${CSS.escape(keys[0])}"]`);
    calm(5000);
    await collapse(whole ? jc : jc ? card : ml ? ml.closest('.mini-line') : null);
    const dates = allSlots().filter((x) => keys.includes(x.key)).map((x) => fmtDate(x.date));
    if (boss) { // nur Rückmeldung – die Zusage gibt der Projektleiter
      const ok = status === 'zugesagt';
      keys.forEach((k) => (S.asg[k] = Object.assign({}, S.asg[k], { tech_reply: ok ? 'kann' : 'kann_nicht', tech_reply_note: note || '', tech_reply_at: nowISO() })));
      paint(jc ? '#openSec' : null);
      toast(`Danke! ${mgrLabel(t)} bekommt deine Meldung und gibt die Zusage.`);
      try {
        await Promise.all(keys.map((k) => store.techSignal(S.user.email, k, ok, note || '')));
        notify('manager', [], `${t.name} ${ok ? 'könnte 👍' : 'kann nicht ✗'} – bitte entscheiden`, 'KOM27: ' + dates.join(', ') + (note ? ' – „' + note + '“' : ''), 'sig-' + t.id);
        calm(1500);
      } catch (e) { keys.forEach((k, i) => (S.asg[k] = prev[i])); paint(); toast('Nicht gespeichert: ' + e.message); }
      return;
    }
    keys.forEach((k) => (S.asg[k] = Object.assign({}, S.asg[k], { status, note: note || '', updated_at: nowISO() })));
    paint(jc ? '#openSec' : null);
    toast(status === 'zugesagt' ? 'Danke! Zusage ist gespeichert ✓' : 'Absage ist gespeichert');
    try {
      await Promise.all(keys.map((k) => store.respond(S.user.email, k, status, note || '')));
      notify('admins', [], `${firstName(t)} hat ${status === 'zugesagt' ? 'zugesagt ✓' : 'abgesagt ✗'}`, dates.join(', ') + (note ? ' – „' + note + '“' : ''), 'answer-' + t.id);
      calm(1500);
    } catch (e) { keys.forEach((k, i) => (S.asg[k] = prev[i])); paint(); toast('Nicht gespeichert: ' + e.message); }
  };
  const interest = async (keys, on) => {
    const prev = S.interest;
    const ok = await optimistic(() => { S.interest = (S.interest || []).filter((i) => !(keys.includes(i.slot_key) && i.tech_id === t.id)).concat(on ? keys.map((k) => ({ slot_key: k, tech_id: t.id, created_at: nowISO() })) : []); },
      () => Promise.all(keys.map((k) => (on ? store.addInterest(k, t.id) : store.removeInterest(k, t.id)))), '#offerSec', () => (S.interest = prev));
    if (ok && on) {
      const dates = allSlots().filter((x) => keys.includes(x.key)).map((x) => fmtDate(x.date));
      notify('admins', [], `${firstName(t)} hätte Zeit 🙋`, `Ausgeschriebener Einsatz: ${dates.join(', ')}`, 'int-' + t.id);
      toast('Danke! ' + CFG.senderName + ' sieht deine Meldung sofort.');
    }
  };
  window.__interest = interest;
  const saveTime = async (key, st, en, br, nt) => {
    const prev = S.asg[key];
    const ok = await optimistic(() => { S.asg[key] = Object.assign({}, prev, { actual_start: st, actual_end: en, break_min: br, time_note: nt, time_at: nowISO() }); S.editTime = null; },
      () => store.logTime(S.user.email, key, st, en, br, nt), '#timeSec', () => (S.asg[key] = prev));
    if (ok) toast('Arbeitszeit gespeichert ✓');
  };
  wireTimeForms(m, saveTime);
  wireVt();
  m.querySelectorAll('[data-gokb]').forEach((b) => (b.onclick = () => { S.techTab = 'kb'; paint(); window.scrollTo(0, 0); }));
  m.querySelectorAll('[data-gotime]').forEach((b) => (b.onclick = () => { const f = document.querySelector('#timeSec'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
  if ($('#toTeam')) $('#toTeam').onclick = () => { S.view2 = 'team'; paint(); window.scrollTo(0, 0); };
  m.querySelectorAll('[data-resig]').forEach((b) => (b.onclick = () => { const k = b.dataset.resig; S.asg[k] = Object.assign({}, S.asg[k], { tech_reply: null }); calm(15000); paint('#openSec'); }));
  m.querySelectorAll('[data-tedit]').forEach((b) => (b.onclick = () => { S.editTime = b.dataset.tedit; paint(); const f = document.querySelector('#timeSec'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
  m.querySelectorAll('[data-int]').forEach((b) => (b.onclick = () => interest(b.dataset.keys.split(','), b.dataset.int === 'on')));
  window.__answer = answer;
  m.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openJob(b.dataset.open)));
  m.querySelectorAll('.job-card').forEach((c) => {
    const keys = [...c.querySelectorAll('.jc-day')].map((d) => d.dataset.k);
    const reason = c.querySelector('.jc-reason'); const acts = c.querySelector(':scope > .jc-actions');
    c.querySelector('[data-all="zugesagt"]').onclick = () => answer(keys, 'zugesagt');
    c.querySelector('[data-askno]').onclick = () => { acts.classList.add('hidden'); reason.classList.remove('hidden'); reason.querySelector('input').focus(); };
    c.querySelector('[data-cancel]').onclick = () => { reason.classList.add('hidden'); acts.classList.remove('hidden'); };
    reason.querySelector('[data-all="abgesagt"]').onclick = () => answer(keys, 'abgesagt', reason.querySelector('input').value.trim());
    const split = c.querySelector('[data-split]');
    if (split) split.onclick = () => { c.querySelectorAll('.jc-one').forEach((x) => x.classList.remove('hidden')); acts.classList.add('hidden'); split.classList.add('hidden'); };
    c.querySelectorAll('[data-one]').forEach((b) => (b.onclick = () => answer([b.dataset.k], b.dataset.one)));
  });
  m.querySelectorAll('[data-change]').forEach((b) => (b.onclick = () => {
    if (b.dataset.change === 'abgesagt' && !confirm('Diesen Einsatz wirklich absagen?')) return;
    answer([b.dataset.k], b.dataset.change);
  }));
  if ($('#ics')) $('#ics').onclick = () => calSheet(t, yes);
  wireTechCal(t);
  fillPushBox(false);
}

/* ---------------- Push-Mitteilungen ---------------- */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let swReg = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((r) => (swReg = r)).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'kom27-refresh') scheduleLive(0); });
}
const b64ToU8 = (b) => { const p = '='.repeat((4 - (b.length % 4)) % 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
let _vapid = null;
async function vapidKey() {
  if (_vapid) return _vapid;
  const { data, error } = await store.sb.functions.invoke('notify', { body: { action: 'key' } });
  if (error || !data || !data.publicKey) throw new Error('Mitteilungsdienst nicht erreichbar.');
  return (_vapid = data.publicKey);
}
async function pushState() {
  if (DEMO) return 'unsupported';
  if (IS_IOS && !IS_STANDALONE) return 'ios-install';
  if (!PUSH_OK) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = swReg || (await navigator.serviceWorker.getRegistration());
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'on' : 'off';
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt.');
  const reg = swReg || (await navigator.serviceWorker.register('sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(await vapidKey()) });
  const j = sub.toJSON();
  await store.savePush({ endpoint: j.endpoint, email: S.user.email, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
}
async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { try { await store.deletePush(sub.endpoint); } catch (e) {} await sub.unsubscribe(); }
}
async function notify(target, tech_ids, title, body, tag) {
  if (DEMO) return;
  try { const r = await store.sb.functions.invoke('notify', { body: { target, tech_ids, title, body, tag } }); return r.data || null; } catch (e) { console.warn('Push fehlgeschlagen', e); return null; }
}
async function fillPushBox(forMaster) {
  const box = $('#pushBox'); if (!box) return;
  const st = await pushState();
  const who = forMaster ? 'wenn ein Techniker zu- oder absagt oder sich abmeldet' : 'sobald eine neue Einsatzanfrage für dich da ist';
  const html = {
    unsupported: '',
    on: `<div class="pushline">🔔 Mitteilungen auf diesem Gerät sind aktiv. <button class="linkbtn" id="pushOff">ausschalten</button> <button class="linkbtn" id="pushTest">Test senden</button></div>`,
    off: `<div class="pushcard"><b>🔔 Mitteilungen aufs Handy</b><p>Lass dich benachrichtigen, ${who}.</p><button class="big yes" id="pushOn">Mitteilungen aktivieren</button></div>`,
    denied: `<div class="pushcard"><b>🔕 Mitteilungen sind blockiert</b><p>Erlaube Mitteilungen für diese Seite in den Einstellungen deines Browsers bzw. iPhones (Einstellungen → Mitteilungen → KOM27) und lade die Seite dann neu.</p></div>`,
    'ios-install': `<div class="pushcard"><b>🔔 Mitteilungen aufs iPhone</b><p>Das iPhone erlaubt Mitteilungen nur für Apps auf dem Home-Bildschirm. Einmalig so einrichten:</p><ol><li>Unten in Safari auf <b>Teilen</b> tippen (Quadrat mit Pfeil ↑)</li><li><b>„Zum Home-Bildschirm“</b> wählen → Hinzufügen</li><li>Die neue App <b>„KOM27“</b> vom Home-Bildschirm öffnen, anmelden und hier auf „Mitteilungen aktivieren“ tippen</li></ol></div>`
  }[st];
  box.innerHTML = html;
  if ($('#pushOn')) $('#pushOn').onclick = async () => { try { $('#pushOn').disabled = true; await enablePush(); toast('Mitteilungen aktiviert 🔔'); fillPushBox(forMaster); } catch (e) { toast(e.message); fillPushBox(forMaster); } };
  if ($('#pushOff')) $('#pushOff').onclick = async () => { await disablePush(); toast('Mitteilungen ausgeschaltet'); fillPushBox(forMaster); };
  if ($('#pushTest')) $('#pushTest').onclick = async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('KOM27 Einsatzplanung', { body: 'So sehen deine Mitteilungen aus ✓', icon: 'icons/icon-192.png' });
  };
}
const firstName = (t) => (t ? t.name.split(' ')[0] : 'Ein Techniker');

/* ---------------- Start ---------------- */
async function boot() {
  try {
    const qs = new URLSearchParams(location.search);
    if (!DEMO && qs.get('token_hash')) { // Link aus unserer Mail: kom27…/?token_hash=…&type=email|recovery
      const type = qs.get('type') || 'email'; history.replaceState(null, '', location.pathname);
      try { await store.verifyLink(qs.get('token_hash'), type); if (type === 'recovery') S.recovery = true; else toast('E-Mail bestätigt ✓ – willkommen!'); }
      catch (e) { return renderLogin('Der Link ist abgelaufen oder wurde schon benutzt. Bitte einfach anmelden – oder „Passwort vergessen“ antippen.'); }
    }
    if (!S.user) S.user = await store.session();
    if (!S.user || S.recovery) return renderLogin();
    S.admin = await store.isAdmin(S.user.email);
    S.viewer = !S.admin && store.isViewer ? await store.isViewer(S.user.email) : false;
    await reload();
    paint();
    startLive();
  } catch (e) { console.error(e); renderLogin(e.message); }
}

/* ---------------- Live-Aktualisierung ---------------- */
let liveTimer = null; let liveOn = false;
function scheduleLive(delay) { clearTimeout(liveTimer); liveTimer = setTimeout(liveRefresh, delay ?? 400); }
async function liveRefresh() {
  if (!S.user || S.recovery) return;
  // nicht mitten in eine Eingabe hinein neu zeichnen
  const ae = document.activeElement;
  if ((ae && /^(SELECT|INPUT|TEXTAREA)$/.test(ae.tagName) && ae.closest('#app')) || document.querySelector('.jc-reason:not(.hidden), .jc-one:not(.hidden), .stmenu, #sheet') || Date.now() < (S.calmUntil || 0)) return scheduleLive(2500);
  const oldAsg = S.asg; const oldUnav = new Set(S.unav.map((u) => u.tech_id + '|' + u.day));
  try { await reload(); } catch (e) { return; }
  const msgs = [];
  if (S.admin) {
    const slotByKey = {}; allSlots().forEach((x) => (slotByKey[x.key] = x));
    Object.values(S.asg).forEach((a) => {
      const o = oldAsg[a.slot_key];
      if (o && o.status !== a.status && (a.status === 'zugesagt' || a.status === 'abgesagt') && o.status === 'angefragt') {
        const t = techById(a.tech_id); const sl = slotByKey[a.slot_key];
        msgs.push(`${t ? t.name.split(' ')[0] : 'Techniker'} hat ${a.status === 'zugesagt' ? 'zugesagt ✓' : 'abgesagt ✗'}${sl ? ' (' + fmtDate(sl.date) + ')' : ''}`);
      }
    });
    const added = S.unav.filter((u) => !oldUnav.has(u.tech_id + '|' + u.day));
    if (added.length) { const t = techById(added[0].tech_id); msgs.push(`${t ? t.name.split(' ')[0] : 'Ein Techniker'} hat ${added.length} Tag${added.length > 1 ? 'e' : ''} als „kann nicht“ eingetragen`); }
  }
  if (dataSig() !== S.sig) paint(); // nur neu zeichnen, wenn sich wirklich etwas geändert hat
  if (msgs.length) toast(msgs.slice(0, 3).join(' · ') + (msgs.length > 3 ? ` (+${msgs.length - 3})` : ''));
}
function startLive() {
  if (liveOn) return; liveOn = true;
  if (DEMO) {
    window.addEventListener('storage', (e) => { if (e.key === DemoStore.K) scheduleLive(); });
  } else {
    const ch = store.sb.channel('kom27-live');
    ['assignments', 'unavailability', 'technicians', 'plan', 'offers', 'offer_interest', 'excel_sync', 'kb_entries'].forEach((tb) => ch.on('postgres_changes', { event: '*', schema: 'public', table: tb }, () => scheduleLive()));
    ch.subscribe((st) => { const d = $('#liveDot'); if (d) d.classList.toggle('on', st === 'SUBSCRIBED'); S.liveState = st; });
  }
  // Sicherheitsnetz: jede Minute und beim Zurückkehren zum Tab auffrischen
  setInterval(() => { if (!document.hidden) scheduleLive(0); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleLive(0); });
}
if (!DEMO) store.sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { S.recovery = true; renderLogin(); return; }
  const em = session && session.user ? session.user.email.toLowerCase() : null;
  if (S.user && em !== S.user.email) { S.user = null; location.reload(); } // in anderem Tab ab-/umgemeldet
});
// Anmeldung in einem anderen Tab desselben Browsers → diese Seite neu laden
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('sb-') && e.key.endsWith('-auth-token') && S.user) location.reload(); });
boot();
