/* SpecialMe demo: builds the "Care Summary" form as a fillable PDF, blank or pre-filled from what the demo read.
   Runs in the browser with pdf-lib. No AI: the pre-fill copies what the rule-based reader found, and it can be incomplete or wrong. */
(function (root) {
  'use strict';
  var PW = 612, PH = 792, M = 42, CW = PW - 2 * M;

  function win(s) { // standard PDF fonts only handle Latin-1: replace the rest
    return String(s == null ? '' : s)
      .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
      .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/[·•]/g, '-')
      .replace(/…/g, '...').replace(/→/g, '->').replace(/[☐☑☒]/g, '')
      .replace(/[^\n\x20-\x7e -ÿ]/g, '').replace(/[ \t]+/g, ' ');
  }

  function lines(data) {
    var L = {}, F = data && data.form;
    L.diagnoses = [];
    if (F && F.disabilities.length) L.diagnoses.push('Disability category on the IEP: ' + F.disabilities.join(', '));
    if (data && data.diagnoses && data.diagnoses.length) L.diagnoses.push('Conditions named in the document: ' + data.diagnoses.join(', '));
    L.goals = (data && data.goals || []).map(function (g) { return g.n + '. ' + (g.area ? g.area + ': ' : '') + (g.text || ''); });
    L.services = (data && data.services || []).map(function (s) { return s.name + ': ' + s.detail; });
    if (data && data.hours && data.hours.length && !(data.services || []).length) L.services = data.hours.map(function (h) { return h.name + ': ' + h.detail; });
    L.accommodations = (data && data.accommodations || []).map(function (a) { return '- ' + a; });
    L.dates = [];
    (data && data.deadlines || []).forEach(function (d) { L.dates.push(window.SpecialMeExtract.pretty(d.date) + ': ' + d.label); });
    (data && data.datesMentioned || []).forEach(function (d) { if (L.dates.length < 12) L.dates.push('Date mentioned: ' + window.SpecialMeExtract.pretty(d)); });
    var c = data && data.contact || {};
    L.contact = [c.name, c.phone, c.email].filter(Boolean).join('   ');
    L.communication = ''; L.behavior = ''; L.other = '';
    if (F) {
      F.levels.forEach(function (l) {
        if (/Communication/i.test(l.area)) L.communication = l.text;
        else if (/Behavior/i.test(l.area)) L.behavior = l.text;
        else L.other += (L.other ? '\n' : '') + l.area + ': ' + l.text;
      });
    }
    var notes = [];
    if (data && data.recommendations && data.recommendations.length && data.type === 'clinical') data.recommendations.slice(0, 4).forEach(function (x) { notes.push('Recommended: ' + x); });
    if (F) {
      if (F.concerns) notes.push('Family concerns (start): ' + F.concerns);
      if (F.outside) notes.push('Time outside the general classroom: ' + F.outside);
      if (F.progress) notes.push('Progress reports: ' + F.progress);
      (F.additional || []).forEach(function (a) { notes.push(a); });
    }
    L.notes = notes;
    var p = [];
    if (data && data.dates && data.dates.iepFrom) p.push('IEP period: ' + window.SpecialMeExtract.pretty(data.dates.iepFrom) + ' to ' + window.SpecialMeExtract.pretty(data.dates.iepTo));
    L.period = p.join('');
    return L;
  }

  function build(data) {
    var PL = root.PDFLib, filled = !!data, L = lines(data);
    return PL.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(PL.StandardFonts.Helvetica), doc.embedFont(PL.StandardFonts.HelveticaBold)]).then(function (fs) {
        var reg = fs[0], bold = fs[1], form = doc.getForm(), page, y, n = 0, pageNo = 0;
        var ink = PL.rgb(0.06, 0.14, 0.17), teal = PL.rgb(0.06, 0.44, 0.48), grey = PL.rgb(0.35, 0.4, 0.43), line = PL.rgb(0.75, 0.82, 0.85);

        function footer() {
          page.drawText(win('Prepared with the SpecialMe demo (specialme.app). Not a legal or medical record. Page ' + pageNo), { x: M, y: 22, size: 8, font: reg, color: grey });
        }
        function newPage() {
          page = doc.addPage([PW, PH]); pageNo++; y = PH - M;
          if (pageNo > 1) { page.drawText('SpecialMe Care Summary (continued)', { x: M, y: y - 10, size: 10, font: bold, color: teal }); y -= 28; }
          footer();
        }
        function need(h) { if (y - h < 40) newPage(); }
        function wrap(text, width, size) {
          var out = [];
          win(text).split('\n').forEach(function (para) {
            var words = para.split(' '), cur = '';
            words.forEach(function (w) {
              var t = cur ? cur + ' ' + w : w;
              if (reg.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
            });
            out.push(cur);
          });
          return out;
        }
        function wrapB(text, width, size) {
          var out = [], cur = '';
          win(text).split(' ').forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (bold.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t; });
          out.push(cur); return out;
        }
        function label(t) { need(40); page.drawText(win(t), { x: M, y: y - 10, size: 10.5, font: bold, color: ink }); y -= 16; }
        function hint(t) { var ls = wrap(t, CW, 8.5); ls.forEach(function (l) { need(12); page.drawText(l, { x: M, y: y - 8, size: 8.5, font: reg, color: grey }); y -= 11; }); y -= 2; }
        function field(name, value, o) {
          o = o || {}; var size = o.size || 9.5, w = o.width || CW, h;
          var f = form.createTextField('f' + (++n) + '_' + name);
          if (o.multi) {
            var ls = wrap(value || '', w - 10, size).length;
            h = Math.max(o.minH || 54, Math.ceil(ls * size * 1.3 * 1.12) + 12);
            f.enableMultiline();
          } else h = 22;
          return { f: f, w: w, h: h, size: size, value: value };
        }
        function place(spec, x) {
          need(spec.h + 8);
          spec.f.addToPage(page, { x: x == null ? M : x, y: y - spec.h, width: spec.w, height: spec.h, borderWidth: 1, borderColor: line, backgroundColor: PL.rgb(1, 1, 1), textColor: ink });
          spec.f.setFontSize(spec.size);
          if (spec.value) spec.f.setText(win(spec.value));
        }
        function block(title, hintText, name, value, o) {
          var s = field(name, value, { multi: true, minH: (o && o.minH) || 54 });
          need(Math.min(s.h + 44, PH - 2 * M - 40)); // keep the heading with its box
          label(title); if (hintText) hint(hintText);
          place(s); y -= s.h + 12;
        }

        newPage();
        page.drawText('SpecialMe Care Summary', { x: M, y: y - 22, size: 22, font: bold, color: teal }); y -= 30;
        page.drawText(win('One page of the basics to share with a school, clinic or caregiver. You can type in the boxes and save.'), { x: M, y: y - 10, size: 9.5, font: reg, color: grey }); y -= 22;

        if (filled) {
          var msg = 'Pre-filled by the SpecialMe demo from a document you chose. The demo does not use AI. It copies what its simple rules recognized, so it may be incomplete or wrong. Please check every box against the original and fix it before you share this.';
          var ml = wrapB(msg, CW - 24, 9.5), bh = ml.length * 12.5 + 14;
          page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: PL.rgb(1, 0.93, 0.65), borderColor: PL.rgb(0.72, 0.47, 0.12), borderWidth: 1 });
          ml.forEach(function (t, i) { page.drawText(t, { x: M + 10, y: y - 16 - i * 12.5, size: 9.5, font: bold, color: ink }); });
          y -= bh + 14;
        }

        label('About');
        var cols = [['Name or nickname', 'name', 220], ['Date of birth', 'dob', 100], ['Grade', 'grade', 60], ['Date filled in', 'date', 112]], x = M, specs = cols.map(function (c) { return field(c[1], '', { width: c[2] }); });
        need(52);
        cols.forEach(function (c, i) { page.drawText(c[0], { x: x, y: y - 9, size: 8.5, font: reg, color: grey }); specs[i].w = c[2]; var sp = specs[i]; sp.f.addToPage(page, { x: x, y: y - 12 - 22, width: c[2], height: 22, borderWidth: 1, borderColor: line, backgroundColor: PL.rgb(1, 1, 1), textColor: ink }); sp.f.setFontSize(10); x += c[2] + 12; });
        y -= 46;
        page.drawText('School or program', { x: M, y: y - 9, size: 8.5, font: reg, color: grey }); y -= 12;
        var sc = field('school', L.period, { width: CW }); place(sc); y -= 30;

        block('Diagnoses and disability category', 'Only what a professional has written down.', 'diagnoses', L.diagnoses.join('\n'));
        block('What helps, and what my child loves', 'Strengths, favorite things, what calms or motivates.', 'strengths', '');
        block('How my child communicates', 'Words, signs, a device, gestures. What to try when it is hard.', 'communication', L.communication);
        block('Behavior and sensory supports', 'Triggers, early signs of stress, and what helps.', 'behavior', L.behavior);
        block('Current goals', 'From the IEP or treatment plan.', 'goals', L.goals.join('\n'), { minH: 70 });
        block('Services', 'Who provides what, and how often.', 'services', L.services.join('\n'), { minH: 70 });
        block('Accommodations and supports', 'Changes that help in class or at home.', 'accommodations', L.accommodations.join('\n'), { minH: 70 });
        block('Health: medicines, allergies, conditions to know about', 'Check with a doctor or pharmacist before you rely on this list.', 'health', '', { minH: 60 });
        block('Important dates', 'Meetings, reviews, deadlines, appointments.', 'dates', L.dates.join('\n'));
        block('Contacts', 'School contact, doctor, therapists, and who to call in an emergency.', 'contacts', L.contact);
        block('Other things to know', 'Anything else a new teacher or caregiver should hear first.', 'notes', L.notes.join('\n\n'), { minH: 70 });

        form.updateFieldAppearances(reg);
        return doc.save();
      });
    });
  }

  function download(bytes, name) {
    var blob = new Blob([bytes], { type: 'application/pdf' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  root.SpecialMeForm = { build: build, download: download, lines: lines };
})(typeof self !== 'undefined' ? self : this);
