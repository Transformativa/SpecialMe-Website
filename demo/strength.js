/* SpecialMe demo: "IEP strength check". Rule-based, no AI. Takes the text of an IEP plus the result of SpecialMeExtract.analyze
   and reports what looks well covered, what is thin or not found, and questions to bring to the next meeting.
   It looks for words and numbers. It cannot judge quality or legal compliance, and it can miss things. */
(function (root) {
  'use strict';
  function flat(t) { return String(t || '').replace(/‖\d+‖/g, ' ').replace(/\s+/g, ' ').trim(); }

  var MEASURE = /\b\d{1,3}\s?%|\b\d+\s*(?:out of|of|\/)\s*\d+\b|\b\d+\s+(?:trials?|times|opportunities|sessions|days|attempts|words|sentences|steps|minutes)\b|\b(?:accuracy|independently|without (?:prompts?|reminders?|adult)|with no more than|at least|average of)\b/i;
  var BASE = /\b(?:currently|baseline|presently|at this time|at present|starting point|right now|can now|is able to|was able to|from \d+\s?%|now (?:reads|writes|uses|does|completes)|present level)/i;
  var TIME = /\b(?:by (?:the end of|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})|within (?:\d+|one|two|three|four|six|twelve) (?:weeks?|months?)|annual|in \d+ (?:weeks?|months?)|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;
  var HOW = /\b(?:data collection|work samples?|teacher (?:records?|observation)|observation|probe|checklist|rubric|curriculum[- ]based|assessment|running record|tally|charted|log\b|portfolio|daily data|trial data)/i;

  function goalTexts(res) {
    if (res.form) return res.form.goals.map(function (g) { return { n: g.n, area: g.area, text: [g.text, g.criteria, g.baseline].filter(Boolean).join(' '), own: g.text || '', criteria: g.criteria || '', baseline: g.baseline || '', objectives: g.objectives || [] }; });
    return (res.goals || []).map(function (g) { return { n: g.n, area: g.area || '', text: g.text, own: g.text, criteria: '', baseline: '', objectives: [] }; });
  }

  function mention(re, f, strongAt) { var n = (f.match(new RegExp(re.source, 'gi')) || []).length; return n >= (strongAt || 3) ? 'strong' : n ? 'partial' : 'none'; }
  function level(count, total, strongAt, partAt) {
    if (!total) return 'none';
    var r = count / total;
    return r >= strongAt ? 'strong' : r >= (partAt == null ? 0.4 : partAt) ? 'partial' : (count ? 'thin' : 'none');
  }

  function evaluate(raw, res) {
    var f = flat(raw), items = [], goals = goalTexts(res), gOut = [];
    var F = res.form || null;

    // Goals
    var mCount = 0, bCount = 0, tCount = 0, hCount = 0;
    goals.forEach(function (g) {
      var t = g.text, m = MEASURE.test(t), b = BASE.test(t) || !!g.baseline, ti = TIME.test(t) || /annual/i.test(g.area) || !!(res.form && res.dates && (res.dates.iepTo || res.dates.iepFrom)), h = HOW.test(t) || HOW.test(g.criteria);
      if (m) mCount++; if (b) bCount++; if (ti) tCount++; if (h) hCount++;
      gOut.push({ n: g.n, area: g.area, text: g.own, measurable: m, baseline: b, timeframe: ti, method: h });
    });
    var N = goals.length;
    items.push({
      id: 'goals-found', title: 'Goals are written down', level: N ? (N >= 2 ? 'strong' : 'partial') : 'none',
      found: N ? N + ' goal' + (N > 1 ? 's' : '') + ' found.' : 'No goals found.',
      why: 'Goals say what the school will work on this year. Without them it is hard to tell whether the IEP is working.',
      ask: 'Can you point me to the annual goals, and tell me how they connect to my child\'s needs?'
    });
    if (N) {
      items.push({
        id: 'goals-measure', title: 'Goals can be measured', level: level(mCount, N, 0.8),
        found: mCount + ' of ' + N + ' goals include a number or a clear way to count success (like "4 of 5 tries").',
        why: 'A goal with a number is easier to track and harder to argue about later.',
        ask: 'For each goal, how will we know it has been met? What number or level counts as success?'
      });
      items.push({
        id: 'goals-baseline', title: 'Goals show a starting point', level: level(bCount, N, 0.7),
        found: bCount + ' of ' + N + ' goals mention where the child is now.',
        why: 'Progress means little unless you know where the child started.',
        ask: 'Where is my child right now on each goal, in numbers or examples?'
      });
      items.push({
        id: 'goals-time', title: 'Goals have a time frame', level: level(tCount, N, 0.8),
        found: tCount + ' of ' + N + ' goals include a date or time frame.',
        why: 'A date tells everyone when to check whether the goal was met.',
        ask: 'By when should each goal be met, and when will we look at it together?'
      });
      items.push({
        id: 'goals-method', title: 'It says how progress is tracked', level: hCount >= Math.ceil(N / 2) ? 'strong' : (hCount || HOW.test(f) ? 'partial' : 'none'),
        found: hCount ? hCount + ' goal' + (hCount > 1 ? 's' : '') + ' name a way of tracking (data, work samples, observation).' : (HOW.test(f) ? 'A way of tracking progress is mentioned somewhere in the document.' : 'No tracking method found.'),
        why: 'Knowing who collects what, and how often, keeps goals from being forgotten.',
        ask: 'Who tracks progress on each goal, using what (data sheets, work samples, observation), and how often?'
      });
    }

    // Present levels and strengths
    var hasLevels = F ? F.levels.length > 0 : !!res.presentLevels || /present levels?|current performance|academic achievement and functional performance/i.test(f);
    items.push({
      id: 'levels', title: 'Where my child is now is described', level: hasLevels ? 'strong' : 'none',
      found: hasLevels ? 'A "present levels" or current-performance section was found.' : 'No present-levels section found.',
      why: 'This section is the base for every goal and service.',
      ask: 'Can we add current examples and test results to the present levels?'
    });
    var strengthHits = (f.match(/\b(?:strengths?|enjoys|loves|likes to|interests?|motivated by|motivates|excels|is good at|talented|curious|creative)\b/gi) || []).length;
    items.push({
      id: 'strengths', title: 'Strengths and interests are named', level: strengthHits >= 4 ? 'strong' : strengthHits >= 1 ? 'partial' : 'none',
      found: strengthHits ? 'Strength or interest words appear ' + strengthHits + ' time' + (strengthHits > 1 ? 's' : '') + '.' : 'No strengths or interests found.',
      why: 'Good IEPs build on what a child enjoys and does well, not only on what is hard.',
      ask: 'Can we add my child\'s strengths and interests, and use them in the goals and supports?'
    });
    var parentIn = F ? !!F.concerns : /parent(?:al)? concerns?|family concerns?|parent input|vision|concerns of the parent|parent\/guardian concerns/i.test(f);
    items.push({
      id: 'parent', title: 'Family concerns or vision are included', level: parentIn ? 'strong' : 'none',
      found: parentIn ? 'A family concerns or vision section was found.' : 'No family concerns or vision found.',
      why: 'Parents are equal members of the IEP team. Your words belong in the document.',
      ask: 'May I add a parent vision statement and my concerns to the IEP?'
    });

    // Services
    var svc = F ? F.services : (res.services || []), S = svc.length, sFreq = 0, sWhere = 0, sDur = 0;
    svc.forEach(function (s) {
      var d = [s.name, s.detail, s.by, s.where].join(' ');
      if (/\b(?:per|a|each|every(?: other)?)\s+(?:day|week|month|session)|daily|weekly|monthly|\b\d+\s?x\b|times? (?:a|per) |\d+\s?(?:x|×)\s?\d+/i.test(d)) sFreq++;
      if (/\b\d+\s*(?:min|minutes|hours?|hrs?)\b|\d+\s*(?:x|×)\s*\d+/i.test(d)) sDur++;
      if (/general education|classroom|resource|small group|separate|individual|push[- ]?in|pull[- ]?out|home|community|inclusion|setting|room/i.test(d) || s.where) sWhere++;
    });
    items.push({
      id: 'services', title: 'Services are listed', level: S ? 'strong' : 'none',
      found: S ? S + ' service' + (S > 1 ? 's' : '') + ' found.' : 'No services found.',
      why: 'Services are what the school promises to provide.',
      ask: 'Which services and supports will my child get, and who provides each one?'
    });
    if (S) {
      items.push({
        id: 'services-detail', title: 'Services say how much, how often, and where', level: level(Math.min(sFreq, sDur, sWhere), S, 0.8, 0.5),
        found: sDur + ' of ' + S + ' give minutes or hours, ' + sFreq + ' give how often, ' + sWhere + ' say where.',
        why: 'Clear amounts and locations make it possible to see whether the school delivered what it promised.',
        ask: 'For each service, how many minutes, how often, in what setting, and who provides it?'
      });
    }

    // Accommodations and assistive tech
    var accs = F ? F.accommodations : (res.accommodations || []), A = accs.length;
    items.push({
      id: 'accommodations', title: 'Accommodations are listed', level: A >= 5 ? 'strong' : A >= 1 ? 'partial' : 'none',
      found: A ? A + ' accommodation' + (A > 1 ? 's' : '') + ' found.' : 'No accommodations found.',
      why: 'Accommodations change how a child learns or shows what they know, such as extra time or a scribe.',
      ask: 'Which accommodations does my child need in class and on tests, and are they the same on state tests?'
    });
    var at = /assistive technology|\bAT\b|speech[- ]to[- ]text|text[- ]to[- ]speech|ipad|tablet|laptop|communication device|AAC|word prediction|audiobook|screen reader/i.test(f);
    items.push({
      id: 'at', title: 'Assistive technology is considered', level: mention(/assistive technology|\bAT\b|speech[- ]to[- ]text|text[- ]to[- ]speech|ipad|tablet|laptop|communication device|AAC|word prediction|audiobook|screen reader/, f, 2),
      found: at ? 'Assistive technology or a device is mentioned.' : 'No assistive technology found.',
      why: 'The IEP team has to consider whether a device or tool would help.',
      ask: 'Was assistive technology discussed for my child? Which tools, and who trains the child and teachers?'
    });

    // Progress reporting
    var rep = F ? F.progress : (res.reports && (res.reports.frequency || (res.reports.dates || []).length) ? (res.reports.frequency || 'dates listed') : '');
    var repFound = rep || /progress (?:reports?|monitoring)|report(?:s)? (?:on|of) progress|report cards?/i.test(f);
    var repFreq = /quarter|trimester|each marking period|every \d+ weeks?|semester|term|report card|monthly|weekly/i.test(String(rep) + ' ' + f);
    items.push({
      id: 'reports', title: 'Progress reports are promised, with how often', level: repFound && repFreq ? 'strong' : repFound ? 'partial' : 'none',
      found: repFound ? (repFreq ? 'Progress reporting and how often were found.' : 'Progress reporting is mentioned, but not how often.') : 'No progress reporting found.',
      why: 'Regular reports let you catch problems early instead of at the next annual meeting.',
      ask: 'How and how often will I get progress reports on each goal, and can I also get the raw data?'
    });

    // Whole child
    var social = /social|emotional|behavio|self[- ]regulat|peer|friend|coping|anxiety|pragmatic/i.test(f);
    items.push({
      id: 'social', title: 'Social, emotional or behavior needs are addressed', level: mention(/social|emotional|behavio|self[- ]regulat|peer|friend|coping|anxiety|pragmatic/, f, 4),
      found: social ? 'Social, emotional or behavior topics appear.' : 'No social, emotional or behavior topics found.',
      why: 'These skills often decide whether a child can use what they learn.',
      ask: 'Are there goals or supports for friendships, feelings and self-regulation?'
    });
    var lre = /general education|least restrictive|nonparticipation|not participate|percent of (?:the )?time|time (?:with|outside)|inclusion|peers/i.test(f);
    items.push({
      id: 'lre', title: 'Time with classmates is explained', level: mention(/general education|least restrictive|nonparticipation|percent of (?:the )?time|inclusion|peers/, f, 3),
      found: lre ? 'The document explains time in general education or with peers.' : 'No explanation of time with classmates found.',
      why: 'The law prefers that children learn with classmates who do not have disabilities as much as is appropriate.',
      ask: 'How much of the day will my child spend in general education, and why?'
    });
    var tr = /transition (?:plan|services?|assessment|goals?)|post-?secondary|after high school|vocational|independent living/i.test(f);
    items.push({
      id: 'transition', title: 'Transition planning (for teens)', level: tr ? mention(/transition (?:plan|services?|assessment|goals?)|post-?secondary|after high school|vocational|independent living/, f, 3) : 'na',
      found: tr ? 'Transition planning is mentioned.' : 'Not found. This only applies from about age 14 to 16, depending on your state.',
      why: 'For older students, the IEP has to plan for life after school.',
      ask: 'If my child is near transition age, when does transition planning start and who is involved?'
    });
    var esy = /extended school year|\bESY\b|summer (?:services?|program)|regression/i.test(f);
    items.push({
      id: 'esy', title: 'Summer or extended school year is considered', level: mention(/extended school year|\bESY\b|summer (?:services?|program)|regression/, f, 3),
      found: esy ? 'Extended school year or summer services are mentioned.' : 'Not found.',
      why: 'Some children lose skills over breaks and may need services in the summer.',
      ask: 'Was extended school year discussed? What information was used to decide?'
    });

    // Tally
    var scored = items.filter(function (i) { return i.level !== 'na'; }), pts = { strong: 1, partial: 0.5, thin: 0.25, none: 0 };
    var total = scored.length, sum = scored.reduce(function (a, i) { return a + pts[i.level]; }, 0);
    return {
      docType: res.type, items: items, goals: gOut, strongCount: scored.filter(function (i) { return i.level === 'strong'; }).length,
      total: total, percent: total ? Math.round(sum / total * 100) : 0,
      questions: items.filter(function (i) { return i.level !== 'strong' && i.level !== 'na'; }).map(function (i) { return i.ask; }).concat(items.filter(function (i) { return i.level === 'na'; }).map(function (i) { return i.ask; }))
    };
  }

  var api = { evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpecialMeStrength = api;
})(typeof self !== 'undefined' ? self : this);
