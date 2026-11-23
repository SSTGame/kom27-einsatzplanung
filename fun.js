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

  /* ---------------- Jahreszeiten-Deko: Schnee im Dezember, Feuerwerk zum Jahreswechsel ---------------- */
  const DEKO_K = 'kom27-deko';
  const dekoAn = () => { try { return localStorage.getItem(DEKO_K) !== 'aus'; } catch (e) { return true; } };
  function dekoSaison(d) {
    d = d || new Date(); const m = d.getMonth() + 1, t = d.getDate();
    if ((m === 12 && t >= 30) || (m === 1 && t <= 1)) return 'silvester';
    if (m === 12 || (m === 1 && t <= 6)) return 'schnee';
    return null;
  }
  let schneeC = null, schneeRaf = null, fwT = null;
  function schneeStart() {
    if (schneeC || ruhig()) return;
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;opacity:.45';
    c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c); schneeC = c;
    const x = c.getContext('2d');
    const neu = (start) => ({ x: Math.random() * c.width, y: start ? Math.random() * c.height : -8, r: 1.1 + Math.random() * 2.3, vy: 0.25 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.25, w: Math.random() * 6.3, vw: 0.01 + Math.random() * 0.02 });
    const f = Array.from({ length: 34 }, () => neu(true));
    const farbe = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#cfe0f2' : '#8fa8c2');
    (function bild() {
      if (!schneeC) return;
      if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
      x.clearRect(0, 0, c.width, c.height); x.fillStyle = farbe();
      f.forEach((k, i) => { k.w += k.vw; k.y += k.vy; k.x += k.vx + Math.sin(k.w) * 0.35; if (k.y > c.height + 8) f[i] = neu(false);
        x.beginPath(); x.arc(k.x, k.y, k.r, 0, 6.3); x.fill(); });
      schneeRaf = requestAnimationFrame(bild);
    })();
  }
  function dekoStop() {
    if (schneeRaf) cancelAnimationFrame(schneeRaf); schneeRaf = null;
    if (schneeC) schneeC.remove(); schneeC = null;
    if (fwT) clearInterval(fwT); fwT = null;
  }
  function dekoStart() {
    dekoStop();
    const s = dekoSaison(); if (!s || !dekoAn() || ruhig()) return;
    schneeStart();
    // zum Jahreswechsel ab und zu ein Feuerwerk – nicht öfter, sonst nervt es
    if (s === 'silvester') fwT = setInterval(() => { if (!document.hidden) feuerwerk(); }, 60000);
  }
  function dekoToggle() {
    try { localStorage.setItem(DEKO_K, dekoAn() ? 'aus' : 'an'); } catch (e) {}
    dekoStart();
    document.querySelectorAll('#dekoTg').forEach((b) => { b.classList.toggle('off', !dekoAn()); b.title = dekoAn() ? 'Winterdeko ausschalten' : 'Winterdeko einschalten'; });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#dekoTg'); if (b) { e.preventDefault(); dekoToggle(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (schneeRaf) cancelAnimationFrame(schneeRaf); schneeRaf = null; } else if (schneeC && !schneeRaf) { dekoStart(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dekoStart); else setTimeout(dekoStart, 300);

  /* ---------------- Saal versenken ---------------- */
  const N = 8;
  const FLOTTE = [['LED-Wand', 4], ['Rednerpult', 3], ['Mediacart', 3], ['Funkstrecke', 2], ['Presenter', 2]];
  // zwei Plätze: „pam“ ist der Herausforderer, „kom“ der Gegner – wer sie besetzt, steht im Spielstand
  const G = { offen: false, solo: false, state: null, sel: null, quer: true };
  const meMail = () => String((S.user || {}).email || '').toLowerCase();
  const meName = () => { try { return myShortName() || meMail().split('@')[0] || 'Ich'; } catch (e) { return meMail().split('@')[0] || 'Ich'; } };
  const gegner = (s) => (s === 'pam' ? 'kom' : 'pam');
  const nameOf = (st, s) => (st && st[s] && st[s].name) || (s === 'pam' ? 'Herausforderer' : 'Gegner');
  const ich = () => { if (G.solo) return 'pam'; const st = G.state; if (!st) return 'pam';
    if ((st.pam || {}).email === meMail()) return 'pam';
    if ((st.kom || {}).email === meMail()) return 'kom';
    return null; }; // noch nicht dabei
  const ZIELE = { kom: 'das KOM27', tech: 'die Techniker', alle: 'alle' };
  const darfMit = (st) => { const z = (st || {}).ziel || 'alle';
    if (z === 'kom') return !!S.viewer;
    if (z === 'tech') { try { return !!myTech() || !!S.admin; } catch (e) { return !!S.admin; } }
    return true; };
  function wuerfeln() {
    const belegt = new Set(); const schiffe = [];
    FLOTTE.forEach(([name, len]) => { for (let v = 0; v < 200; v++) {
      const quer = Math.random() < 0.5, r = (Math.random() * (quer ? N : N - len + 1)) | 0, c = (Math.random() * (quer ? N - len + 1 : N)) | 0;
      const cells = Array.from({ length: len }, (_, i) => (quer ? r * N + c + i : (r + i) * N + c));
      if (cells.some((z) => belegt.has(z))) continue;
      cells.forEach((z) => belegt.add(z)); schiffe.push({ name, cells }); break; } });
    return schiffe;
  }
  const leer = (ziel) => ({ status: 'setup', turn: 'kom', winner: null, msg: '', ziel: ziel || 'alle',
    pam: { ships: null, shots: [], email: meMail(), name: meName() }, kom: { ships: null, shots: [], email: '', name: '' } });
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
      st.msg = `${nameOf(st, von)}: Treffer${weg ? ' – ' + tr.name + ' versenkt!' : '!'}`;
      if (alleWeg(ziel, st[von].shots)) { st.status = 'done'; st.winner = von; st.msg = `${nameOf(st, von)} hat das ganze Haus versenkt 🎉`; }
    } else { st.msg = `${nameOf(st, von)}: daneben.`; st.turn = gegner(von); }
    return true;
  }
  // Computer: erst rund um Treffer suchen, sonst würfeln
  function computerZug() {
    const st = G.state; if (!G.solo || st.status !== 'play' || st.turn !== 'kom') return;
    const sch = st.kom.shots; const treffer = sch.filter((z) => st.pam.ships.some((s) => s.cells.includes(z) && !versenkt(s, sch)));
    let kand = [];
    treffer.forEach((z) => { const r = (z / N) | 0, c = z % N; [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([a, b]) => { if (a >= 0 && a < N && b >= 0 && b < N && !sch.includes(a * N + b)) kand.push(a * N + b); }); });
    if (!kand.length) kand = Array.from({ length: N * N }, (_, i) => i).filter((z) => !sch.includes(z));
    const z = kand[(Math.random() * kand.length) | 0];
    schuss('kom', z);
    speichern(); zeichnen(); fxAuf('pam', z);
    if (G.state.status === 'play' && G.state.turn === 'kom') setTimeout(computerZug, 700);
  }
  // Schiffe als Zeichnung: Rumpf mit Bug, Deck, Brücke, Schornstein, Geschütztürme
  function schiffSvg(len, quer) {
    const L = len * 100, b = Math.max(28, L * 0.17), bx = L * 0.3;
    const turm = (x) => `<g class="turm"><circle cx="${x}" cy="50" r="11"/><rect x="${x - 2.5}" y="25" width="5" height="24" rx="2.5"/></g>`;
    const form = `<path class="rumpf" d="M10 20 H${L - 38} Q${L - 4} 50 ${L - 38} 80 H10 Q2 50 10 20 Z"/>
      <path class="deck" d="M20 31 H${L - 46} Q${L - 22} 50 ${L - 46} 69 H20 Q14 50 20 31 Z"/>
      <rect class="bruecke" x="${bx}" y="33" width="${b}" height="34" rx="7"/>
      <rect class="fenster" x="${bx + 5}" y="39" width="${Math.max(6, b - 10)}" height="9" rx="4"/>
      <rect class="rohr" x="${bx + b + 9}" y="27" width="14" height="28" rx="5"/>
      <path class="mast" d="M${bx + b / 2} 33 V9"/>
      ${len >= 3 ? turm(L - 64) : ''}${len >= 4 ? turm(60) : ''}
      ${Array.from({ length: len }, (_, i) => `<circle class="auge" cx="${i * 100 + 50}" cy="72" r="3.6"/>`).join('')}`;
    return quer ? `<svg viewBox="0 0 ${L} 100" preserveAspectRatio="none">${form}</svg>` : `<svg viewBox="0 0 100 ${L}" preserveAspectRatio="none"><g transform="translate(100,0) rotate(90)">${form}</g></svg>`;
  }
  const istQuer = (sch) => sch.cells.length < 2 || sch.cells[1] - sch.cells[0] === 1;
  const SPALTEN = 'ABCDEFGH';
  const feldName = (z) => SPALTEN[z % N] + (((z / N) | 0) + 1);
  function brett(seite, eigen, setup) {
    const st = G.state; const s = st[seite]; const beschuss = st[gegner(seite)].shots; // Schüsse, die auf dieses Brett gingen
    let h = `<div class="sv-brett${setup ? ' setup' : ''}" data-seite="${seite}">`;
    (s.ships || []).forEach((sch, i) => { const weg = versenkt(sch, beschuss); if (!eigen && !weg) return;
      const z = sch.cells[0], q = istQuer(sch), len = sch.cells.length;
      h += `<div class="sv-schiff${weg ? ' weg' : ''}" data-si="${i}" style="grid-row:${((z / N) | 0) + 1} / span ${q ? 1 : len};grid-column:${(z % N) + 1} / span ${q ? len : 1};animation-delay:${-(i * 0.7)}s" title="${esc(sch.name)}">${schiffSvg(len, q)}</div>`; });
    for (let z = 0; z < N * N; z++) {
      const schiff = (s.ships || []).find((x) => x.cells.includes(z)); const getroffen = beschuss.includes(z);
      const kl = getroffen ? (schiff ? (versenkt(schiff, beschuss) ? 'weg' : 'hit') : 'miss') : '';
      const stil = `grid-row:${((z / N) | 0) + 1};grid-column:${(z % N) + 1}`;
      if (setup) { h += `<span class="sv-z ${kl}" style="${stil}"></span>`; continue; }
      const kann = !eigen && st.status === 'play' && st.turn === ich() && !getroffen;
      h += `<button class="sv-z ${kl}" style="${stil}" ${kann ? `data-svz="${z}"` : 'disabled'} aria-label="${feldName(z)}">${getroffen ? '<i class="sv-pin"></i>' : ''}</button>`;
    }
    h += '</div>';
    return `<div class="sv-board"><span class="sv-eck"></span><div class="sv-labx">${[...SPALTEN].map((c) => `<span>${c}</span>`).join('')}</div>`
      + `<div class="sv-laby">${Array.from({ length: N }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>${h}</div>`;
  }
  // Schiff ab Feld z in die gewählte Richtung – null, wenn es nicht passt
  function platz(len, z, quer, andere) {
    const r = (z / N) | 0, c = z % N; if (quer ? c + len > N : r + len > N) return null;
    const cells = Array.from({ length: len }, (_, i) => (quer ? z + i : z + i * N));
    return cells.some((x) => andere.some((sch) => sch.cells.includes(x))) ? null : cells;
  }
  /* ----- Einschlag: Fontäne beim Danebenschuss, Explosion beim Treffer ----- */
  function fx(bo, z, art) {
    if (!bo) return;
    const e = document.createElement('div');
    e.className = 'sv-eff ' + art;
    e.style.gridRow = String(((z / N) | 0) + 1); e.style.gridColumn = String((z % N) + 1);
    e.innerHTML = art === 'boom'
      ? '<span class="blitz"></span><span class="feuer"></span><span class="ring r1"></span><span class="ring r2"></span>' + Array.from({ length: 10 }, (_, i) => `<i style="--w:${i * 36}deg"></i>`).join('')
      : '<span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span><span class="saeule"></span>' + Array.from({ length: 7 }, (_, i) => `<b style="--w:${i * 51 + 10}deg"></b>`).join('');
    bo.appendChild(e);
    if (art === 'boom') { bo.classList.add('wackelt'); setTimeout(() => bo.classList.remove('wackelt'), 480); }
    setTimeout(() => e.remove(), 1300);
  }
  function fxAuf(seite, z) {
    const bo = document.querySelector(`#svSpiel .sv-brett[data-seite="${seite}"]`); if (!bo) return;
    const getroffen = (((G.state || {})[seite] || {}).ships || []).some((x) => x.cells.includes(z));
    fx(bo, z, getroffen ? 'boom' : 'splash');
  }
  /* ----- Aufstellen: Schiffe ziehen, antippen zum Drehen – mit Maus und am iPad ----- */
  function wireSetup(o, me) {
    const bo = o.querySelector('.sv-brett.setup'); if (!bo) return;
    const ships = () => G.state[me].ships;
    const ghost = document.createElement('div'); ghost.className = 'sv-ghost'; ghost.hidden = true; bo.appendChild(ghost);
    let zug = null, start = 0, bewegt = false, letztes = null;
    const feld = (ev) => { const r = bo.getBoundingClientRect();
      const c = Math.floor((ev.clientX - r.left) / (r.width / N)), z = Math.floor((ev.clientY - r.top) / (r.height / N));
      return c < 0 || c >= N || z < 0 || z >= N ? null : z * N + c; };
    const anker = (f) => { let r = (f / N) | 0, c = f % N;
      if (zug.quer) c = Math.max(0, Math.min(N - zug.len, c - zug.greif)); else r = Math.max(0, Math.min(N - zug.len, r - zug.greif));
      return r * N + c; };
    const andere = () => ships().filter((x) => x !== zug.alt);
    const zeigen = (f) => {
      if (!zug || f == null) { ghost.hidden = true; zug && (zug.ziel = null); return; }
      const a = anker(f); const passt = platz(zug.len, a, zug.quer, andere());
      zug.ziel = passt ? a : null;
      ghost.hidden = false; ghost.className = 'sv-ghost ' + (passt ? 'ok' : 'nok');
      ghost.style.gridRow = `${((a / N) | 0) + 1} / span ${zug.quer ? 1 : zug.len}`;
      ghost.style.gridColumn = `${(a % N) + 1} / span ${zug.quer ? zug.len : 1}`;
      ghost.innerHTML = schiffSvg(zug.len, zug.quer);
    };
    const aufraeumen = () => { zug = null; ghost.hidden = true; bo.querySelectorAll('.sv-schiff.zieht').forEach((e) => e.classList.remove('zieht')); };
    bo.addEventListener('pointerdown', (ev) => {
      if (zug) return;
      const f = feld(ev); if (f == null) return;
      const hier = ships().find((x) => x.cells.includes(f));
      if (hier) zug = { alt: hier, name: hier.name, len: hier.cells.length, quer: istQuer(hier), greif: hier.cells.indexOf(f) };
      else if (G.sel != null && G.sel >= 0 && FLOTTE[G.sel]) zug = { alt: null, name: FLOTTE[G.sel][0], len: FLOTTE[G.sel][1], quer: G.quer !== false, greif: 0 };
      else return;
      ev.preventDefault();
      start = Date.now(); bewegt = false; letztes = f;
      if (hier) { const el = bo.querySelector(`.sv-schiff[data-si="${ships().indexOf(hier)}"]`); if (el) el.classList.add('zieht'); }
      try { bo.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
      zeigen(f);
    });
    bo.addEventListener('pointermove', (ev) => {
      if (!zug) return;
      const f = feld(ev); if (f === letztes) return;
      letztes = f; bewegt = true; zeigen(f);
    });
    const fertig = (ev) => {
      if (!zug) return;
      const z = zug; const kurz = !bewegt && Date.now() - start < 400;
      aufraeumen();
      if (z.alt && kurz) { // antippen dreht das Schiff an Ort und Stelle
        const basis = z.alt.cells[0]; const neuQuer = !z.quer;
        const cells = platz(z.len, basis, neuQuer, ships().filter((x) => x !== z.alt));
        if (!cells) return toast('Zum Drehen ist hier kein Platz – zieh das Schiff woanders hin');
        z.alt.cells = cells; G.quer = neuQuer; G.sel = null; return zeichnen();
      }
      if (z.ziel == null) { if (bewegt || !z.alt) toast('Da passt das Schiff nicht hin'); return zeichnen(); }
      const cells = platz(z.len, z.ziel, z.quer, ships().filter((x) => x !== z.alt));
      if (!cells) return zeichnen();
      G.state[me].ships = ships().filter((x) => x !== z.alt).concat([{ name: z.name, cells }]);
      G.quer = z.quer; G.sel = null; zeichnen();
    };
    bo.addEventListener('pointerup', fertig);
    bo.addEventListener('pointercancel', () => { aufraeumen(); zeichnen(); });
    bo.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }
  function zeichnen() {
    let o = document.getElementById('svSpiel'); if (!G.offen) { if (o) o.remove(); return; }
    if (!o) { o = document.createElement('div'); o.id = 'svSpiel'; document.body.appendChild(o); }
    const st = G.state; const me = ich(); const er = me ? gegner(me) : null;
    let inhalt;
    if (!st || !st.status) {
      const ziele = S.viewer ? [['tech', 'Techniker herausfordern'], ['alle', 'Alle herausfordern']] : [['kom', 'KOM27 herausfordern'], ['tech', 'Andere Techniker herausfordern']];
      inhalt = `<p class="sv-txt">Schiffe versenken im KOM27: Wer trifft zuerst LED-Wand, Rednerpult, Mediacart, Funkstrecke und Presenter des anderen?</p>
        <div class="sv-btns">${ziele.map(([z, t], i) => `<button class="big ${i ? 'ghost' : 'primary solid'}" data-svneu="${z}">${t}</button>`).join('')}<button class="big ghost" data-svneu="solo">Gegen den Computer</button></div>`;
    } else if (!me) {
      const frei = !(st.kom || {}).email && st.status === 'setup';
      inhalt = `<p class="sv-txt">${frei ? `${esc(nameOf(st, 'pam'))} fordert ${ZIELE[st.ziel] || 'alle'} heraus.` : `Gerade spielt ${esc(nameOf(st, 'pam'))} gegen ${esc(nameOf(st, 'kom'))}.`}</p>
        <div class="sv-btns">${frei && darfMit(st) ? '<button class="big primary solid" data-svmit>Mitspielen</button>' : ''}<button class="big ghost" data-svneu="solo">Gegen den Computer</button>${S.admin ? '<button class="btn" data-svende>Spiel beenden</button>' : ''}</div>`;
    } else if (st.status === 'setup') {
      const bereit = !!st[me].ready;
      if (!st[me].ships) st[me].ships = [];
      const da = (n) => st[me].ships.some((x) => x.name === n);
      const voll = st[me].ships.length === FLOTTE.length;
      if (G.sel == null || G.sel >= 0 && da(FLOTTE[G.sel] && FLOTTE[G.sel][0])) { const i = FLOTTE.findIndex(([n]) => !da(n)); G.sel = i; }
      inhalt = `<p class="sv-txt">${bereit ? ((st[er] || {}).email ? `Deine Flotte liegt bereit. Warte auf ${esc(nameOf(st, er))} …` : `Deine Flotte liegt bereit. Warte auf ${ZIELE[st.ziel] || 'einen Gegner'} …`) : voll ? 'Alles aufgestellt. Schiff verschieben: einfach ziehen. Antippen dreht es. Oder los!' : 'Stell deine Flotte auf: Schiff wählen und ins Haus ziehen. Ein Schiff antippen dreht es, ziehen verschiebt es.'}</p>
        ${bereit ? '' : `<div class="sv-flotte">${FLOTTE.map(([n, len], i) => `<button class="sv-wahl${G.sel === i ? ' on' : ''}${da(n) ? ' da' : ''}" data-svs="${i}"><span class="sv-mini" style="width:${len * 22}px">${schiffSvg(len, true)}</span>${esc(n)}</button>`).join('')}
          <button class="btn sv-dreh" data-svdreh>↻ ${G.quer === false ? 'längs' : 'quer'} <small>(Taste R)</small></button></div>`}
        <div class="sv-felder eins"><div><h4>Dein Haus</h4>${brett(me, true, !bereit)}</div></div>
        <div class="sv-btns">${bereit ? '' : `<button class="big ghost" data-svwurf>Zufällig aufstellen</button><button class="big primary solid" data-svbereit ${voll ? '' : 'disabled'}>Bereit</button>`}<button class="btn" data-svende>Spiel abbrechen</button></div>`;
    } else {
      const dran = st.turn === me;
      const rest = (s) => (st[s].ships || []).filter((x) => !versenkt(x, st[gegner(s)].shots)).length;
      inhalt = `<p class="sv-status ${st.status === 'done' ? 'ende' : dran ? 'dran' : ''}">${st.status === 'done' ? (st.winner === me ? '🏆 Gewonnen! ' : 'Verloren. ') + esc(st.msg) : (dran ? 'Du bist dran – tippe ins gegnerische Haus. ' : `${esc(nameOf(st, er))} ist dran … `) + esc(st.msg || '')}</p>
        <div class="sv-felder">
          <div><h4>Haus von ${esc(nameOf(st, er))} <small>noch ${rest(er)} von ${FLOTTE.length}</small></h4>${brett(er, st.status === 'done')}</div>
          <div><h4>Dein Haus <small>noch ${rest(me)} von ${FLOTTE.length}</small></h4>${brett(me, true)}</div>
        </div>
        <div class="sv-btns"><button class="btn" data-svende>${st.status === 'done' ? 'Neues Spiel' : 'Spiel abbrechen'}</button></div>`;
    }
    o.innerHTML = `<div class="sv-karte" role="dialog" aria-label="Saal versenken"><div class="sv-kopf"><b>🚢 Saal versenken${G.solo ? ' · gegen den Computer' : ''}</b><button class="btn small" data-svzu>Schließen</button></div>${inhalt}</div>`;
    o.querySelector('[data-svzu]').onclick = () => { G.offen = false; zeichnen(); };
    o.querySelectorAll('[data-svneu]').forEach((b) => (b.onclick = async () => {
      const z = b.dataset.svneu; G.solo = z === 'solo';
      G.state = leer(G.solo ? 'alle' : z);
      if (G.solo) { G.state.kom = { ships: wuerfeln(), shots: [], ready: true, email: 'computer', name: 'Computer' }; G.state.turn = 'pam'; }
      else {
        const ids = (S.techs || []).filter((t) => t.active !== false && t.email && t.email.toLowerCase() !== meMail()).map((t) => t.id);
        const txt = `${meName()} fordert ${ZIELE[z] || 'alle'} heraus – in der App „versenken“ tippen.`;
        if ((z === 'tech' || z === 'alle') && ids.length) notify(S.viewer ? 'kom' : 'techs', ids, '🚢 Saal versenken', txt, 'sv');
        if (!S.admin) notify('admins', [], '🚢 Saal versenken', txt, 'sv');
      }
      await speichern(); zeichnen();
    }));
    const mit = o.querySelector('[data-svmit]'); if (mit) mit.onclick = async () => {
      try { const neu = await store.gameLoad(); if (neu && neu.status) G.state = neu; } catch (e) { /* dann der eigene Stand */ }
      if ((G.state.kom || {}).email) return zeichnen(); // jemand war schneller
      G.state.kom = Object.assign({ ships: null, shots: [] }, G.state.kom, { email: meMail(), name: meName() });
      await speichern(); zeichnen();
    };
    const wf = o.querySelector('[data-svwurf]'); if (wf) wf.onclick = () => { G.state[me].ships = wuerfeln(); G.sel = -1; zeichnen(); };
    o.querySelectorAll('[data-svs]').forEach((b) => (b.onclick = () => { const i = +b.dataset.svs; G.state[me].ships = G.state[me].ships.filter((x) => x.name !== FLOTTE[i][0]); G.sel = i; zeichnen(); }));
    const dr = o.querySelector('[data-svdreh]'); if (dr) dr.onclick = () => { G.quer = G.quer === false; zeichnen(); };
    if (o.querySelector('.sv-brett.setup')) wireSetup(o, me);
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
      const z = +b.dataset.svz;
      if (!schuss(me, z)) return zeichnen();
      await speichern(); zeichnen(); fxAuf(er, z);
      if (G.state.status === 'done') { if (G.state.winner === me) konfetti();
        if (!G.solo) { const gm = (G.state[gegner(me)] || {}).email;
          const t = (S.techs || []).find((x) => (x.email || '').toLowerCase() === gm);
          if (t) notify(S.viewer ? 'kom' : 'techs', [t.id], '🚢 Saal versenken', G.state.msg, 'sv');
          else if (!S.admin) notify('admins', [], '🚢 Saal versenken', G.state.msg, 'sv'); } }
      else if (G.solo) setTimeout(computerZug, 700);
    }));
  }
  async function oeffnen() {
    if (!S.user) return;
    G.offen = true;
    const lokal = ls.get('kom27-sv');
    let duell = null;
    try { duell = await store.gameLoad(); } catch (e) { duell = null; }
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
    let txt = '', dringend = false;
    if (st && st.status && !G.offen) {
      const mir = st.pam && st.pam.email === meMail() ? 'pam' : st.kom && st.kom.email === meMail() ? 'kom' : null;
      if (!mir) {
        if (st.status === 'setup' && !(st.kom || {}).email && darfMit(st)) { txt = `${nameOf(st, 'pam')} fordert dich heraus – Saal versenken`; dringend = true; }
      } else if (st.status === 'setup') {
        txt = !(st[mir] || {}).ready ? 'Saal versenken: Flotte aufstellen' : `Warten auf ${nameOf(st, gegner(mir))} …`;
        dringend = !(st[mir] || {}).ready;
      } else if (st.status === 'play') {
        txt = st.turn === mir ? 'Du bist dran – Saal versenken' : `${nameOf(st, gegner(mir))} ist am Zug`;
        dringend = st.turn === mir;
      }
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
    const mir = ich();
    const meinsOffen = mir && G.state && G.state.status === 'setup' && G.state[mir] && !G.state[mir].ready && neu.status === 'setup';
    if (meinsOffen) { neu[mir] = G.state[mir]; if (document.querySelector('#svSpiel [data-svp]') && (neu[gegner(mir)] || {}).ready === (G.state[gegner(mir)] || {}).ready) { G.state = neu; return; } }
    const vorher = mir && G.state && G.state[gegner(mir)] ? (G.state[gegner(mir)].shots || []).slice() : [];
    G.state = neu.status ? neu : null; zeichnen(); banner();
    if (G.state && mir) { const jetzt = ((G.state[gegner(mir)] || {}).shots || []).filter((z) => !vorher.includes(z)); if (jetzt.length) fxAuf(mir, jetzt[jetzt.length - 1]); }
    if (G.state && G.state.status === 'done' && mir && G.state.winner === mir && war) konfetti();
  }

  // Codewort
  (function () {
    const CODE = 'versenken'; let buf = '';
    const angemeldet = () => !!S.user && !document.querySelector('.card.login'); // auf der Anmeldeseite passiert nichts
    document.addEventListener('keydown', (e) => {
      if (!angemeldet() || e.key.length !== 1 || e.metaKey || e.ctrlKey) return;
      // R dreht das Schiff, solange die Flotte aufgestellt wird
      if (e.key.toLowerCase() === 'r' && document.querySelector('#svSpiel .sv-brett.setup')) { const d = document.querySelector('#svSpiel [data-svdreh]'); if (d) { d.click(); return; } }
      buf = (buf + e.key.toLowerCase()).slice(-12); if (buf.endsWith(CODE)) { buf = ''; oeffnen(); }
    });
    document.addEventListener('input', (e) => { if (!angemeldet()) return; const t = e.target; if (!t || typeof t.value !== 'string' || !t.value) return; if (t.value.toLowerCase().trim().endsWith(CODE)) { t.value = t.value.slice(0, -CODE.length).trim(); t.blur(); oeffnen(); } });
  })();

  /* ---------------- Kabelsalat: verhedderte Leitungen entwirren ----------------
     Jedes Kabel ist ein Seil aus Gliedern (Verlet): es hängt durch, schwingt nach
     und spannt sich straff. Gezählt wird auf genau der Linie, die gezeichnet wird. */
  const KS_STUFEN = [['Soundcheck', 6], ['Probe', 8], ['Show', 10], ['Festival', 12]];
  const KS_TYP = {
    bnc:    { name: 'BNC (Video)',    ader: '#e2ac2e', mantel: '#7d5c13', boot: '#141519' },
    hdmi:   { name: 'HDMI',           ader: '#2a2c33', mantel: '#0b0c0f', boot: '#0b0c0f' },
    schuko: { name: 'Schuko (Strom)', ader: '#eceef2', mantel: '#6e6e78', boot: '#1b1d22' },
    cat:    { name: 'CAT (Netzwerk)', ader: '#2f7fe0', mantel: '#123a6b', boot: '#0e1116' },
    dmx:    { name: 'DMX / XLR',      ader: '#3f9d63', mantel: '#1b4a2d', boot: '#101317' },
  };
  const KS_TL = Object.keys(KS_TYP);
  const KS_ORTE = ['SAAL 1', 'SAAL 2', 'SAAL 3', 'SAAL 4', 'SEMINAR 1', 'SEMINAR 2', 'SEMINAR 3',
                   'FOYER', 'REGIE', 'FOH', 'BÜHNE L', 'BÜHNE R', 'PATCH A', 'PATCH B', 'TECHNIK'];
  const KS = { offen: false, stufe: 0, dosen: [], kabel: [], greift: -1, t0: 0, laeuft: false,
               fertig: false, kreuze: [], sauber: 0, raf: null, puls: 0, wand: null,
               B: { w: 800, h: 600, dpr: 1 }, cv: null, cx: null, seitPruefung: 0 };

  /* --- Rätsel: aus einer kreuzungsfreien Kreisform, also immer lösbar --- */
  function ksGraph(n) {
    const kanten = []; for (let i = 0; i < n; i++) kanten.push([i, (i + 1) % n]);
    const zw = (x, p, q) => (p < q ? x > p && x < q : x > p || x < q);
    const kreuztAufKreis = (a, b, c, d) => zw(c, a, b) !== zw(d, a, b);
    let versuche = n * 14; const ziel = n + Math.floor(n / 2);
    while (versuche-- > 0 && kanten.length < ziel) {
      const a = (Math.random() * n) | 0, b = (Math.random() * n) | 0;
      if (a === b || (a + 1) % n === b || (b + 1) % n === a) continue;
      if (kanten.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
      if (kanten.some(([p, q]) => p !== a && p !== b && q !== a && q !== b && kreuztAufKreis(a, b, p, q))) continue;
      kanten.push([a, b]);
    }
    return kanten;
  }
  function ksRaster(n, w, h) {
    const rand = Math.min(w, h) * 0.1;
    const zeilen = Math.max(1, Math.round(Math.sqrt(n * (h / w))));
    const spalten = Math.ceil(n / zeilen);
    const felder = [];
    for (let r = 0; r < zeilen; r++) for (let c = 0; c < spalten; c++) felder.push([c, r]);
    for (let i = felder.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [felder[i], felder[j]] = [felder[j], felder[i]]; }
    const bx = (w - 2 * rand) / spalten, by = (h - 2 * rand) / zeilen;
    return felder.slice(0, n).map(([c, r]) => ({
      x: rand + (c + 0.5) * bx + (Math.random() - 0.5) * bx * 0.5,
      y: rand + (r + 0.5) * by + (Math.random() - 0.5) * by * 0.5,
    }));
  }
  function ksSeil(a, b, typ) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const laenge = Math.max(d * 1.1, d + 34);
    const seg = Math.max(10, Math.min(20, Math.round(laenge / 16)));
    const p = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * (laenge - d) * 0.5;
      p.push({ x, y, px: x, py: y });
    }
    return { typ, p, ruhe: laenge / seg };
  }
  const ksTeilt = (k1, k2) => k1[0] === k2[0] || k1[0] === k2[1] || k1[1] === k2[0] || k1[1] === k2[1];

  function ksNeu(stufe) {
    KS.stufe = Math.max(0, Math.min(KS_STUFEN.length - 1, stufe || 0));
    const n = KS_STUFEN[KS.stufe][1];
    const kanten = ksGraph(n);
    const orte = KS_ORTE.slice().sort(() => Math.random() - 0.5);
    let pos = null;
    for (let v = 0; v < 40; v++) {
      pos = ksRaster(n, KS.B.w, KS.B.h);
      let kreuze = 0;
      for (let i = 0; i < kanten.length; i++) for (let j = i + 1; j < kanten.length; j++) {
        if (ksTeilt(kanten[i], kanten[j])) continue;
        if (ksGerade(pos[kanten[i][0]], pos[kanten[i][1]], pos[kanten[j][0]], pos[kanten[j][1]])) kreuze++;
      }
      if (kreuze >= Math.max(4, n)) break;
    }
    KS.dosen = pos.map((p, i) => ({ x: p.x, y: p.y, label: orte[i % orte.length], led: 0 }));
    KS.kabel = kanten.map(([a, b], i) => {
      const k = ksSeil(KS.dosen[a], KS.dosen[b], KS_TL[i % KS_TL.length]); k.a = a; k.b = b; return k;
    });
    const t = KS.kabel.map((k) => k.typ).sort(() => Math.random() - 0.5);
    KS.kabel.forEach((k, i) => (k.typ = t[i]));
    KS.greift = -1; KS.laeuft = false; KS.fertig = false; KS.t0 = 0; KS.sauber = 0; KS.kreuze = [];
    ksPruefen();
  }

  /* --- Physik --- */
  const KS_G = 0.34, KS_D = 0.985, KS_IT = 8;
  function ksSchritt() {
    for (const k of KS.kabel) {
      const p = k.p, letzte = p.length - 1;
      for (let i = 1; i < letzte; i++) {
        const q = p[i];
        const vx = (q.x - q.px) * KS_D, vy = (q.y - q.py) * KS_D;
        q.px = q.x; q.py = q.y; q.x += vx; q.y += vy + KS_G;
      }
      const A = KS.dosen[k.a], Z = KS.dosen[k.b];
      p[0].x = A.x; p[0].y = A.y; p[letzte].x = Z.x; p[letzte].y = Z.y;
      for (let d = 0; d < KS_IT; d++) {
        for (let i = 0; i < letzte; i++) {
          const a = p[i], b = p[i + 1];
          let dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 0.0001;
          const f = ((len - k.ruhe) / len) * 0.5; dx *= f; dy *= f;
          if (i > 0) { a.x += dx; a.y += dy; }
          if (i + 1 < letzte) { b.x -= dx; b.y -= dy; }
        }
        p[0].x = A.x; p[0].y = A.y; p[letzte].x = Z.x; p[letzte].y = Z.y;
      }
      for (let i = 1; i < letzte; i++) {
        p[i].x = Math.max(6, Math.min(KS.B.w - 6, p[i].x));
        p[i].y = Math.max(6, Math.min(KS.B.h - 6, p[i].y));
      }
    }
  }

  /* --- Kreuzungen --- */
  const ksSeite = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  function ksGerade(p1, p2, p3, p4) {
    const o1 = ksSeite(p1, p2, p3), o2 = ksSeite(p1, p2, p4), o3 = ksSeite(p3, p4, p1), o4 = ksSeite(p3, p4, p2);
    return o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4;
  }
  function ksTreff(p1, p2, p3, p4) {
    const a = p2.x - p1.x, b = p4.x - p3.x, c = p2.y - p1.y, d = p4.y - p3.y;
    const nen = a * d - c * b; if (!nen) return null;
    const t = ((p3.x - p1.x) * d - (p3.y - p1.y) * b) / nen;
    return { x: p1.x + a * t, y: p1.y + c * t };
  }
  function ksPruefen() {
    const K = KS.kabel, punkte = [], schuld = new Set();
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
      if (ksTeilt([K[i].a, K[i].b], [K[j].a, K[j].b])) continue;
      const A = K[i].p, Z = K[j].p; let p = null;
      for (let x = 0; x < A.length - 1 && !p; x++) for (let y = 0; y < Z.length - 1; y++) {
        if (ksGerade(A[x], A[x + 1], Z[y], Z[y + 1])) { p = ksTreff(A[x], A[x + 1], Z[y], Z[y + 1]); break; }
      }
      if (p) { punkte.push(p); [K[i].a, K[i].b, K[j].a, K[j].b].forEach((d) => schuld.add(d)); }
    }
    KS.kreuze = punkte;
    KS.dosen.forEach((d, i) => (d.led = schuld.has(i) ? 0 : 1));
    const z = document.querySelector('#ksSpiel .ks-kreuz-n'); if (z) z.textContent = punkte.length;
    const box = document.querySelector('#ksSpiel .ks-kreuz'); if (box) box.classList.toggle('rot', punkte.length > 0);
    if (!KS.fertig && KS.laeuft) {
      KS.sauber = punkte.length === 0 ? KS.sauber + 1 : 0;
      if (KS.sauber >= 3) ksGewonnen();
    }
    return punkte.length;
  }

  /* --- Zeichnen --- */
  function ksWandMuster() {
    const o = document.createElement('canvas'); o.width = o.height = 120;
    const x = o.getContext('2d');
    x.fillStyle = '#13161b'; x.fillRect(0, 0, 120, 120);
    for (let i = 0; i < 2400; i++) {
      const a = Math.random() * 0.05;
      x.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
      x.fillRect(Math.random() * 120, Math.random() * 120, 1.3, 1.3);
    }
    return KS.cx.createPattern(o, 'repeat');
  }
  function ksHintergrund() {
    const c = KS.cx, B = KS.B;
    const g = c.createLinearGradient(0, 0, B.w * 0.4, B.h);
    g.addColorStop(0, '#1b1f26'); g.addColorStop(1, '#0d1014');
    c.fillStyle = g; c.fillRect(0, 0, B.w, B.h);
    if (KS.wand) { c.globalAlpha = 0.55; c.fillStyle = KS.wand; c.fillRect(0, 0, B.w, B.h); c.globalAlpha = 1; }
    c.lineWidth = 1;
    for (let y = 0; y < B.h; y += 112) {
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(B.w, y + 0.5); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.035)'; c.beginPath(); c.moveTo(0, y + 1.5); c.lineTo(B.w, y + 1.5); c.stroke();
    }
    const l = c.createRadialGradient(B.w * 0.22, -B.h * 0.1, 10, B.w * 0.22, -B.h * 0.1, B.h * 1.35);
    l.addColorStop(0, 'rgba(255,245,220,.11)'); l.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = l; c.fillRect(0, 0, B.w, B.h);
  }
  function ksPfad(p) {
    const c = KS.cx;
    c.beginPath(); c.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      c.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    c.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  }
  function ksKabelZeichnen(k, dicke) {
    const c = KS.cx, T = KS_TYP[k.typ];
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.save(); c.translate(5, 8);
    ksPfad(k.p); c.strokeStyle = 'rgba(0,0,0,.42)'; c.lineWidth = dicke + 3; c.stroke();
    c.restore();
    ksPfad(k.p); c.strokeStyle = T.mantel; c.lineWidth = dicke + 2.4; c.stroke();
    ksPfad(k.p); c.strokeStyle = T.ader; c.lineWidth = dicke; c.stroke();
    c.save(); c.translate(-0.9, -1.3); c.globalAlpha = 0.33;
    ksPfad(k.p); c.strokeStyle = '#ffffff'; c.lineWidth = dicke * 0.33; c.stroke();
    c.restore();
  }
  function ksStecker(k, ende) {
    const c = KS.cx, p = k.p;
    const dose = ende ? p[p.length - 1] : p[0];
    const nach = ende ? p[p.length - 4] : p[3];
    const w = Math.atan2(dose.y - nach.y, dose.x - nach.x);
    const T = KS_TYP[k.typ];
    c.save(); c.translate(dose.x, dose.y); c.rotate(w); c.translate(-29, 0);
    const metall = c.createLinearGradient(0, -5, 0, 5);
    metall.addColorStop(0, '#e6eaef'); metall.addColorStop(.42, '#aeb5bf'); metall.addColorStop(1, '#6d747e');
    c.fillStyle = T.boot;
    c.beginPath(); c.moveTo(-13, -3.4); c.lineTo(-3, -4.6); c.lineTo(-3, 4.6); c.lineTo(-13, 3.4); c.closePath(); c.fill();
    c.fillStyle = T.ader; c.globalAlpha = .9; c.fillRect(-7.5, -4.4, 2.2, 8.8); c.globalAlpha = 1;
    if (k.typ === 'hdmi') {
      c.fillStyle = '#1a1c21'; c.fillRect(-4, -4.4, 5, 8.8);
      c.fillStyle = metall;
      c.beginPath(); c.moveTo(1, -3.6); c.lineTo(10, -2.6); c.lineTo(10, 2.6); c.lineTo(1, 3.6); c.closePath(); c.fill();
      c.fillStyle = '#2f333a';
      c.beginPath(); c.moveTo(3, -2.3); c.lineTo(8.6, -1.6); c.lineTo(8.6, 1.6); c.lineTo(3, 2.3); c.closePath(); c.fill();
    } else if (k.typ === 'bnc') {
      c.fillStyle = metall; c.fillRect(-4, -3.4, 8, 6.8);
      c.fillStyle = '#8d949e'; for (let i = -3; i < 4; i += 1.6) c.fillRect(i, -3.4, .6, 6.8);
      c.fillStyle = metall; c.fillRect(4, -4.2, 5.5, 8.4);
      c.fillStyle = '#5c636d'; c.fillRect(4, -4.2, 5.5, 1.1); c.fillRect(4, 3.1, 5.5, 1.1);
      c.fillStyle = '#d8b23c'; c.beginPath(); c.arc(10.4, 0, 1.5, 0, 7); c.fill();
    } else if (k.typ === 'schuko') {
      c.fillStyle = '#1e2127';
      c.beginPath(); c.moveTo(-4, -5.4); c.lineTo(4, -6.2); c.lineTo(8.5, -3.4); c.lineTo(8.5, 3.4); c.lineTo(4, 6.2); c.lineTo(-4, 5.4); c.closePath(); c.fill();
      c.fillStyle = '#31353d'; c.fillRect(-2, -4.4, 7, 8.8);
      c.fillStyle = metall; c.fillRect(6, -2.6, 4.6, 1.7); c.fillRect(6, .9, 4.6, 1.7);
      c.fillStyle = '#9aa1ab'; c.fillRect(2.5, -6.3, 2.6, .9); c.fillRect(2.5, 5.4, 2.6, .9);
    } else if (k.typ === 'cat') {
      c.fillStyle = '#c8ced6'; c.fillRect(-4, -4.2, 13, 8.4);
      c.fillStyle = '#b0b7c0'; c.fillRect(-2.5, -6.2, 4.5, 2.2);
      c.fillStyle = '#e8ecf1'; c.fillRect(2, -3, 6.4, 6);
      c.fillStyle = '#8f96a1'; for (let i = 0; i < 4; i++) c.fillRect(3 + i * 1.5, -2.4, .8, 4.8);
    } else {
      c.fillStyle = metall;
      c.beginPath(); if (c.roundRect) c.roundRect(-4, -5, 9, 10, 2.4); else c.rect(-4, -5, 9, 10); c.fill();
      c.fillStyle = '#5f6670'; c.fillRect(-2, -5, 1.2, 10);
      c.fillStyle = '#20242a'; c.beginPath(); c.arc(6.4, 0, 4.4, 0, 7); c.fill();
      c.fillStyle = '#cfd5dd';
      [[7.6, -2.1], [7.6, 2.1], [4.6, 0]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.05, 0, 7); c.fill(); });
    }
    c.restore();
  }
  function ksDose(d, i) {
    const c = KS.cx, s = (KS.greift === i ? 1.08 : 1) * 1.18;
    c.save(); c.translate(d.x, d.y); c.scale(s, s);
    const box = (x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    c.fillStyle = 'rgba(0,0,0,.5)'; box(-20, -14, 40, 34, 4); c.fill();
    const plat = c.createLinearGradient(0, -18, 0, 18);
    plat.addColorStop(0, '#454c57'); plat.addColorStop(.5, '#333942'); plat.addColorStop(1, '#262b33');
    c.fillStyle = plat; box(-21, -18, 42, 36, 4); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; box(-20.5, -17.5, 41, 35, 4); c.stroke();
    c.fillStyle = '#596170';
    [[-15.5, -12.5], [15.5, -12.5], [-15.5, 12.5], [15.5, 12.5]].forEach(([x, y]) => {
      c.beginPath(); c.arc(x, y, 2.1, 0, 7); c.fill();
      c.strokeStyle = '#2a2f37'; c.lineWidth = .9;
      c.beginPath(); c.moveTo(x - 1.2, y - 1.2); c.lineTo(x + 1.2, y + 1.2); c.stroke();
    });
    const loch = c.createRadialGradient(-2, -3, 1, 0, 0, 11);
    loch.addColorStop(0, '#2b3038'); loch.addColorStop(1, '#0a0c0f');
    c.fillStyle = loch; c.beginPath(); c.arc(0, -2, 9.5, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 1.4; c.beginPath(); c.arc(0, -2, 9.5, 0, 7); c.stroke();
    c.fillStyle = '#05070a'; c.beginPath(); c.arc(0, -2, 5.2, 0, 7); c.fill();
    const an = d.led === 1;
    c.fillStyle = an ? '#2fd16d' : '#5a2520';
    if (an) { c.shadowColor = 'rgba(47,209,109,.9)'; c.shadowBlur = 9; }
    c.beginPath(); c.arc(-14, 1, 2.1, 0, 7); c.fill(); c.shadowBlur = 0;
    c.font = '600 8px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillText(d.label, 0, 15.2);
    c.fillStyle = '#aab2bd'; c.fillText(d.label, 0, 14.4);
    c.restore();
  }
  function ksMarker() {
    const c = KS.cx;
    KS.puls += ruhig() ? 0 : 0.07;
    const g = ruhig() ? 1 : 0.78 + Math.sin(KS.puls) * 0.22;
    for (const p of KS.kreuze) {
      c.save();
      c.globalAlpha = 0.28 * g; c.fillStyle = '#ff4d3d';
      c.beginPath(); c.arc(p.x, p.y, 13, 0, 7); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#ff4d3d';
      c.beginPath(); c.arc(p.x, p.y, 4.2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(p.x, p.y, 4.2, 0, 7); c.stroke();
      c.restore();
    }
  }
  function ksZeichnen() {
    if (!KS.cx) return;
    KS.cx.setTransform(KS.B.dpr, 0, 0, KS.B.dpr, 0, 0);
    ksHintergrund();
    const dicke = Math.max(5, Math.min(8, KS.B.w / 150));
    for (const k of KS.kabel) ksKabelZeichnen(k, dicke);
    KS.dosen.forEach(ksDose);
    for (const k of KS.kabel) { ksStecker(k, 0); ksStecker(k, 1); }
    ksMarker();
  }

  /* --- Uhr, Rangliste, Sieg --- */
  const ksZeit = () => (KS.laeuft || KS.t0 ? (Date.now() - KS.t0) / 1000 : 0);
  const ksFmt = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + ' min'
                                : (Math.round(s * 10) / 10).toString().replace('.', ',') + ' s');
  const ksBestKey = () => 'kom27-ks-best-' + KS.stufe;
  function ksBest() { try { const v = localStorage.getItem(ksBestKey()); return v ? +v : null; } catch (e) { return null; } }
  function ksBestZeigen() { const e = document.querySelector('#ksSpiel .ks-best-n'); if (e) { const b = ksBest(); e.textContent = b === null ? '–' : ksFmt(b); } }
  function ksUhr() { const e = document.querySelector('#ksSpiel .ks-uhr-n'); if (e) e.textContent = ksFmt(ksZeit()); }
  function ksName() {
    const mail = ((S.user || {}).email || '').toLowerCase();
    return ((S.techs || []).find((t) => (t.email || '').toLowerCase() === mail) || {}).name
      || ((S.viewers || []).find((v) => (v.email || '').toLowerCase() === mail) || {}).name
      || (S.admin && typeof CFG !== 'undefined' && CFG.senderName) || (mail ? mail.split('@')[0] : 'Du');
  }
  async function ksGewonnen() {
    KS.fertig = true; KS.laeuft = false;
    const sek = ksZeit(); ksUhr();
    const alt = ksBest(); const neu = alt === null || sek < alt;
    if (neu) { try { localStorage.setItem(ksBestKey(), String(Math.round(sek * 10) / 10)); } catch (e) {} }
    ksBestZeigen();
    konfetti();
    let rang = '';
    try {
      const top = await store.kabelTop();
      const meins = top.find((x) => x.name === ksName());
      if (!meins || sek < +meins.sek) { await store.kabelSave(ksName(), Math.round(sek * 10) / 10, KS.stufe + 1); rang = 'Neue Bestzeit im Team!'; }
    } catch (e) { /* Rangliste ist Beiwerk */ }
    const t = document.querySelector('#ksSpiel .ks-sieg');
    if (t) {
      t.querySelector('h3').textContent = neu ? 'Neue Bestzeit' : 'Sauber gepatcht';
      t.querySelector('.ks-sz').textContent = ksFmt(sek);
      t.querySelector('p').textContent = rang || (neu && alt !== null ? 'Vorher ' + ksFmt(alt) + '. Alle Dosen grün.' : 'Kein Kabel kreuzt mehr. Alle Dosen grün.');
      t.querySelector('[data-ksw]').style.display = KS.stufe < KS_STUFEN.length - 1 ? '' : 'none';
      setTimeout(() => t.classList.add('auf'), 600);
    }
  }
  async function ksRangliste() {
    const box = document.querySelector('#ksSpiel .ks-rang'); if (!box) return;
    box.classList.add('auf');
    box.innerHTML = '<p class="ks-leer">Rangliste wird geladen …</p>';
    let top = [];
    try { top = await store.kabelTop(); } catch (e) { top = []; }
    box.innerHTML = '<button class="ks-zu" data-kszu>✕</button>' + (top.length
      ? `<h4>Bestzeiten im Team</h4><ol>${top.slice(0, 10).map((x) => `<li><span>${esc(x.name || x.email)}</span><em>${ksFmt(+x.sek)}</em><small>${(KS_STUFEN[(x.stufe || 1) - 1] || [''])[0]}</small></li>`).join('')}</ol>`
      : '<p class="ks-leer">Noch keine Bestzeit – du kannst die erste sein.</p>');
    const zu = box.querySelector('[data-kszu]'); if (zu) zu.onclick = () => box.classList.remove('auf');
  }

  /* --- Fläche, Bedienung, Schleife --- */
  function ksMessen() {
    const feld = document.querySelector('#ksSpiel .ks-feld'); if (!feld || !KS.cv) return;
    const r = feld.getBoundingClientRect();
    const alt = { w: KS.B.w, h: KS.B.h };
    KS.B.dpr = Math.min(devicePixelRatio || 1, 2);
    KS.B.w = Math.max(280, r.width); KS.B.h = Math.max(280, r.height);
    KS.cv.width = KS.B.w * KS.B.dpr; KS.cv.height = KS.B.h * KS.B.dpr;
    if (alt.w && KS.dosen.length) {
      const fx = KS.B.w / alt.w, fy = KS.B.h / alt.h;
      KS.dosen.forEach((d) => { d.x *= fx; d.y *= fy; });
      KS.kabel.forEach((k) => k.p.forEach((p) => { p.x *= fx; p.y *= fy; p.px *= fx; p.py *= fy; }));
    }
  }
  function ksSchleife(t) {
    if (!KS.offen) { KS.raf = null; return; }
    ksSchritt();
    if (t - KS.seitPruefung > 90) { KS.seitPruefung = t; ksPruefen(); }
    if (KS.laeuft && !KS.fertig) ksUhr();
    ksZeichnen();
    KS.raf = requestAnimationFrame(ksSchleife);
  }
  function ksBedienung() {
    const cv = KS.cv;
    const ort = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * KS.B.w, y: ((e.clientY - r.top) / r.height) * KS.B.h }; };
    cv.addEventListener('pointerdown', (e) => {
      if (KS.fertig) return;
      const p = ort(e); let nah = -1, weite = 36 * 36;
      KS.dosen.forEach((d, i) => { const q = (d.x - p.x) ** 2 + (d.y - p.y) ** 2; if (q < weite) { weite = q; nah = i; } });
      if (nah < 0) return;
      KS.greift = nah; cv.setPointerCapture(e.pointerId); e.preventDefault();
      if (!KS.laeuft) { KS.laeuft = true; KS.t0 = Date.now(); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (KS.greift < 0) return;
      const p = ort(e), d = KS.dosen[KS.greift];
      d.x = Math.max(26, Math.min(KS.B.w - 26, p.x));
      d.y = Math.max(26, Math.min(KS.B.h - 26, p.y));
    });
    const los = () => { KS.greift = -1; };
    cv.addEventListener('pointerup', los); cv.addEventListener('pointercancel', los);
    window.addEventListener('resize', ksMessen);
  }
  function ksBauenUi() {
    let o = document.getElementById('ksSpiel');
    if (!o) { o = document.createElement('div'); o.id = 'ksSpiel'; o.className = 'ks'; document.body.appendChild(o); }
    o.innerHTML = `<div class="ks-box">
      <div class="ks-kopf">
        <b>🔌 Kabelsalat</b>
        <div class="ks-stufen">${KS_STUFEN.map(([n, z], i) => `<button data-ks="${i}" class="${i === KS.stufe ? 'on' : ''}">${n} <span>${z}</span></button>`).join('')}</div>
        <span class="ks-sp"></span>
        <div class="ks-anzeige">
          <div><b class="ks-uhr-n">0,0 s</b><small>Zeit</small></div>
          <div class="ks-kreuz"><b class="ks-kreuz-n">0</b><small>Kreuzungen</small></div>
          <div><b class="ks-best-n">–</b><small>Bestzeit</small></div>
        </div>
        <button class="ks-x" aria-label="Schließen">✕</button>
      </div>
      <div class="ks-feld"><canvas></canvas>
        <div class="ks-sieg"><div class="ks-skarte"><h3>Sauber gepatcht</h3><div class="ks-sz">0,0 s</div><p></p>
          <div class="ks-sbtn"><button class="ks-btn" data-ksneu>Nochmal</button><button class="ks-btn" data-ksw>Nächste Stufe</button></div></div></div>
        <div class="ks-rang"></div>
      </div>
      <div class="ks-fuss">${KS_TL.map((t) => `<span class="ks-t"><i style="background:${KS_TYP[t].ader};outline:1px solid ${KS_TYP[t].mantel}"></i>${esc(KS_TYP[t].name)}</span>`).join('')}
        <span class="ks-sp"></span>
        <button class="ks-btn" data-ksmisch>Neu stecken</button>
        <button class="ks-btn" data-ksrang>🏆 Rangliste</button></div>
    </div>`;
    KS.cv = o.querySelector('canvas'); KS.cx = KS.cv.getContext('2d');
    o.querySelector('.ks-x').onclick = ksZu;
    o.querySelector('[data-ksmisch]').onclick = () => ksStart(KS.stufe);
    o.querySelector('[data-ksneu]').onclick = () => ksStart(KS.stufe);
    o.querySelector('[data-ksw]').onclick = () => ksStart(KS.stufe + 1);
    o.querySelector('[data-ksrang]').onclick = ksRangliste;
    o.querySelectorAll('[data-ks]').forEach((b) => (b.onclick = () => ksStart(+b.dataset.ks)));
    ksBedienung();
  }
  function ksStart(stufe) {
    const neuBauen = !document.getElementById('ksSpiel');
    KS.offen = true;
    if (neuBauen) ksBauenUi();
    const sg = document.querySelector('#ksSpiel .ks-sieg'); if (sg) sg.classList.remove('auf');
    const rg = document.querySelector('#ksSpiel .ks-rang'); if (rg) rg.classList.remove('auf');
    KS.stufe = Math.max(0, Math.min(KS_STUFEN.length - 1, stufe || 0));
    document.querySelectorAll('#ksSpiel [data-ks]').forEach((b) => b.classList.toggle('on', +b.dataset.ks === KS.stufe));
    ksMessen();
    if (!KS.wand) KS.wand = ksWandMuster();
    ksNeu(KS.stufe);
    ksUhr(); ksBestZeigen();
    if (!KS.raf) KS.raf = requestAnimationFrame(ksSchleife);
  }
  function ksZu() {
    KS.offen = false; KS.laeuft = false;
    if (KS.raf) cancelAnimationFrame(KS.raf); KS.raf = null;
    const o = document.getElementById('ksSpiel'); if (o) o.remove();
    KS.cv = null; KS.cx = null; KS.wand = null;
  }
  function kabel() { if (!S.user) return; ksStart(KS.stufe); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && KS.offen) ksZu(); });
  (function () {
    const CODE = 'kabelsalat'; let buf = '';
    document.addEventListener('keydown', (e) => {
      if (!S.user || !e.key || e.key.length !== 1) return;
      const t = e.target; if (t && /input|textarea|select/i.test(t.tagName)) return;
      buf = (buf + e.key.toLowerCase()).slice(-12); if (buf.endsWith(CODE)) { buf = ''; kabel(); }
    });
    document.addEventListener('input', (e) => {
      if (!S.user) return; const t = e.target; if (!t || typeof t.value !== 'string' || !t.value) return;
      if (t.value.toLowerCase().trim().endsWith(CODE)) { t.value = t.value.slice(0, -CODE.length).trim(); t.blur(); kabel(); }
    });
  })();

  window.KOM27Fun = { konfetti, feuerwerk, sync, oeffnen, dekoSaison, dekoAn, dekoStart, dekoToggle, kabel };
})();
