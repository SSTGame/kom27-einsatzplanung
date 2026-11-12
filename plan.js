/* KOM27 Einsatzplanung – versteckter Planungsbereich (Code 2und40)
   Hier plant das KOM27 seine Veranstaltungen: Räume, Zeiten, Technik, wie viele PAM-Techniker.
   Sichtbar wird der Bereich nur, wenn jemand 2und40 eintippt. */
(function () {
  const RAEUME = ['Saal 1', 'Saal 2', 'Saal 3', 'Saal 4', 'Foyer', 'Seminar 1', 'Seminar 2', 'Seminar 3', 'Konferenzzone'];
  const MODES = [['pam', 'PAM-Techniker', 'wird angefragt'], ['selbst', 'Machen wir selbst', 'ohne PAM'], ['aufbau', 'Nur Aufbau', 'PAM baut auf, wir betreuen']];
  const ST = { entwurf: ['geplant', 'Entwurf'], gesendet: ['angefragt', 'bei PAM angefragt'], uebernommen: ['zugesagt', 'von PAM übernommen'], abgelehnt: ['abgesagt', 'abgelehnt'] };
  const P = { view: 'liste', row: null, grp: null, catEdit: null };

  const GORD = ['Ton', 'Bild', 'Konferenz', 'Aufzeichnung & Stream', 'Bestuhlung', 'Sonstiges'];
  const gk = (g) => { const i = GORD.indexOf(g); return i < 0 ? 90 : i; };
  const cat = () => (S.cat || []).slice().sort((a, b) => gk(a.grp) - gk(b.grp) || (a.grp || '').localeCompare(b.grp || '') || a.sort - b.sort || a.name.localeCompare(b.name));
  const grps = () => [...new Set(cat().map((x) => x.grp))];
  const reqs = () => (S.vreq || []).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.va).localeCompare(String(b.va)));
  const mine = () => !S.admin; // KOM27 plant, der Master schaut mit und übernimmt
  const plus = (t, n) => { const [h, m] = String(t || '').split(':').map(Number); if (isNaN(h)) return ''; const x = (h * 60 + (m || 0) + n + 1440 * 2) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  const nextVa = (day) => { const base = 'VA' + String(day || todayISO()).slice(2).replace(/-/g, ''); const n = reqs().filter((r) => r.day === day).length + 1; return base + '-' + String(n).padStart(2, '0'); };
  const leer = (day) => ({ id: null, day: day || addDays(todayISO(), 7), va: '', title: '', rooms: [], va_from: '09:00', va_to: '17:00', einlass: '', mode: 'pam', techs: 1, tech_from: '', tech_to: '', items: [], note: '', status: 'entwurf' });

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
    const st = ST[r.status] || ST.entwurf;
    const tech = r.mode === 'pam' ? `${r.techs} ${r.techs === 1 ? 'Techniker' : 'Techniker'} gewünscht` : r.mode === 'aufbau' ? 'nur Aufbau durch PAM' : 'ohne PAM';
    const items = (r.items || []).filter((i) => i.qty > 0).slice(0, 3).map((i) => `${i.qty}× ${i.name}`).join(', ');
    return `<button class="vq-row" data-pedit="${r.id == null ? '' : r.id}">
      <span class="dbox2"><i>${['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'][d.getDay()]}</i><b>${d.getDate()}</b><i>${['JAN', 'FEB', 'MRZ', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'][d.getMonth()]}</i></span>
      <span class="vq-main"><b>${esc([r.va, r.title].filter(Boolean).join(' · ') || 'Ohne Titel')}</b>
        <small>${esc([(r.rooms || []).join(', '), [r.va_from, r.va_to].filter(Boolean).join('–'), tech, items].filter(Boolean).join(' · '))}</small></span>
      <span class="pill ${st[0]}">${st[1]}</span></button>`;
  }

  /* ---------------- Formular ---------------- */
  function formHtml(r) {
    const g = grps();
    const grp = P.grp && g.includes(P.grp) ? P.grp : g[0];
    const qty = (name) => { const i = (r.items || []).find((x) => x.name === name); return i ? i.qty : 0; };
    const eigene = (r.items || []).filter((i) => !cat().some((c) => c.name === i.name));
    return `<div class="pform">
      <h2 class="sec"><button class="btn small" data-pback>‹ Zurück</button><span class="spacer"></span>${r.id ? 'Veranstaltung ändern' : 'Neue Veranstaltung'}</h2>
      <section class="dpanel">
        <div class="pf2">
          <div class="pfld"><label for="pfDay">Datum</label><input type="date" id="pfDay" value="${esc(r.day)}"></div>
          <div class="pfld"><label for="pfVa">VA-Nummer</label><input id="pfVa" value="${esc(r.va)}" placeholder="${esc(nextVa(r.day))}"></div>
        </div>
        <div class="pfld"><label for="pfTitle">Titel / Kunde</label><input id="pfTitle" value="${esc(r.title)}" maxlength="80" placeholder="z. B. Jahreskonferenz Bundesverband"></div>
        <div class="pfld"><label>Räume</label><div class="prooms">${RAEUME.map((x) => `<button class="room-t${(r.rooms || []).includes(x) ? ' on' : ''}" data-proom="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
        <div class="pf3">
          <div class="pfld"><label for="pfFrom">Veranstaltung von</label><input type="time" id="pfFrom" value="${esc(r.va_from)}"></div>
          <div class="pfld"><label for="pfTo">bis</label><input type="time" id="pfTo" value="${esc(r.va_to)}"></div>
          <div class="pfld"><label for="pfEin">Einlass</label><input type="time" id="pfEin" value="${esc(r.einlass)}"></div>
        </div>
        <div class="pfld"><label>Wer betreut die Technik?</label>
          <div class="segbig">${MODES.map(([k, t, s]) => `<button class="${r.mode === k ? 'on' : ''}" data-pmode="${k}">${t}<small>${s}</small></button>`).join('')}</div></div>
        ${r.mode === 'pam' || r.mode === 'aufbau' ? `<div class="pf2">
          <div class="pfld"><label>Wie viele Techniker?</label><div class="step"><button data-ptech="-1" aria-label="weniger">−</button><b id="pfTechs">${r.techs}</b><button data-ptech="1" aria-label="mehr">+</button></div></div>
          <div class="pfld"><label for="pfTf">Einsatzzeit der Techniker</label><div class="pf2b"><input type="time" id="pfTf" value="${esc(r.tech_from || plus(r.va_from, -90))}"><input type="time" id="pfTt" value="${esc(r.tech_to || plus(r.va_to, 60))}"></div>
            <small class="muted">Vorschlag: 1,5 Std. vor Beginn bis 1 Std. nach Ende</small></div>
        </div>` : ''}
      </section>

      <h2 class="sec">Welche Technik wird gebraucht?</h2>
      <section class="dpanel">
        <div class="prooms pgrp">${g.map((x) => `<button class="room-t${x === grp ? ' on' : ''}" data-pgrp="${esc(x)}">${esc(x)} <span class="rt-k">${cat().filter((c) => c.grp === x && c.active).filter((c) => qty(c.name) > 0).length || ''}</span></button>`).join('')}</div>
        <div class="peq">${cat().filter((c) => c.grp === grp && c.active).map((c) => `<div class="eqrow2${qty(c.name) ? ' on' : ''}">
            <span class="step"><button data-pq="${esc(c.name)}|-1" aria-label="weniger">−</button><b>${qty(c.name)}</b><button data-pq="${esc(c.name)}|1" aria-label="mehr">+</button></span>
            <span class="eq-n">${esc(c.name)}${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span>
          </div>`).join('')}</div>
        ${eigene.length ? `<div class="peq pown"><h4>Eigene Punkte</h4>${eigene.map((i) => `<div class="eqrow2 on">
            <span class="step"><button data-pq="${esc(i.name)}|-1" aria-label="weniger">−</button><b>${i.qty}</b><button data-pq="${esc(i.name)}|1" aria-label="mehr">+</button></span>
            <span class="eq-n">${esc(i.name)}<small>eigener Punkt</small></span></div>`).join('')}</div>` : ''}
        <div class="pown-new"><input id="pfOwn" maxlength="60" placeholder="Noch etwas, das nicht in der Liste steht?"><button class="btn" data-pown>Hinzufügen</button><button class="btn" data-pownc title="Punkt dauerhaft in den Katalog aufnehmen">+ in den Katalog</button></div>
        <div class="pfld" style="margin-top:14px"><label for="pfNote">Bemerkungen für PAM</label><textarea id="pfNote" rows="3" maxlength="600">${esc(r.note)}</textarea></div>
      </section>

      <div class="pfoot">
        ${r.id ? `<button class="btn" data-pdel>Löschen</button>` : ''}
        <span class="spacer"></span>
        <button class="big ghost" data-psave="entwurf">Als Entwurf speichern</button>
        ${mine() ? `<button class="big primary solid" data-psave="gesendet">${r.mode === 'selbst' ? 'An PAM senden (ohne Techniker)' : `An PAM senden – ${r.techs} ${r.techs === 1 ? 'Techniker' : 'Techniker'} anfragen`}</button>`
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
  function setItem(name, d) {
    const it = (P.row.items || []).slice();
    const i = it.findIndex((x) => x.name === name);
    if (i < 0) { if (d > 0) it.push({ name, qty: 1 }); }
    else { it[i] = Object.assign({}, it[i], { qty: Math.max(0, it[i].qty + d) }); if (!it[i].qty && !cat().some((c) => c.name === name)) it.splice(i, 1); }
    P.row.items = it;
  }
  function readForm(m) {
    const v = (id) => { const e = m.querySelector('#' + id); return e ? e.value.trim() : ''; };
    Object.assign(P.row, { day: v('pfDay') || P.row.day, va: v('pfVa') || nextVa(v('pfDay') || P.row.day), title: v('pfTitle'), va_from: v('pfFrom'), va_to: v('pfTo'), einlass: v('pfEin'), note: v('pfNote') });
    if (m.querySelector('#pfTf')) Object.assign(P.row, { tech_from: v('pfTf'), tech_to: v('pfTt') });
  }
  function wire(m) {
    const back = () => { P.view = 'liste'; P.row = null; P.catEdit = null; render(m); window.scrollTo(0, 0); };
    m.querySelectorAll('[data-pback]').forEach((b) => (b.onclick = back));
    const nw = m.querySelector('[data-pnew]'); if (nw) nw.onclick = () => { P.row = leer(); P.view = 'form'; render(m); window.scrollTo(0, 0); };
    const kb = m.querySelector('[data-pcat]'); if (kb) kb.onclick = () => { P.view = 'kat'; render(m); window.scrollTo(0, 0); };
    m.querySelectorAll('[data-pedit]').forEach((b) => (b.onclick = () => { const r = reqs().find((x) => String(x.id) === b.dataset.pedit); if (!r) return; P.row = JSON.parse(JSON.stringify(r)); P.view = 'form'; render(m); window.scrollTo(0, 0); }));
    m.querySelectorAll('[data-pgrp]').forEach((b) => (b.onclick = () => { if (P.view === 'form') readForm(m); P.grp = b.dataset.pgrp; render(m); }));

    // Formular
    m.querySelectorAll('[data-proom]').forEach((b) => (b.onclick = () => { readForm(m); const x = b.dataset.proom; P.row.rooms = (P.row.rooms || []).includes(x) ? P.row.rooms.filter((y) => y !== x) : (P.row.rooms || []).concat([x]); render(m); }));
    m.querySelectorAll('[data-pmode]').forEach((b) => (b.onclick = () => { readForm(m); P.row.mode = b.dataset.pmode; render(m); }));
    m.querySelectorAll('[data-ptech]').forEach((b) => (b.onclick = () => { readForm(m); P.row.techs = Math.min(6, Math.max(0, P.row.techs + +b.dataset.ptech)); render(m); }));
    m.querySelectorAll('[data-pq]').forEach((b) => (b.onclick = () => { readForm(m); const [n, d] = b.dataset.pq.split('|'); setItem(n, +d); render(m); }));
    const own = m.querySelector('[data-pown]'); if (own) own.onclick = () => { readForm(m); const i = m.querySelector('#pfOwn'); const n = i.value.trim(); if (!n) return i.focus(); setItem(n, 1); render(m); };
    const ownc = m.querySelector('[data-pownc]'); if (ownc) ownc.onclick = async () => {
      readForm(m); const i = m.querySelector('#pfOwn'); const n = i.value.trim(); if (!n) return i.focus();
      try { await store.saveCat({ name: n, grp: P.grp || grps()[0] || 'Sonstiges', hint: '', sort: 999, active: true }); setItem(n, 1); await reload(); toast(`„${n}" steht jetzt im Katalog`); render(m); }
      catch (e) { toast('Konnte nicht in den Katalog aufgenommen werden'); }
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
          notify('admins', [], 'Neue Anfrage vom KOM27', `${fmtDate(row.day)} · ${[row.va, row.title].filter(Boolean).join(' · ')} · ${(row.rooms || []).join(', ')} · ${t}`, 'vq-' + row.day);
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
      try { await store.saveCat(row); await reload(); P.catEdit = null; toast('Gespeichert'); render(m); }
      catch (e) { toast('Speichern hat nicht geklappt'); cs.disabled = false; }
    };
    m.querySelectorAll('[data-pcup]').forEach((b) => (b.onclick = async () => {
      const l = cat().filter((c) => c.grp === (P.grp || grps()[0]));
      const i = l.findIndex((c) => String(c.id) === b.dataset.pcup); if (i < 1) return;
      try { await store.saveCat(Object.assign({}, l[i], { sort: l[i - 1].sort - 1 })); await reload(); render(m); } catch (e) { toast('Hat nicht geklappt'); }
    }));
  }

  window.KOM27Plan = { render, reset: () => { P.view = 'liste'; P.row = null; P.catEdit = null; } };
})();
