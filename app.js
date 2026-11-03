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
  async loadAll() {
    const d = this.d(); const me = (d.techs || []).find((t) => (t.email || '').toLowerCase() === ls.get(this.U));
    const coll = Object.values(d.asg || {}).filter((a) => me && a.tech_id && a.tech_id !== me.id && ['angefragt', 'zugesagt'].includes(a.status)).map((a) => ({ slot_key: a.slot_key, name: ((d.techs || []).find((t) => t.id === a.tech_id) || {}).name || '', status: a.status }));
    return { plan: d.plan, techs: d.techs || [], asg: d.asg || {}, unav: d.unav || [], coll };
  },
  async setUnav(tech_id, day, note) { const d = this.d(); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && u.day === day)); d.unav.push({ tech_id, day, note: note || '' }); this.w(d); },
  async clearUnav(tech_id, day) { const d = this.d(); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && u.day === day)); this.w(d); },
  async setUnavMany(tech_id, days, note) { const d = this.d(); const set = new Set(days); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && set.has(u.day))); days.forEach((day) => d.unav.push({ tech_id, day, note: note || '' })); this.w(d); },
  async clearUnavMany(tech_id, days) { const d = this.d(); const set = new Set(days); d.unav = (d.unav || []).filter((u) => !(u.tech_id === tech_id && set.has(u.day))); this.w(d); },
  async savePlan(plan) { const d = this.d(); d.plan = plan; this.w(d); },
  async saveTech(t) { const d = this.d(); const i = d.techs.findIndex((x) => x.id === t.id); if (i >= 0) d.techs[i] = t; else d.techs.push(t); this.w(d); return t; },
  async deleteTech(id) { const d = this.d(); d.techs = d.techs.filter((t) => t.id !== id); Object.values(d.asg).forEach((a) => { if (a.tech_id === id) delete d.asg[a.slot_key]; }); this.w(d); },
  async saveAssignments(list) { const d = this.d(); list.forEach((a) => (d.asg[a.slot_key] = a)); this.w(d); },
  async deleteAssignments(keys) { const d = this.d(); keys.forEach((k) => delete d.asg[k]); this.w(d); },
  async savePush() {}, async deletePush() {},
  async respond(email, key, status, note) {
    const d = this.d(); const t = d.techs.find((x) => (x.email || '').toLowerCase() === email); const a = d.asg[key];
    if (!t || !a || a.tech_id !== t.id) throw new Error('Kein Einsatz gefunden.');
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
    async isAdmin() { return !!chk(await sb.rpc('is_admin')); },
    async loadAll() {
      const [p, t, a] = await Promise.all([sb.from('plan').select('data').eq('id', 1).maybeSingle(), sb.from('technicians').select('*').order('name'), sb.from('assignments').select('*')]);
      const asg = {}; chk(a).forEach((x) => (asg[x.slot_key] = x));
      const u = await sb.from('unavailability').select('tech_id, day, note'); // fehlt die Tabelle noch, einfach leer
      const ps = await sb.from('push_subscriptions').select('email'); // Admin sieht alle, Techniker nur eigene
      const co = await sb.rpc('my_colleagues'); // wer am selben Tag mit im Einsatz ist (fehlt die Funktion: leer)
      return { plan: chk(p) ? p.data.data : null, techs: chk(t), asg, unav: u.error ? [] : u.data, pushEmails: ps.error ? [] : ps.data.map((x) => x.email.toLowerCase()), coll: co.error ? [] : co.data || [] };
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
    async savePush(row) { chk(await sb.from('push_subscriptions').upsert(row)); },
    async deletePush(endpoint) { chk(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); }
  };
}
const store = DEMO ? DemoStore : makeSupabaseStore();

/* ---------------- Zustand ---------------- */
const S = { user: null, admin: false, plan: null, techs: [], asg: {}, unav: [], tab: 'plan', month: '', onlyOpen: false, recovery: false };

