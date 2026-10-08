/* SpecialMe demo: Vision builder page. Questions in, editable drafts out, optional PDF. Nothing leaves this browser. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var V = window.SpecialMeVision;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function field(q) {
    var fs = el('fieldset', 'q'), lg = el('legend', null, q.label); fs.appendChild(lg);
    if (q.hint) fs.appendChild(el('p', 'hint', q.hint));
    if (q.type === 'text') { var i = el('input'); i.type = 'text'; i.id = 'q_' + q.id; i.maxLength = 240; i.setAttribute('aria-label', q.label); fs.appendChild(i); }
    else if (q.type === 'person') {
      var g = el('div', 'pair'), a = el('input'), b = el('input'); a.type = b.type = 'text'; a.id = 'q_' + q.id + '_n'; b.id = 'q_' + q.id + '_w'; a.maxLength = 40; b.maxLength = 200;
      a.placeholder = q.nameLabel; b.placeholder = q.doLabel; a.setAttribute('aria-label', q.label + ': ' + q.nameLabel); b.setAttribute('aria-label', q.label + ': ' + q.doLabel); g.appendChild(a); g.appendChild(b); fs.appendChild(g);
    } else {
      var box = el('div', 'opts'); q.options.forEach(function (o, k) {
        var l = el('label', 'o'), c = el('input'); c.type = q.type === 'radio' ? 'radio' : 'checkbox'; c.name = 'q_' + q.id; c.value = o[0]; l.appendChild(c); l.appendChild(el('span', null, o[1])); box.appendChild(l);
      }); fs.appendChild(box);
    }
    return fs;
  }
  V.PARENT.forEach(function (q) { $('pq').appendChild(field(q)); });
  V.CHILD.forEach(function (q) { $('cq').appendChild(field(q)); });

  function read(q) {
    if (q.type === 'text') return $('q_' + q.id).value.trim();
    if (q.type === 'person') return { name: $('q_' + q.id + '_n').value.trim(), what: $('q_' + q.id + '_w').value.trim() };
    var sel = [].slice.call(document.querySelectorAll('input[name="q_' + q.id + '"]:checked')).map(function (x) { return x.value; });
    return q.type === 'radio' ? sel[0] || '' : sel;
  }
  var cur = null;
  $('vform').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = { name: $('vname').value.trim(), pronoun: $('vpro').value };
    V.PARENT.concat(V.CHILD).forEach(function (q) { a[q.id] = read(q); });
    cur = V.generate(a);
    $('pt').textContent = cur.parentTitle; $('ct').textContent = cur.childTitle;
    $('pdoc').value = cur.parent.join('\n\n'); $('cdoc').value = cur.child.join(' ');
    $('out').hidden = false; $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function status(m, bad) { var s = $('vstatus'); s.textContent = m || ''; s.className = 'status' + (bad ? ' bad' : ''); }
  function texts() {
    return { pt: $('pt').textContent, ct: $('ct').textContent, p: $('pdoc').value.trim(), c: $('cdoc').value.trim() };
  }
  $('vcopy').addEventListener('click', function () {
    var t = texts(), s = t.pt + '\n\n' + t.p + '\n\n\n' + t.ct + '\n\n' + t.c + '\n\nDrafted with the SpecialMe demo (specialme.app).';
    if (navigator.clipboard) navigator.clipboard.writeText(s).then(function () { status('Copied.'); }, function () { status('Could not copy. Select the text and copy it yourself.', true); });
  });
  $('vprint').addEventListener('click', function () { window.print(); });

  /* ---- PDF ---- */
  function win(s) {
    return String(s == null ? '' : s).replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\n\x20-\x7e -ÿ]/g, '');
  }
  function buildPdf(t) {
    var PL = window.PDFLib, PW = 612, PH = 792, M = 56, CW = PW - 2 * M;
    return PL.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(PL.StandardFonts.Helvetica), doc.embedFont(PL.StandardFonts.HelveticaBold)]).then(function (fs) {
        var reg = fs[0], bold = fs[1], page, y, n = 0;
        var ink = PL.rgb(0.06, 0.14, 0.17), teal = PL.rgb(0.06, 0.44, 0.48), grey = PL.rgb(0.35, 0.4, 0.43), gold = PL.rgb(0.949, 0.757, 0.306);
        function wrap(text, size, font) {
          var out = []; win(text).split('\n').forEach(function (para) {
            var cur = ''; para.split(' ').forEach(function (w) { var x = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(x, size) > CW && cur) { out.push(cur); cur = w; } else cur = x; }); out.push(cur);
          }); return out;
        }
        function start(title) {
          page = doc.addPage([PW, PH]); n++; y = PH - M;
          var sc = 0.6, top = y;
          page.drawSvgPath('M16 0H48A16 16 0 0 1 64 16V48A16 16 0 0 1 48 64H16A16 16 0 0 1 0 48V16A16 16 0 0 1 16 0Z', { x: M, y: top, scale: sc, color: PL.rgb(0.043, 0.227, 0.259), borderWidth: 0 });
          page.drawCircle({ x: M + 32 * sc, y: top - 23 * sc, size: 8 * sc, color: gold });
          page.drawSvgPath('M14 36A18 18 0 0 0 50 36', { x: M, y: top, scale: sc, borderColor: PL.rgb(0.357, 0.784, 0.831), borderWidth: 5 * sc, borderLineCap: PL.LineCapStyle.Round });
          page.drawText('Special', { x: M + 48, y: top - 26, size: 18, font: bold, color: ink });
          page.drawText('Me', { x: M + 48 + bold.widthOfTextAtSize('Special', 18), y: top - 26, size: 18, font: bold, color: teal });
          y -= 62;
          page.drawText(win(title), { x: M, y: y, size: 22, font: bold, color: ink }); y -= 12;
          page.drawRectangle({ x: M, y: y - 4, width: 54, height: 4, color: gold }); y -= 30;
          page.drawText(win('Drafted with the SpecialMe demo (specialme.app). No AI. Please check and edit before you share.'), { x: M, y: 30, size: 8, font: reg, color: grey });
        }
        function body(text, size) {
          text.split(/\n{2,}/).forEach(function (para) {
            wrap(para, size, reg).forEach(function (ln) { if (y < 56) { start(t.cont || ''); } page.drawText(ln, { x: M, y: y, size: size, font: reg, color: ink }); y -= size * 1.5; });
            y -= size * 0.7;
          });
        }
        start(t.pt); body(t.p, 11.5);
        start(t.ct); body(t.c, 14);
        return doc.save();
      });
    });
  }
  $('vpdf').addEventListener('click', function () {
    var t = texts(); t.cont = '';
    status('Building the PDF…');
    buildPdf(t).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'SpecialMe-Vision.pdf'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); status('Downloaded SpecialMe-Vision.pdf.');
    }).catch(function () { status('Sorry, the PDF could not be built.', true); });
  });
})();
