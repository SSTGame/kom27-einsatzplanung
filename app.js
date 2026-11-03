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
  async loadAll() { const d = this.d(); return { plan: d.plan, techs: d.techs || [], asg: d.asg || {} }; },
  async savePlan(plan) { const d = this.d(); d.plan = plan; this.w(d); },
  async saveTech(t) { const d = this.d(); const i = d.techs.findIndex((x) => x.id === t.id); if (i >= 0) d.techs[i] = t; else d.techs.push(t); this.w(d); return t; },
  async deleteTech(id) { const d = this.d(); d.techs = d.techs.filter((t) => t.id !== id); Object.values(d.asg).forEach((a) => { if (a.tech_id === id) delete d.asg[a.slot_key]; }); this.w(d); },
  async saveAssignments(list) { const d = this.d(); list.forEach((a) => (d.asg[a.slot_key] = a)); this.w(d); },
  async deleteAssignments(keys) { const d = this.d(); keys.forEach((k) => delete d.asg[k]); this.w(d); },
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
      return { plan: chk(p) ? p.data.data : null, techs: chk(t), asg };
    },
    async savePlan(plan) { chk(await sb.from('plan').upsert({ id: 1, data: plan, imported_at: plan.importedAt })); },
    async saveTech(t) { return chk(await sb.from('technicians').upsert(Object.assign({}, t, { email: t.email || null })).select().single()); },
    async deleteTech(id) { chk(await sb.from('technicians').delete().eq('id', id)); },
    async saveAssignments(list) { if (list.length) chk(await sb.from('assignments').upsert(list)); },
    async deleteAssignments(keys) { if (keys.length) chk(await sb.from('assignments').delete().in('slot_key', keys)); },
    async respond(_email, key, status, note) { chk(await sb.rpc('respond', { p_slot: key, p_status: status, p_note: note || '' })); }
  };
}
const store = DEMO ? DemoStore : makeSupabaseStore();

/* ---------------- Zustand ---------------- */
const S = { user: null, admin: false, plan: null, techs: [], asg: {}, tab: 'plan', month: '', onlyOpen: false, recovery: false };