async function reload() { const d = await store.loadAll(); S.plan = d.plan; S.techs = d.techs; S.asg = d.asg; S.unav = d.unav || []; S.pushEmails = new Set(d.pushEmails || []); S.coll = d.coll || []; }
const unavOf = (techId, day) => S.unav.find((u) => u.tech_id === techId && u.day === day);
const allDays = () => (S.plan ? S.plan.days : []);
const allSlots = () => allDays().flatMap((d) => d.slots.map((s) => Object.assign({ day: d }, s)));
const techById = (id) => S.techs.find((t) => t.id === id);
const myTech = () => S.techs.find((t) => (t.email || '').toLowerCase() === S.user.email);

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
  const free = (s, id) => !(busy[s.date] && busy[s.date].has(id)) && !declined(s).has(id) && !unavOf(id, s.date);
  const set = (s, id) => { const prev = S.asg[s.key] || {}; changes[s.key] = { slot_key: s.key, tech_id: id, status: 'geplant', note: '', declined: prev.declined || [], requested_at: null, updated_at: nowISO() }; mark(s.date, id); };
  const byLoad = () => active.map((t) => t.id).sort((a, b) => (load[a] || 0) - (load[b] || 0));

  // 1) Namen, die schon in der Excel stehen
  slots.forEach((s) => { if (!isOpen(cur(s.key))) return; const t = matchTech(s.excelName); if (t && t.active !== false && free(s, t.id)) set(s, t.id); });
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
function renderLogin(msg) {
  const demoTechs = DEMO ? (DemoStore.d().techs || []).filter((t) => t.email) : [];
  $('#app').innerHTML = `
  <div class="card login">
    <h1>KOM27 Einsatzplanung</h1>
    <div class="muted">Medientechnik · ÖPP Mauerstraße</div>
    ${S.recovery ? `
      <label>Neues Passwort</label><input id="pw1" type="password" autocomplete="new-password">
      <div class="row"><button class="btn primary" id="setpw">Passwort speichern</button></div>` : `
      <label for="em">E-Mail</label><input id="em" type="email" autocomplete="username" value="${esc(ls.get('kom27-last-email') || '')}">
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
    </div></div>` : ''}
  </div>`;
  const err = (e) => ($('#err').textContent = e.message || e);
  const creds = () => { const em = $('#em').value.trim(); ls.set('kom27-last-email', em); return [em, $('#pw').value]; };
  if (S.recovery) {
    $('#setpw').onclick = async () => { try { await store.setPassword($('#pw1').value); S.recovery = false; toast('Passwort geändert'); boot(); } catch (e) { err(e); } };
    return;
  }
  $('#in').onclick = async () => { try { const [e, p] = creds(); S.user = await store.signIn(e, p); boot(); } catch (e) { err(e); } };
  $('#pw').onkeydown = (ev) => { if (ev.key === 'Enter') $('#in').click(); };
  $('#up').onclick = async () => {
    try { const [e, p] = creds(); if (p.length < 8) throw new Error('Passwort bitte mit mindestens 8 Zeichen.'); const u = await store.signUp(e, p); if (u) { S.user = u; boot(); } else err('Fast fertig: Bitte den Bestätigungslink in deiner E-Mail anklicken, dann hier anmelden.'); } catch (e) { err(e); }
  };
  $('#forgot').onclick = async () => { try { const [e] = creds(); if (!e) throw new Error('Bitte erst die E-Mail eintragen.'); await store.reset(e); err('Link zum Zurücksetzen wurde per E-Mail geschickt.'); } catch (e) { err(e); } };
  document.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => { S.user = await store.signIn(b.dataset.demo); boot(); }));
}

/* ---------------- Render: Master ---------------- */
function header(extra) {
  return `<header class="top"><div class="top-inner">
    <div class="brand">KOM27 Einsatzplanung<small>${DEMO ? 'Demo' : esc(S.user.email)}</small></div>
    <span class="live ${DEMO || S.liveState === 'SUBSCRIBED' ? 'on' : ''}" id="liveDot" title="Live: Änderungen erscheinen automatisch"><i></i>live</span>
    ${extra || ''}<div class="spacer"></div>
    <button class="btn small" id="logout">Abmelden</button></div></header>`;
}

function renderMaster() {
  const tabs = [['plan', 'Planung'], ['req', 'Anfragen'], ['techs', 'Techniker']];
  const nav = `<nav class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  $('#app').innerHTML = header(nav) + `<main id="main"></main>`;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; renderMaster(); }));
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  ({ plan: renderPlan, req: renderReq, techs: renderTechs })[S.tab]();
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
    </div>`;
}

