/* KOM27 Einsatzplanung – versteckter Planungsbereich (Code 2und40)
   Hier plant das KOM27 seine Veranstaltungen: Räume, Zeiten, Technik, wie viele PAM-Techniker.
   Sichtbar wird der Bereich nur, wenn jemand 2und40 eintippt. */
(function () {
  const RAEUME = ['Saal 1', 'Saal 2', 'Saal 3', 'Saal 4', 'Foyer', 'Seminar 1', 'Seminar 2', 'Seminar 3', 'Konferenzzone'];
  const MODES = [['pam', 'PAM-Techniker', 'wird angefragt'], ['selbst', 'Machen wir selbst', 'ohne PAM'], ['aufbau', 'Nur Aufbau', 'PAM baut auf, wir betreuen']];
  const ST = { entwurf: ['geplant', 'Entwurf'], gesendet: ['angefragt', 'bei PAM angefragt'], uebernommen: ['zugesagt', 'von PAM übernommen'], abgelehnt: ['abgesagt', 'abgelehnt'], abgesagt: ['abgesagt', 'abgesagt'] };
  const KOM = ['Jens', 'Felix', 'Regie'];
  // Wie viele kabellose Mikrofone ein Raum verträgt – die vier Shure Axient zählen extra
  const MIC_MAX = { 'Saal 1': 16, 'Saal 2': 16, 'Saal 3': 8, 'Saal 4': 8 };
  const AXIENT = 'Shure Axient (Funkstrecke)';
  const isFunk = (name) => { const c = (S.cat || []).find((x) => x.name === name); return !!(c && c.funk); };
  const micUsed = (r, room) => (r.items || []).filter((i) => (i.room || '') === room && isFunk(i.name)).reduce((n, i) => n + i.qty, 0);
  const micMax = (room) => MIC_MAX[room];
  const P = { view: 'liste', row: null, grp: null, catEdit: null, rtab: null, vaAuto: true, techAuto: true };

  const GORD = ['Ton', 'Bild', 'Konferenz', 'Aufzeichnung & Stream', 'Bestuhlung', 'Sonstiges'];
  const gk = (g) => { const i = GORD.indexOf(g); return i < 0 ? 90 : i; };
  const cat = () => (S.cat || []).slice().sort((a, b) => gk(a.grp) - gk(b.grp) || (a.grp || '').localeCompare(b.grp || '') || a.sort - b.sort || a.name.localeCompare(b.name));
  const grps = () => [...new Set(cat().map((x) => x.grp))];
  const reqs = () => (S.vreq || []).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.va).localeCompare(String(b.va)));
  const mine = () => !S.admin; // KOM27 plant, der Master schaut mit und übernimmt
  const plus = (t, n) => { const [h, m] = String(t || '').split(':').map(Number); if (isNaN(h)) return ''; const x = (h * 60 + (m || 0) + n + 1440 * 2) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  const nextVa = (day) => { const base = 'VA' + String(day || todayISO()).slice(2).replace(/-/g, ''); const n = reqs().filter((r) => r.day === day).length + 1; return base + '-' + String(n).padStart(2, '0'); };
  const leer = (day) => ({ id: null, day: day || addDays(todayISO(), 7), va: '', title: '', rooms: [], rdet: {}, day_to: null, kom: [], wunsch: '', va_from: '09:00', va_to: '17:00', einlass: '', mode: 'pam', techs: 1, tech_from: '', tech_to: '', items: [], note: '', status: 'entwurf' });
  const rd = (r, room) => { const x = (r.rdet || {})[room]; return typeof x === 'string' ? { mode: x } : (x || {}); };
  const rmode = (r, room) => rd(r, room).mode || 'pam';
  const setRd = (r, room, patch) => { r.rdet = Object.assign({}, r.rdet, { [room]: Object.assign({}, rd(r, room), patch) }); };
  const MODEK = { pam: 'PAM', selbst: 'ohne PAM', aufbau: 'nur Aufbau' };
  // Gesamtstatus: sobald ein Raum PAM braucht, ist es eine PAM-Veranstaltung
  const gesamtMode = (r) => { const m = (r.rooms || []).map((x) => rmode(r, x)); return m.includes('pam') ? 'pam' : m.includes('aufbau') ? 'aufbau' : 'selbst'; };
  const qtyOf = (r, room, name) => { const i = (r.items || []).find((x) => x.name === name && (x.room || '') === room); return i ? i.qty : 0; };

  /* ---------------- Liste ---------------- */
  function listeHtml() {
    const heute = todayISO();
    const l = reqs().filter((r) => r.day >= heute);
    const alt = reqs().filter((r) => r.day < heute).length;
    const zahl = (f) => l.filter(f).length;
    return `<section class="hello">
        <h1>Veranstaltung planen</h1>
        <p class="hk-long">Hier trägt das KOM27 ein, was es braucht – PAM sieht es sofort.</p>
      </section>
      <div class="sumrow">
        <div class="sumbox"><b>${l.length}</b><span>kommende Veranstaltungen</span></div>
        <div class="sumbox ok"><b>${zahl((r) => r.status === 'uebernommen')}</b><span>von PAM übernommen</span></div>
        <div class="sumbox warn"><b>${zahl((r) => r.status === 'gesendet')}</b><span>wartet auf PAM</span></div>
      </div>
      <h2 class="sec">${mine() ? 'Meine Veranstaltungen' : 'Vom KOM27 geplant'}
        <span class="spacer"></span>
        <button class="btn small" data-pcat>Technik-Katalog</button>
        <button class="btn small primary" data-pnew>+ Neue Veranstaltung</button></h2>
      <section class="dpanel"><div class="vq-list">${l.length ? l.map(rowHtml).join('') : '<p class="muted">Noch nichts geplant. Leg die erste Veranstaltung an.</p>'}</div></section>
      ${alt ? `<p class="note">${alt} vergangene ${alt === 1 ? 'Veranstaltung ist' : 'Veranstaltungen sind'} im Archiv.</p>` : ''}`;
  }
  function rowHtml(r) {
    const d = new Date(r.day + 'T12:00:00');
    const bis = r.day_to && r.day_to > r.day ? new Date(r.day_to + 'T12:00:00') : null;
    const st = ST[r.status] || ST.entwurf;
    const gm = gesamtMode(r);
    const tech = gm === 'pam' ? `${r.techs} ${r.techs === 1 ? 'Techniker' : 'Techniker'} gewünscht` : gm === 'aufbau' ? 'nur Aufbau durch PAM' : 'ohne PAM';
    const rl = (r.rooms || []).map((x) => `${x}${rmode(r, x) === 'pam' ? '' : ' (' + MODEK[rmode(r, x)] + ')'}`).join(', ');
    const mehr = (r.rooms || []).length > 1;
    const items = (r.items || []).filter((i) => i.qty > 0).slice(0, 3).map((i) => `${mehr && i.room ? i.room + ': ' : ''}${i.qty}× ${i.name}`).join(', ');
    return `<button class="vq-row" data-pedit="${r.id == null ? '' : r.id}">
      <span class="dbox2"><i>${['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'][d.getDay()]}</i><b>${d.getDate()}</b><i>${['JAN', 'FEB', 'MRZ', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'][d.getMonth()]}</i></span>
      <span class="vq-main"><b>${esc([r.va, r.title].filter(Boolean).join(' · ') || 'Ohne Titel')}${bis ? ` <span class="vq-bis">bis ${bis.getDate()}.${bis.getMonth() + 1}.</span>` : ''}</b>
        <small>${esc([rl, [r.va_from, r.va_to].filter(Boolean).join('–'), tech, items].filter(Boolean).join(' · '))}</small></span>
      <span class="pill ${st[0]}">${st[1]}</span></button>`;
  }

  /* ---------------- Formular ---------------- */
  function formHtml(r) {
    const g = grps();
    const grp = P.grp && g.includes(P.grp) ? P.grp : g[0];
    const rooms = r.rooms || [];
    const rtab = rooms.includes(P.rtab) ? P.rtab : rooms[0];
    const gm = gesamtMode(r);
    const eigene = rtab ? (r.items || []).filter((i) => (i.room || '') === rtab && !cat().some((c) => c.name === i.name)) : [];
    return `<div class="pform">
      <h2 class="sec"><button class="btn small" data-pback>‹ Zurück</button><span class="spacer"></span>${r.id ? 'Veranstaltung ändern' : 'Neue Veranstaltung'}</h2>
      <section class="dpanel">
        <div class="pf2">
          <div class="pfld"><label for="pfDay">Datum</label><input type="date" id="pfDay" value="${esc(r.day)}"></div>
          <div class="pfld"><label for="pfVa">VA-Nummer</label><input id="pfVa" value="${esc(r.va || nextVa(r.day))}"><small class="muted">Wird aus dem Datum gebildet – du kannst sie überschreiben.</small></div>
        </div>
        <div class="pf2">
          <div class="pfld"><label for="pfTitle">Titel / Kunde</label><input id="pfTitle" value="${esc(r.title)}" maxlength="80" placeholder="z. B. Jahreskonferenz Bundesverband"></div>
          <div class="pfld"><label for="pfTo2">Geht bis (nur bei mehrtägig)</label><input type="date" id="pfTo2" value="${esc(r.day_to || '')}" min="${esc(r.day)}"><small class="muted">Leer lassen, wenn die Veranstaltung an einem Tag ist.</small></div>
        </div>
        <div class="pf3">
          <div class="pfld"><label for="pfFrom">Veranstaltung von</label><input type="time" id="pfFrom" value="${esc(r.va_from)}"></div>
          <div class="pfld"><label for="pfTo">bis</label><input type="time" id="pfTo" value="${esc(r.va_to)}"></div>
          <div class="pfld"><label for="pfEin">Einlass</label><input type="time" id="pfEin" value="${esc(r.einlass)}"></div>
        </div>
        <div class="pf2">
          <div class="pfld"><label>Wer vom KOM27 ist im Haus?</label><div class="prooms">${KOM.map((x) => `<button class="room-t${(r.kom || []).includes(x) ? ' on' : ''}" data-pkom="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
          <div class="pfld"><label for="pfWunsch">Wunsch-Techniker (wenn ihr jemanden im Kopf habt)</label><input id="pfWunsch" value="${esc(r.wunsch || '')}" maxlength="60" placeholder="z. B. Kevin"></div>
        </div>
      </section>

      <h2 class="sec">Welche Räume – und wer betreut sie?</h2>
      <section class="dpanel">
        <div class="pfld"><label>Räume antippen</label><div class="prooms">${RAEUME.map((x) => `<button class="room-t${rooms.includes(x) ? ' on' : ''}" data-proom="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
        ${rooms.length ? rooms.map((x) => `<div class="rcard">
            <div class="rhead"><b>${esc(x)}</b>
              <div class="rseg">${MODES.map(([k, t]) => `<button class="${rmode(r, x) === k ? 'on ' + k : ''}" data-prm="${esc(x)}|${k}">${t === 'PAM-Techniker' ? 'PAM-Techniker' : t === 'Machen wir selbst' ? 'Ohne PAM' : 'Nur Aufbau'}</button>`).join('')}</div>
            </div>
            <div class="rsub">
              <label>Raum gebucht</label>
              <input type="time" data-prb="${esc(x)}|from" value="${esc(rd(r, x).buch_from || '')}">
              <span>bis</span>
              <input type="time" data-prb="${esc(x)}|to" value="${esc(rd(r, x).buch_to || '')}">
              <input class="rnote" data-prn="${esc(x)}" value="${esc(rd(r, x).note || '')}" maxlength="120" placeholder="Anmerkung zu ${esc(x)} (z. B. Bestuhlung, Aufbau ab …)">
              ${micMax(x) != null ? `<span class="miccount${micUsed(r, x) >= micMax(x) ? ' voll' : ''}">🎤 ${micUsed(r, x)} von ${micMax(x)} Mikrofonen${qtyOf(r, x, AXIENT) ? ` + ${qtyOf(r, x, AXIENT)}× Axient` : ''}</span>` : ''}
            </div>
          </div>`).join('') : '<p class="muted">Noch kein Raum gewählt.</p>'}
        ${gm !== 'selbst' ? `<div class="pf2" style="margin-top:14px">
          <div class="pfld"><label>Wie viele PAM-Techniker insgesamt?</label><div class="step"><button data-ptech="-1" aria-label="weniger">−</button><b id="pfTechs">${r.techs}</b><button data-ptech="1" aria-label="mehr">+</button></div>
            <small class="muted">${rooms.filter((x) => rmode(r, x) !== 'selbst').length} ${rooms.filter((x) => rmode(r, x) !== 'selbst').length === 1 ? 'Raum braucht' : 'Räume brauchen'} PAM</small></div>
          <div class="pfld"><label for="pfTf">Einsatzzeit der Techniker</label><div class="pf2b"><input type="time" id="pfTf" value="${esc(r.tech_from || plus(r.va_from, -90))}"><input type="time" id="pfTt" value="${esc(r.tech_to || plus(r.va_to, 60))}"></div>
            <small class="muted">Vorschlag: 1,5 Std. vor Beginn bis 1 Std. nach Ende</small></div>
        </div>` : ''}
      </section>

      <h2 class="sec">Welche Technik wird in welchem Raum gebraucht?</h2>
      <section class="dpanel">
        ${!rooms.length ? '<p class="muted">Wähle oben zuerst die Räume aus.</p>' : `
        ${rtab && micMax(rtab) != null ? `<p class="note mic-note">In ${esc(rtab)} gehen bis zu <b>${micMax(rtab)} kabellose Mikrofone</b> (Hand und Headset zusammen), dazu kommen 4× Shure Axient. Mehr ist technisch nicht möglich.</p>` : ''}
        ${rooms.length > 1 ? `<div class="prooms rtabs">${rooms.map((x) => `<button class="room-t${x === rtab ? ' on' : ''}" data-prt="${esc(x)}">${esc(x)} <span class="rt-k">${(r.items || []).filter((i) => (i.room || '') === x && i.qty > 0).length || ''}</span></button>`).join('')}</div>` : ''}
        <div class="prooms pgrp">${g.map((x) => `<button class="room-t${x === grp ? ' on' : ''}" data-pgrp="${esc(x)}">${esc(x)} <span class="rt-k">${cat().filter((c) => c.grp === x && c.active && qtyOf(r, rtab, c.name) > 0).length || ''}</span></button>`).join('')}</div>
        <div class="peq">${cat().filter((c) => c.grp === grp && c.active).map((c) => `<div class="eqrow2${qtyOf(r, rtab, c.name) ? ' on' : ''}">
            <span class="step"><button data-pq="${esc(c.name)}|-1" aria-label="weniger">−</button><b>${qtyOf(r, rtab, c.name)}</b><button data-pq="${esc(c.name)}|1" aria-label="mehr">+</button></span>
            <span class="eq-n">${esc(c.name)}${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span>
          </div>`).join('')}</div>
        ${eigene.length ? `<div class="peq pown"><h4>Eigene Punkte in ${esc(rtab)}</h4>${eigene.map((i) => `<div class="eqrow2 on">
            <span class="step"><button data-pq="${esc(i.name)}|-1" aria-label="weniger">−</button><b>${i.qty}</b><button data-pq="${esc(i.name)}|1" aria-label="mehr">+</button></span>
            <span class="eq-n">${esc(i.name)}<small>eigener Punkt</small></span></div>`).join('')}</div>` : ''}
        <div class="pown-new"><input id="pfOwn" maxlength="60" placeholder="Noch etwas für ${esc(rtab || '')}, das nicht in der Liste steht?"><button class="btn" data-pown>Hinzufügen</button><button class="btn" data-pownc title="Punkt dauerhaft in den Katalog aufnehmen">+ in den Katalog</button></div>`}
        <div class="pfld" style="margin-top:14px"><label for="pfNote">Bemerkungen für PAM</label><textarea id="pfNote" rows="3" maxlength="600">${esc(r.note)}</textarea></div>
      </section>

      <div class="pfoot">
        ${r.id ? `<button class="btn" data-pdel>Löschen</button>` : ''}
        ${r.id && r.status !== 'abgesagt' ? `<button class="btn" data-psave="abgesagt">Veranstaltung absagen</button>` : ''}
        ${r.status === 'abgesagt' ? `<span class="pill abgesagt">abgesagt</span>` : ''}
        <span class="spacer"></span>
        <button class="big ghost" data-psave="entwurf">Als Entwurf speichern</button>
        ${mine() ? `<button class="big primary solid" data-psave="gesendet">${gm === 'selbst' ? 'An PAM senden (ohne Techniker)' : `An PAM senden – ${r.techs} ${r.techs === 1 ? 'Techniker' : 'Techniker'} anfragen`}</button>`
          : `<button class="big primary solid" data-psave="uebernommen">In die Planung übernommen</button>`}
      </div>
    </div>`;
  }

  /* ---------------- Katalog ---------------- */
  function katHtml() {
    const g = grps(); const grp = P.grp && g.includes(P.grp) ? P.grp : g[0];
    const e = P.catEdit;
    return `<h2 class="sec"><button class="btn small" data-pback>‹ Zurück</button><span class="spacer"></span>Technik-Katalog</h2>
      <section class="dpanel">
        <p class="note">Was hier steht, kann beim Planen angetippt werden. Änderungen gelten für neue Veranstaltungen – was schon geplant ist, behält seinen Text.</p>
        <div class="prooms pgrp">${g.map((x) => `<button class="room-t${x === grp ? ' on' : ''}" data-pgrp="${esc(x)}">${esc(x)} <span class="rt-k">${cat().filter((c) => c.grp === x).length}</span></button>`).join('')}</div>
        <div class="vq-list">${cat().filter((c) => c.grp === grp).map((c) => `<div class="kat-row${c.active ? '' : ' off'}">
          <span class="vq-main"><b>${esc(c.name)}</b><small>${esc([c.hint, c.stock != null ? 'Bestand ' + c.stock : '', c.active ? '' : 'ausgeblendet'].filter(Boolean).join(' · ') || '–')}</small></span>
          <button class="btn small" data-pcup="${c.id}" aria-label="nach oben">↑</button>
          <button class="btn small" data-pcedit="${c.id}">Ändern</button></div>`).join('') || '<p class="muted">Diese Gruppe ist leer.</p>'}</div>
        <div class="pfoot"><span class="spacer"></span><button class="btn primary" data-pcedit="neu">+ Neuer Punkt</button></div>
      </section>
      ${e ? `<section class="dpanel kat-form">
        <h3>${e.id ? 'Punkt ändern' : 'Neuer Punkt'}</h3>
        <div class="pf2">
          <div class="pfld"><label for="kcName">Name</label><input id="kcName" value="${esc(e.name || '')}" maxlength="80"></div>
          <div class="pfld"><label for="kcGrp">Gruppe</label><input id="kcGrp" list="kcGrps" value="${esc(e.grp || grp)}" maxlength="40"><datalist id="kcGrps">${g.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        </div>
        <div class="pf2">
          <div class="pfld"><label for="kcHint">Hinweis (steht klein darunter)</label><input id="kcHint" value="${esc(e.hint || '')}" maxlength="120"></div>
          <div class="pfld"><label for="kcStock">Bestand (leer = unbegrenzt)</label><input type="number" id="kcStock" min="0" max="999" value="${e.stock == null ? '' : e.stock}"></div>
        </div>
        <label class="kcchk"><input type="checkbox" id="kcActive" ${e.active === false ? '' : 'checked'}> beim Planen anzeigen</label>
        <div class="pfoot"><span class="spacer"></span><button class="btn" data-pcx>Abbrechen</button><button class="btn primary" data-pcsave>Speichern</button></div>
      </section>` : ''}`;
  }

  /* ---------------- Zusammenbauen und verdrahten ---------------- */
  function render(m) {
    const html = P.view === 'form' ? formHtml(P.row) : P.view === 'kat' ? katHtml() : listeHtml();
    m.innerHTML = `<div class="planwrap">${html}</div>`;
    wire(m);
  }
  function setItem(room, name, d) {
    const max = micMax(room);
    if (d > 0 && max != null && isFunk(name) && micUsed(P.row, room) >= max) { toast(`In ${room} gehen höchstens ${max} kabellose Mikrofone – die Shure Axient kommen extra dazu.`); return; }
    const ax = (S.cat || []).find((x) => x.name === name && x.stock != null);
    if (d > 0 && ax && name === AXIENT && qtyOf(P.row, room, name) >= ax.stock) { toast(`Es gibt nur ${ax.stock}× ${name}.`); return; }
    const it = (P.row.items || []).slice();
    const i = it.findIndex((x) => x.name === name && (x.room || '') === room);
    if (i < 0) { if (d > 0) it.push({ room, name, qty: 1 }); }
    else { it[i] = Object.assign({}, it[i], { qty: Math.max(0, it[i].qty + d) }); if (!it[i].qty && !cat().some((c) => c.name === name)) it.splice(i, 1); }
    P.row.items = it;
  }
  const curRoom = () => { const rooms = P.row.rooms || []; return rooms.includes(P.rtab) ? P.rtab : rooms[0] || ''; };
  function readForm(m) {
    const v = (id) => { const e = m.querySelector('#' + id); return e ? e.value.trim() : ''; };
    Object.assign(P.row, { day: v('pfDay') || P.row.day, va: v('pfVa') || nextVa(v('pfDay') || P.row.day), title: v('pfTitle'), va_from: v('pfFrom'), va_to: v('pfTo'), einlass: v('pfEin'), note: v('pfNote') });
    P.row.mode = gesamtMode(P.row);
    if (m.querySelector('#pfTf')) Object.assign(P.row, { tech_from: v('pfTf'), tech_to: v('pfTt') });
    P.row.day_to = v('pfTo2') || null; P.row.wunsch = v('pfWunsch');
    m.querySelectorAll('[data-prb]').forEach((e) => { const [room, w] = e.dataset.prb.split('|'); setRd(P.row, room, w === 'from' ? { buch_from: e.value } : { buch_to: e.value }); });
    m.querySelectorAll('[data-prn]').forEach((e) => setRd(P.row, e.dataset.prn, { note: e.value.trim() }));
  }
  function wire(m) {
    const back = () => { P.view = 'liste'; P.row = null; P.catEdit = null; render(m); window.scrollTo(0, 0); };
    m.querySelectorAll('[data-pback]').forEach((b) => (b.onclick = back));
    const nw = m.querySelector('[data-pnew]'); if (nw) nw.onclick = () => { P.row = leer(); P.row.va = nextVa(P.row.day); P.vaAuto = true; P.techAuto = true; P.rtab = null; P.view = 'form'; render(m); window.scrollTo(0, 0); };
    const kb = m.querySelector('[data-pcat]'); if (kb) kb.onclick = () => { P.view = 'kat'; render(m); window.scrollTo(0, 0); };
    m.querySelectorAll('[data-pedit]').forEach((b) => (b.onclick = () => { const r = reqs().find((x) => String(x.id) === b.dataset.pedit); if (!r) return; P.row = JSON.parse(JSON.stringify(r)); P.row.rdet = P.row.rdet || {}; P.vaAuto = false; P.techAuto = false; P.rtab = null; P.view = 'form'; render(m); window.scrollTo(0, 0); }));
    m.querySelectorAll('[data-pgrp]').forEach((b) => (b.onclick = () => { if (P.view === 'form') readForm(m); P.grp = b.dataset.pgrp; render(m); }));

    // Formular
    const day = m.querySelector('#pfDay');
    if (day) day.onchange = () => { readForm(m); if (P.vaAuto) P.row.va = nextVa(P.row.day); render(m); };
    const vaf = m.querySelector('#pfVa');
    if (vaf) vaf.oninput = () => { P.vaAuto = false; };
    m.querySelectorAll('[data-proom]').forEach((b) => (b.onclick = () => { readForm(m); const x = b.dataset.proom; const hat = (P.row.rooms || []).includes(x);
      P.row.rooms = hat ? P.row.rooms.filter((y) => y !== x) : (P.row.rooms || []).concat([x]);
      P.row.rdet = Object.assign({}, P.row.rdet); if (hat) { delete P.row.rdet[x]; P.row.items = (P.row.items || []).filter((i) => (i.room || '') !== x); } else setRd(P.row, x, { mode: rmode(P.row, x) });
      P.rtab = hat ? null : x; techVorschlag(); render(m); }));
    const techVorschlag = () => { if (!P.techAuto) return; const n = (P.row.rooms || []).filter((x) => rmode(P.row, x) !== 'selbst').length; P.row.techs = Math.max(1, Math.min(6, n)); };
    m.querySelectorAll('[data-prm]').forEach((b) => (b.onclick = () => { readForm(m); const [room, md] = b.dataset.prm.split('|'); setRd(P.row, room, { mode: md }); techVorschlag(); render(m); }));
    m.querySelectorAll('[data-pkom]').forEach((b) => (b.onclick = () => { readForm(m); const x = b.dataset.pkom; P.row.kom = (P.row.kom || []).includes(x) ? P.row.kom.filter((y) => y !== x) : (P.row.kom || []).concat([x]); render(m); }));
    m.querySelectorAll('[data-prt]').forEach((b) => (b.onclick = () => { readForm(m); P.rtab = b.dataset.prt; render(m); }));
    m.querySelectorAll('[data-ptech]').forEach((b) => (b.onclick = () => { readForm(m); P.techAuto = false; P.row.techs = Math.min(6, Math.max(0, P.row.techs + +b.dataset.ptech)); render(m); }));
    m.querySelectorAll('[data-pq]').forEach((b) => (b.onclick = () => { readForm(m); const [n, d] = b.dataset.pq.split('|'); setItem(curRoom(), n, +d); render(m); }));
    const own = m.querySelector('[data-pown]'); if (own) own.onclick = () => { readForm(m); const i = m.querySelector('#pfOwn'); const n = i.value.trim(); if (!n) return i.focus(); setItem(curRoom(), n, 1); render(m); };
    const ownc = m.querySelector('[data-pownc]'); if (ownc) ownc.onclick = async () => {
      readForm(m); const i = m.querySelector('#pfOwn'); const n = i.value.trim(); if (!n) return i.focus();
      try { await store.saveCat({ name: n, grp: P.grp || grps()[0] || 'Sonstiges', hint: '', sort: 999, active: true }); setItem(curRoom(), n, 1); await reload(); toast(`„${n}" steht jetzt im Katalog`); render(m); }
      catch (e) { toast('Nicht in den Katalog aufgenommen: ' + ((e && e.message) || 'unbekannter Fehler')); }
    };
    m.querySelectorAll('[data-psave]').forEach((b) => (b.onclick = async () => {
      readForm(m); const st = b.dataset.psave;
      if (!P.row.day) return toast('Bitte ein Datum angeben');
      b.disabled = true;
      const row = Object.assign({}, P.row, { status: st, items: (P.row.items || []).filter((x) => x.qty > 0), author: (S.user && S.user.email ? S.user.email.split('@')[0] : '') });
      try {
        await store.saveVr(row); await reload();
        if (st === 'gesendet') {
          const t = row.mode === 'pam' ? `${row.techs} ${row.techs === 1 ? 'Techniker' : 'Techniker'} gewünscht` : row.mode === 'aufbau' ? 'nur Aufbau' : 'ohne PAM';
          const rl = (row.rooms || []).map((x) => `${x} (${MODEK[(row.rdet || {})[x] || 'pam']})`).join(', ');
          notify('admins', [], 'Neue Anfrage vom KOM27', `${fmtDate(row.day)} · ${[row.va, row.title].filter(Boolean).join(' · ')} · ${rl} · ${t}`, 'vq-' + row.day);
          toast('An PAM gesendet – Basti bekommt eine Mitteilung');
        } else toast(st === 'uebernommen' ? 'Als übernommen markiert' : 'Entwurf gespeichert');
        back();
      } catch (e) { toast('Speichern hat nicht geklappt – bitte nochmal'); b.disabled = false; }
    }));
    const del = m.querySelector('[data-pdel]'); if (del) del.onclick = async () => {
      if (!confirm('Diese Veranstaltung wirklich löschen?')) return;
      try { await store.delVr(P.row.id); await reload(); toast('Gelöscht'); back(); } catch (e) { toast('Löschen hat nicht geklappt'); }
    };

    // Katalog
    m.querySelectorAll('[data-pcedit]').forEach((b) => (b.onclick = () => {
      P.catEdit = b.dataset.pcedit === 'neu' ? { grp: P.grp || grps()[0], active: true } : Object.assign({}, cat().find((c) => String(c.id) === b.dataset.pcedit));
      render(m); const f = m.querySelector('.kat-form'); if (f) f.scrollIntoView({ block: 'center' });
    }));
    const cx = m.querySelector('[data-pcx]'); if (cx) cx.onclick = () => { P.catEdit = null; render(m); };
    const cs = m.querySelector('[data-pcsave]'); if (cs) cs.onclick = async () => {
      const g = (id) => { const e = m.querySelector('#' + id); return e ? e.value.trim() : ''; };
      const name = g('kcName'); if (!name) return m.querySelector('#kcName').focus();
      const row = { id: P.catEdit.id, name, grp: g('kcGrp') || 'Sonstiges', hint: g('kcHint'), stock: g('kcStock') === '' ? null : +g('kcStock'), active: m.querySelector('#kcActive').checked, sort: P.catEdit.sort || 999 };
      cs.disabled = true;
      try { await store.saveCat(row); await reload(); P.catEdit = null; P.grp = row.grp; toast(`„${row.name}" ist gespeichert`); render(m); }
      catch (e) { toast('Speichern hat nicht geklappt: ' + ((e && e.message) || 'unbekannter Fehler')); cs.disabled = false; }
    };
    m.querySelectorAll('[data-pcup]').forEach((b) => (b.onclick = async () => {
      const l = cat().filter((c) => c.grp === (P.grp || grps()[0]));
      const i = l.findIndex((c) => String(c.id) === b.dataset.pcup); if (i < 1) return;
      try { await store.saveCat(Object.assign({}, l[i], { sort: l[i - 1].sort - 1 })); await reload(); render(m); } catch (e) { toast('Hat nicht geklappt'); }
    }));
  }

  window.KOM27Plan = { render, reset: () => { P.view = 'liste'; P.row = null; P.catEdit = null; } };
})();
