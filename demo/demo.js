/* SpecialMe demo page: reads a PDF in this browser with pdf.js, then runs SpecialMeExtract on the text.
   Nothing is uploaded. The only network call is the optional trial sign-up. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var X = window.SpecialMeExtract, pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  var MAX_BYTES = 20 * 1024 * 1024, MAX_PAGES = 40;
  var plan = [];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(msg, kind) { var s = $('status'); s.textContent = msg || ''; s.className = 'status ' + (kind || ''); }

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

  var MAX_OCR_PAGES = 40, ocrWorker = null;
  function loadScript(src) {
    return new Promise(function (ok, bad) { var t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = bad; document.head.appendChild(t); });
  }
  function poolSize() { var c = navigator.hardwareConcurrency || 2; return Math.max(1, Math.min(3, Math.floor(c / 2))); }
  function getPool(n) {
    if (ocrWorker) return ocrWorker;
    say('Getting the scan reader ready (one-time download, about 8 MB)…');
    ocrWorker = (window.Tesseract ? Promise.resolve() : loadScript('vendor/ocr/tesseract.min.js')).then(function () {
      var ws = [];
      for (var i = 0; i < n; i++) ws.push(window.Tesseract.createWorker('eng', 1, {
        workerPath: 'vendor/ocr/worker.min.js', corePath: 'vendor/ocr/', langPath: 'vendor/ocr/', gzip: true, workerBlobURL: false
      }));
      return Promise.all(ws);
    });
    ocrWorker.catch(function () { ocrWorker = null; });
    return ocrWorker;
  }
  function ocrPage(page, w) {
    var vp0 = page.getViewport({ scale: 1 });
    var vp = page.getViewport({ scale: Math.min(3, Math.max(1.5, 2200 / Math.max(vp0.width, vp0.height * 0.8))) });
    var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () {
      return w.recognize(cv);
    }).then(function (r) {
      var sx = vp0.width / cv.width, sy = vp0.height / cv.height, d = r.data, out;
      cv.width = cv.height = 0;
      try { out = ocrRows(d, sx, sy); } catch (e) { out = ''; }
      return out && out.replace(/\s/g, '').length >= 20 ? out : (d.text || '');
    });
  }
  // Turn OCR words into the same column-marked rows that pageText builds for text PDFs (so form pages parse the same way).
  function ocrRows(d, sx, sy) {
    var lines = d.lines || [], L = [];
    lines.forEach(function (ln) {
      var ws = (ln.words || []).filter(function (w) { return w.text && w.text.trim() && (w.confidence == null || w.confidence >= 30); }).map(function (w) {
        return { x: w.bbox.x0 * sx, w: (w.bbox.x1 - w.bbox.x0) * sx, y: (w.bbox.y0 + w.bbox.y1) / 2 * sy, s: w.text.trim() };
      });
      if (!ws.length) return;
      ws.sort(function (a, b) { return a.x - b.x; });
      L.push({ y: ws.reduce(function (a, w) { return a + w.y; }, 0) / ws.length, ws: ws });
    });
    L.sort(function (a, b) { return a.y - b.y; });
    var rows = [];
    L.forEach(function (l) {
      var r = rows[rows.length - 1];
      if (r && Math.abs(r.y - l.y) <= 3.5) { r.ws = r.ws.concat(l.ws).sort(function (a, b) { return a.x - b.x; }); }
      else rows.push({ y: l.y, ws: l.ws.slice() });
    });
    return rows.map(function (r) {
      var s = '', prevEnd = null;
      r.ws.forEach(function (p, i) {
        var gap = prevEnd == null ? 99 : p.x - prevEnd;
        if (gap > 12) s += (i ? ' ' : '') + '\u2016' + Math.round(p.x) + '\u2016' + p.s;
        else s += (gap > 0.5 ? ' ' : '') + p.s;
        prevEnd = p.x + p.w;
      });
      return s;
    }).join('\n');
  }

  function readPdf(buf) {
    return pdfjs.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise.then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGES), pages = [];
      var chain = Promise.resolve(), scanned = 0, skipped = 0, jobs = [];
      function step(i) {
        return doc.getPage(i).then(function (pg) {
          return pageText(pg).then(function (txt) {
            if (txt.replace(/\s/g, '').length >= 40) { pages[i - 1] = txt; return; }
            if (jobs.length >= MAX_OCR_PAGES) { skipped++; pages[i - 1] = ''; return; }
            jobs.push({ i: i, pg: pg });
          });
        });
      }
      for (var i = 1; i <= n; i++) (function (k) { chain = chain.then(function () { return step(k); }); })(i);
      return chain.then(function () {
        if (!jobs.length) return;
        scanned = jobs.length;
        return getPool(Math.min(poolSize(), jobs.length)).then(function (ws) {
          var next = 0, done = 0;
          say('Reading scanned pages: 0 of ' + jobs.length + ' done. This takes a few minutes for a long scan.');
          function work(w) {
            if (next >= jobs.length) return Promise.resolve();
            var j = jobs[next++];
            return ocrPage(j.pg, w).then(function (t) { pages[j.i - 1] = t; done++; say('Reading scanned pages: ' + done + ' of ' + jobs.length + ' done. This takes a few minutes for a long scan.'); }).then(function () { return work(w); });
          }
          return Promise.all(ws.slice(0, Math.min(ws.length, jobs.length)).map(work));
        });
      }).then(function () { return { text: X.stripRepeats(pages.map(function (p) { return p || ''; })).join('\n\n'), pages: doc.numPages, scanned: scanned, skipped: skipped }; });
    });
  }

  function handleBuffer(buf, name) {
    $('results').hidden = true;
    say('Reading ' + name + ' on your device…');
    readPdf(buf).then(function (r) {
      var res = X.analyze(r.text);
      if (res.empty) { say('We could not find readable text in this file, even after trying to read it as a scan. It may be a photo with very small or faint writing.', 'bad'); return; }
      say('');
      render(res, r.text, name, r.pages, r);
    }).catch(function () { say('We could not open that file. Please choose a PDF that is not password protected.', 'bad'); });
  }

  function handleFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { say('Please choose a PDF file.', 'bad'); return; }
    if (file.size > MAX_BYTES) { say('That file is larger than 20 MB. Please try a smaller one.', 'bad'); return; }
    file.arrayBuffer().then(function (b) { handleBuffer(b, 'your file'); });
  }

  function loadSample(path, label) {
    say('Opening ' + label + '…');
    fetch(path).then(function (r) { return r.arrayBuffer(); }).then(function (b) { handleBuffer(b, label); })
      .catch(function () { say('Could not load the sample.', 'bad'); });
  }

  function card(title, hint) {
    var c = el('section', 'card'); c.appendChild(el('h3', null, title));
    if (hint) c.appendChild(el('p', 'hint', hint));
    return c;
  }
  function addBtn(c, text, item) {
    var b = el('button', 'mini', 'Add to my plan'); b.type = 'button';
    b.setAttribute('aria-label', 'Add to my plan: ' + text);
    b.addEventListener('click', function () { addToPlan(item); b.disabled = true; b.textContent = 'Added'; });
    return b;
  }
  function li(ul, text, item) {
    var l = el('li'); l.appendChild(el('span', null, text));
    if (item) l.appendChild(addBtn(l, text, item));
    ul.appendChild(l);
  }

  var lastRes = null;
  function render(r, raw, name, pages, info) {
    lastRes = r;
    var out = $('cards'); out.textContent = ''; plan = []; renderPlan();
    var kind = { amendment: 'Notice of proposed IEP amendment', iep: 'IEP (goals and services)', clinical: 'Clinical letter (evaluation or treatment)', unknown: 'Document' }[r.type];
    $('docline').textContent = kind + ' · ' + pages + ' page' + (pages > 1 ? 's' : '') + ' · read in this browser' + (info && info.scanned ? ' · ' + info.scanned + ' scanned page' + (info.scanned > 1 ? 's' : '') + ' read with text recognition' : '') + (info && info.skipped ? ' · ' + info.skipped + ' scanned page(s) skipped, demo limit is ' + MAX_OCR_PAGES : '');

    var c = card('Summary in plain words');
    var ul = el('ul', 'plain'); r.summary.forEach(function (s) { li(ul, s); }); c.appendChild(ul); out.appendChild(c);

    if (r.diagnoses && r.diagnoses.length) {
      c = card('Conditions named', 'Only what the letter says. This is not a diagnosis from us.');
      ul = el('ul', 'plain'); r.diagnoses.forEach(function (x) { li(ul, x); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.recommendations && r.recommendations.length) {
      c = card('What the writer recommends', 'Sentences from the letter that sound like advice or a request.');
      ul = el('ul', 'plain'); r.recommendations.forEach(function (x) { li(ul, x, { kind: 'Recommendation', text: x }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.type === 'unknown' && r.keySentences && r.keySentences.length) {
      c = card('Sentences that look important');
      ul = el('ul', 'plain'); r.keySentences.forEach(function (x) { li(ul, x); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.datesMentioned && r.datesMentioned.length) {
      c = card('Dates mentioned');
      ul = el('ul', 'plain'); r.datesMentioned.forEach(function (x) { li(ul, X.pretty(x), { kind: 'Date', text: X.pretty(x) }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.noFutureDates) {
      c = card('Key dates');
      c.appendChild(el('p', null, 'All the dates in this document are in the past. In this demo we only look forward. In the full version, parents will be able to add progress reports and other earlier dates.'));
      out.appendChild(c);
    }
    if (r.deadlines.length) {
      c = card('Key dates', 'Check each date against your own copy.');
      ul = el('ul', 'plain');
      r.deadlines.forEach(function (d) {
        li(ul, X.pretty(d.date) + ': ' + d.label + (d.note ? '. ' + d.note : ''), { kind: 'Date', text: X.pretty(d.date) + ': ' + d.label });
      });
      c.appendChild(ul); out.appendChild(c);
    }
    if (r.actions.length) {
      c = card('What to do next');
      ul = el('ul', 'plain'); r.actions.forEach(function (a) { li(ul, a, { kind: 'To do', text: a }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.form) { renderForm(out, r); }
    else if (r.goals.length) {
      c = card('Annual goals', r.goals.length + ' found');
      ul = el('ul', 'plain'); r.goals.forEach(function (g) { li(ul, 'Goal ' + g.n + ': ' + g.text, { kind: 'Goal', text: g.text }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (!r.form && (r.services.length || r.accommodations.length)) {
      c = card('Services and supports');
      ul = el('ul', 'plain');
      r.services.forEach(function (s) { li(ul, s.name + ': ' + s.detail, { kind: 'Service', text: s.name + ': ' + s.detail }); });
      r.accommodations.forEach(function (a) { li(ul, 'Accommodation: ' + a, { kind: 'Accommodation', text: a }); });
      c.appendChild(ul); out.appendChild(c);
    }
    if (!r.form && r.presentLevels) {
      c = card('Where things stand now', 'From the "present levels" section.');
      c.appendChild(el('p', null, r.presentLevels)); out.appendChild(c);
    }
    if (!r.form && r.reports && r.reports.dates.length) {
      c = card('Progress reports', r.reports.frequency ? 'Reported ' + r.reports.frequency + '.' : '');
      ul = el('ul', 'plain'); r.reports.dates.forEach(function (d) { li(ul, 'Report due ' + X.pretty(d), { kind: 'Date', text: 'Progress report due ' + X.pretty(d) }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.contact && (r.contact.name || r.contact.phone || r.contact.email)) {
      c = card('Who to contact');
      c.appendChild(el('p', null, [r.contact.name, r.contact.phone, r.contact.email].filter(Boolean).join(' · '))); out.appendChild(c);
    }
    $('results').hidden = false;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderForm(out, r) {
    var F = r.form, c, ul;
    if (F.concerns) { c = card('What the family asked the IEP to address', 'First lines of the concerns section.'); c.appendChild(el('p', null, F.concerns)); out.appendChild(c); }
    if (F.levels.length) {
      c = card('Where things stand now', 'Short excerpts. The full text is in your document.');
      F.levels.forEach(function (l) { var p = el('p', null); p.appendChild(el('b', null, l.area + ': ')); p.appendChild(document.createTextNode(l.text)); p.style.marginTop = '10px'; c.appendChild(p); });
      out.appendChild(c);
    }
    if (F.goals.length) {
      c = card('Annual goals', F.goals.length + ' goals. Open one to see the steps toward it.');
      F.goals.forEach(function (g) {
        var det = el('details', 'goal'), sm = el('summary', null, 'Goal ' + g.n + ': ' + g.area); det.appendChild(sm);
        if (g.text) det.appendChild(el('p', null, g.text));
        if (g.criteria) det.appendChild(el('p', 'hint', 'How success is measured: ' + g.criteria));
        if (g.baseline) { var b = el('p', 'hint'); b.appendChild(el('b', null, 'Where things stand: ')); b.appendChild(document.createTextNode(g.baseline)); det.appendChild(b); }
        if (g.objectives.length) { var u = el('ul', 'plain'); g.objectives.forEach(function (o) { li(u, o); }); det.appendChild(u); }
        var add = addBtn(det, 'Goal ' + g.n, { kind: 'Goal', text: g.area + (g.text ? ': ' + g.text : '') }); add.style.marginTop = '8px'; det.appendChild(add);
        c.appendChild(det);
      });
      out.appendChild(c);
    }
    if (F.services.length) {
      c = card('Services', 'Check each line against the original. Minutes per week can overlap, so do not add them up.');
      ul = el('ul', 'plain');
      F.services.forEach(function (s) { li(ul, s.name + ': ' + s.detail + (s.by ? ' (' + s.by + ')' : '') + (s.where ? ', ' + s.where : ''), { kind: 'Service', text: s.name + ': ' + s.detail }); });
      c.appendChild(ul); out.appendChild(c);
    }
    if (F.accommodations.length) {
      c = card('Accommodations', F.accommodations.length + ' found');
      ul = el('ul', 'plain'); F.accommodations.slice(0, 40).forEach(function (a) { li(ul, a, { kind: 'Accommodation', text: a }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (F.progress) { c = card('Progress reports'); c.appendChild(el('p', null, F.progress)); out.appendChild(c); }
    if (F.additional.length) {
      c = card('Also important to know');
      ul = el('ul', 'plain'); F.additional.forEach(function (a) { li(ul, a); }); c.appendChild(ul); out.appendChild(c);
    }
  }

  function addToPlan(item) { plan.push(item); renderPlan(); }
  function renderPlan() {
    var box = $('plan'), ul = $('planlist'); ul.textContent = '';
    box.hidden = plan.length === 0;
    plan.forEach(function (p) { var l = el('li'); l.appendChild(el('b', null, p.kind + ': ')); l.appendChild(document.createTextNode(p.text)); ul.appendChild(l); });
  }
  $('planprint').addEventListener('click', function () { window.print(); });
  $('plancopy').addEventListener('click', function () {
    var t = 'My plan (SpecialMe demo)\n\n' + plan.map(function (p) { return '- ' + p.kind + ': ' + p.text; }).join('\n');
    var done = function () { $('plancopy').textContent = 'Copied'; setTimeout(function () { $('plancopy').textContent = 'Copy as text'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
  });

  function makeForm(data, file) {
    var st = $('formstatus'); st.textContent = 'Building the form…'; st.className = 'status';
    window.SpecialMeForm.build(data).then(function (bytes) { window.SpecialMeForm.download(bytes, file); st.textContent = 'Downloaded ' + file + '.'; })
      .catch(function () { st.textContent = 'Sorry, the form could not be built.'; st.className = 'status bad'; });
  }
  $('filled').addEventListener('click', function () { if (lastRes) makeForm(lastRes, 'SpecialMe-Care-Summary-prefilled.pdf'); });
  $('blank2').addEventListener('click', function () { makeForm(null, 'SpecialMe-Care-Summary-blank.pdf'); });
  $('blank').addEventListener('click', function () { makeForm(null, 'SpecialMe-Care-Summary-blank.pdf'); });

  // Upload wiring
  $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
  var dz = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
  $('s1').addEventListener('click', function () { loadSample('samples/sample-amendment-notice.pdf', 'sample notice'); });
  $('s3').addEventListener('click', function () { loadSample('samples/sample-clinical-letter.pdf', 'sample clinical letter'); });
  $('s4').addEventListener('click', function () { loadSample('samples/sample-scanned-letter.pdf', 'sample scan'); });
  $('s2').addEventListener('click', function () { loadSample('samples/sample-iep-goals.pdf', 'sample IEP'); });

  // Trial sign-up (same table as the main site, tagged source = demo)
  var URL_ = 'https://zocypfuzifymtqyrzzvt.supabase.co', KEY = 'sb_publishable_8uO3u--OIRwSukiAXkZ47Q_kG0wJmBW';
  var f = $('signup'), out = $('result'), btn = $('go');
  function show(kind, text) { out.textContent = ''; out.appendChild(el('p', 'msg ' + kind, text)); }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (f.elements.website.value) { show('ok', 'Thank you. You are on the list.'); return; }
    var email = f.elements.email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { show('bad', 'Please enter a valid email address.'); f.elements.email.focus(); return; }
    if (!f.elements.consent.checked) { show('bad', 'Please tick the box so we know it is okay to email you.'); return; }
    btn.disabled = true; btn.textContent = 'Sending...';
    fetch(URL_ + '/rest/v1/trial_signups', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ email: email, first_name: f.elements.first.value.trim() || null, role: f.elements.role.value, consent: true, source: 'demo' }) })
      .then(function (r) {
        if (r.ok || r.status === 409) { f.reset(); f.style.display = 'none'; show('ok', 'Thank you. You are on the list, and we will email you when the trial opens.'); }
        else show('bad', 'Something went wrong on our side. Please try again in a few minutes.');
      })
      .catch(function () { show('bad', 'We could not reach the server. Please check your connection and try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Join the trial'; });
  });
})();