let excelLib;
async function loadExcelJS() {
  if (window.ExcelJS) return;
  if (!excelLib) excelLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'; s.onload = res; s.onerror = () => rej(new Error('ExcelJS konnte nicht geladen werden')); document.head.appendChild(s); });
  await excelLib;
}
async function importFile(file) {
  try {
    toast('Lese Excel …');
    await loadExcelJS();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const plan = window.KOM27Parser.parseWorkbook(wb);
    plan.fileName = file.name;
    await store.savePlan(plan);
    S.plan = plan;
    const n = plan.days.reduce((a, d) => a + d.slots.length, 0);
    toast(`Excel eingelesen: ${plan.days.length} Tage, ${n} Techniker-Einsätze`);
    renderMaster();
  } catch (e) { console.error(e); toast('Fehler beim Einlesen: ' + e.message); }
}
function wireImport() {
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
  const map = {}; const need = {}; const filled = {}; const sum = {};
  days.forEach((d) => { if (d.cancelled) return; d.slots.forEach((s) => {
    need[d.date] = (need[d.date] || 0) + 1;
    const a = S.asg[s.key];
    if (a && a.tech_id && a.status !== 'abgesagt') { filled[d.date] = (filled[d.date] || 0) + 1; ((map[a.tech_id] = map[a.tech_id] || {})[d.date] = map[a.tech_id][d.date] || []).push({ s, a }); sum[a.tech_id] = (sum[a.tech_id] || 0) + 1; }
  }); });
  const th = days.map((d) => { const f = fmtDate(d.date); return `<th class="${d.free ? 'we' : ''} ${d.date === today ? 'today' : ''}"><span>${f.slice(0, 2)}</span>${d.date.slice(8, 10)}</th>`; }).join('');
  const needRow = days.map((d) => {
    const n = need[d.date] || 0; const f = filled[d.date] || 0;
    if (!n) return `<td class="${d.free ? 'we' : ''}"></td>`;
    return `<td class="${d.free ? 'we' : ''}"><button class="need ${f >= n ? 'full' : 'miss'}" data-jump="${d.date}" title="${f} von ${n} Plätzen besetzt">${f}/${n}</button></td>`;
  }).join('');
  const rowsH = techs.map((t) => `<tr><th class="name">${esc(t.name)}</th>${days.map((d) => {
    const e = (map[t.id] || {})[d.date]; const u = unavOf(t.id, d.date);
    if (!e) return `<td class="${d.free ? 'we' : ''}">${u ? `<span class="gblock" title="${esc('Kann nicht' + (u.note ? ': ' + u.note : ''))}">✗</span>` : ''}</td>`;
    const worst = ['abgesagt', 'geplant', 'angefragt', 'zugesagt'].find((st) => e.some((x) => x.a.status === st));
    const tip = e.map((x) => `${x.s.zeit || ''} ${x.s.va || ''} – ${ST_LABEL[x.a.status]}`).join('\n');
    return `<td class="${d.free ? 'we' : ''}"><button class="gcell ${worst} ${e.length > 1 || u ? 'dbl' : ''}" data-jump="${d.date}" title="${esc(tip + (u ? '\n⛔ hat sich für diesen Tag abgemeldet' : ''))}">${esc((e[0].s.zeit || '•').slice(0, 2))}${e.length > 1 ? '²' : ''}</button></td>`;
  }).join('')}<td class="sum">${sum[t.id] || 0}</td></tr>`).join('');
  return `<div class="legend"><span class="lg zugesagt"></span>zugesagt <span class="lg angefragt"></span>angefragt <span class="lg geplant"></span>geplant <span class="lg miss"></span>Platz offen <span class="lg blocked"></span>kann nicht (vom Techniker eingetragen) · Zahl = Arbeitsbeginn · Klick = zum Tag springen</div>
    <div class="card gridwrap"><table class="grid"><thead><tr><th class="name">Techniker</th>${th}<th class="sum">Σ</th></tr></thead>
    <tbody><tr class="needrow"><th class="name">Besetzt / Bedarf</th>${needRow}<td class="sum"></td></tr>${rowsH || `<tr><td colspan="${days.length + 2}" class="empty-msg">Noch keine Techniker angelegt.</td></tr>`}</tbody></table></div>`;
}

