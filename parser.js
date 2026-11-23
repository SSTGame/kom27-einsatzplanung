/* KOM27 VA-Kalender Parser – liest die Excel (ExcelJS-Workbook) und liefert Tage + Techniker-Slots.
   Läuft im Browser (window.KOM27Parser) und in Node (module.exports). */
(function (root) {
  const MULTI = { 'FFFFFF00': 'gelb', 'FFFFC000': 'orange', 'FFFDE9D9': 'rosa' };
  const FREE = 'FF00B0F0';      // Frei bzw. Setuptage (blau)
  // Schwarz heißt laut Legende „interner Block": derjenige ist an dem Tag nicht da
  const istSchwarz = (f) => !!f && (f === 'FF000000' || /^TH1(?:[+-]0\.[0-2]\d*)?$/.test(f));
  const CANCEL = 'FFFF0000';    // VA abgesagt (rot)
  const HAUS = 'FF92D050';      // grün in „Service Haus 1“: Betreuung durch Medientechnik KOM27 – dort findet eine Veranstaltung statt

  const fillOf = (cell) => {
    const f = cell && cell.fill;
    if (!f || f.type !== 'pattern' || !f.fgColor) return null;
    if (f.fgColor.argb) return f.fgColor.argb.toUpperCase();
    if (f.fgColor.theme !== undefined) return 'TH' + f.fgColor.theme + (f.fgColor.tint ? (f.fgColor.tint > 0 ? '+' : '') + f.fgColor.tint.toFixed(2) : '');
    return null;
  };
  const txt = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(11, 16);
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((r) => r.text).join('');
      if (v.text) return String(v.text);
      if (v.result !== undefined) return txt(v.result);
      return '';
    }
    return String(v);
  };
  const clean = (s) => txt(s).replace(/[\t\r]/g, ' ').replace(/\s+/g, ' ').trim();
  // mehrzeiliger Text (Ausstattungslisten): Zeilen behalten, Tabs/„| Stück“ entfernen
  const cleanML = (v) => txt(v).split(/\r?\n/).map((l) => l.replace(/\|\s*Stück/gi, '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const iso = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  const vaId = (s) => { const m = /VA\s*\d{6,}-\d+/i.exec(s || ''); return m ? m[0].replace(/\s/g, '').toUpperCase() : null; };
  const vaDays = (id) => { // VA26110405-01 -> ['04','05']
    const m = /^VA(\d{2})(\d{2})(\d+)-/.exec(id || '');
    if (!m) return [];
    const d = m[3]; const out = [];
    for (let i = 0; i + 1 < d.length + 1 && i < d.length; i += 2) out.push(d.slice(i, i + 2));
    return out;
  };
  const normName = (n) => {
    n = clean(n);
    if (!n || /^x+$/i.test(n) || n === '-' || n === '?') return '';
    return n;
  };

  function parseSheet(ws) {
    // Kopfzeile suchen (Spalte A = "Tag")
    let head = 0;
    for (let r = 1; r <= 20; r++) if (clean(ws.getCell(r, 1).value).toLowerCase() === 'tag') { head = r; break; }
    if (!head) return [];
    // Spalten anhand der Kopfzeile bestimmen
    const col = { anz: 4, name: 5, zeit: 6, va: 9, buch: 0, einlass: 0, vazeit: 0, anwesend: 0, zusatz: 0, rooms: [] };
    for (let c = 1; c <= 30; c++) {
      const h = clean(ws.getCell(head, c).value).toLowerCase();
      if (!h) continue;
      if (h === 'veranstaltung') col.va = c;
      else if (h.includes('buchungszeit')) col.buch = c;
      else if (h.includes('einlass')) col.einlass = c;
      else if (h.startsWith('va-uhrzeit') || h.startsWith('va-zeit')) col.vazeit = c;
      else if (/^(saal|seminar|foyer)/.test(h)) col.rooms.push([c, clean(ws.getCell(head, c).value)]);
    }
    if (!col.buch && col.vazeit) col.buch = 0;
    // „Anzahl“, „Name Techniker“ und „Einsatzzeit“ stehen ein bis zwei Zeilen unter der Kopfzeile.
    // Je nach Blatt sind sie verschoben (z. B. wenn eine Spalte wie „Service Haus 1“ dazukommt) – deshalb suchen statt raten.
    const unter = { anz: 0, name: 0, zeit: 0 };
    for (let r = head; r <= head + 2; r++) {
      for (let c = 1; c <= 30; c++) {
        const h = clean(ws.getCell(r, c).value).toLowerCase();
        if (!h) continue;
        if (!unter.anz && /^anzahl/.test(h)) unter.anz = c;
        if (!unter.name && /^name/.test(h)) unter.name = c;
        if (!unter.zeit && /^einsatzzeit/.test(h)) unter.zeit = c;
      }
    }
    if (unter.anz) { col.anz = unter.anz; col.name = unter.name || unter.anz + 1; col.zeit = unter.zeit || unter.anz + 2; }
    else if (unter.name) { col.name = unter.name; col.zeit = unter.zeit || unter.name + 1; col.anz = Math.max(1, unter.name - 1); }
    // „Anwesend laut Planung“ (Ersatz für eine fehlende Einsatzzeit) und „Zusatz / Anmerkung“ (z. B. „externes Haus“)
    for (let r = head; r <= head + 2; r++) {
      for (let c = 1; c <= 30; c++) {
        const h = clean(ws.getCell(r, c).value).toLowerCase();
        if (!h) continue;
        if (!col.anwesend && /^anwesend/.test(h)) col.anwesend = c;
        if (!col.zusatz && /(zusatz|anmerkung)/.test(h)) col.zusatz = c;
        if (!col.haus && /service\s*haus/.test(h)) col.haus = c;
      }
    }
    // Weitere Spalten (Bemerkungen, Hybrid, Diskussionsanlage, Zusatz …) mit Überschrift merken
    const used = new Set([col.anz, col.name, col.zeit, col.va, col.buch, col.einlass, col.vazeit, ...col.rooms.map((x) => x[0])]);
    const label = (c) => {
      const parts = [0, 1, 2].map((k) => clean(ws.getCell(head + k, c).value)).filter(Boolean);
      const out = [];
      parts.forEach((p) => { if (!out.some((o) => o.toLowerCase() === p.toLowerCase()) && !/^(service|anzahl)$/i.test(p)) out.push(p); });
      return out.join(' · ');
    };
    // Spalten „Medientechnik KOM27“ (vor „Anzahl“): Name steht eine Zeile darunter, „x“ = an dem Tag vor Ort
    const komCols = [];
    for (let c = 2; c < col.anz; c++) if (/medientechnik/i.test(clean(ws.getCell(head, c).value))) { const n = clean(ws.getCell(head + 1, c).value); if (n) komCols.push([c, n]); }
    komCols.forEach(([c]) => used.add(c));
    const extraCols = [];
    for (let c = col.zeit + 1; c <= Math.min(ws.columnCount || 35, 40); c++) { if (used.has(c) || c < 2) continue; const l = label(c); if (l) extraCols.push([c, l]); }
    const days = [];
    let cur = null;
    const last = Math.min(ws.rowCount, head + 120);
    for (let r = head + 3; r <= last; r++) {
      const aCell = ws.getCell(r, 1);
      const isSlave = aCell.isMerged && aCell.master && aCell.master.address !== aCell.address;
      const a = isSlave ? null : aCell.value;
      const aVal = a && a.result instanceof Date ? a.result : a;
      if (aVal instanceof Date) {
        cur = { date: iso(aVal), rows: [], free: fillOf(ws.getCell(r, 1)) === FREE, cancelled: false, blocked: false, anzahl: 0, kom: [], komWeg: [] };
        days.push(cur);
      } else if (!cur) continue;
      // „x“ heißt: der ist an dem Tag im Haus. Grün in „Service Haus 1“ heißt dasselbe – dort steht kein x, nur die Farbe.
      komCols.forEach(([c, n]) => {
        const cl = ws.getCell(r, c), f = fillOf(cl), txt = clean(cl.value);
        if (istSchwarz(f)) {
          // „interner Block" schlägt ein x: in der Excel bleibt das x oft stehen und wird nur schwarz überfärbt
          if (!cur.komWeg.includes(n)) cur.komWeg.push(n);
          cur.kom = cur.kom.filter((y) => y !== n);
          if (txt && !/^x+$/i.test(txt)) (cur.komWegNote = cur.komWegNote || {})[n] = txt;   // z. B. „Sommerpause 13.07-24.08"
        } else if (/^x+$/i.test(txt) || f === HAUS) {
          if (!cur.kom.includes(n) && !cur.komWeg.includes(n)) cur.kom.push(n);
        }
      });
      const cells = { d: ws.getCell(r, col.anz), e: ws.getCell(r, col.name), f: ws.getCell(r, col.zeit), i: ws.getCell(r, col.va) };
      const anz = parseInt(clean(cells.d.value), 10);
      if (aVal instanceof Date && !isNaN(anz)) cur.anzahl = anz;
      if (fillOf(cells.e) === 'TH1' || fillOf(cells.d) === 'TH1') cur.blocked = true;
      if ([cells.d, cells.e, cells.i].some((c) => fillOf(c) === CANCEL)) cur.cancelled = true;
      if (col.haus && fillOf(ws.getCell(r, col.haus)) === HAUS) cur.haus = true;
      const rooms = col.rooms.map(([c, n]) => { const v = clean(ws.getCell(r, c).value); return v ? n + ': ' + v : ''; }).filter(Boolean);
      const anwesend = col.anwesend ? clean(ws.getCell(r, col.anwesend).value) : '';
      const zusatz = col.zusatz ? clean(ws.getCell(r, col.zusatz).value) : '';
      // Manche Tage haben keine Einsatzzeit, aber „Anwesend laut Planung“ – dann gilt die
      const zeitRoh = clean(cells.f.value) || (/\d{1,2}[.:]\d{2}/.test(anwesend) ? anwesend : '');
      cur.rows.push({
        row: r,
        name: clean(cells.e.value),
        anwesend,
        zusatz,
        zeit: zeitRoh.replace(/\./g, ':'),
        va: clean(cells.i.value),
        color: MULTI[fillOf(cells.e)] || MULTI[fillOf(cells.i)] || null,
        vazeit: col.vazeit ? clean(ws.getCell(r, col.vazeit).value) : '',
        buch: col.buch ? clean(ws.getCell(r, col.buch).value) : '',
        info: rooms.join(' · '),
        einlass: col.einlass ? clean(ws.getCell(r, col.einlass).value) : '',
        rooms: col.rooms.map(([c, n]) => [n, cleanML(ws.getCell(r, c).value)]).filter((x) => x[1]),
        extras: extraCols.map(([c, l]) => [l, cleanML(ws.getCell(r, c).value)]).filter((x) => x[1] && !/^x$/i.test(x[1]))
      });
    }
    return days;
  }

  function buildSlots(days) {
    const out = [];
    let prev = null;
    for (const d of days) {
      const day = { date: d.date, anzahl: d.anzahl, free: d.free, cancelled: d.cancelled, blocked: d.blocked, haus: !!d.haus, kom: (d.kom || []).filter((n) => !(d.komWeg || []).includes(n)), komWeg: d.komWeg || [], komWegNote: d.komWegNote || null, vas: [], info: '', slots: [] };
      d.rows.forEach((r) => { const id = vaId(r.va); if (r.va) day.vas.push(r.va); if (r.info && !day.info) day.info = r.info; r._va = id;
        // „externes Haus“ / „interne Betreuung“ stehen als Text in Name, Zusatz oder Anmerkung – für KOM27 wichtig
        // auch die Anmerkungsspalten rechts außen mitlesen – dort steht es im 2026er Kalender
        const zusatzText = (r.extras || []).filter(([l]) => /(zusatz|anmerk|betreu|haus)/i.test(l)).map(([, v]) => v);
        const quellen = [r.zusatz, r.name, r.anwesend].concat(zusatzText).filter(Boolean);
        const woher = (re) => (quellen.find((v) => re.test(v)) || '').trim();
        if (!day.extern && quellen.some((v) => /extern/i.test(v))) day.extern = woher(/extern/i);
        if (!day.intern && quellen.some((v) => /intern\w*\s*betreu/i.test(v))) day.intern = woher(/intern\w*\s*betreu/i);
      });
      // Grün in „Service Haus 1“ sagt dasselbe wie der Text: die Medientechnik KOM27 betreut an dem Tag eine Veranstaltung
      if (day.haus && !day.intern && !day.extern) day.intern = 'Betreuung durch Medientechnik KOM27';
      day.vazeit = (d.rows.find((r) => r.vazeit) || {}).vazeit || '';
      // Zeilen mit Einsatzzeit oder Name = Slots; "Marcel/Basti" splitten
      const slotRows = [];
      d.rows.forEach((r) => {
        if (!r.zeit && !normName(r.name)) return;
        const parts = r.name.split(/\s*(?:\/|,|&|\+|\bund\b)\s*/i).map(normName).filter(Boolean);
        const isName = (n) => !/\d/.test(n) && n.split(' ').length <= 3 && !/pam|pause|extern|abbau|aufbau|betreuung/i.test(n);
        const names = parts.filter(isName);
        const note = parts.filter((n) => !isName(n)).join(', ');
        if (!names.length) slotRows.push({ ...r, name: '', note });
        else names.forEach((n) => slotRows.push({ ...r, name: n, note }));
      });
      // Dieselbe Person mehrfach am Tag (parallele VAs) = ein Einsatz
      const merged = [];
      slotRows.forEach((s) => {
        const k = s.name ? s.name.toLowerCase() : '';
        const m = k && merged.find((x) => x.name && x.name.toLowerCase() === k);
        if (m) { if (s._va && s._va !== m._va) m.also = (m.also || []).concat(s._va); return; }
        merged.push(Object.assign({}, s, { also: [] }));
      });
      // Spalte „Anzahl PAM“ gibt vor, wie viele Techniker der Tag braucht – die Namen in der Excel sind nur Vorschläge
      if (d.anzahl && merged.length > d.anzahl) {
        const fold = (x) => { const tgt = merged.find((y) => (y.zeit || '') === (x.zeit || '')) || merged[0];
          if (tgt && x._va && x._va !== tgt._va) tgt.also = tgt.also.concat(x._va);
          if (tgt && x.name && !String(tgt.auch || '').includes(x.name)) tgt.auch = [...(tgt.auch ? [tgt.auch] : []), x.name].join(', '); };
        // 1. Zeilen ohne Namen (parallele VAs desselben Einsatzes)
        for (let i = merged.length - 1; i >= 0 && merged.length > d.anzahl; i--) {
          if (merged[i].name) continue;
          fold(merged.splice(i, 1)[0]);
        }
        // 2. weitere Namen zur selben Uhrzeit – ein Platz je Uhrzeit
        for (let i = merged.length - 1; i >= 1 && merged.length > d.anzahl; i--) {
          if (!merged.some((y, j) => j < i && (y.zeit || '') === (merged[i].zeit || ''))) continue;
          fold(merged.splice(i, 1)[0]);
        }
        // 3. immer noch mehr Namen als gewünscht: von unten kürzen
        while (merged.length > d.anzahl) fold(merged.splice(merged.length - 1, 1)[0]);
      }
      slotRows.length = 0; merged.forEach((s) => slotRows.push(s));
      // Fehlende Plätze bis "Anzahl" auffüllen
      const need = Math.max(d.anzahl || 0, d.anzahl ? 0 : slotRows.length);
      while (slotRows.length < need) {
        const base = slotRows[slotRows.length - 1] || d.rows[0];
        slotRows.push({ ...base, name: '', also: [], zeit: base.zeit || '' });
      }
      // Ohne Zahl in „Anzahl PAM“ zählt ein eingetragener Name als ein Platz; bloße Notizen ohne Name und Zeit nicht
      if (!d.anzahl && slotRows.length && !slotRows.some((s) => s.zeit || s.name)) slotRows.length = 0;
      const dayVa = (d.rows.find((r) => r._va) || {})._va || null;
      slotRows.forEach((s, idx) => {
        let va = s._va || null, color = s.color;
        // VA-Nummer vom Vortag erben: gleiche Farbe oder Datumsbereich in der VA-Nummer
        if (!va && prev) {
          const dd = d.date.slice(8, 10);
          const sameCol = color && prev.slots.find((p) => p.color === color && p.va);
          const inRange = prev.slots.find((p) => p.va && vaDays(p.va).includes(dd)) || prev.vaIds.map((v) => ({ va: v })).find((p) => vaDays(p.va).includes(dd));
          va = (sameCol && sameCol.va) || (inRange && inRange.va) || null;
        }
        if (!va) va = dayVa;
        if (!color && va && prev) { const p = prev.slots.find((x) => x.va === va && x.color); if (p) color = p.color; }
        const vk = va || '-';
        const n = day.slots.filter((x) => (x.va || '-') === vk).length;
        day.slots.push({ key: d.date + '#' + vk + '#' + n, date: d.date, idx, zeit: s.zeit, excelName: s.name, excelAlso: s.auch || '', note: s.note || '', va: va, also: [...new Set((s.also || []).filter((x) => x && x !== va))], color: color || null, label: s.va || '',
          det: { buch: s.buch || '', einlass: s.einlass || '', vazeit: s.vazeit || '', rooms: s.rooms || [], extras: s.extras || [] } });
      });
      day.vaIds = [...new Set(d.rows.map((r) => r._va).filter(Boolean))];
      // Details auch für Veranstaltungen ohne PAM-Techniker (Einsatzzeit, VA-Zeit, Einlass, Aufbau …)
      day.vaDet = {};
      d.rows.forEach((r) => {
        if (!r.va || day.vaDet[r.va] || day.slots.some((x) => x.va && (x.va === r._va || x.va === r.va))) return;
        day.vaDet[r.va] = { zeit: r.zeit || '', label: r.va, buch: r.buch || '', einlass: r.einlass || '', vazeit: r.vazeit || '', rooms: r.rooms || [], extras: r.extras || [] };
      });
      prev = day;
      out.push(day);
    }
    // Mehrtägige Gruppen: gleiche VA-Nummer an mehreren Tagen
    const cnt = {};
    out.forEach((d) => new Set(d.slots.map((s) => s.va).filter(Boolean)).forEach((v) => (cnt[v] = (cnt[v] || 0) + 1)));
    out.forEach((d) => d.slots.forEach((s) => (s.group = s.va && cnt[s.va] > 1 ? s.va : null)));
    return out;
  }

  // Derselbe Tag kann in der Excel mehrfach vorkommen (z. B. zweite Veranstaltung weiter unten) – zu einem Tag zusammenfassen
  function mergeDays(days) {
    const by = new Map(); const out = [];
    (days || []).forEach((d) => {
      const m = by.get(d.date);
      const part = { vas: d.vas || [], info: d.info || '', vazeit: d.vazeit || '' };
      if (!m) { const c = Object.assign({}, d, { slots: (d.slots || []).slice(), parts: d.parts || [part] }); by.set(d.date, c); out.push(c); return; }
      m.parts = (m.parts || []).concat(d.parts || [part]);
      m.vaDet = Object.assign({}, m.vaDet || {}, d.vaDet || {});
      const uni = (a, b) => [...new Set([...(a || []), ...(b || [])])];
      m.slots = m.slots.concat(d.slots || []);
      m.vas = uni(m.vas, d.vas); m.vaIds = uni(m.vaIds, d.vaIds); m.kom = (m.kom || d.kom) ? uni(m.kom, d.kom) : m.kom;
      m.info = [m.info, d.info].filter(Boolean).join(' · ');
      m.vazeit = [...new Set([m.vazeit, d.vazeit].filter(Boolean))].join(' / ');
      m.anzahl = (+m.anzahl || 0) + (+d.anzahl || 0);
      m.free = !!(m.free && d.free); m.blocked = !!(m.blocked || d.blocked); m.cancelled = !!(m.cancelled && d.cancelled);
      m.extern = m.extern || d.extern; m.intern = m.intern || d.intern; m.haus = !!(m.haus || d.haus);
      (d.komWeg || []).forEach((n) => { if (!(m.komWeg || []).includes(n)) (m.komWeg = m.komWeg || []).push(n); });
      if (d.komWegNote) m.komWegNote = Object.assign({}, m.komWegNote || {}, d.komWegNote);
      if ((m.komWeg || []).length) m.kom = (m.kom || []).filter((n) => !m.komWeg.includes(n));
    });
    return out;
  }

  const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  function parseWorkbook(wb) {
    let all = [];
    wb.eachSheet((ws) => { if (MONTHS.includes(ws.name.trim().toLowerCase())) all = all.concat(parseSheet(ws)); });
    all.sort((a, b) => a.date.localeCompare(b.date));
    const days = mergeDays(buildSlots(all));
    // Tippfehler in VA-Nummern fallen sonst erst auf, wenn mehrtägige Veranstaltungen nicht zusammenfinden:
    // die Ziffern einer VA-Nummer sind das Datum (JJMMTT, bei mehrtägigen JJMMTTTT)
    const passt = (zif, date) => {
      const y = date.slice(2, 4) + date.slice(5, 7), t = date.slice(8, 10);
      if (zif.length === 6) return zif === y + t;
      if (zif.length === 8) return zif.slice(0, 4) === y && (zif.slice(4, 6) === t || zif.slice(6, 8) === t);
      return false;
    };
    const tage = new Map();                                        // VA-Nummer -> Tage, an denen sie vorkommt
    days.forEach((d) => [...new Set((d.vas || []).concat(d.slots.map((s) => s.va || '')))].filter(Boolean)
      .forEach((roh) => (String(roh).match(/VA\s?\d{4,10}\s?-\s?\d{1,2}/gi) || [])   // freier Text wie „Preisverleihung“ bleibt außen vor
        .forEach((tok) => { const v = tok.replace(/\s/g, ''); if (!tage.has(v)) tage.set(v, new Set()); tage.get(v).add(d.date); })));
    const vaWarn = [...tage.entries()].filter(([v, dts]) => {
      const m = v.match(/^VA(\d+)-(\d{1,2})$/i);
      return m && ![...dts].some((dt) => passt(m[1], dt));           // passt zu keinem ihrer Tage = vermutlich Zahlendreher
    }).map(([v, dts]) => ({ va: v, date: [...dts].sort()[0] }));
    return { importedAt: new Date().toISOString(), days, vaWarn };
  }

  const api = { parseWorkbook, vaDays, mergeDays, VERSION: 12 }; // bei Änderungen an den Einleseregeln hochzählen
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KOM27Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
