/* SpecialMe demo: rule-based extraction. No AI, no network. Pure functions, so they can be tested in Node.
   Input: plain text of a document. Output: a plain object the page renders. */
(function (root) {
  'use strict';

  var DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})';
  var MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

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
    var m = new RegExp('IEP dated:?\\s*from\\s*' + DATE + '\\s*to\\s*' + DATE, 'i').exec(f) ||
            new RegExp('IEP dates:?\\s*from\\s*' + DATE + '\\s*to\\s*' + DATE, 'i').exec(f);
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
    var sec = first(/Progress reports?\s*(.+?)(?=\s*Next steps|$)/i, f);
    var dates = [], re = new RegExp(DATE, 'g'), m;
    while ((m = re.exec(sec))) dates.push(m[1]);
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

  function analyze(raw) {
    var text = clean(raw), f = flat(text);
    var res = { chars: f.length, type: detectType(f) };
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
    res.actions = buildActions(res);
    res.summary = buildSummary(res);
    res.found = (res.goals.length ? 1 : 0) + (res.services.length ? 1 : 0) + res.deadlines.length + (res.change.change ? 1 : 0);
    return res;
  }

  function buildActions(r) {
    var a = [];
    var d = r.dates || {};
    if (r.type === 'amendment') {
      a.push('Read the proposed change and decide: accept, reject part, or reject all.');
      if (d.returnDate) a.push('Sign and return the response page by ' + pretty(d.returnDate) + '.');
      else a.push('Sign and return the response page. Check the notice for the due date.');
      a.push('If you disagree with any part, write that on the response page and ask for a meeting.');
      if (r.contact && (r.contact.email || r.contact.phone)) a.push('Questions: contact ' + (r.contact.name ? r.contact.name + ' ' : 'the district contact ') + [r.contact.phone, r.contact.email].filter(Boolean).join(' or ') + '.');
    } else if (r.type === 'iep') {
      if (r.reports && r.reports.dates.length) a.push('Watch for progress reports on ' + r.reports.dates.map(pretty).join(' and ') + '.');
      a.push('Check each goal for a clear way to measure it, and ask how progress will be shown.');
      a.push('Return the signed response page if the document asks for one.');
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
      if (d.returnDate) L.push('Due: your signed response is due ' + pretty(d.returnDate) + '.');
      if (d.iepFrom && d.iepTo) L.push('It attaches to the IEP running ' + pretty(d.iepFrom) + ' to ' + pretty(d.iepTo) + '.');
    } else if (r.type === 'iep') {
      L.push('This looks like an IEP.');
      if (r.presentLevels) L.push('Where things stand now: ' + trim(r.presentLevels, 260));
      if (r.goals.length) L.push(r.goals.length + ' annual goal' + (r.goals.length > 1 ? 's' : '') + ' found.');
      if (r.services.length) L.push(r.services.length + ' service' + (r.services.length > 1 ? 's' : '') + ' found' + (r.accommodations.length ? ', plus ' + r.accommodations.length + ' accommodations.' : '.'));
    } else {
      L.push('We could not tell what kind of document this is. Here is what we found anyway.');
    }
    return L;
  }
  function trim(s, n) { s = flat(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  var api = { analyze: analyze, clean: clean, pretty: pretty, toDate: toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpecialMeExtract = api;
})(typeof self !== 'undefined' ? self : this);
