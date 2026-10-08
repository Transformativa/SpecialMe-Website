/* SpecialMe demo: rule-based extraction. No AI, no network. Pure functions, so they can be tested in Node.
   Input: plain text of a document. Output: a plain object the page renders. */
(function (root) {
  'use strict';

  var DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})';
  var MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

  var TODAY = null;
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function isFuture(str) { var d = toDate(str); return !!d && d >= (TODAY || startOfToday()); }

  function clean(t) {
    return String(t || '')
      .replace(/[   ]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function flat(t) { return t.replace(/\s+/g, ' ').trim(); }
  function first(re, s, i) { var m = re.exec(s); return m ? (m[i == null ? 1 : i] || '').trim() : ''; }

  function toDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s || '');
    if (!m) return null;
    var y = +m[3]; if (y < 100) y += 2000;
    var d = new Date(y, +m[1] - 1, +m[2]);
    return isNaN(d) ? null : d;
  }
  function pretty(s) {
    var d = toDate(s);
    if (!d) return s;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function addDays(s, n) {
    var d = toDate(s); if (!d) return '';
    d.setDate(d.getDate() + n);
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  }
  function sentences(t) {
    return flat(t).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = x.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }

  function detectType(f) {
    var amend = /Notice of Proposed School District Action|IEP Amendment|Amendment Data/i.test(f);
    var iep = /Annual goals?|Present levels|Services and supports|Service delivery/i.test(f) && /goal/i.test(f);
    if (iep && !/Notice of Proposed School District Action/i.test(f)) return 'iep';
    if (amend) return 'amendment';
    var clin = (f.match(/diagnos|evaluation|assessment|treatment plan|recommend|therapy|disorder|autism|ADHD|pediatric|clinic/gi) || []).length;
    if (!iep && clin >= 3) return 'clinical';
    if (iep) return 'iep';
    return 'unknown';
  }

  function extractDates(f) {
    var o = {};
    o.noticeDate = first(new RegExp('Notice Date:?\\s*' + DATE, 'i'), f);
    o.returnDate = first(new RegExp('(?:Document )?Return Date:?\\s*' + DATE, 'i'), f);
    o.meetingDate = first(new RegExp('Date of Meeting:?\\s*' + DATE, 'i'), f);
    o.annualReview = first(new RegExp('Annual Review Meeting:?\\s*' + DATE, 'i'), f);
    o.reeval = first(new RegExp('Three-Year Reevaluation Meeting:?\\s*' + DATE, 'i'), f);
    var m = new RegExp('IEP dated:?\\s*from:?\\s*' + DATE + '\\s*to\\s*' + DATE, 'i').exec(f) ||
            new RegExp('IEP dates:?\\s*from:?\\s*' + DATE + '\\s*to\\s*' + DATE, 'i').exec(f);
    if (m) { o.iepFrom = m[1]; o.iepTo = m[2]; }
    return o;
  }

  function extractContact(f) {
    var c = {};
    var m = /District Contact(?: Person)?:?\s*([A-Za-z'’\- ]+,\s*[A-Za-z'’\-]+)/i.exec(f);
    if (m) c.name = m[1].trim();
    var ph = /(?:\(?\b\d{3}\)?[ .-])?\b\d{3}[ .-]\d{4}\b/.exec(f);
    if (ph) c.phone = ph[0];
    var em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(f);
    if (em) c.email = em[0];
    return c;
  }

  function extractChange(f) {
    var o = {};
    var m = /What section of the IEP will be changed\?[\s\S]*?Why is this change being made\?/i.exec(f);
    var block = m ? m[0] : '';
    var sect = /What section of the IEP will be changed\?\s*(.+?)\s*What change/i.exec(f);
    if (sect) o.section = sect[1].trim();
    var chg = /What change\(?s?\)?(?: will be made)?(?: to the existing IEP)?\??\s*(.+?)\s*Why is this change being made/i.exec(f);
    if (chg) o.change = chg[1].trim();
    var why = /Why is this change being made\?\s*(.+?)(?:\s*(?:Additional Information|Parent response|Response Section|Sample document)|$)/i.exec(f);
    if (why) o.why = why[1].trim().slice(0, 400);
    if (!o.change) {
      var tail = /Why is this change being made\?\s*(.+?)\s*(?:Additional Information|Response Section|$)/i.exec(f);
      if (tail && tail[1].length > 25) { o.change = tail[1].replace(/\|\S*/g, '').trim(); o.jumbled = true; }
    }
    if (!o.change) {
      var a = first(/What action is the school district proposing to take\?\s*(.+?)\s*Why is the school district proposing to act\?/i, f);
      if (a) o.change = a;
    }
    return o;
  }

  function extractNarrative(f) {
    var o = {};
    o.action = first(/What action is the school district proposing to take\?\s*(.+?)\s*Why is the school district proposing to act\?/i, f);
    o.reason = first(/Why is the school district proposing to act\?\s*(.+?)\s*What rejected options/i, f);
    o.basis = first(/What evaluation procedure.*?proposed action\?\s*(.+?)\s*What other factors/i, f);
    o.next = first(/What next steps, if any, are recommended\?\s*(.+?)(?:\s*You have \d+ calendar days|\s*Sample document|$)/i, f);
    return o;
  }

  function extractGoals(t) {
    var f = flat(t), goals = [];
    var re = /Goal\s*(\d+)\s*[:.\-]\s*(.+?)(?=\s*Goal\s*\d+\s*[:.\-]|\s*(?:Services and supports|Service delivery|Progress reports?|Next steps|Accommodations)\b|$)/gi, m;
    while ((m = re.exec(f))) {
      var txt = m[2].trim();
      // skip progress notes ("has met", "2.) ... 3.) ...") and anything that is not worded like a goal
      if (/\b(has|have|had) (?:not )?(?:been )?(?:met|mastered|achieved|made)\b|\bnot met\b|\d\.\)/i.test(txt) || !/\bwill\b|\bwould\b|\bto (?:be|demonstrate|improve|increase|decrease)\b/i.test(txt) || txt.length > 420) continue;
      var by = /by\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(txt);
      goals.push({ n: +m[1], text: txt, by: by ? by[1] : '' });
    }
    return goals;
  }

  function extractServices(t) {
    var f = flat(t), out = [];
    var sec = /(?:Services and supports|Service delivery)\s*(.+?)(?=\s*(?:Progress reports?|Next steps|$))/i.exec(f);
    var body = sec ? sec[1] : f;
    var re = /((?:Special education|Speech-language therapy|Speech therapy|Occupational therapy|Physical therapy|Counseling|Behavior support|Transportation|Paraprofessional support)[^:.]*):\s*([^.]*?(?:minutes?|hours?)[^.]*)\./gi, m;
    while ((m = re.exec(body))) out.push({ name: m[1].trim(), detail: m[2].trim() });
    var acc = /Accommodations?:\s*([^.]+)\./i.exec(body);
    var accommodations = acc ? acc[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
    return { services: out, accommodations: accommodations };
  }

  function extractPresentLevels(t) {
    var f = flat(t);
    return first(/Present levels(?: of performance)?\s*(.+?)(?=\s*Annual goals?)/i, f);
  }

  function extractReports(t) {
    var f = flat(t);
    var sec = first(/Progress reports?\s*(.{0,500}?)(?=\s*Next steps|$)/i, f);
    var dates = [], re = new RegExp(DATE, 'g'), m;
    while ((m = re.exec(sec))) if (dates.indexOf(m[1]) < 0) dates.push(m[1]);
    var freq = first(/reported to parents\s+([^.]+?)\./i, sec);
    return { frequency: freq, dates: dates };
  }

  function buildDeadlines(d, type, text) {
    var out = [];
    function add(date, label, note) { if (date) out.push({ date: date, label: label, note: note || '' }); }
    add(d.returnDate, 'Return the signed response page', 'The district needs a signed copy before changes begin.');
    var days = first(/You have (\d+) calendar days/i, flat(text));
    if (d.noticeDate && days) add(addDays(d.noticeDate, +days), 'End of the ' + days + '-day review window', 'Counted from the notice date. Check your own copy of the notice.');
    add(d.annualReview, 'Next annual review meeting');
    add(d.reeval, 'Next three-year reevaluation meeting');
    add(d.iepTo, 'Current IEP period ends');
    return out.sort(function (a, b) { return (toDate(a.date) || 0) - (toDate(b.date) || 0); });
  }


  /* ---------- table-aware helpers (column markers come from demo.js: ‖x‖ before each text segment) ---------- */
  var MK = /‖(\d+)‖/g;
  function plainOf(t) { return t.replace(MK, ' ').replace(/[ \t]+/g, ' '); }
  function segsOf(line) {
    var out = [], re = /‖(\d+)‖([^‖]*)/g, m;
    while ((m = re.exec(line))) { var t = m[2].trim(); if (t) out.push({ x: +m[1], t: t }); }
    if (!out.length && line.trim()) out.push({ x: 0, t: line.replace(MK, ' ').trim() });
    return out;
  }
  function colOf(xs, x) { var c = 0; for (var i = 0; i < xs.length; i++) if (x + 8 >= xs[i]) c = i; return c; }
  function clusterStarts(xs, tol, minCount) {
    var a = xs.slice().sort(function (p, q) { return p - q; }), groups = [];
    a.forEach(function (x) { var g = groups[groups.length - 1]; if (g && x - g.last <= tol) { g.last = x; g.n++; } else groups.push({ start: x, last: x, n: 1 }); });
    return groups.filter(function (g) { return g.n >= (minCount || 1); }).map(function (g) { return g.start; });
  }
  function nearestCol(starts, x) { var c = -1; for (var i = 0; i < starts.length; i++) if (x + 5 >= starts[i]) c = i; return c; }
  function headerIdx(lines, re) { for (var i = 0; i < lines.length; i++) if (re.test(plainOf(lines[i]))) return i; return -1; }

  /* Remove page headers and footers that repeat on most pages. Keeps the first copy. */
  function stripRepeats(pages) {
    var key = function (l) { return plainOf(l).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim(); };
    var count = {};
    pages.forEach(function (p) {
      var L = p.split('\n').filter(function (l) { return l.trim(); }), seen = {};
      L.slice(0, 4).concat(L.slice(-4)).forEach(function (l) { var k = key(l); if (k.length > 8 && !seen[k]) { seen[k] = 1; count[k] = (count[k] || 0) + 1; } });
    });
    var need = Math.max(3, Math.ceil(pages.length * 0.5)), kept = {};
    return pages.map(function (p) {
      return p.split('\n').filter(function (l) {
        var k = key(l); if (!count[k] || count[k] < need) return true;
        if (!kept[k]) { kept[k] = 1; return true; }
        return false;
      }).join('\n');
    });
  }

  function isIepForm(f) { return /Individualized Education Program/i.test(f) && /MEASURABLE ANNUAL GOALS/.test(f) && /SERVICE DELIVERY/.test(f); }

  function between(text, startRe, endRe) {
    var m = startRe.exec(text); if (!m) return '';
    var rest = text.slice(m.index + m[0].length), e = endRe ? endRe.exec(rest) : null;
    return (e ? rest.slice(0, e.index) : rest).trim();
  }
  function firstSentences(t, maxChars, n) {
    var ss = sentences(plainOf(t)), out = '';
    for (var i = 0; i < ss.length && i < (n || 2); i++) { if ((out + ' ' + ss[i]).length > maxChars && out) break; out += (out ? ' ' : '') + ss[i]; }
    return out.length > maxChars ? out.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…' : out;
  }

  function analyzeIepForm(rawClean) {
    var lines = rawClean.split('\n'), text = plainOf(rawClean).replace(/\n{3,}/g, '\n\n'), o = {};
    // disabilities
    var prof = between(text, /STUDENT PROFILE/, /English Learner/);
    var D = /\bX\s+(Autism|Communication Impairment|Developmental Delay|Emotional Impairment|Health Impairment|Intellectual Impairment|Neurological Impairment|Physical Impairment|Sensory Impairment|Specific Learning Disability|Hearing|Vision|Deaf-Blind)/g, m;
    o.disabilities = []; while ((m = D.exec(prof))) o.disabilities.push(m[1]);
    // concerns
    var conc = between(text, /What concern\(s\) do you want this IEP to address\?/, /STUDENT AND TEAM VISION/);
    o.concerns = firstSentences(conc.replace(/^[^\n]*shared via email[^\n]*\n/i, '').replace(/^Here is a summary[^\n]*\n/i, ''), 420, 3);
    // present levels by area (content is indented relative to the form's instruction text)
    o.levels = [];
    [['Academics', /^Briefly describe current academic performance/], ['Behavior, social and emotional', /^Briefly describe current behavioral\/social\/emotional performance/], ['Communication', /^Briefly describe current communication performance/], ['Other areas (health, motor, other)', /^Briefly describe current performance and any applicable documentation/]].forEach(function (a2) {
      var idx = -1; for (var q = 0; q < lines.length; q++) if (a2[0] && a2[1].test(plainOf(lines[q]).trim())) { idx = q; break; }
      if (idx < 0) return;
      var ax = segsOf(lines[idx])[0].x, body = [], started = false;
      for (var j = idx + 1; j < lines.length && body.length < 14; j++) {
        var pl2 = plainOf(lines[j]).trim(); if (!pl2) { if (started) break; continue; }
        var sx = segsOf(lines[j])[0].x;
        if (/^(PRESENT LEVELS|ACCOMMODATIONS|Describe any disability|Briefly describe|Massachusetts DESE)/.test(pl2)) break;
        if (!started) { if (sx > ax + 2) started = true; else continue; }
        else if (sx <= ax + 2 && /^[A-Z][A-Z \/]{8,}$/.test(pl2)) break;
        body.push(pl2);
      }
      var t = firstSentences(body.join(' '), 380, 2);
      if (t.length > 30) o.levels.push({ area: a2[0], text: t });
    });
    // goals
    o.goals = [];
    var gs = [], gre = /Goal Number:\s*(\d+)\s+Goal Area:\s*([^\n]+)/g;
    while ((m = gre.exec(text))) gs.push({ n: +m[1], area: m[2].replace(/\s+/g, ' ').trim(), i: m.index });
    gs.forEach(function (g, k) {
      var end = k + 1 < gs.length ? gs[k + 1].i : text.length, block = text.slice(g.i, end);
      var cut = /SCHEDULE OF PROGRESS REPORTING|MEASURABLE ANNUAL GOALS/.exec(block.slice(20)); if (cut) block = block.slice(0, cut.index + 20);
      var obj = between(block, /Short-term objectives[^\n]*\n/i, null);
      var items = obj ? obj.split(/\n(?=\s*\d+\.\s)/).map(function (x) { return x.replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim(); }).filter(function (x) { return x.length > 15; }) : [];
      var base = between(block, /Baseline[^\n]*\n/i, /Annual Goal\/Target/);
      var crit = /(\d{2,3}%[^.\n]{0,60}?(?:by (?:the )?end of (?:this )?IEP|trials|accuracy|of opportunities)[^\n|]*)/i.exec(block);
      // goal table: columns found from where the text actually starts
      var gi = lines.map(function (l) { return plainOf(l); });
      var start = -1; for (var q = 0; q < lines.length; q++) if (new RegExp('Goal Number:\\s*' + g.n + '\\s+Goal Area').test(gi[q])) { start = q; break; }
      var goalText = '', gcols = ['', '', '', '', ''];
      if (start >= 0) {
        var h = -1, sh = -1;
        for (q = start; q < Math.min(lines.length, start + 90); q++) { if (/Who will monitor progress/i.test(gi[q]) && h < 0) h = q; if (/Short-term objectives/i.test(gi[q])) { sh = q; break; } }
        if (h > 0 && sh > h) {
          var rows2 = [], skipping = true;
          for (q = h + 1; q < sh; q++) {
            var pl3 = gi[q].trim(); if (!pl3) continue;
            if (skipping && /expected to attain|determine whether|timeframe|goal has been achieved|be measured|how frequently|monitor progress|^by the$|^end of this|^the goal has/i.test(pl3)) continue;
            skipping = false; rows2.push(segsOf(lines[q]));
          }
          var allx = []; rows2.forEach(function (r2) { r2.forEach(function (x) { allx.push(x.x); }); });
          var cs = clusterStarts(allx, 5, 1).slice(0, 5);
          rows2.forEach(function (r2) { r2.forEach(function (x) { var c3 = Math.max(0, nearestCol(cs, x.x)); gcols[c3] = (gcols[c3] + ' ' + x.t).trim(); }); });
          goalText = gcols[0].replace(/This goal will be achieved when the following benchmarks are met\.?/i, '').replace(/\s+/g, ' ').trim();
        }
      }
      o.goals.push({ n: g.n, area: g.area, text: goalText, baseline: firstSentences(base, 300, 2), criteria: [gcols[1], gcols[2], gcols[3], gcols[4]].filter(Boolean).join(' · ').replace(/\s+/g, ' '), objectives: items });
    });
    // progress reporting
    var pr = between(text, /periodically informed of the student's progress[^\n]*\n/i, /Massachusetts DESE|PARTICIPATION IN THE GENERAL/);
    o.progress = firstSentences(pr, 300, 2);
    // outside general ed
    var out = between(text, /removed from a general education class or activity\./i, /SERVICE DELIVERY/);
    o.outside = firstSentences(out, 380, 2);
    // service grid: each record starts at a goal-number cell; later lines fill in wrapped cells
    o.services = [];
    var sh2 = headerIdx(lines, /Type of Service/), group = '';
    if (sh2 >= 0) {
      var DT = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, FQ = /\d+(?:\.\d+)?\s*x\s*\d+\s*\/\s*(?:Week|Day|Month|Year|Quarter)/i, cur = null;
      var endIdx = headerIdx(lines.slice(sh2), /TRANSPORTATION SERVICES/), stop = endIdx > 0 ? sh2 + endIdx : lines.length;
      for (var i = sh2 + 1; i < stop; i++) {
        var pl = plainOf(lines[i]).trim(); if (!pl) continue;
        var gm = /^([A-C])\.\s+(.+)/.exec(pl); if (gm) { group = gm[2]; cur = null; continue; }
        if (/^Massachusetts DESE|^Student Name:/.test(pl)) { continue; }
        var sg = segsOf(lines[i]), rest = [];
        var lead = sg.length ? /^(\d+(?:\s*,\s*\d+)*)(?:\s+(\S.*))?$/.exec(sg[0].t) : null;
        if (lead && sg[0].x < 80) {
          cur = { goals: lead[1].replace(/\s+/g, ''), base: [], cells: [], freq: '', dates: [], group: group }; o.services.push(cur);
          if (lead[2]) rest.push({ x: sg[0].x + 15, t: lead[2] });
          rest = rest.concat(sg.slice(1));
          rest.forEach(function (x) { if (!FQ.test(x.t) && !(x.t.match(DT) || []).length) { cur.base.push(x.x); cur.cells.push(x.t); } });
        } else if (cur) { rest = sg; rest.forEach(function (x) {
          if (FQ.test(x.t) || (x.t.match(DT) || []).length) return;
          var c = 0; for (var k = 0; k < cur.base.length; k++) if (x.x + 8 >= cur.base[k]) c = k;
          if (cur.cells.length) cur.cells[c] = (cur.cells[c] + ' ' + x.t).trim(); else { cur.base.push(x.x); cur.cells.push(x.t); }
        }); }
        if (cur) (lead && sg[0].x < 80 ? rest : sg).forEach(function (x) { var fm = FQ.exec(x.t); if (fm) cur.freq = fm[0]; var d2 = x.t.match(DT); if (d2) cur.dates = cur.dates.concat(d2); });
      }
      o.services = o.services.map(function (r) {
        var f2 = /(\d+(?:\.\d+)?)\s*x\s*(\d+)\s*\/\s*(Week|Day|Month|Year|Quarter)/i.exec(r.freq || ''), per = f2 ? f2[3].toLowerCase() : '', times = f2 ? parseFloat(f2[1]) : 0, mins = f2 ? +f2[2] : 0;
        var LOC = /(Meeting Space|Special Ed(?:ucation)? Classroom|Academic Classroom|General Ed(?:ucation)? Classroom|Resource Room|Therapy Room|Playground|Cafeteria|Home|Community)/i, allc = r.cells.slice(1).join(' '), lm = LOC.exec(allc);
        var byTxt = lm ? allc.replace(lm[0], ' ').replace(/\s+/g, ' ').trim() : (r.cells[1] || '');
        return { name: r.cells[0] || 'Service', by: byTxt, where: lm ? lm[0] : (r.cells[2] || ''), goals: r.goals, group: r.group, times: times, mins: mins, per: per,
          detail: f2 ? (times === 1 ? '1 time' : (+times) + ' times') + ' × ' + mins + ' minutes per ' + per : '', start: r.dates[0] || '', end: r.dates[1] || '',
          direct: !/consultation/i.test((r.group || '') + ' ' + (r.cells[0] || '')) };
      }).filter(function (r) { return r.detail; });
    }
    // accommodations (columns found from where the bullets start)
    o.accommodations = [];
    var ah = headerIdx(lines, /Presentation of Instruction/);
    if (ah >= 0) {
      var aend = headerIdx(lines.slice(ah), /STATE AND\/OR DISTRICTWIDE/), stopA = aend > 0 ? ah + aend : Math.min(lines.length, ah + 220), rowsA = [], axs = [];
      for (i = ah + 1; i < stopA; i++) { var sgA = segsOf(lines[i]); if (/^Massachusetts DESE|^Student Name:/.test(plainOf(lines[i]).trim())) continue; rowsA.push(sgA); sgA.forEach(function (x) { axs.push(x.x); }); }
      var starts = clusterStarts(axs, 5, 6), colsA = starts.map(function () { return []; });
      rowsA.forEach(function (r3) { r3.forEach(function (x) { var c4 = nearestCol(starts, x.x); if (c4 >= 0) colsA[c4].push(x.t); }); });
      var seen2 = {};
      colsA.forEach(function (colLines) {
        var items = [], cur2 = null, label = false;
        colLines.forEach(function (ln) {
          if (/^To [Ss]upport/.test(ln)) { label = true; cur2 = null; if (!/[:]$/.test(ln) && /^-/.test(ln)) label = false; return; }
          if (/^[-•–]\s*/.test(ln)) { label = false; cur2 = ln.replace(/^[-•–]\s*/, ''); items.push(cur2); items[items.length - 1] = cur2; return; }
          if (label) { if (/:$/.test(ln)) return; return; }
          if (items.length) items[items.length - 1] += ' ' + ln;
        });
        items.forEach(function (p) {
          p = p.replace(/\s+/g, ' ').trim();
          if (p.length > 6 && p.length < 240 && !/\s[-•–][A-Za-z]/.test(p) && !seen2[p.toLowerCase()]) { seen2[p.toLowerCase()] = 1; o.accommodations.push(p); }
        });
      });
    }
    // additional information
    var add = between(text, /ADDITIONAL INFORMATION[\s\S]*?(?:and services\)\.|not addressed through IEP goals[^\n]*\n)/, /RESPONSE SECTION/);
    o.additional = add.split(/\n\s*\n/).map(function (x) { return firstSentences(x.replace(/\s+/g, ' '), 260, 2); }).filter(function (x) { return x.length > 25; }).slice(0, 6);
    return o;
  }

  function analyze(raw, opts) {
    TODAY = (opts && opts.today) || startOfToday();
    var rawClean = clean(raw), text = clean(plainOf(rawClean)), f = flat(text);
    var res = { chars: f.length, type: detectType(f) };
    if (isIepForm(f)) { res.type = 'iep'; res.form = analyzeIepForm(rawClean); }
    if (f.length < 80) { res.empty = true; return res; }
    res.dates = extractDates(f);
    res.contact = extractContact(f);
    res.narrative = extractNarrative(f);
    res.change = extractChange(f);
    res.goals = extractGoals(text);
    var s = extractServices(text);
    res.services = s.services;
    res.accommodations = s.accommodations;
    res.presentLevels = extractPresentLevels(text);
    res.reports = extractReports(text);
    res.deadlines = buildDeadlines(res.dates, res.type, text);
    res.diagnoses = extractDiagnoses(f);
    res.recommendations = (res.type === 'clinical' || res.type === 'unknown') ? extractRecommendations(text) : [];
    res.hours = extractHours(f);
    res.keySentences = (res.type === 'clinical' || res.type === 'unknown') ? keySentences(text) : [];
    res.datesMentioned = (res.type === 'clinical' || res.type === 'unknown') ? allDates(f) : [];
    if (res.type === 'clinical' && !res.services.length) res.services = res.hours;
    if (res.form) {
      var F = res.form;
      res.goals = F.goals.map(function (g) { return { n: g.n, text: g.text || g.area, by: '', area: g.area }; });
      res.services = F.services.map(function (r) { return { name: r.name, detail: r.detail + (r.by ? ' · ' + r.by : '') + (r.where ? ' · ' + r.where : '') + (r.goals ? ' · goal ' + r.goals.replace(/,/g, ', ') : ''), group: r.group }; });
      res.diagnoses = []; res.recommendations = []; res.datesMentioned = []; res.accommodations = F.accommodations; res.presentLevels = ''; res.reports = { frequency: '', dates: [] };
      res.deadlines = res.deadlines.filter(function (d) { return !/Return the signed|review window/.test(d.label); });
      (F.services || []).forEach(function () {});
    }
    // This demo only looks forward: keep today and later dates.
    var seenAll = [];
    [res.dates].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { if (toDate(o[k])) seenAll.push(o[k]); }); });
    (res.deadlines || []).forEach(function (d) { seenAll.push(d.date); });
    (res.datesMentioned || []).forEach(function (d) { seenAll.push(d); });
    ((res.reports && res.reports.dates) || []).forEach(function (d) { seenAll.push(d); });
    res.deadlines = (res.deadlines || []).filter(function (d) { return isFuture(d.date); });
    res.datesMentioned = (res.datesMentioned || []).filter(function (d) { return !toDate(d) || isFuture(d); });
    if (res.reports) res.reports.dates = res.reports.dates.filter(isFuture).slice(0, 6);
    var dated = seenAll.filter(function (d) { return toDate(d); }).length;
    res.noFutureDates = dated > 0 && !res.deadlines.length && !res.datesMentioned.length && !(res.reports && res.reports.dates.length);
    res.actions = buildActions(res);
    res.summary = buildSummary(res);
    res.found = (res.diagnoses.length ? 1 : 0) + (res.recommendations.length ? 1 : 0) + (res.goals.length ? 1 : 0) + (res.services.length ? 1 : 0) + res.deadlines.length + (res.change.change ? 1 : 0);
    return res;
  }

  var DX = /\b(Autism Spectrum Disorder|ASD|Attention[- ]Deficit(?:\/| and )?Hyperactivity Disorder|ADHD|Intellectual Disability|Global Developmental Delay|Developmental Delay|Speech(?: and Language)? (?:Delay|Disorder)|Language Disorder|Anxiety(?: Disorder)?|Epilepsy|Cerebral Palsy|Down Syndrome|Sensory Processing(?: Disorder)?|Dyslexia|Apraxia(?: of Speech)?|Oppositional Defiant Disorder|Learning Disorder)\b/g;
  var ABBR = { ASD: 'Autism Spectrum Disorder', ADHD: 'ADHD', ID: 'Intellectual Disability', GDD: 'Global Developmental Delay' };

  function extractDiagnoses(f) {
    var seen = {}, out = [], m;
    DX.lastIndex = 0;
    while ((m = DX.exec(f))) {
      var k = (ABBR[m[1]] || m[1]).toLowerCase();
      if (seen[k]) continue;
      var ctx = f.slice(Math.max(0, m.index - 120), m.index).split(/[.;]\s/).pop();
      if (/not (?:better )?explained by|rule[sd]? out|no evidence of|negative for|without (?:a |any )?(?:diagnosis|history) of/i.test(ctx)) continue; // mentioned only to be excluded
      seen[k] = 1; out.push(ABBR[m[1]] || m[1]);
    }
    return out;
  }
  function extractRecommendations(t) {
    var re = /\b(recommend|imperative|essential|should|must|need(?:s)? to|requires?|referr|follow[- ]up|consistent|ongoing|strongly)/i;
    return sentences(t).filter(function (x) { return re.test(x) && x.length > 25 && x.length < 420 && !/^\s*(?:Sincerely|Thank)/i.test(x); }).slice(0, 8);
  }
  function extractHours(f) {
    var out = [], re = /(\d+(?:\s*[–\-]\s*\d+)?)\s*(hours?|minutes?|sessions?)\s+(?:of\s+)?([A-Za-z][A-Za-z\- ]{1,40}?)\s+(?:per|a|each|every)\s+(week|day|month)/gi, m;
    while ((m = re.exec(f))) out.push({ name: m[3].trim(), detail: m[1].replace(/\s+/g, '') + ' ' + m[2] + ' per ' + m[4] });
    var re2 = /recommendation is\s+(\d+(?:\s*[–\-]\s*\d+)?)\s*(hours?)\s+of\s+([A-Za-z][A-Za-z\- ]{1,40}?)\s+per\s+(week|day|month)/gi;
    return out;
  }
  function allDates(f) {
    var out = [], seen = {}, re = new RegExp(DATE + '|(?:' + MONTHS + ')\\s+\\d{1,2},\\s+\\d{4}', 'g'), m;
    while ((m = re.exec(f))) { if (!seen[m[0]]) { seen[m[0]] = 1; out.push(m[0]); } }
    return out.slice(0, 8);
  }
  function keySentences(t) {
    var ss = sentences(t).filter(function (x) { return x.length > 40 && x.length < 400; });
    var KW = /diagnos|recommend|treatment|therapy|goal|plan|require|support|skill|behavior|language|progress|result|score|meets? criteria|concern|important|deficit|delay/i;
    var scored = ss.map(function (x, i) { return { x: x, i: i, s: (KW.test(x) ? 2 : 0) + (i < 3 ? 1 : 0) + (/\d/.test(x) ? 0.5 : 0) }; });
    return scored.sort(function (a, b) { return b.s - a.s || a.i - b.i; }).slice(0, 5).sort(function (a, b) { return a.i - b.i; }).map(function (o) { return o.x; });
  }

  function buildActions(r) {
    var a = [];
    var d = r.dates || {};
    if (r.type === 'amendment') {
      a.push('Read the proposed change and decide: accept, reject part, or reject all.');
      if (d.returnDate && isFuture(d.returnDate)) a.push('Sign and return the response page by ' + pretty(d.returnDate) + '.');
      else if (d.returnDate) a.push('The return date on this notice (' + pretty(d.returnDate) + ') has passed. Ask the contact whether your response is still open.');
      else a.push('Sign and return the response page. Check the notice for the due date.');
      a.push('If you disagree with any part, write that on the response page and ask for a meeting.');
      if (r.contact && (r.contact.email || r.contact.phone)) a.push('Questions: contact ' + (r.contact.name ? r.contact.name + ' ' : 'the district contact ') + [r.contact.phone, r.contact.email].filter(Boolean).join(' or ') + '.');
    } else if (r.type === 'iep' && r.form) {
      var F = r.form;
      a.push('Check that each of the ' + F.goals.length + ' goals says how it will be measured, how often, and by whom.');
      if (F.services.length) a.push('Confirm each service (minutes, how often, who provides it) matches what was agreed at the meeting.');
      if (F.progress) a.push('Progress reports: ' + F.progress);
      a.push('Read the response section at the end. Accept, reject part, or reject all, and sign and return it to the district.');
      if (d.annualReview && !isFuture(d.annualReview)) a.push('The annual review date on this IEP (' + pretty(d.annualReview) + ') has passed. Ask the school for the current IEP and the next meeting date.');
      else a.push('Keep a signed copy and put the next annual review date in your calendar.');
    } else if (r.type === 'iep') {
      if (r.reports && r.reports.dates.length) a.push('Watch for progress reports on ' + r.reports.dates.map(pretty).join(' and ') + '.');
      a.push('Check each goal for a clear way to measure it, and ask how progress will be shown.');
      a.push('Return the signed response page if the document asks for one.');
    }
    else if (r.type === 'clinical') {
      if (r.hours && r.hours.length) a.push('Ask who will provide ' + r.hours.map(function (h) { return h.detail + ' of ' + h.name; }).join(' and ') + ', and how to start (insurance, waitlist, referral).');
      else a.push('Ask the provider what the next step is and how to start.');
      a.push('Share this letter with your child\'s school team and ask how it fits the IEP.');
      a.push('Keep this letter with your records. Insurers and schools often ask for it.');
      if (r.contact && (r.contact.phone || r.contact.email)) a.push('Questions: call or email ' + [r.contact.phone, r.contact.email].filter(Boolean).join(' or ') + '.');
    }
    return a;
  }

  function buildSummary(r) {
    var d = r.dates || {}, L = [];
    if (r.type === 'amendment') {
      var what = r.change.change || (r.narrative && r.narrative.action) || '';
      L.push('This looks like a notice that the school wants to amend the IEP.');
      if (what) L.push('What is changing: ' + trim(what, 260) + (r.change.jumbled ? ' (The table in this file reads out of order, so the wording may be mixed. Check the original.)' : ''));
      if (r.change.why) L.push('Why: ' + trim(r.change.why, 220));
      if (r.narrative && r.narrative.basis) L.push('Based on: ' + trim(r.narrative.basis, 220));
      if (d.returnDate) L.push(isFuture(d.returnDate) ? 'Due: your signed response is due ' + pretty(d.returnDate) + '.' : 'The date to return your response, ' + pretty(d.returnDate) + ', has passed.');
      if (d.iepFrom && d.iepTo) L.push('It attaches to the IEP running ' + pretty(d.iepFrom) + ' to ' + pretty(d.iepTo) + '.');
    } else if (r.type === 'iep' && r.form) {
      var F = r.form;
      L.push('This looks like a full IEP' + (d.iepFrom && d.iepTo ? ' for ' + pretty(d.iepFrom) + ' to ' + pretty(d.iepTo) : '') + '.');
      if (F.disabilities.length) L.push('Disability category marked: ' + F.disabilities.join(', ') + '.');
      if (F.goals.length) L.push(F.goals.length + ' annual goals: ' + F.goals.map(function (g) { return g.area; }).join(', ') + '.');
      if (F.services.length) L.push(F.services.length + ' services listed' + (F.accommodations.length ? ', and ' + F.accommodations.length + ' accommodations.' : '.'));
      if (F.outside) L.push('Time outside the general classroom: ' + trim(F.outside, 240));
    } else if (r.type === 'iep') {
      L.push('This looks like an IEP.');
      if (r.presentLevels) L.push('Where things stand now: ' + trim(r.presentLevels, 260));
      if (r.goals.length) L.push(r.goals.length + ' annual goal' + (r.goals.length > 1 ? 's' : '') + ' found.');
      if (r.services.length) L.push(r.services.length + ' service' + (r.services.length > 1 ? 's' : '') + ' found' + (r.accommodations.length ? ', plus ' + r.accommodations.length + ' accommodations.' : '.'));
    } else if (r.type === 'clinical') {
      L.push('This looks like a letter from a clinician about an evaluation, diagnosis or treatment.');
      if (r.diagnoses.length) L.push('Conditions named: ' + r.diagnoses.join(', ') + '.');
      if (r.hours && r.hours.length) L.push('Recommended: ' + r.hours.map(function (h) { return h.detail + ' of ' + h.name; }).join('; ') + '.');
      if (r.recommendations.length) L.push('Main point: ' + trim(r.recommendations[0], 260));
    } else {
      L.push('We could not tell exactly what kind of document this is, so here are the sentences that look most important.');
      r.keySentences.slice(0, 3).forEach(function (x) { L.push(trim(x, 240)); });
    }
    return L;
  }
  function trim(s, n) { s = flat(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  var api = { analyze: analyze, isFuture: isFuture, stripRepeats: stripRepeats, clean: clean, pretty: pretty, toDate: toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpecialMeExtract = api;
})(typeof self !== 'undefined' ? self : this);