function renderPlan() {
  const m = $('#main');
  const today = todayISO();
  if (!S.month) S.month = today.slice(0, 7);
  if (!S.filter) S.filter = 'alle';
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
  const techOpts = (sel, slot) => {
    const dec = new Set(((S.asg[slot.key] || {}).declined) || []);
    const list = S.techs.filter((t) => t.active !== false || t.id === sel);
    const busy = (t) => busyOn[slot.date] && busyOn[slot.date][t.id] && busyOn[slot.date][t.id] !== slot.key;
    const opt = (t, suffix) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}${t.id === sel ? '' : suffix}</option>`;
    const away = (t) => !!unavOf(t.id, slot.date);
    const free = list.filter((t) => !busy(t) && !dec.has(t.id) && !away(t)).sort((a, b) => (loadM[a.id] || 0) - (loadM[b.id] || 0));
    const taken = list.filter((t) => busy(t) && !dec.has(t.id) && !away(t));
    const off = list.filter((t) => away(t) && !dec.has(t.id));
    const no = list.filter((t) => dec.has(t.id));
    return `<option value="">– unbesetzt –</option>`
      + (free.length ? `<optgroup label="Frei an diesem Tag (wenigste Einsätze zuerst)">${free.map((t) => opt(t, `  · ${loadM[t.id] || 0} im Monat`)).join('')}</optgroup>` : '')
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
    const show = S.filter === 'alle' ? groups : groups.filter((g) => g.slots.some((s) => slotState(s) === S.filter));
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
          <div class="va-id">${esc(g.k)} ${tag} ${lbl ? `<span class="tag">${esc(lbl[0][0].toUpperCase() + lbl[0].slice(1).toLowerCase())}</span>` : ''} ${d.cancelled ? '<span class="tag red">abgesagt</span>' : ''}</div>
          <div class="va-sub">${[d.vazeit ? 'VA ' + esc(d.vazeit) : '', esc(room)].filter(Boolean).join(' · ')}
            ${d.info && gi === 0 ? `<details class="more"><summary>Details</summary><div>${esc(d.info)}</div></details>` : ''}</div>
        </div>
        <div class="c-slots">${g.none ? '<span class="muted small">kein Techniker angefordert</span>' : g.slots.map((s) => {
          const a = S.asg[s.key]; const st = slotState(s); const t = a && a.tech_id ? techById(a.tech_id) : null;
          const excelDiff = s.excelName && (!t || matchTech(s.excelName) !== t);
          const dbl = t && d.slots.some((x) => x.key !== s.key && S.asg[x.key] && S.asg[x.key].tech_id === t.id && S.asg[x.key].status !== 'abgesagt');
          return `<div class="slot st-${st}">
            <select data-slot="${esc(s.key)}" aria-label="Techniker">${techOpts(t ? t.id : '', s)}</select>
            <div class="slot-foot"><span class="time">${esc(s.zeit || 'Zeit offen')}</span>
              ${t ? `<button class="pill ${a.status}" data-cycle="${esc(s.key)}" title="Klicken zum Ändern${a.note ? ' – Notiz: ' + esc(a.note) : ''}">${ST_LABEL[a.status]}${a.note ? ' 💬' : ''}</button>` : '<span class="pill leer">unbesetzt</span>'}</div>
            ${dbl ? '<div class="hint warn">⚠ an diesem Tag doppelt eingeteilt</div>' : ''}
            ${t && unavOf(t.id, d.date) ? `<div class="hint warn">⛔ ${esc(t.name.split(' ')[0])} hat sich abgemeldet${unavOf(t.id, d.date).note ? ': ' + esc(unavOf(t.id, d.date).note) : ''}</div>` : ''}
            ${excelDiff ? `<div class="hint" title="So steht es in der KOM27-Excel">Excel: ${esc(s.excelName)}</div>` : ''}
          </div>`;
        }).join('')}</div>
      </div>`;
    });
  });

  m.innerHTML = importBar() + (S.plan ? `
    ${S.techs.length ? '' : `<div class="banner">Lege zuerst unter <b>Techniker</b> dein Stamm-Team an (Namen aus der Excel lassen sich mit einem Klick übernehmen).</div>`}
    <div class="toolbar">
      <div class="monthnav">
        <button class="btn small" id="mPrev" ${mi <= 0 ? 'disabled' : ''} aria-label="Vormonat">‹</button>
        <select id="month">${months.map((x) => `<option value="${x}" ${x === S.month ? 'selected' : ''}>${MON[+x.slice(5, 7) - 1]} ${x.slice(0, 4)}</option>`).join('')}</select>
        <button class="btn small" id="mNext" ${mi >= months.length - 1 ? 'disabled' : ''} aria-label="Nächster Monat">›</button>
      </div>
      <div class="seg" role="tablist"><button data-view="liste" class="${S.view !== 'raster' ? 'on' : ''}">Liste</button><button data-view="raster" class="${S.view === 'raster' ? 'on' : ''}">Raster</button></div>
      <div class="spacer"></div>
      <button class="btn" id="copy">Zusagen kopieren</button>
      <button class="btn primary" id="auto">Auto-Einteilung</button>
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
  document.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { S.filter = b.dataset.filter; renderMaster(); }));
  if ($('#showPast')) $('#showPast').onchange = (e) => { S.showPast = e.target.checked; renderMaster(); };
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { S.view = b.dataset.view; renderMaster(); }));
  document.querySelectorAll('[data-jump]').forEach((c) => (c.onclick = () => {
    S.view = 'liste'; S.filter = 'alle'; if (c.dataset.jump < today) S.showPast = true; renderMaster();
    const el = document.getElementById('d-' + c.dataset.jump); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }));
  const days = monthDays;
  $('#month').onchange = (e) => { S.month = e.target.value; renderMaster(); };
  document.querySelectorAll('select[data-slot]').forEach((sel) => (sel.onchange = async () => {
    const key = sel.dataset.slot; const id = sel.value; const prev = S.asg[key] || {};
    try {
      if (!id) { await store.deleteAssignments([key]); delete S.asg[key]; }
      else { const a = { slot_key: key, tech_id: id, status: 'geplant', note: '', declined: prev.declined || [], requested_at: null, updated_at: nowISO() }; await store.saveAssignments([a]); S.asg[key] = a; }
      renderMaster();
    } catch (e) { toast(e.message); }
  }));
  document.querySelectorAll('[data-cycle]').forEach((b) => (b.onclick = async () => {
    const a = Object.assign({}, S.asg[b.dataset.cycle]); a.status = STATUS[(STATUS.indexOf(a.status) + 1) % STATUS.length]; a.updated_at = nowISO();
    try { await store.saveAssignments([a]); S.asg[a.slot_key] = a; renderMaster(); } catch (e) { toast(e.message); }
  }));
  $('#auto').onclick = async () => {
    if (!S.techs.length) return toast('Bitte zuerst Techniker anlegen.');
    const ch = autoAssign();
    if (!ch.length) return toast('Alles besetzt – nichts zu tun.');
    try { await store.saveAssignments(ch); ch.forEach((a) => (S.asg[a.slot_key] = a)); toast(`${ch.length} Einsätze eingeteilt (Status „geplant“). Jetzt unter „Anfragen“ verschicken.`); renderMaster(); } catch (e) { toast(e.message); }
  };
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
  return `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
}

