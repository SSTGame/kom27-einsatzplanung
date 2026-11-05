/* Hell/Dunkel: folgt dem Gerät, bis man selbst umschaltet – die Wahl merkt sich der Browser */
(function () {
  var K = 'kom27-theme', root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var own = function () { try { return localStorage.getItem(K); } catch (e) { return null; } };
  var cur = function () { return own() || (mq && mq.matches ? 'dark' : 'light'); };
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  // Symbol zeigt, wohin der Knopf wechselt
  var ico = function () { return cur() === 'dark' ? SUN : MOON; };
  var label = function () { return cur() === 'dark' ? 'Hell' : 'Dunkel'; };
  var paint = function () {
    var t = cur(); root.setAttribute('data-theme', t);
    document.querySelectorAll('meta[name=theme-color]').forEach(function (m) { m.setAttribute('content', t === 'dark' ? '#0f151c' : '#eef0f3'); m.removeAttribute('media'); });
    document.querySelectorAll('[data-themetg]').forEach(function (b) { b.innerHTML = ico() + '<span class="tt-l">' + label() + '</span>'; b.title = b.ariaLabel = 'Zu ' + label() + ' wechseln'; });
  };
  paint();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!own()) paint(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-themetg]'); if (!b) return;
    try { localStorage.setItem(K, cur() === 'dark' ? 'light' : 'dark'); } catch (x) { }
    paint();
  });
  window.KOM27Theme = { btn: function (cls) { return '<button type="button" class="theme-tg ' + (cls || '') + '" data-themetg title="Zu ' + label() + ' wechseln" aria-label="Zu ' + label() + ' wechseln">' + ico() + '<span class="tt-l">' + label() + '</span></button>'; }, paint: paint };
  document.addEventListener('DOMContentLoaded', paint);
})();
