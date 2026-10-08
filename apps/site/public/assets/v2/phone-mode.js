/* Phone mode: when a phone shows the "Desktop site" / "Request Desktop Website" version of the page (a browser
   setting most visitors don't know about), lay the page out as the phone version anyway. The phone still reports its
   real screen size, so: width media queries are re-decided for that width, vw/vh are re-based on the screen (style
   sheets and inline styles), matchMedia/innerWidth answer the same way, and the page is zoomed so the phone layout
   fills the screen at normal reading size. Originals are kept, so turning the phone re-decides everything, and the
   page goes back to normal when the shrink no longer applies. Runs inline in <head>, before any other script. */
(function () {
  try {
    var de = document.documentElement, w = window;
    if (!w.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
    var a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height);
    if (!a || a > 600) return;                                     // phones only: never tablets, laptops or desktops
    var on = false, W = 0, H = 0;
    if ((de.clientWidth || w.innerWidth) <= b * 1.1) return;      // laid out at the real screen width: a normal phone, nothing to do
    var state = function () {
      var lw = de.clientWidth || w.innerWidth, lh = de.clientHeight || w.innerHeight;
      var sw = lw > lh ? b : a;                                    // iPhones report the upright width even when turned sideways
      return { on: lw >= sw * 1.6, W: sw, z: lw / sw, H: Math.round(lh / (lw / sw)) };
    };
    var mq = function (t) {                                        // width conditions decided for the phone's width
      return String(t).replace(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)/g, function (m, k, n, u) {
        var v = parseFloat(n) * (u === 'px' ? 1 : 16); return (k === 'min' ? W >= v : W <= v) ? '(min-width: 0px)' : '(max-width: 0px)'; });
    };
    var VU = /(-?[\d.]+)(d|s|l)?v(w|h)\b/g, hasVU = /[\d.](d|s|l)?v[wh]\b/;
    var vu = function (v) { return v.replace(VU, function (m, n, x, ax) { return (parseFloat(n) * (ax === 'w' ? W : H) / 100).toFixed(2) + 'px'; }); };
    var media = [], decl = [], inl = new Map(), seen = new WeakSet(), mine = new WeakMap();
    var collect = function (rules) {                               // remember every rule we may need to rewrite, with its original text
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i]; if (seen.has(r)) continue; seen.add(r);
        if (r.media && r.cssRules && /-width/.test(r.media.mediaText)) media.push([r, r.media.mediaText]);
        if (r.style) for (var j = 0; j < r.style.length; j++) {
          var p = r.style[j], val = r.style.getPropertyValue(p);
          if (hasVU.test(val)) decl.push([r.style, p, val, r.style.getPropertyPriority(p)]);
        }
        if (r.cssRules) collect(r.cssRules);
      }
    };
    var sheets = function () { for (var s = 0; s < document.styleSheets.length; s++) { try { collect(document.styleSheets[s].cssRules); } catch (e) {} } };
    var inline = function (root) {                                 // inline style="" attributes under root
      if (root.nodeType === 1 && root.hasAttribute('style')) note(root);
      var els = root.querySelectorAll ? root.querySelectorAll('[style]') : [];
      for (var i = 0; i < els.length; i++) note(els[i]);
    };
    var note = function (el) {
      var cur = el.getAttribute('style') || '';
      if (mine.get(el) === cur) return;                            // the value we wrote ourselves
      if (hasVU.test(cur)) inl.set(el, cur); else inl.delete(el);
      if (on) paintEl(el);
    };
    var paintEl = function (el) {
      var orig = inl.get(el); if (orig === undefined) return;
      var v = on ? vu(orig) : orig; mine.set(el, v); if (el.getAttribute('style') !== v) el.setAttribute('style', v);
    };
    var paint = function () {                                      // apply (on) or restore (off) from the originals
      for (var i = 0; i < media.length; i++) { var t = on ? mq(media[i][1]) : media[i][1]; if (media[i][0].media.mediaText !== t) media[i][0].media.mediaText = t; }
      for (var j = 0; j < decl.length; j++) { var d = decl[j]; d[0].setProperty(d[1], on ? vu(d[2]) : d[2], d[3]); }
      inl.forEach(function (v, el) { if (el.isConnected) paintEl(el); else inl.delete(el); });
    };
    var update = function () {
      var s = state(); sheets(); inline(de);
      if (s.on === on && (!on || (s.W === W && s.H === H))) return;
      on = s.on; W = s.W; H = s.H;
      if (on) { de.classList.add('phone-mode'); de.style.zoom = s.z; } else { de.classList.remove('phone-mode'); de.style.zoom = ''; }
      paint();
    };
    var mm = w.matchMedia.bind(w);
    w.matchMedia = function (t) { return mm(on ? mq(t) : t); };
    var iw = Object.getOwnPropertyDescriptor(w, 'innerWidth');
    if (iw && iw.get && iw.configurable) Object.defineProperty(w, 'innerWidth', { configurable: true, enumerable: true, get: function () { return on ? W : iw.get.call(w); } });
    update();
    var later = function () { sheets(); inline(de); paint(); };
    document.addEventListener('DOMContentLoaded', later); w.addEventListener('load', later);
    var t; var re = function () { clearTimeout(t); t = setTimeout(update, 120); };
    w.addEventListener('resize', re); w.addEventListener('orientationchange', re);
    if (w.MutationObserver) new MutationObserver(function (ms) {
      var css = false;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'attributes') { note(m.target); continue; }
        for (var k = 0; k < m.addedNodes.length; k++) { var n = m.addedNodes[k]; if (n.nodeType !== 1) continue; if (n.tagName === 'STYLE' || n.tagName === 'LINK') css = true; else inline(n); }
      }
      if (css) setTimeout(later, 0);
    }).observe(de, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  } catch (e) {}
})();