function renderReq() {
  const m = $('#main'); const today = todayISO();
  const rows = S.techs.map((t) => {
    const sl = slotsOfTech(t.id, today);
    return { t, neu: sl.filter((s) => S.asg[s.key].status === 'geplant'), wait: sl.filter((s) => S.asg[s.key].status === 'angefragt'), no: sl.filter((s) => S.asg[s.key].status === 'abgesagt') };
  }).filter((r) => r.neu.length || r.wait.length || r.no.length);
  const hasPush = (t) => t.email && S.pushEmails && S.pushEmails.has(t.email.toLowerCase());
  m.innerHTML = `<div id="pushBox"></div><div class="bar"><div class="note">„📲 Push senden“ schickt eine Mitteilung direkt aufs Handy des Technikers (wenn er sie aktiviert hat, erkennbar am 🔔). „✉️ E-Mail“ öffnet zusätzlich eine fertige Mail. Danach stehen die Einsätze auf „angefragt“.</div></div>
  <div class="card">${rows.map(({ t, neu, wait, no }) => `<div class="req">
    <h3>${esc(t.name)} ${hasPush(t) ? '<span title="Push-Mitteilungen aktiv">🔔</span>' : ''} <span class="note">${esc(t.email || 'keine E-Mail hinterlegt')}</span></h3>
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
      setTimeout(renderMaster, 400);
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
  <div class="card"><table class="list">
    <thead><tr><th>Name</th><th>E-Mail (= Login)</th><th class="hide-sm">Andere Schreibweisen in der Excel</th><th>Aktiv</th><th class="hide-sm">Einsätze ab heute</th><th></th></tr></thead>
    <tbody>${S.techs.map((t) => `<tr data-id="${t.id}">
      <td><input type="text" data-f="name" value="${esc(t.name)}"></td>
      <td><input type="email" data-f="email" value="${esc(t.email || '')}" placeholder="name@…"></td>
      <td class="hide-sm"><input type="text" data-f="aliases" value="${esc(t.aliases || '')}" placeholder="z. B. Kevin R., Kevin Rehfeld"></td>
      <td><input type="checkbox" data-f="active" ${t.active !== false ? 'checked' : ''}></td>
      <td class="hide-sm">${slotsOfTech(t.id, today).length}</td>
      <td><button class="btn small" data-del="${t.id}">Entfernen</button></td></tr>`).join('')}
      <tr><td colspan="6"><button class="btn" id="addTech">+ Techniker hinzufügen</button></td></tr>
    </tbody></table></div>
  <p class="note">Jeder Techniker meldet sich mit genau dieser E-Mail an. Beim ersten Mal klickt er auf „Konto anlegen“ und wählt sein Passwort selbst. Er sieht nur seine eigenen Einsätze.</p>`;
  const save = async (t) => { try { const r = await store.saveTech(t); const i = S.techs.findIndex((x) => x.id === r.id); if (i >= 0) S.techs[i] = r; else S.techs.push(r); } catch (e) { toast(e.message); } };
  m.querySelectorAll('tr[data-id] input').forEach((inp) => (inp.onchange = async () => {
    const t = Object.assign({}, techById(inp.closest('tr').dataset.id));
    const f = inp.dataset.f; t[f] = f === 'active' ? inp.checked : f === 'email' ? inp.value.trim().toLowerCase() : inp.value.trim();
    await save(t); toast('Gespeichert');
  }));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const t = techById(b.dataset.del);
    if (!confirm(`${t.name} entfernen? Seine Einteilungen werden gelöscht.`)) return;
    try { await store.deleteTech(t.id); await reload(); renderMaster(); } catch (e) { toast(e.message); }
  }));
  const add = async (name) => { await save({ id: uid(), name, email: '', aliases: '', active: true }); renderMaster(); };
  $('#addTech').onclick = () => add('Neuer Techniker');
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
  const mine = S.asg[s.key]; const myId = mine && mine.tech_id;
  if (S.admin) return allSlots().filter((x) => x.date === s.date && x.key !== s.key && S.asg[x.key] && S.asg[x.key].tech_id && S.asg[x.key].tech_id !== myId && ['angefragt', 'zugesagt'].includes(S.asg[x.key].status))
    .map((x) => ({ name: (techById(S.asg[x.key].tech_id) || {}).name || '?', status: S.asg[x.key].status, zeit: x.zeit, same: x.va === s.va }));
  return (S.coll || []).filter((c) => c.slot_key.startsWith(s.date + '#')).map((c) => {
    const x = allSlots().find((y) => y.key === c.slot_key) || {};
    return { name: c.name, status: c.status, zeit: x.zeit, same: x.va === s.va };
  });
}

function timeline(s) {
  const det = s.det || {};
  const rows = [['Dein Einsatz', s.zeit, 'tl-me'], ['Raum gebucht', det.buch, 'tl-b'], ['Veranstaltung', det.vazeit || s.day.vazeit, 'tl-va']].map(([l, z, c]) => [l, z, c, parseSpan(z)]).filter((r) => r[3]);
  if (rows.length < 2) return '';
  const lo = Math.floor(Math.min(...rows.map((r) => r[3][0]))); const hi = Math.ceil(Math.max(...rows.map((r) => r[3][1]))); const span = Math.max(hi - lo, 1);
  const ticks = []; for (let h = lo; h <= hi; h += span > 10 ? 2 : 1) ticks.push(`<i style="left:${((h - lo) / span) * 100}%">${hm(h).slice(0, 2)}</i>`);
  return `<div class="tl">${rows.map(([l, z, c, [a, b]]) => `<div class="tl-row"><span class="tl-l">${l}</span><div class="tl-track"><div class="tl-bar ${c}" style="left:${((a - lo) / span) * 100}%;width:${((b - a) / span) * 100}%"></div></div></div>`).join('')}
    <div class="tl-row"><span class="tl-l"></span><div class="tl-ticks">${ticks.join('')}</div></div></div>`;
}

function equipHtml(s) {
  const det = s.det || {};
  let rooms = det.rooms && det.rooms.length ? det.rooms : null;
  if (!rooms && s.day.info) rooms = s.day.info.split(' · ').map((x) => { const i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : ['', x]; });
  if (!rooms) return `<p class="muted">Für diesen Tag steht in der Excel noch nichts zum Aufbau.</p>`;
  const done = doneGet()[s.key] || [];
  return rooms.map(([room, text], ri) => {
    let items = text.split('\n').map((x) => x.trim()).filter(Boolean);
    if (items.length === 1 && items[0].split(',').length > 2) items = items[0].split(',').map((x) => x.trim()).filter(Boolean);
    return `<div class="room"><div class="room-h">📍 ${esc(room || 'Raum')}</div><ul class="check">${items.map((it, ii) => { const id = ri + '.' + ii; const on = done.includes(id);
      return `<li class="${on ? 'done' : ''} ${isImportant(it) ? 'imp' : ''}"><label><input type="checkbox" data-chk="${id}" ${on ? 'checked' : ''}><span>${esc(it)}</span></label></li>`; }).join('')}</ul></div>`;
  }).join('');
}

function openJob(key, list) {
  const s = allSlots().find((x) => x.key === key); if (!s) return;
  const a = S.asg[s.key] || {}; const det = s.det || {};
  const grp = s.group ? allSlots().filter((x) => x.group === s.group && S.asg[x.key] && S.asg[x.key].tech_id === a.tech_id) : [s];
  const gi = grp.findIndex((x) => x.key === s.key);
  const coll = colleaguesOf(s);
  const status = a.status || 'geplant';
  const stTxt = { angefragt: 'Wartet auf deine Antwort', zugesagt: 'Zugesagt ✓', abgesagt: 'Abgesagt', geplant: 'Geplant' }[status];
  const fact = (lbl, val, big) => val ? `<div class="fact ${big ? 'big' : ''}"><small>${lbl}</small><b>${esc(niceTime(val))}</b></div>` : '';
  const old = !s.det;
  const html = `<div class="sheet-bg" id="sheet"><div class="sheet" role="dialog" aria-modal="true" aria-label="Einsatz-Details">
    <div class="sh-top"><button class="sh-x" data-close aria-label="Schließen">✕</button><span class="pill st-${status}">${stTxt}</span></div>
    <div class="sh-head">
      <div class="sh-date">${dateBox(s.date)}<div><h2>${esc(longDate(s.date))}</h2><span class="until">${untilTxt(s.date)}</span></div></div>
      <div class="sh-va">${esc(s.va || 'Einsatz')}${s.label && s.label.replace(/\s/g, '') !== (s.va || '') ? ' · ' + esc(s.label) : ''}</div>
      ${grp.length > 1 ? `<div class="sh-days"><span>Tag ${gi + 1} von ${grp.length}</span>${grp.map((x) => `<button class="chip ${x.key === s.key ? 'on' : ''}" data-jump="${esc(x.key)}">${shortDate(x.date)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="facts">${fact('Deine Einsatzzeit', s.zeit || '–', true)}${fact('Veranstaltung (VA-Zeit)', det.vazeit || s.day.vazeit)}${fact('Einlass', det.einlass)}${fact('Raum gebucht', det.buch)}</div>
    ${timeline(s)}
    ${s.note ? `<div class="hint">📝 ${esc(s.note)}</div>` : ''}
    <h3>🛠 Das baust du auf</h3>
    ${equipHtml(s)}
    ${old ? `<p class="muted small">Tipp für ${esc(CFG.senderName)}: Excel einmal neu einlesen, dann erscheint hier die Liste Punkt für Punkt.</p>` : `<p class="muted small">Abhaken ist nur für dich – praktisch beim Aufbau.</p>`}
    ${(det.extras || []).length ? `<h3>ℹ️ Weitere Infos</h3><dl class="extras">${det.extras.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>` : ''}
    <h3>👥 Mit dir im Haus</h3>
    ${coll.length ? `<div class="coll">${coll.map((c) => `<span class="cchip ${c.status}">${esc(c.name)}${c.zeit ? ' <small>' + esc(c.zeit) + '</small>' : ''}${c.status === 'angefragt' ? ' <small>(angefragt)</small>' : ''}</span>`).join('')}</div>` : `<p class="muted">Nach aktuellem Stand bist du allein eingeteilt.</p>`}
    <h3>📍 Ort</h3>
    <p>KOM27, Mauerstraße, Berlin · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('KOM27 Mauerstraße Berlin')}" target="_blank" rel="noopener">Route öffnen</a></p>
    <div class="sh-actions">
      ${status === 'angefragt' && !S.admin ? `<button class="big yes" data-ans="zugesagt">✓ Ich kann</button><button class="big no" data-ans="abgesagt">✗ Kann nicht</button>` : ''}
      ${status === 'zugesagt' ? `<button class="big ghost" data-ics>📅 In meinen Kalender</button>` : ''}
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
  box.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = async () => {
    let note = '';
    if (b.dataset.ans === 'abgesagt') { const r = prompt('Kurzer Grund (optional):', ''); if (r === null) return; note = r.trim(); }
    close(); if (window.__answer) window.__answer([s.key], b.dataset.ans, note);
  }));
}

