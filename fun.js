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

  /* ---------------- Kabelsalat: verhedderte Leitungen entwirren ---------------- */
  const KS_STUFEN = [['Leicht', 7], ['Mittel', 9], ['Schwer', 11], ['Chaos', 13]];
  // echte Kabeltypen aus dem Haus – Farbe wie im Lager, damit man sie auseinanderhält
  const KS_TYP = {
    bnc: { name: 'BNC (Video)', kabel: '#e0a92c', mantel: '#8a6713' },
    hdmi: { name: 'HDMI', kabel: '#23242a', mantel: '#0c0d10' },
    schuko: { name: 'Schuko (Strom)', kabel: '#f1f1f5', mantel: '#6e6e78' },
    cat: { name: 'CAT (Netzwerk)', kabel: '#2f7fe0', mantel: '#16467f' },
  };
  const KS_TYPEN = Object.keys(KS_TYP);
  // Steckerform, Nase zeigt nach +x
  const KS_FORM = {
    bnc: '<rect x="-4.6" y="-1.5" width="3.6" height="3" rx=".5" fill="#2a2b2f"/><rect x="-1.6" y="-1.9" width="2" height="3.8" rx=".45" fill="#c9ccd1"/><rect x="-.5" y="-1.2" width="1.5" height="2.4" rx=".3" fill="#d8b23c"/><circle cx=".9" cy="0" r=".45" fill="#8a8f96"/>',
    hdmi: '<rect x="-4.8" y="-1.8" width="3.2" height="3.6" rx=".5" fill="#1a1b1f"/><path d="M-1.8,-1.5 L.9,-1.05 L.9,1.05 L-1.8,1.5 Z" fill="#b9bec6"/><path d="M-1.3,-.95 L.5,-.65 L.5,.65 L-1.3,.95 Z" fill="#3c3f45"/>',
    schuko: '<rect x="-4.8" y="-2" width="2.8" height="4" rx=".7" fill="#1d1e22"/><path d="M-2.2,-2.2 a2.3,2.3 0 0 1 0,4.4 z" fill="#2a2c31"/><rect x="-.6" y="-1.15" width="2" height=".75" rx=".3" fill="#c7ccd2"/><rect x="-.6" y=".4" width="2" height=".75" rx=".3" fill="#c7ccd2"/>',
    cat: '<rect x="-4.6" y="-1.7" width="3.4" height="3.4" rx=".45" fill="#cfd4da"/><rect x="-3.9" y="-2.9" width="1.5" height="1.3" rx=".35" fill="#b7bcc3"/><rect x="-1.4" y="-1.3" width="2.1" height="2.6" rx=".3" fill="#e4e8ec"/><rect x="-.9" y="-.85" width="1.4" height="1.7" rx=".2" fill="#9aa0a7"/>',
  };
  const KS = { offen: false, stufe: 0, pos: [], kanten: [], typ: [], t0: 0, lauf: false, tick: null, pfade: [], mantel: [], stecker: [], punkte: [], linien: [] };

  // Kabel hängen durch – die Kurve ist auch die Grundlage fürs Kreuzungszählen
  function ksKurve(a, b) {
    const p = KS.pos[a], q = KS.pos[b];
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    return { p, q, c: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + d * 0.09 } };
  }
  const ksD = (k) => `M${k.p.x.toFixed(2)},${k.p.y.toFixed(2)} Q${k.c.x.toFixed(2)},${k.c.y.toFixed(2)} ${k.q.x.toFixed(2)},${k.q.y.toFixed(2)}`;
  function ksLinie(a, b) {              // Kurve in kurze Stücke zerlegen
    const k = ksKurve(a, b); const out = [];
    for (let t = 0; t <= 10; t++) { const u = t / 10, m = 1 - u;
      out.push({ x: m * m * k.p.x + 2 * m * u * k.c.x + u * u * k.q.x, y: m * m * k.p.y + 2 * m * u * k.c.y + u * u * k.q.y }); }
    return out;
  }
  const ksOri = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const ksKreuz = (p1, p2, p3, p4) => { const o1 = ksOri(p1, p2, p3), o2 = ksOri(p1, p2, p4), o3 = ksOri(p3, p4, p1), o4 = ksOri(p3, p4, p2); return o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4; };
  // Schnittpunkt zweier Strecken – damit die Stelle markiert werden kann, an der es hakt
  function ksTreff(p1, p2, p3, p4) {
    const a = p2.x - p1.x, b = p4.x - p3.x, c = p2.y - p1.y, d = p4.y - p3.y;
    const nen = a * d - c * b; if (!nen) return null;
    const t = ((p3.x - p1.x) * d - (p3.y - p1.y) * b) / nen;
    return { x: p1.x + a * t, y: p1.y + c * t };
  }
  function ksPruefen() {
    const k = KS.kanten; const bahn = k.map(([a, b]) => ksLinie(a, b)); const treffer = []; let n = 0;
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
      if (k[i][0] === k[j][0] || k[i][0] === k[j][1] || k[i][1] === k[j][0] || k[i][1] === k[j][1]) continue;  // gemeinsame Buchse zählt nicht
      let punkt = null;
      for (let x = 0; x < bahn[i].length - 1 && !punkt; x++) for (let y = 0; y < bahn[j].length - 1; y++) {
        if (ksKreuz(bahn[i][x], bahn[i][x + 1], bahn[j][y], bahn[j][y + 1])) { punkt = ksTreff(bahn[i][x], bahn[i][x + 1], bahn[j][y], bahn[j][y + 1]); break; }
      }
      if (punkt) { n++; treffer.push(punkt); }
    }
    const g = document.querySelector('#ksSpiel .ks-kreuz');
    if (g) g.innerHTML = treffer.map((t) => `<circle class="ks-xp" cx="${t.x.toFixed(2)}" cy="${t.y.toFixed(2)}" r="1.9"/>`).join('');
    return n;
  }
  function ksBauen(anz) {
    const kanten = []; for (let i = 0; i < anz; i++) kanten.push([i, (i + 1) % anz]);
    const zwischen = (x, p, q) => (p < q ? x > p && x < q : x > p || x < q);
    const kreuztAufKreis = (a, b, c, d) => zwischen(c, a, b) !== zwischen(d, a, b);
    let versuche = anz * 12; const ziel = anz + Math.floor(anz / 2);
    while (versuche-- > 0 && kanten.length < ziel) {
      const a = (Math.random() * anz) | 0, b = (Math.random() * anz) | 0;
      if (a === b || (a + 1) % anz === b || (b + 1) % anz === a) continue;
      if (kanten.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
      if (kanten.some(([p, q]) => p !== a && p !== b && q !== a && q !== b && kreuztAufKreis(a, b, p, q))) continue;
      kanten.push([a, b]);
    }
    KS.kanten = kanten;
    KS.typ = kanten.map((_, i) => KS_TYPEN[i % KS_TYPEN.length]).sort(() => Math.random() - 0.5);
    for (let run = 0; run < 60; run++) {
      // auf ein grobes Raster verteilen und dann verwackeln – so ist das Feld gleichmäßig voll
      const spalten = Math.ceil(Math.sqrt(anz)), zeilen = Math.ceil(anz / spalten);
      const felder = [];
      for (let r = 0; r < zeilen; r++) for (let c = 0; c < spalten; c++) felder.push([c, r]);
      felder.sort(() => Math.random() - 0.5);
      const bx = 76 / spalten, by = 76 / zeilen;
      const pos = felder.slice(0, anz).map(([c, r]) => ({
        x: 12 + (c + 0.5) * bx + (Math.random() - 0.5) * bx * 0.55,
        y: 12 + (r + 0.5) * by + (Math.random() - 0.5) * by * 0.55,
      }));
      KS.pos = pos;
      let n = 0;
      for (let i = 0; i < kanten.length; i++) for (let j = i + 1; j < kanten.length; j++) {
        if (kanten[i][0] === kanten[j][0] || kanten[i][0] === kanten[j][1] || kanten[i][1] === kanten[j][0] || kanten[i][1] === kanten[j][1]) continue;
        const A = ksLinie(kanten[i][0], kanten[i][1]), B = ksLinie(kanten[j][0], kanten[j][1]);
        let kreuzt = false;
        for (let x = 0; x < A.length - 1 && !kreuzt; x++) for (let y = 0; y < B.length - 1; y++) if (ksKreuz(A[x], A[x + 1], B[y], B[y + 1])) { kreuzt = true; break; }
        if (kreuzt) n++;
      }
      if (n >= Math.max(3, Math.floor(anz / 2))) return;
    }
  }
  const ksZeit = () => (KS.lauf || KS.t0 ? (Date.now() - KS.t0) / 1000 : 0);
  const ksFmt = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + ' min' : (Math.round(s * 10) / 10).toString().replace('.', ',') + ' s');
  function ksInfo(txt) { const e = document.querySelector('#ksSpiel .ks-info'); if (e) e.innerHTML = txt; }
  function ksStand() {
    const n = ksPruefen();
    ksInfo(`<b>${ksFmt(ksZeit())}</b> · ${n ? n + (n === 1 ? ' Kreuzung' : ' Kreuzungen') : 'kein Kabel kreuzt mehr 🎉'}`);
    return n;
  }
  async function ksGewonnen(sek) {
    KS.lauf = false; clearInterval(KS.tick); KS.tick = null;
    konfetti();
    const mail = ((S.user || {}).email || '').toLowerCase();
    const name = ((S.techs || []).find((t) => (t.email || '').toLowerCase() === mail) || {}).name
      || ((S.viewers || []).find((v) => (v.email || '').toLowerCase() === mail) || {}).name
      || (S.admin && typeof CFG !== 'undefined' && CFG.senderName) || (mail ? mail.split('@')[0] : 'Du');
    let platz = '';
    try {
      const top = await store.kabelTop();
      const meins = top.find((x) => x.name === name);
      if (!meins || sek < meins.sek) { await store.kabelSave(name, Math.round(sek * 10) / 10, KS.stufe + 1); platz = ' <b>Neue Bestzeit!</b>'; }
    } catch (e) { /* Rangliste ist Beiwerk */ }
    ksInfo(`🎉 Entwirrt in <b>${ksFmt(sek)}</b>${platz}`);
    const f = document.querySelector('#ksSpiel .ks-feld'); if (f) f.classList.add('fertig');
    setTimeout(ksRangliste, 1200);
  }
  async function ksRangliste() {
    const box = document.querySelector('#ksSpiel .ks-rang'); if (!box) return;
    box.innerHTML = '<p class="ks-leer">Rangliste wird geladen …</p>'; box.classList.add('auf');
    let top = [];
    try { top = await store.kabelTop(); } catch (e) { top = []; }
    box.innerHTML = top.length
      ? `<h4>Bestzeiten</h4><ol>${top.slice(0, 10).map((x) => `<li><span>${esc(x.name || x.email)}</span><em>${ksFmt(+x.sek)}</em><small>${(KS_STUFEN[(x.stufe || 1) - 1] || [''])[0]}</small></li>`).join('')}</ol>`
      : '<p class="ks-leer">Noch keine Bestzeit – du kannst die erste sein.</p>';
  }
  function ksZeichnen() {
    let o = document.getElementById('ksSpiel');
    if (!KS.offen) { if (o) o.remove(); clearInterval(KS.tick); KS.tick = null; return; }
    if (!o) { o = document.createElement('div'); o.id = 'ksSpiel'; o.className = 'ks'; document.body.appendChild(o); }
    const typen = [...new Set(KS.typ)];
    o.innerHTML = `<div class="ks-box">
      <div class="ks-kopf"><b>🔌 Kabelsalat</b><span class="ks-info"></span><button class="ks-x" aria-label="Schließen">✕</button></div>
      <p class="ks-hilfe">Zieh die Buchsen auseinander, bis sich kein Kabel mehr kreuzt. Die roten Punkte zeigen, wo noch etwas übereinander liegt.</p>
      <svg class="ks-feld" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <g class="ks-kabel">${KS.kanten.map((_, i) => `<path class="ks-m" style="stroke:${KS_TYP[KS.typ[i]].mantel}" /><path class="ks-l" style="stroke:${KS_TYP[KS.typ[i]].kabel}" />`).join('')}</g>
        <g class="ks-st">${KS.kanten.map((_, i) => `<g class="ks-s2">${KS_FORM[KS.typ[i]]}</g><g class="ks-s2">${KS_FORM[KS.typ[i]]}</g>`).join('')}</g>
        <g class="ks-kreuz"></g>
        <g class="ks-bu">${KS.pos.map((p, i) => `<g class="ks-p" data-i="${i}" transform="translate(${p.x},${p.y})"><rect x="-4.6" y="-4.6" width="9.2" height="9.2" rx="1.6" fill="#3a3d44"/><rect x="-3.4" y="-3.4" width="6.8" height="6.8" rx="1.1" fill="#16181c"/><circle r="1.5" fill="#2c2f35"/></g>`).join('')}</g>
      </svg>
      <div class="ks-typen">${typen.map((t) => `<span class="ks-t"><i style="background:${KS_TYP[t].kabel};outline:1px solid ${KS_TYP[t].mantel}"></i>${esc(KS_TYP[t].name)}</span>`).join('')}</div>
      <div class="ks-rang"></div>
      <div class="ks-fuss">
        <div class="ks-stufen">${KS_STUFEN.map(([n], i) => `<button class="ks-s ${i === KS.stufe ? 'on' : ''}" data-ks="${i}">${n}</button>`).join('')}</div>
        <span class="ks-sp"></span>
        <button class="ks-btn" data-ksneu>Neu mischen</button>
        <button class="ks-btn" data-ksrang>🏆 Rangliste</button>
      </div></div>`;
    const kab = [...o.querySelectorAll('.ks-kabel > path')];
    KS.mantel = kab.filter((_, i) => i % 2 === 0); KS.pfade = kab.filter((_, i) => i % 2 === 1);
    KS.stecker = [...o.querySelectorAll('.ks-st > g')];
    KS.punkte = [...o.querySelectorAll('.ks-p')];
    ksKanten(); ksStand();
    o.querySelector('.ks-x').onclick = ksZu;
    o.querySelector('[data-ksneu]').onclick = () => ksStart(KS.stufe);
    o.querySelector('[data-ksrang]').onclick = ksRangliste;
    o.querySelectorAll('[data-ks]').forEach((b) => (b.onclick = () => ksStart(+b.dataset.ks)));
    o.addEventListener('pointerdown', (e) => { if (e.target === o) ksZu(); });
    ksZiehen(o.querySelector('.ks-feld'));
  }
  function ksKanten() {
    KS.kanten.forEach(([a, b], i) => {
      const k = ksKurve(a, b); const d = ksD(k);
      if (KS.pfade[i]) KS.pfade[i].setAttribute('d', d);
      if (KS.mantel[i]) KS.mantel[i].setAttribute('d', d);
      // Stecker sitzen kurz vor der Buchse und zeigen mit der Nase hinein
      [[k.p, k.c, 2 * i], [k.q, k.c, 2 * i + 1]].forEach(([ende, ctrl, idx]) => {
        const g = KS.stecker[idx]; if (!g) return;
        const dx = ctrl.x - ende.x, dy = ctrl.y - ende.y, len = Math.hypot(dx, dy) || 1;
        const x = ende.x + (dx / len) * 5.4, y = ende.y + (dy / len) * 5.4;
        const grad = (Math.atan2(ende.y - y, ende.x - x) * 180) / Math.PI;
        g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${grad.toFixed(1)})`);
      });
    });
  }
  function ksZiehen(svg) {
    if (!svg) return;
    let akt = -1;
    const wo = (e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }; };
    svg.addEventListener('pointerdown', (e) => {
      const p = e.target.closest && e.target.closest('.ks-p'); if (!p) return;
      akt = +p.dataset.i; p.classList.add('zieh'); svg.setPointerCapture(e.pointerId); e.preventDefault();
      if (!KS.lauf) { KS.lauf = true; KS.t0 = Date.now(); KS.tick = setInterval(ksStand, 100); }
    });
    svg.addEventListener('pointermove', (e) => {
      if (akt < 0) return;
      const q = wo(e);
      KS.pos[akt] = { x: Math.max(6, Math.min(94, q.x)), y: Math.max(6, Math.min(94, q.y)) };
      KS.punkte[akt].setAttribute('transform', `translate(${KS.pos[akt].x},${KS.pos[akt].y})`);
      ksKanten();
    });
    const los = () => {
      if (akt < 0) return;
      KS.punkte[akt].classList.remove('zieh'); akt = -1;
      if (ksStand() === 0 && KS.lauf) ksGewonnen(ksZeit());
    };
    svg.addEventListener('pointerup', los); svg.addEventListener('pointercancel', los);
  }
  function ksStart(stufe) {
    KS.stufe = Math.max(0, Math.min(KS_STUFEN.length - 1, stufe || 0));
    KS.lauf = false; KS.t0 = 0; clearInterval(KS.tick); KS.tick = null;
    ksBauen(KS_STUFEN[KS.stufe][1]);
    KS.offen = true; ksZeichnen();
  }
  function ksZu() { KS.offen = false; KS.lauf = false; clearInterval(KS.tick); KS.tick = null; ksZeichnen(); }
  function kabel() { if (!S.user) return; ksStart(KS.stufe); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && KS.offen) ksZu(); });
  (function () {
    const CODE = 'kabelsalat'; let buf = '';
    document.addEventListener('keydown', (e) => {
      if (!S.user || !e.key || e.key.length !== 1) return;
      const t = e.target; if (t && /input|textarea|select/i.test(t.tagName)) return;
      buf = (buf + e.key.toLowerCase()).slice(-12); if (buf.endsWith(CODE)) { buf = ''; kabel(); }
    });
    document.addEventListener('input', (e) => { if (!S.user) return; const t = e.target; if (!t || typeof t.value !== 'string' || !t.value) return;
      if (t.value.toLowerCase().trim().endsWith(CODE)) { t.value = t.value.slice(0, -CODE.length).trim(); t.blur(); kabel(); } });
  })();

  window.KOM27Fun = { konfetti, feuerwerk, sync, oeffnen, dekoSaison, dekoAn, dekoStart, dekoToggle, kabel };
})();
