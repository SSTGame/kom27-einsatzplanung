// Füllt Impressum/Datenschutz mit den Angaben aus config.js (KOM27_CONFIG.legal)
(function () {
  var L = (window.KOM27_CONFIG && window.KOM27_CONFIG.legal) || {};
  var miss = '<span class="lg-miss">noch einzutragen</span>';
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  document.querySelectorAll('[data-f]').forEach(function (el) {
    var k = el.getAttribute('data-f'); var v = L[k];
    if (k === 'zusatz') { if (v) el.innerHTML = esc(v).replace(/\n/g, '<br>'); else el.remove(); return; }
    if (!v) { el.innerHTML = miss; return; }
    if (k === 'email') el.innerHTML = '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
    else if (k === 'telefon') el.innerHTML = '<a href="tel:' + esc(v.replace(/[^\d+]/g, '')) + '">' + esc(v) + '</a>';
    else el.textContent = v;
  });
})();