function renderTech() {
  const t = myTech();
  const today = todayISO();
  $('#app').innerHTML = header() + `<main class="mine" id="main"></main>`;
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  const m = $('#main');
  if (!t) { m.innerHTML = `<section class="hello"><h1>Fast geschafft</h1><p>Dein Login <b>${esc(S.user.email)}</b> ist noch keinem Techniker zugeordnet. Bitte gib ${esc(CFG.senderName)} kurz Bescheid, dann siehst du hier deine Einsätze.</p></section>`; return; }

  const sl = slotsOfTech(t.id, today).filter((s) => S.asg[s.key].status !== 'geplant');
  const st = (s) => S.asg[s.key].status;
  // nach Veranstaltung gruppieren
  const groupsOf = (list) => { const out = []; const idx = {}; list.forEach((s) => { const g = s.group || s.key; if (!(g in idx)) { idx[g] = out.length; out.push({ id: g, va: s.va, slots: [] }); } out[idx[g]].slots.push(s); }); return out; };
  const open = groupsOf(sl.filter((s) => st(s) === 'angefragt'));
  const yes = sl.filter((s) => st(s) === 'zugesagt');
  const no = sl.filter((s) => st(s) === 'abgesagt');
  const nOpen = open.reduce((a, g) => a + g.slots.length, 0);

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
      <div class="jc-actions">
        <button class="big yes" data-all="zugesagt">✓ Ich kann${multi ? ` – alle ${g.slots.length} Tage` : ''}</button>
        <button class="big no" data-askno>✗ Kann nicht</button>
      </div>
      <div class="jc-reason hidden"><label>Kurzer Grund (optional)</label><input type="text" placeholder="z. B. Urlaub, anderer Job …"><div class="jc-actions"><button class="big no solid" data-all="abgesagt">Absage senden</button><button class="big ghost" data-cancel>Zurück</button></div></div>
      ${multi ? `<button class="linkbtn" data-split>Ich kann nur an einzelnen Tagen</button>` : ''}
    </article>`;
  };
  const line = (s, kind) => `<div class="mini-line">${dateBox(s.date)}<button class="ml-txt jc-open" data-open="${esc(s.key)}"><b>${esc(niceTime(s.zeit))} <span class="until">${untilTxt(s.date)}</span></b><small>${esc(s.va || '')}${roomsOf(s.day.info) ? ' · ' + esc(roomsOf(s.day.info)) : ''}${S.asg[s.key].note ? ' · „' + esc(S.asg[s.key].note) + '“' : ''}</small><span class="jc-more">Details ›</span></button>
      ${kind === 'yes' ? `<button class="linkbtn danger" data-change="abgesagt" data-k="${esc(s.key)}">doch absagen</button>` : `<button class="linkbtn" data-change="zugesagt" data-k="${esc(s.key)}">doch zusagen</button>`}</div>`;

  m.innerHTML = `
    <section class="hello">
      <h1>Hallo ${esc(t.name.split(' ')[0])} 👋</h1>
      <p>Medientechnik im KOM27, Mauerstraße</p>
      <div id="pushBox"></div>
      <div class="sumrow">
        <div class="sumbox ${nOpen ? 'warn' : ''}"><b>${nOpen}</b><span>${nOpen === 1 ? 'Anfrage wartet' : 'Anfragen warten'} auf dich</span></div>
        <div class="sumbox ok"><b>${yes.length}</b><span>${yes.length === 1 ? 'zugesagter Einsatz' : 'zugesagte Einsätze'}</span></div>
      </div>
    </section>
    ${open.length ? `<h2 class="sec">Bitte gib Bescheid</h2>${open.map(card).join('')}` : `<div class="allgood">✓ Alles beantwortet – danke!<small>Neue Anfragen bekommst du per E-Mail.</small></div>`}
    <h2 class="sec">Wann kannst du nicht?</h2>
    <p class="sec-help">Tippe die Tage an, an denen du nicht verfügbar bist. Nochmal tippen nimmt es wieder raus. ${esc(CFG.senderName)} sieht das sofort und plant dich dann nicht ein.</p>
    ${techCalHtml(t)}
    ${yes.length ? `<h2 class="sec">Deine nächsten Einsätze <button class="linkbtn" id="ics">📅 in meinen Kalender</button></h2><div class="mini-list">${yes.map((s) => line(s, 'yes')).join('')}</div>` : ''}
    ${no.length ? `<details class="nolist"><summary>Abgesagt (${no.length})</summary><div class="mini-list">${no.map((s) => line(s, 'no')).join('')}</div></details>` : ''}
    <p class="note center">Fragen? Einfach ${esc(CFG.senderName)} anrufen oder auf die Anfrage-Mail antworten.</p>`;

  const answer = async (keys, status, note) => {
    try {
      for (const k of keys) await store.respond(S.user.email, k, status, note || '');
      const dates = allSlots().filter((x) => keys.includes(x.key)).map((x) => fmtDate(x.date));
      notify('admins', [], `${firstName(t)} hat ${status === 'zugesagt' ? 'zugesagt ✓' : 'abgesagt ✗'}`, dates.join(', ') + (note ? ' – „' + note + '“' : ''), 'answer-' + t.id);
      await reload(); toast(status === 'zugesagt' ? 'Danke! Zusage ist gespeichert ✓' : 'Absage ist gespeichert'); renderTech();
    } catch (e) { toast(e.message); }
  };
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
  if ($('#ics')) $('#ics').onclick = () => icsFor(yes, t);
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
  try { await store.sb.functions.invoke('notify', { body: { target, tech_ids, title, body, tag } }); } catch (e) { console.warn('Push fehlgeschlagen', e); }
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
    if (!S.user) S.user = await store.session();
    if (!S.user || S.recovery) return renderLogin();
    S.admin = await store.isAdmin(S.user.email);
    await reload();
    S.admin ? renderMaster() : renderTech();
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
  if ((ae && /^(SELECT|INPUT|TEXTAREA)$/.test(ae.tagName) && ae.closest('#app')) || document.querySelector('.jc-reason:not(.hidden), .jc-one:not(.hidden)')) return scheduleLive(2500);
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
  const y = window.scrollY;
  S.admin ? renderMaster() : renderTech();
  window.scrollTo(0, y);
  if (msgs.length) toast(msgs.slice(0, 3).join(' · ') + (msgs.length > 3 ? ` (+${msgs.length - 3})` : ''));
}
function startLive() {
  if (liveOn) return; liveOn = true;
  if (DEMO) {
    window.addEventListener('storage', (e) => { if (e.key === DemoStore.K) scheduleLive(); });
  } else {
    const ch = store.sb.channel('kom27-live');
    ['assignments', 'unavailability', 'technicians', 'plan'].forEach((tb) => ch.on('postgres_changes', { event: '*', schema: 'public', table: tb }, () => scheduleLive()));
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
