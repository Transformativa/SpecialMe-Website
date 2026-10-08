/* SpecialMe demo: IEP strength check page. Reads the PDF in this browser, runs the rule-based check. Nothing is uploaded. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var X = window.SpecialMeExtract, R = window.SpecialMeReader, S = window.SpecialMeStrength, last = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(m, k) { var s = $('status'); s.textContent = m || ''; s.className = 'status ' + (k || ''); }
  var LAB = { strong: ['Covered', 'ok'], partial: ['Partly there', 'mid'], thin: ['Thin', 'mid'], none: ['Not found', 'low'], na: ['May not apply', 'na'] };

  function item(i) {
    var d = el('div', 'item'), h = el('h4', null, i.title), c = el('span', 'chip ' + LAB[i.level][1], LAB[i.level][0]);
    h.appendChild(c); d.appendChild(h);
    d.appendChild(el('p', null, i.found));
    d.appendChild(el('p', 'hint', 'Why it matters: ' + i.why));
    if (i.level !== 'strong') d.appendChild(el('p', 'ask', 'Ask: ' + i.ask));
    return d;
  }
  function yn(v) { return el('span', 'chip ' + (v ? 'ok' : 'low'), v ? 'Yes' : 'Not found'); }

  function render(ev, pages, info, chars) {
    last = ev;
    $('docline').textContent = pages + ' page' + (pages > 1 ? 's' : '') + ' · read in this browser' + (info && info.scanned ? ' · ' + info.scanned + ' scanned page' + (info.scanned > 1 ? 's' : '') + ' read with text recognition' : '');
    var sum = $('sum'); sum.textContent = '';
    sum.appendChild(el('div', 'big', ev.strongCount + ' of ' + ev.total));
    var t = el('div'); t.appendChild(el('b', null, 'areas look covered'));
    t.appendChild(el('p', 'hint', 'This counts topics we could find, not how good they are. Use the questions below to check the rest with the team.')); sum.appendChild(t);
    if ((info && info.skipped) || chars < 1500) { var w = el('p', 'note warn', 'We could read only part of this file' + (info && info.skipped ? ' (' + info.skipped + ' scanned page' + (info.skipped > 1 ? 's were' : ' was') + ' skipped)' : ' (very little text was found)') + ', so some items may show as not found when they are in the document.'); w.style.flexBasis = '100%'; sum.appendChild(w); }
    if (ev.docType !== 'iep' && !ev.goals.length) { var n2 = el('p', 'note warn', 'This does not look like a full IEP (it looks like ' + ({ amendment: 'a notice or amendment', clinical: 'a clinical letter', unknown: 'another kind of document' }[ev.docType] || 'another kind of document') + '). This check works best on the full IEP with goals and services.'); n2.style.flexBasis = '100%'; sum.appendChild(n2); }
    var st = $('strong'), wk = $('weak'); st.textContent = ''; wk.textContent = '';
    ev.items.forEach(function (i) { (i.level === 'strong' ? st : wk).appendChild(item(i)); });
    if (!st.children.length) st.appendChild(el('p', null, 'Nothing was found that clearly matches the list. This can happen with scans or unusual layouts.'));
    if (!wk.children.length) wk.appendChild(el('p', null, 'Everything on the list was found.'));
    var gs = $('goalsec'), tb = $('gtab'); tb.textContent = '';
    if (ev.goals.length) {
      gs.hidden = false;
      var hr = el('tr'); ['Goal', 'Number or clear measure', 'Starting point', 'Time frame', 'How tracked'].forEach(function (x) { hr.appendChild(el('th', null, x)); }); tb.appendChild(hr);
      ev.goals.forEach(function (g) {
        var r = el('tr'), c = el('td'); c.appendChild(el('b', null, 'Goal ' + g.n + (g.area ? ': ' + g.area : ''))); if (g.text) c.appendChild(el('div', 'hint', g.text.length > 160 ? g.text.slice(0, 157) + '…' : g.text)); r.appendChild(c);
        [g.measurable, g.baseline, g.timeframe, g.method].forEach(function (v) { var td = el('td'); td.appendChild(yn(v)); r.appendChild(td); });
        tb.appendChild(r);
      });
    } else gs.hidden = true;
    var qs = $('qs'); qs.textContent = '';
    ev.questions.forEach(function (q) { qs.appendChild(el('li', null, q)); });
    $('qbox').hidden = !ev.questions.length;
    $('results').hidden = false; $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleBuffer(buf, name) {
    $('results').hidden = true; say('Reading ' + name + ' on your device…');
    R.read(buf, say).then(function (r) {
      var res = X.analyze(r.text);
      if (res.empty) { say('We could not find readable text in this file, even after trying to read it as a scan.', 'bad'); return; }
      say(''); render(S.evaluate(r.text, res), r.pages, r, r.text.length);
    }).catch(function () { say('We could not open that file. Please choose a PDF that is not password protected.', 'bad'); });
  }
  function handleFile(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { say('Please choose a PDF file.', 'bad'); return; }
    if (f.size > R.MAX_BYTES) { say('That file is larger than 20 MB. Please try a smaller one.', 'bad'); return; }
    f.arrayBuffer().then(function (b) { handleBuffer(b, 'your file'); });
  }
  $('file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
  var dz = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
  $('s2').addEventListener('click', function () {
    say('Opening the sample IEP…');
    fetch('samples/sample-iep-goals.pdf').then(function (r) { return r.arrayBuffer(); }).then(function (b) { handleBuffer(b, 'sample IEP'); }).catch(function () { say('Could not load the sample.', 'bad'); });
  });
  $('qprint').addEventListener('click', function () { window.print(); });
  $('qcopy').addEventListener('click', function () {
    if (!last) return;
    var t = 'Questions for the next IEP meeting (SpecialMe demo)\n\n' + last.questions.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n');
    var done = function () { $('qcopy').textContent = 'Copied'; setTimeout(function () { $('qcopy').textContent = 'Copy as text'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
  });
})();
