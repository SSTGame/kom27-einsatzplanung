/* KOM27 VA-Kalender Parser – liest die Excel (ExcelJS-Workbook) und liefert Tage + Techniker-Slots.
   Läuft im Browser (window.KOM27Parser) und in Node (module.exports). */
(function (root) {
  const MULTI = { 'FFFFFF00': 'gelb', 'FFFFC000': 'orange', 'FFFDE9D9': 'rosa' };
  const FREE = 'FF00B0F0';      // Frei bzw. Setuptage (blau)
  const CANCEL = 'FFFF0000';    // VA abgesagt (rot)

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
    const col = { anz: 4, name: 5, zeit: 6, va: 9, buch: 0, einlass: 0, vazeit: 0, rooms: [] };
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
        cur = { date: iso(aVal), rows: [], free: fillOf(ws.getCell(r, 1)) === FREE, cancelled: false, blocked: false, anzahl: 0, kom: [] };
        days.push(cur);
      } else if (!cur) continue;
      komCols.forEach(([c, n]) => { if (/^x+$/i.test(clean(ws.getCell(r, c).value)) && !cur.kom.includes(n)) cur.kom.push(n); });
      const cells = { d: ws.getCell(r, col.anz), e: ws.getCell(r, col.name), f: ws.getCell(r, col.zeit), i: ws.getCell(r, col.va) };
      const anz = parseInt(clean(cells.d.value), 10);
      if (aVal instanceof Date && !isNaN(anz)) cur.anzahl = anz;
      if (fillOf(cells.e) === 'TH1' || fillOf(cells.d) === 'TH1') cur.blocked = true;
      if ([cells.d, cells.e, cells.i].some((c) => fillOf(c) === CANCEL)) cur.cancelled = true;
      const rooms = col.rooms.map(([c, n]) => { const v = clean(ws.getCell(r, c).value); return v ? n + ': ' + v : ''; }).filter(Boolean);
      cur.rows.push({
        row: r,
        name: clean(cells.e.value),
        zeit: clean(cells.f.value).replace(/\./g, ':'),
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
      const day = { date: d.date, anzahl: d.anzahl, free: d.free, cancelled: d.cancelled, blocked: d.blocked, kom: d.kom || [], vas: [], info: '', slots: [] };
      d.rows.forEach((r) => { const id = vaId(r.va); if (r.va) day.vas.push(r.va); if (r.info && !day.info) day.info = r.info; r._va = id; });
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
      // Mehr Zeilen als „Anzahl“: überzählige Zeilen ohne Namen sind parallele VAs desselben Einsatzes
      if (d.anzahl && merged.length > d.anzahl) {
        for (let i = merged.length - 1; i >= 0 && merged.length > d.anzahl; i--) {
          if (merged[i].name) continue;
          const [x] = merged.splice(i, 1);
          const tgt = merged.find((y) => y.zeit === x.zeit) || merged[0];
          if (tgt && x._va && x._va !== tgt._va) tgt.also = tgt.also.concat(x._va);
        }
      }
      slotRows.length = 0; merged.forEach((s) => slotRows.push(s));
      // Fehlende Plätze bis "Anzahl" auffüllen
      const need = Math.max(d.anzahl || 0, d.anzahl ? 0 : slotRows.length);
      while (slotRows.length < need) {
        const base = slotRows[slotRows.length - 1] || d.rows[0];
        slotRows.push({ ...base, name: '', also: [], zeit: base.zeit || '' });
      }
      if (!d.anzahl && slotRows.length && !slotRows.some((s) => s.zeit)) slotRows.length = 0;
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
        day.slots.push({ key: d.date + '#' + vk + '#' + n, date: d.date, idx, zeit: s.zeit, excelName: s.name, note: s.note || '', va: va, also: [...new Set((s.also || []).filter((x) => x && x !== va))], color: color || null, label: s.va || '',
          det: { buch: s.buch || '', einlass: s.einlass || '', vazeit: s.vazeit || '', rooms: s.rooms || [], extras: s.extras || [] } });
      });
      day.vaIds = [...new Set(d.rows.map((r) => r._va).filter(Boolean))];
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
      if (!m) { const c = Object.assign({}, d, { slots: (d.slots || []).slice() }); by.set(d.date, c); out.push(c); return; }
      const uni = (a, b) => [...new Set([...(a || []), ...(b || [])])];
      m.slots = m.slots.concat(d.slots || []);
      m.vas = uni(m.vas, d.vas); m.vaIds = uni(m.vaIds, d.vaIds); m.kom = (m.kom || d.kom) ? uni(m.kom, d.kom) : m.kom;
      m.info = [m.info, d.info].filter(Boolean).join(' · ');
      m.vazeit = [...new Set([m.vazeit, d.vazeit].filter(Boolean))].join(' / ');
      m.anzahl = (+m.anzahl || 0) + (+d.anzahl || 0);
      m.free = !!(m.free && d.free); m.blocked = !!(m.blocked || d.blocked); m.cancelled = !!(m.cancelled && d.cancelled);
    });
    return out;
  }

  const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  function parseWorkbook(wb) {
    let all = [];
    wb.eachSheet((ws) => { if (MONTHS.includes(ws.name.trim().toLowerCase())) all = all.concat(parseSheet(ws)); });
    all.sort((a, b) => a.date.localeCompare(b.date));
    const days = mergeDays(buildSlots(all));
    return { importedAt: new Date().toISOString(), days };
  }

  const api = { parseWorkbook, vaDays, mergeDays, VERSION: 3 }; // bei Änderungen an den Einleseregeln hochzählen
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KOM27Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