async function reload() { const d = await store.loadAll(); S.plan = d.plan; S.techs = d.techs; S.asg = d.asg; }
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
  const free = (s, id) => !(busy[s.date] && busy[s.date].has(id)) && !declined(s).has(id);
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
    const e = (map[t.id] || {})[d.date];
    if (!e) return `<td class="${d.free ? 'we' : ''}"></td>`;
    const worst = ['abgesagt', 'geplant', 'angefragt', 'zugesagt'].find((st) => e.some((x) => x.a.status === st));
    const tip = e.map((x) => `${x.s.zeit || ''} ${x.s.va || ''} – ${ST_LABEL[x.a.status]}`).join('\n');
    return `<td class="${d.free ? 'we' : ''}"><button class="gcell ${worst} ${e.length > 1 ? 'dbl' : ''}" data-jump="${d.date}" title="${esc(tip)}">${esc((e[0].s.zeit || '•').slice(0, 2))}${e.length > 1 ? '²' : ''}</button></td>`;
  }).join('')}<td class="sum">${sum[t.id] || 0}</td></tr>`).join('');
  return `<div class="legend"><span class="lg zugesagt"></span>zugesagt <span class="lg angefragt"></span>angefragt <span class="lg geplant"></span>geplant <span class="lg miss"></span>Platz offen · Zahl = Arbeitsbeginn · Klick = zum Tag springen</div>
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
    const free = list.filter((t) => !busy(t) && !dec.has(t.id)).sort((a, b) => (loadM[a.id] || 0) - (loadM[b.id] || 0));
    const taken = list.filter((t) => busy(t) && !dec.has(t.id));
    const no = list.filter((t) => dec.has(t.id));
    return `<option value="">– unbesetzt –</option>`
      + (free.length ? `<optgroup label="Frei an diesem Tag (wenigste Einsätze zuerst)">${free.map((t) => opt(t, `  · ${loadM[t.id] || 0} im Monat`)).join('')}</optgroup>` : '')
      + (taken.length ? `<optgroup label="Schon eingeteilt an diesem Tag">${taken.map((t) => opt(t, '  ⚠ doppelt')).join('')}</optgroup>` : '')
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
  m.innerHTML = `<div class="bar"><div class="note">Pro Techniker wird eine fertige E-Mail in deinem Mailprogramm geöffnet. Danach stehen die Einsätze auf „angefragt“, und die Antworten erscheinen hier und in der Planung.</div></div>
  <div class="card">${rows.map(({ t, neu, wait, no }) => `<div class="req">
    <h3>${esc(t.name)} <span class="note">${esc(t.email || 'keine E-Mail hinterlegt')}</span></h3>
    ${neu.length ? `<div><b>Neu (${neu.length})</b><ul>${neu.map((s) => `<li>${esc(slotLine(s))}</li>`).join('')}</ul></div>` : ''}
    ${wait.length ? `<div class="muted"><b>Wartet auf Antwort (${wait.length})</b><ul>${wait.map((s) => `<li>${esc(slotLine(s))}</li>`).join('')}</ul></div>` : ''}
    ${no.length ? `<div style="color:var(--st-abgesagt)"><b>Abgesagt – Ersatz einteilen (${no.length})</b><ul>${no.map((s) => `<li>${esc(slotLine(s))}${S.asg[s.key].note ? ' – „' + esc(S.asg[s.key].note) + '“' : ''}</li>`).join('')}</ul></div>` : ''}
    <div class="bar" style="margin:0">
      ${neu.length ? `<button class="btn primary" data-send="${t.id}" ${t.email ? '' : 'disabled'}>Anfrage per E-Mail (${neu.length})</button>` : ''}
      ${wait.length ? `<button class="btn" data-remind="${t.id}" ${t.email ? '' : 'disabled'}>Erinnern</button>` : ''}
      ${no.length ? `<button class="btn" data-replace="${t.id}">Ersatz automatisch suchen</button>` : ''}
    </div></div>`).join('') || '<div class="req muted">Nichts offen. Neue Einsätze erscheinen hier, sobald sie in der Planung eingeteilt sind.</div>'}</div>`;
  m.querySelectorAll('[data-send]').forEach((b) => (b.onclick = async () => {
    const r = rows.find((x) => x.t.id === b.dataset.send);
    location.href = mailFor(r.t, r.neu, false);
    const ch = r.neu.map((s) => Object.assign({}, S.asg[s.key], { status: 'angefragt', requested_at: nowISO(), updated_at: nowISO() }));
    try { await store.saveAssignments(ch); ch.forEach((a) => (S.asg[a.slot_key] = a)); setTimeout(renderMaster, 400); } catch (e) { toast(e.message); }
  }));
  m.querySelectorAll('[data-remind]').forEach((b) => (b.onclick = () => { const r = rows.find((x) => x.t.id === b.dataset.remind); location.href = mailFor(r.t, r.wait, true); }));
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
function renderTech() {
  const t = myTech();
  const today = todayISO();
  $('#app').innerHTML = header() + `<main class="mine" id="main"></main>`;
  $('#logout').onclick = async () => { await store.signOut(); S.user = null; renderLogin(); };
  const m = $('#main');
  if (!t) { m.innerHTML = `<div class="card req"><h3>Noch nicht freigeschaltet</h3><p>Dein Login (${esc(S.user.email)}) ist noch keinem Techniker zugeordnet. Bitte gib ${esc(CFG.senderName)} Bescheid.</p></div>`; return; }
  const sl = slotsOfTech(t.id, today).filter((s) => S.asg[s.key].status !== 'geplant');
  // nach Veranstaltung gruppieren
  const groups = []; const idx = {};
  sl.forEach((s) => { const g = s.group || s.key; if (!(g in idx)) { idx[g] = groups.length; groups.push({ id: g, va: s.va, slots: [] }); } groups[idx[g]].slots.push(s); });
  const open = sl.filter((s) => S.asg[s.key].status !== 'zugesagt' && S.asg[s.key].status !== 'abgesagt').length;
  m.innerHTML = `<h2 style="margin:4px 0 2px">Hallo ${esc(t.name.split(' ')[0])}</h2>
  <p class="muted" style="margin-top:0">${open ? `Bitte gib bei ${open} ${open > 1 ? 'Einsätzen' : 'Einsatz'} Bescheid, ob du kannst.` : 'Alles beantwortet – danke!'}</p>
  <div class="card">${groups.map((g) => {
    const multi = g.slots.length > 1;
    return `<div class="job">
      <h3>${esc(g.va || 'Einsatz')}${multi ? ` <span class="group-tag">· ${g.slots.length} Tage, bitte möglichst alle</span>` : ''}</h3>
      ${g.slots[0].day.info ? `<div class="note">${esc(g.slots[0].day.info.slice(0, 220))}</div>` : ''}
      ${g.slots.map((s) => { const a = S.asg[s.key]; return `<div class="line">
        <span class="when">${fmtDate(s.date, true)}<br><span class="note">${esc(s.zeit || 'Zeit folgt')}${s.day.vazeit ? ' · VA ' + esc(s.day.vazeit) : ''}</span></span>
        <span class="pill ${a.status === 'geplant' ? 'angefragt' : a.status}" style="cursor:default">${a.status === 'zugesagt' ? 'zugesagt ✓' : a.status === 'abgesagt' ? 'abgesagt ✗' : 'offen'}</span>
        <input class="comment" data-c="${esc(s.key)}" placeholder="Kommentar (optional)" value="${esc(a.note || '')}">
        <button class="btn ok small" data-ans="zugesagt" data-k="${esc(s.key)}">Kann ich</button>
        <button class="btn no small" data-ans="abgesagt" data-k="${esc(s.key)}">Kann nicht</button>
      </div>`; }).join('')}
      ${multi ? `<div class="bar" style="margin:8px 0 0"><button class="btn ok" data-all="${esc(g.slots.map((s) => s.key).join('|'))}">Alle ${g.slots.length} Tage zusagen</button></div>` : ''}
    </div>`;
  }).join('') || '<div class="job muted">Aktuell keine Einsätze für dich.</div>'}</div>`;
  const answer = async (keys, status) => {
    try {
      for (const k of keys) { const note = (m.querySelector(`[data-c="${CSS.escape(k)}"]`) || {}).value || ''; await store.respond(S.user.email, k, status, note); }
      await reload(); toast(status === 'zugesagt' ? 'Danke für die Zusage!' : 'Absage gespeichert'); renderTech();
    } catch (e) { toast(e.message); }
  };
  m.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => answer([b.dataset.k], b.dataset.ans)));
  m.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => answer(b.dataset.all.split('|'), 'zugesagt')));
}

/* ---------------- Start ---------------- */
async function boot() {
  try {
    if (!S.user) S.user = await store.session();
    if (!S.user || S.recovery) return renderLogin();
    S.admin = await store.isAdmin(S.user.email);
    await reload();
    S.admin ? renderMaster() : renderTech();
  } catch (e) { console.error(e); renderLogin(e.message); }
}
if (!DEMO) store.sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { S.recovery = true; renderLogin(); return; }
  const em = session && session.user ? session.user.email.toLowerCase() : null;
  if (S.user && em !== S.user.email) { S.user = null; location.reload(); } // in anderem Tab ab-/umgemeldet
});
// Anmeldung in einem anderen Tab desselben Browsers → diese Seite neu laden
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('sb-') && e.key.endsWith('-auth-token') && S.user) location.reload(); });
boot();
