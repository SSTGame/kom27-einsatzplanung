/* KOM27 Einsatzplanung – Spielkram: Konfetti, Feuerwerk und „Saal versenken“ (Code: versenken) */
(function () {
  const ruhig = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Konfetti und Feuerwerk ---------------- */
  function leinwand() {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c); return c;
  }
  const FARBEN = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2', '#ff2d55'];
  function konfetti() {
    if (ruhig() || document.querySelector('canvas[data-fun]')) return;
    const c = leinwand(); c.dataset.fun = '1'; const x = c.getContext('2d');
    const p = Array.from({ length: 130 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4, vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 3.5, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, f: FARBEN[(Math.random() * FARBEN.length) | 0] }));
    const t0 = performance.now();
    (function bild(t) {
      x.clearRect(0, 0, c.width, c.height);
      p.forEach((k) => { k.x += k.vx; k.y += k.vy; k.r += k.vr; x.save(); x.translate(k.x, k.y); x.rotate(k.r); x.fillStyle = k.f; x.globalAlpha = Math.min(1, Math.max(0, (2600 - (t - t0)) / 700)); x.fillRect(-k.s / 2, -k.s / 4, k.s, k.s / 2); x.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(bild); else c.remove();
    })(t0);
  }
  function feuerwerk() {
    if (ruhig() || document.querySelector('canvas[data-fun]')) return;
    const c = leinwand(); c.dataset.fun = '1'; const x = c.getContext('2d');
    let funken = []; const t0 = performance.now(); let naechste = 0; let n = 0;
    const knall = () => { const cx = c.width * (0.15 + Math.random() * 0.7), cy = c.height * (0.15 + Math.random() * 0.45), f = FARBEN[(Math.random() * FARBEN.length) | 0];
      for (let i = 0; i < 70; i++) { const w = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 5; funken.push({ x: cx, y: cy, vx: Math.cos(w) * v, vy: Math.sin(w) * v, l: 1, f }); } };
    (function bild(t) {
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'lighter';
      if (t - t0 > naechste && n < 7) { knall(); n++; naechste += 380; }
      if (t - t0 > 3300 && !c.style.opacity) { c.style.transition = 'opacity 1.4s ease'; c.style.opacity = '0'; }
      funken.forEach((k) => { k.x += k.vx; k.y += k.vy; k.vy += 0.06; k.vx *= 0.985; k.vy *= 0.985; k.l -= 0.014; x.globalAlpha = Math.max(0, k.l); x.fillStyle = k.f; x.beginPath(); x.arc(k.x, k.y, 2.4, 0, 6.3); x.fill(); });
      funken = funken.filter((k) => k.l > 0);
      if (t - t0 < 4800) requestAnimationFrame(bild); else c.remove();
    })(t0);
  }
  // Bei jedem Öffnen kurz Feuerwerk, wenn Jens heute nicht im Haus eingetragen ist
  let fwGezeigt = '';
  function jensCheck() {
    try {
      if (!S.user || !S.plan) return;
      const heute = todayISO();
      const sig = (S.user.email || '') + '|' + heute;
      if (fwGezeigt === sig) return; // einmal pro Besuch, nicht bei jeder Aktualisierung
      const d = (S.plan.days || []).find((y) => y.date === heute);
      if (!d || d.free || d.cancelled || !(d.kom || []).length) return; // nur wenn klar ist, wer vom KOM27 da ist
      if ((d.kom || []).some((n) => /jens/i.test(n))) return;
      fwGezeigt = sig; setTimeout(feuerwerk, 900);
    } catch (e) { /* Spielkram darf nie stören */ }
  }

  /* ---------------- Saal versenken ---------------- */
  const N = 8;
  const FLOTTE = [['LED-Wand', 4], ['Rednerpult', 3], ['Mediacart', 3], ['Funkstrecke', 2], ['Presenter', 2]];
  const SEITE = { pam: 'PAM-Technik', kom: 'KOM27' };
  const G = { offen: false, solo: false, state: null, sel: null, quer: true };
  const ich = () => (G.solo ? 'pam' : S.viewer ? 'kom' : 'pam'); // KOM27 gegen alle von PAM (Master und Techniker)
  const gegner = (s) => (s === 'pam' ? 'kom' : 'pam');
  function wuerfeln() {
    const belegt = new Set(); const schiffe = [];
    FLOTTE.forEach(([name, len]) => { for (let v = 0; v < 200; v++) {
      const quer = Math.random() < 0.5, r = (Math.random() * (quer ? N : N - len + 1)) | 0, c = (Math.random() * (quer ? N - len + 1 : N)) | 0;
      const cells = Array.from({ length: len }, (_, i) => (quer ? r * N + c + i : (r + i) * N + c));
      if (cells.some((z) => belegt.has(z))) continue;
      cells.forEach((z) => belegt.add(z)); schiffe.push({ name, cells }); break; } });
    return schiffe;
  }
  const leer = () => ({ status: 'setup', turn: 'kom', winner: null, msg: '', von: '', pam: { ships: null, shots: [] }, kom: { ships: null, shots: [] } });
  const versenkt = (schiff, schuesse) => schiff.cells.every((z) => schuesse.includes(z));
  const alleWeg = (seite, schuesse) => (seite.ships || []).every((s) => versenkt(s, schuesse));
  async function speichern() {
    if (G.solo) { ls.set('kom27-sv', G.state); return; }
    try { await store.gameSave(G.state); } catch (e) { toast('Zug konnte nicht gespeichert werden'); }
  }
  function schuss(von, z) {
    const st = G.state; const ziel = st[gegner(von)];
    if (st.status !== 'play' || st.turn !== von || st[von].shots.includes(z)) return false;
    st[von].shots.push(z);
    const tr = (ziel.ships || []).find((s) => s.cells.includes(z));
    if (tr) { const weg = versenkt(tr, st[von].shots);
      st.msg = `${SEITE[von]}: Treffer${weg ? ' – ' + tr.name + ' versenkt!' : '!'}`;
      if (alleWeg(ziel, st[von].shots)) { st.status = 'done'; st.winner = von; st.msg = `${SEITE[von]} hat das ganze Haus versenkt 🎉`; }
    } else { st.msg = `${SEITE[von]}: daneben.`; st.turn = gegner(von); }
    return true;
  }
  // Computer: erst rund um Treffer suchen, sonst würfeln
  function computerZug() {
    const st = G.state; if (!G.solo || st.status !== 'play' || st.turn !== 'kom') return;
    const sch = st.kom.shots; const treffer = sch.filter((z) => st.pam.ships.some((s) => s.cells.includes(z) && !versenkt(s, sch)));
    let kand = [];
    treffer.forEach((z) => { const r = (z / N) | 0, c = z % N; [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([a, b]) => { if (a >= 0 && a < N && b >= 0 && b < N && !sch.includes(a * N + b)) kand.push(a * N + b); }); });
    if (!kand.length) kand = Array.from({ length: N * N }, (_, i) => i).filter((z) => !sch.includes(z));
    schuss('kom', kand[(Math.random() * kand.length) | 0]);
    speichern(); zeichnen();
    if (G.state.status === 'play' && G.state.turn === 'kom') setTimeout(computerZug, 700);
  }
  const PLAN = `<svg class="sv-plan" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".7">
    <rect x="2" y="2" width="31" height="17" rx="1.5"/><rect x="34.5" y="2" width="31" height="17" rx="1.5"/><rect x="67" y="2" width="31" height="17" rx="1.5"/>
    <rect x="2" y="23" width="34" height="35" rx="1.5"/><rect x="2" y="61" width="34" height="37" rx="1.5"/>
    <rect x="40" y="23" width="58" height="23" rx="1.5"/><rect x="40" y="49" width="58" height="17" rx="1.5"/><rect x="40" y="69" width="58" height="29" rx="1.5"/></g>
    <g fill="currentColor" font-size="4.6" font-weight="700" text-anchor="middle"><text x="17.5" y="12">Seminar 1</text><text x="50" y="12">Seminar 2</text><text x="82.5" y="12">Seminar 3</text>
    <text x="19" y="42">Saal 4</text><text x="19" y="81">Saal 3</text><text x="69" y="36">Saal 1</text><text x="69" y="59">Foyer</text><text x="69" y="85">Saal 2</text></g></svg>`;
  // kleines Schiff als Zeichnung: Rumpf mit Bug, Aufbau, Schornstein, Bullaugen
  function schiffSvg(len, quer) {
    const L = len * 100;
    const b = Math.max(26, L * 0.18);
    const form = `<path class="rumpf" d="M8 22 H${L - 40} L${L - 4} 50 L${L - 40} 78 H8 Q0 50 8 22 Z"/>
      <path class="deck" d="M18 32 H${L - 46} L${L - 24} 50 L${L - 46} 68 H18 Z"/>
      <rect class="bruecke" x="${L * 0.26}" y="34" width="${b}" height="32" rx="6"/>
      <rect class="rohr" x="${L * 0.26 + b + 8}" y="30" width="13" height="26" rx="4"/>
      ${Array.from({ length: len }, (_, i) => `<circle class="auge" cx="${i * 100 + 46}" cy="70" r="3.4"/>`).join('')}`;
    return quer ? `<svg viewBox="0 0 ${L} 100" preserveAspectRatio="none">${form}</svg>` : `<svg viewBox="0 0 100 ${L}" preserveAspectRatio="none"><g transform="translate(100,0) rotate(90)">${form}</g></svg>`;
  }
  const istQuer = (sch) => sch.cells.length < 2 || sch.cells[1] - sch.cells[0] === 1;
  function brett(seite, eigen, setup) {
    const st = G.state; const s = st[seite]; const beschuss = st[gegner(seite)].shots; // Schüsse, die auf dieses Brett gingen
    let h = `<div class="sv-brett${setup ? ' setup' : ''}">${PLAN}`;
    (s.ships || []).forEach((sch, i) => { const weg = versenkt(sch, beschuss); if (!eigen && !weg) return;
      const z = sch.cells[0], q = istQuer(sch), len = sch.cells.length;
      h += `<div class="sv-schiff${weg ? ' weg' : ''}${setup && G.sel === i ? ' sel' : ''}" style="grid-row:${((z / N) | 0) + 1} / span ${q ? 1 : len};grid-column:${(z % N) + 1} / span ${q ? len : 1};animation-delay:${-(i * 0.7)}s" title="${esc(sch.name)}">${schiffSvg(len, q)}</div>`; });
    for (let z = 0; z < N * N; z++) {
      const schiff = (s.ships || []).find((x) => x.cells.includes(z)); const getroffen = beschuss.includes(z);
      const kl = getroffen ? (schiff ? (versenkt(schiff, beschuss) ? 'weg' : 'hit') : 'miss') : '';
      const kann = !eigen && st.status === 'play' && st.turn === ich() && !getroffen;
      const attr = setup ? `data-svp="${z}"` : kann ? `data-svz="${z}"` : 'disabled';
      h += `<button class="sv-z ${kl}" style="grid-row:${((z / N) | 0) + 1};grid-column:${(z % N) + 1}" ${attr} aria-label="${String.fromCharCode(65 + (z % N))}${((z / N) | 0) + 1}">${getroffen ? (schiff ? '✹' : '•') : ''}</button>`;
    }
    return h + '</div>';
  }
  // Schiff ab Feld z in die gewählte Richtung – null, wenn es nicht passt
  function platz(len, z, quer, andere) {
    const r = (z / N) | 0, c = z % N; if (quer ? c + len > N : r + len > N) return null;
    const cells = Array.from({ length: len }, (_, i) => (quer ? z + i : z + i * N));
    return cells.some((x) => andere.some((sch) => sch.cells.includes(x))) ? null : cells;
  }
  function zeichnen() {
    let o = document.getElementById('svSpiel'); if (!G.offen) { if (o) o.remove(); return; }
    if (!o) { o = document.createElement('div'); o.id = 'svSpiel'; document.body.appendChild(o); }
    const st = G.state; const me = ich(); const er = gegner(me);
    const darfDuell = !!S.user; // Master, Techniker und KOM27 dürfen gegeneinander
    let inhalt;
    if (!st || !st.status) {
      inhalt = `<p class="sv-txt">Schiffe versenken im KOM27: Wer trifft zuerst LED-Wand, Rednerpult, Mediacart, Funkstrecke und Presenter des anderen?</p>
        <div class="sv-btns">${darfDuell ? `<button class="big primary solid" data-svneu="duell">${SEITE[er]} herausfordern</button>` : ''}<button class="big ghost" data-svneu="solo">Gegen den Computer</button></div>`;
    } else if (st.status === 'setup') {
      const bereit = !!st[me].ready;
      if (!st[me].ships) st[me].ships = [];
      const da = (n) => st[me].ships.some((x) => x.name === n);
      const voll = st[me].ships.length === FLOTTE.length;
      if (G.sel == null || G.sel >= 0 && da(FLOTTE[G.sel] && FLOTTE[G.sel][0])) { const i = FLOTTE.findIndex(([n]) => !da(n)); G.sel = i; }
      inhalt = `<p class="sv-txt">${bereit ? `Deine Flotte liegt bereit. Warte auf ${SEITE[er]} …` : voll ? 'Alles aufgestellt. Tippe ein Schiff an, um es noch einmal zu versetzen – oder los.' : 'Stell deine Flotte auf: Schiff wählen, dann ins Haus tippen. Mit „Drehen“ liegt es quer oder längs.'}</p>
        ${bereit ? '' : `<div class="sv-flotte">${FLOTTE.map(([n, len], i) => `<button class="sv-wahl${G.sel === i ? ' on' : ''}${da(n) ? ' da' : ''}" data-svs="${i}"><span class="sv-mini" style="width:${len * 22}px">${schiffSvg(len, true)}</span>${esc(n)}</button>`).join('')}
          <button class="btn" data-svdreh>↻ Drehen: ${G.quer === false ? 'längs' : 'quer'}</button></div>`}
        <div class="sv-felder eins"><div><h4>Dein Haus</h4>${brett(me, true, !bereit)}</div></div>
        <div class="sv-btns">${bereit ? '' : `<button class="big ghost" data-svwurf>Zufällig aufstellen</button><button class="big primary solid" data-svbereit ${voll ? '' : 'disabled'}>Bereit</button>`}<button class="btn" data-svende>Spiel abbrechen</button></div>`;
    } else {
      const dran = st.turn === me;
      const rest = (s) => (st[s].ships || []).filter((x) => !versenkt(x, st[gegner(s)].shots)).length;
      inhalt = `<p class="sv-status ${st.status === 'done' ? 'ende' : dran ? 'dran' : ''}">${st.status === 'done' ? (st.winner === me ? '🏆 Gewonnen! ' : 'Verloren. ') + esc(st.msg) : (dran ? 'Du bist dran – tippe ins gegnerische Haus. ' : `${SEITE[er]} ist dran … `) + esc(st.msg || '')}</p>
        <div class="sv-felder">
          <div><h4>Haus von ${SEITE[er]} <small>noch ${rest(er)} von ${FLOTTE.length}</small></h4>${brett(er, st.status === 'done')}</div>
          <div><h4>Dein Haus <small>noch ${rest(me)} von ${FLOTTE.length}</small></h4>${brett(me, true)}</div>
        </div>
        <div class="sv-btns"><button class="btn" data-svende>${st.status === 'done' ? 'Neues Spiel' : 'Spiel abbrechen'}</button></div>`;
    }
    o.innerHTML = `<div class="sv-karte" role="dialog" aria-label="Saal versenken"><div class="sv-kopf"><b>🚢 Saal versenken${G.solo ? ' · gegen den Computer' : ''}</b><button class="btn small" data-svzu>Schließen</button></div>${inhalt}</div>`;
    o.querySelector('[data-svzu]').onclick = () => { G.offen = false; zeichnen(); };
    o.querySelectorAll('[data-svneu]').forEach((b) => (b.onclick = async () => {
      G.solo = b.dataset.svneu === 'solo'; G.state = leer();
      if (G.solo) { G.state.kom.ships = wuerfeln(); G.state.kom.ready = true; G.state.turn = 'pam'; }
      else {
        G.state.von = myShortName ? myShortName() || SEITE[me] : SEITE[me];
        if (me === 'kom') notify('kom', (S.techs || []).filter((t) => t.active !== false).map((t) => t.id), '🚢 Saal versenken', `${G.state.von} vom KOM27 fordert euch heraus – in der App „versenken“ tippen.`, 'sv');
        else notify('admins', [], '🚢 Saal versenken', `${G.state.von} fordert das KOM27 heraus.`, 'sv');
      }
      await speichern(); zeichnen();
    }));
    const wf = o.querySelector('[data-svwurf]'); if (wf) wf.onclick = () => { G.state[me].ships = wuerfeln(); G.sel = -1; zeichnen(); };
    o.querySelectorAll('[data-svs]').forEach((b) => (b.onclick = () => { const i = +b.dataset.svs; G.state[me].ships = G.state[me].ships.filter((x) => x.name !== FLOTTE[i][0]); G.sel = i; zeichnen(); }));
    const dr = o.querySelector('[data-svdreh]'); if (dr) dr.onclick = () => { G.quer = G.quer === false; zeichnen(); };
    o.querySelectorAll('[data-svp]').forEach((b) => (b.onclick = () => {
      const z = +b.dataset.svp; const ships = G.state[me].ships;
      const hier = ships.find((x) => x.cells.includes(z));
      if (hier) { G.quer = istQuer(hier); G.sel = FLOTTE.findIndex(([n]) => n === hier.name); G.state[me].ships = ships.filter((x) => x !== hier); return zeichnen(); } // Schiff wieder aufnehmen
      if (G.sel == null || G.sel < 0) return;
      const [name, len] = FLOTTE[G.sel]; const cells = platz(len, z, G.quer !== false, ships);
      if (!cells) return toast('Da passt das Schiff nicht hin');
      ships.push({ name, cells }); G.sel = null; zeichnen();
    }));
    const br = o.querySelector('[data-svbereit]'); if (br) br.onclick = async () => {
      if (G.state[me].ships.length !== FLOTTE.length) return;
      if (!G.solo) { try { const neu = await store.gameLoad(); if (neu && neu.status === 'setup') { neu[me] = G.state[me]; G.state = neu; } } catch (e) { /* dann eben mit dem eigenen Stand */ } }
      G.state[me].ready = true;
      if (G.state.pam.ready && G.state.kom.ready) { G.state.status = 'play'; G.state.msg = 'Los geht’s!'; }
      await speichern(); zeichnen();
    };
    const en = o.querySelector('[data-svende]'); if (en) en.onclick = async () => { if (G.state.status === 'play' && !confirm('Laufendes Spiel wirklich abbrechen?')) return; G.state = {}; await speichern(); G.state = null; zeichnen(); };
    o.querySelectorAll('[data-svz]').forEach((b) => (b.onclick = async () => {
      if (!G.solo) { try { const neu = await store.gameLoad(); if (neu && neu.status) G.state = neu; } catch (e) { return; } }
      if (!schuss(me, +b.dataset.svz)) return zeichnen();
      await speichern(); zeichnen();
      if (G.state.status === 'done') { if (G.state.winner === me) konfetti();
        if (!G.solo && me === 'kom') notify('kom', (S.techs || []).filter((t) => t.active !== false).map((t) => t.id), '🚢 Saal versenken', G.state.msg, 'sv');
        else if (!G.solo) notify('admins', [], '🚢 Saal versenken', G.state.msg, 'sv'); }
      else if (G.solo) setTimeout(computerZug, 700);
    }));
  }
  async function oeffnen() {
    if (!S.user) return;
    G.offen = true;
    const lokal = ls.get('kom27-sv');
    let duell = null;
    if (S.admin || S.viewer) { try { duell = await store.gameLoad(); } catch (e) { duell = null; } }
    if (duell && duell.status) { G.solo = false; G.state = duell; }
    else if (lokal && lokal.status && lokal.status !== 'done') { G.solo = true; G.state = lokal; }
    else { G.solo = false; G.state = null; }
    zeichnen();
    if (G.solo) computerZug();
  }
  // Leiste, damit die Gegenseite die Herausforderung überhaupt mitbekommt
  let weg = '';
  function banner() {
    const alt = document.getElementById('svTipp'); const st = S.game;
    const me = ich();
    let txt = '', dringend = false;
    if (st && st.status === 'setup' && !G.offen) {
      if (!(st[me] || {}).ready) { txt = `${esc(st.von || SEITE[gegner(me)])} fordert dich heraus – Saal versenken`; dringend = true; }
      else txt = `Warten auf ${SEITE[gegner(me)]} …`;
    } else if (st && st.status === 'play' && !G.offen) {
      txt = st.turn === me ? 'Du bist dran – Saal versenken' : `${SEITE[gegner(me)]} ist am Zug`;
      dringend = st.turn === me;
    }
    const sig = JSON.stringify([txt, dringend]);
    if (!txt || weg === sig) { if (alt) alt.remove(); return; }
    const el = alt || document.createElement('div');
    el.id = 'svTipp'; el.className = 'sv-tipp' + (dringend ? ' dringend' : '');
    el.innerHTML = `<button class="sv-tipp-go">🚢 ${txt}</button><button class="sv-tipp-x" aria-label="Ausblenden">✕</button>`;
    if (!alt) document.body.appendChild(el);
    el.querySelector('.sv-tipp-go').onclick = () => { el.remove(); oeffnen(); };
    el.querySelector('.sv-tipp-x').onclick = () => { weg = sig; el.remove(); };
  }
  // Live: Zug des anderen übernehmen
  function sync() {
    jensCheck();
    banner();
    if (!G.offen || G.solo) return;
    const neu = S.game;
    if (!neu) return;
    const war = G.state && G.state.status === 'play' ? G.state.turn : null;
    if (JSON.stringify(neu) === JSON.stringify(G.state || {})) return;
    const meinsOffen = G.state && G.state.status === 'setup' && G.state[ich()] && !G.state[ich()].ready && neu.status === 'setup';
    if (meinsOffen) { neu[ich()] = G.state[ich()]; if (document.querySelector('#svSpiel [data-svp]') && neu[gegner(ich())].ready === (G.state[gegner(ich())] || {}).ready) { G.state = neu; return; } }
    G.state = neu.status ? neu : null; zeichnen(); banner();
    if (G.state && G.state.status === 'done' && G.state.winner === ich() && war) konfetti();
  }

  // Codewort
  (function () {
    const CODE = 'versenken'; let buf = '';
    document.addEventListener('keydown', (e) => { if (e.key.length !== 1 || e.metaKey || e.ctrlKey) return; buf = (buf + e.key.toLowerCase()).slice(-12); if (buf.endsWith(CODE)) { buf = ''; oeffnen(); } });
    document.addEventListener('input', (e) => { const t = e.target; if (!t || typeof t.value !== 'string' || !t.value) return; if (t.value.toLowerCase().trim().endsWith(CODE)) { t.value = t.value.slice(0, -CODE.length).trim(); t.blur(); oeffnen(); } });
  })();

  window.KOM27Fun = { konfetti, feuerwerk, sync, oeffnen };
})();
