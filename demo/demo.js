/* SpecialMe demo page: reads a PDF in this browser with pdf.js, then runs SpecialMeExtract on the text.
   Nothing is uploaded. The only network call is the optional trial sign-up. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var X = window.SpecialMeExtract, pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  var MAX_BYTES = 15 * 1024 * 1024, MAX_PAGES = 40;
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
        items.push({ x: t[4], y: t[5], s: it.str });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      var rows = [];
      items.forEach(function (it) {
        var r = rows[rows.length - 1];
        if (r && Math.abs(r.y - it.y) <= 3.5) { r.parts.push(it); r.y = (r.y * (r.parts.length - 1) + it.y) / r.parts.length; }
        else rows.push({ y: it.y, parts: [it] });
      });
      return rows.map(function (r) { r.parts.sort(function (a, b) { return a.x - b.x; }); return r.parts.map(function (p) { return p.s; }).join(' '); }).join('\n');
    });
  }

  function readPdf(buf) {
    return pdfjs.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise.then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGES), jobs = [];
      for (var i = 1; i <= n; i++) jobs.push(doc.getPage(i).then(pageText));
      return Promise.all(jobs).then(function (t) { return { text: t.join('\n\n'), pages: doc.numPages }; });
    });
  }

  function handleBuffer(buf, name) {
    $('results').hidden = true;
    say('Reading ' + name + ' on your device…');
    readPdf(buf).then(function (r) {
      var res = X.analyze(r.text);
      if (res.empty) { say('We could not find readable text in this file. It may be a scan or a photo. The full app will read scans too. This demo reads PDFs that have selectable text.', 'bad'); return; }
      say('');
      render(res, r.text, name, r.pages);
    }).catch(function () { say('We could not open that file. Please choose a PDF that is not password protected.', 'bad'); });
  }

  function handleFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { say('Please choose a PDF file.', 'bad'); return; }
    if (file.size > MAX_BYTES) { say('That file is larger than 15 MB. Please try a smaller one.', 'bad'); return; }
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

  function render(r, raw, name, pages) {
    var out = $('cards'); out.textContent = ''; plan = []; renderPlan();
    var kind = { amendment: 'Notice of proposed IEP amendment', iep: 'IEP (goals and services)', clinical: 'Clinical letter (evaluation or treatment)', unknown: 'Document' }[r.type];
    $('docline').textContent = kind + ' · ' + pages + ' page' + (pages > 1 ? 's' : '') + ' · read in this browser';

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
    if (r.goals.length) {
      c = card('Annual goals', r.goals.length + ' found');
      ul = el('ul', 'plain'); r.goals.forEach(function (g) { li(ul, 'Goal ' + g.n + ': ' + g.text, { kind: 'Goal', text: g.text }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.services.length || r.accommodations.length) {
      c = card('Services and supports');
      ul = el('ul', 'plain');
      r.services.forEach(function (s) { li(ul, s.name + ': ' + s.detail, { kind: 'Service', text: s.name + ': ' + s.detail }); });
      r.accommodations.forEach(function (a) { li(ul, 'Accommodation: ' + a, { kind: 'Accommodation', text: a }); });
      c.appendChild(ul); out.appendChild(c);
    }
    if (r.presentLevels) {
      c = card('Where things stand now', 'From the "present levels" section.');
      c.appendChild(el('p', null, r.presentLevels)); out.appendChild(c);
    }
    if (r.reports && r.reports.dates.length) {
      c = card('Progress reports', r.reports.frequency ? 'Reported ' + r.reports.frequency + '.' : '');
      ul = el('ul', 'plain'); r.reports.dates.forEach(function (d) { li(ul, 'Report due ' + X.pretty(d), { kind: 'Date', text: 'Progress report due ' + X.pretty(d) }); }); c.appendChild(ul); out.appendChild(c);
    }
    if (r.contact && (r.contact.name || r.contact.phone || r.contact.email)) {
      c = card('Who to contact');
      c.appendChild(el('p', null, [r.contact.name, r.contact.phone, r.contact.email].filter(Boolean).join(' · '))); out.appendChild(c);
    }
    var d = el('details', 'raw'); d.appendChild(el('summary', null, 'Show the text the demo read (' + raw.length + ' characters)'));
    var pre = el('pre', null, raw); d.appendChild(pre); out.appendChild(d);

    $('results').hidden = false;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Upload wiring
  $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
  var dz = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
  $('s1').addEventListener('click', function () { loadSample('samples/sample-amendment-notice.pdf', 'sample notice'); });
  $('s3').addEventListener('click', function () { loadSample('samples/sample-clinical-letter.pdf', 'sample clinical letter'); });
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
