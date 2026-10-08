/* SpecialMe demo: shared PDF reader (pdf.js text with column markers, OCR for scanned pages). Runs in this browser. Nothing is uploaded. */
(function () {
  'use strict';
  var X = window.SpecialMeExtract, pdfjs = window.pdfjsLib, say = function () {};
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  var MAX_PAGES = 40;
  function pageText(page) {
    var vp = page.getViewport({ scale: 1 });
    return page.getTextContent().then(function (tc) {
      var items = [];
      tc.items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var t = pdfjs.Util.transform(vp.transform, it.transform); // handles rotated pages
        items.push({ x: t[4], y: t[5], s: it.str, w: it.width * (vp.scale || 1) });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      var rows = [];
      items.forEach(function (it) {
        var r = rows[rows.length - 1];
        if (r && Math.abs(r.y - it.y) <= 3.5) { r.parts.push(it); r.y = (r.y * (r.parts.length - 1) + it.y) / r.parts.length; }
        else rows.push({ y: it.y, parts: [it] });
      });
      return rows.map(function (r) {
        r.parts.sort(function (a, b) { return a.x - b.x; });
        var s = '', prevEnd = null;
        r.parts.forEach(function (p, i) {
          var gap = prevEnd == null ? 99 : p.x - prevEnd;
          if (gap > 12) s += (i ? ' ' : '') + '\u2016' + Math.round(p.x) + '\u2016' + p.s; // new column segment
          else s += (gap > 0.5 ? ' ' : '') + p.s;
          prevEnd = p.x + p.w;
        });
        return s;
      }).join('\n');
    });
  }

  var MAX_OCR_PAGES = 12, ocrWorker = null;
  function loadScript(src) {
    return new Promise(function (ok, bad) { var t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = bad; document.head.appendChild(t); });
  }
  function getOcr() {
    if (ocrWorker) return ocrWorker;
    say('Getting the scan reader ready (one-time download, about 8 MB)…');
    ocrWorker = (window.Tesseract ? Promise.resolve() : loadScript('vendor/ocr/tesseract.min.js')).then(function () {
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: 'vendor/ocr/worker.min.js', corePath: 'vendor/ocr/', langPath: 'vendor/ocr/', gzip: true, workerBlobURL: false
      });
    });
    ocrWorker.catch(function () { ocrWorker = null; });
    return ocrWorker;
  }
  function ocrPage(page, label) {
    var vp0 = page.getViewport({ scale: 1 });
    var vp = page.getViewport({ scale: Math.min(3, Math.max(1.5, 2200 / Math.max(vp0.width, vp0.height * 0.8))) });
    var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () {
      return getOcr();
    }).then(function (w) {
      say(label);
      return w.recognize(cv);
    }).then(function (r) { cv.width = cv.height = 0; return r.data.text || ''; });
  }

  function readPdf(buf) {
    return pdfjs.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise.then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGES), pages = [];
      var chain = Promise.resolve(), scanned = 0, skipped = 0;
      function step(i) {
        return doc.getPage(i).then(function (pg) {
          return pageText(pg).then(function (txt) {
            if (txt.replace(/\s/g, '').length >= 40) { pages[i - 1] = txt; return; }
            if (scanned >= MAX_OCR_PAGES) { skipped++; pages[i - 1] = ''; return; }
            scanned++;
            return ocrPage(pg, 'Reading scanned page ' + i + ' of ' + n + '… this takes a few seconds per page.').then(function (t) { pages[i - 1] = t; });
          });
        });
      }
      for (var i = 1; i <= n; i++) (function (k) { chain = chain.then(function () { return step(k); }); })(i);
      return chain.then(function () { return { text: X.stripRepeats(pages.map(function (p) { return p || ''; })).join('\n\n'), pages: doc.numPages, scanned: scanned, skipped: skipped }; });
    });
  }


  window.SpecialMeReader = { MAX_BYTES: 20 * 1024 * 1024, read: function (buf, sayFn) { say = sayFn || function () {}; return readPdf(buf); } };
})();
