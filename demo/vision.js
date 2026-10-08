/* SpecialMe demo: Vision builder. A parent answers a few questions, and the page writes a draft "Parent Vision" and a first-person
   "Child's Vision" for an IEP meeting. No AI: it fills sentence templates with the answers. Everything stays in this browser. */
(function (root) {
  'use strict';

  /* ---------- questions ---------- */
  var PARENT = [
    { id: 'words', type: 'text', label: 'Three words for your child at their best', hint: 'For example: curious, funny, kind.' },
    { id: 'loves', type: 'text', label: 'What does your child love learning about or doing?', hint: 'Separate with commas. For example: reading encyclopedias, stories, building with blocks.' },
    { id: 'social', type: 'radio', label: 'How does your child feel about being with other kids?', options: [
      ['social', 'Very social. Asks for friends and loves to play'],
      ['small', 'Likes one or two friends or small groups best'],
      ['slow', 'Takes time to warm up. Sometimes prefers time alone'],
      ['varies', 'It changes a lot from day to day']] },
    { id: 'socialMore', type: 'text', label: 'Anything to add about friendships? (optional)', hint: 'One sentence is plenty.' },
    { id: 'hard', type: 'checks', label: 'What is hard for your child right now?', hint: 'Tick all that fit.', options: [
      ['express', 'organizing and sharing thoughts out loud or in writing'], ['writing', 'writing by hand'], ['reading', 'reading'], ['math', 'math'],
      ['focus', 'staying focused'], ['feelings', 'managing big feelings'], ['sensory', 'loud or busy places'], ['changes', 'changes and transitions'],
      ['social', 'understanding social situations'], ['motor', 'fine motor tasks'], ['communication', 'communicating what they need']] },
    { id: 'hardOther', type: 'text', label: 'Something else that is hard (optional)' },
    { id: 'hardWhen', type: 'text', label: 'When does it show up most? (optional)', hint: 'For example: when they are excited, tired, or have many thoughts at once.' },
    { id: 'aware', type: 'radio', label: 'Is your child noticing differences between themselves and other kids?', options: [
      ['yes', 'Yes, more and more'], ['little', 'A little'], ['no', 'Not yet'], ['unsure', 'Not sure']] },
    { id: 'works', type: 'checks', label: 'What helps your child now?', hint: 'At home or at school.', options: [
      ['scribe', 'a scribe (someone who writes down ideas)'], ['stt', 'a tablet with speech-to-text'], ['time', 'extra time to think'], ['visual', 'a visual schedule or pictures'],
      ['breaks', 'movement or calm-down breaks'], ['small', 'small group or one-to-one help'], ['preview', 'knowing what is coming next'], ['quiet', 'a quiet place to reset'],
      ['organizers', 'graphic organizers or checklists'], ['praise', 'encouragement and positive attention']] },
    { id: 'worksOther', type: 'text', label: 'Anything else that helps (optional)' },
    { id: 'thanks1', type: 'person', label: 'Someone you want to thank (optional)', nameLabel: 'First name', doLabel: 'Thank them for…', hint: 'For example: being patient and connecting with my child.' },
    { id: 'thanks2', type: 'person', label: 'Another person to thank (optional)', nameLabel: 'First name', doLabel: 'Thank them for…' },
    { id: 'goals', type: 'checks', label: 'What do you hope for in the long run?', hint: 'Tick up to five.', options: [
      ['confident', 'grow as a confident learner'], ['friends', 'build lasting friendships'], ['organize', 'learn tools to organize their thoughts'], ['share', 'share their ideas clearly with others'],
      ['feelings', 'manage big feelings when things are hard'], ['independent', 'become more independent'], ['visible', 'show what they really know'], ['advocate', 'speak up for what they need'],
      ['joy', 'keep their love of learning']] },
    { id: 'hope', type: 'text', label: 'In three years, I hope… (optional)', hint: 'Finish the sentence in your own words.' },
    { id: 'first', type: 'text', label: 'What should the team focus on first? (optional)' }
  ];
  var CHILD = [
    { id: 'cLike', type: 'text', label: 'I like learning about…', hint: 'Use your child\'s own words if you can.' },
    { id: 'cFriends', type: 'text', label: 'With other kids, I like to…', hint: 'For example: play games, talk about my favorite things.' },
    { id: 'cHard', type: 'checks', label: 'It can be hard for me to…', hint: 'Tick what fits.', options: [
      ['explain', 'explain what I am thinking'], ['write', 'write things down'], ['read', 'read'], ['math', 'do math'], ['focus', 'pay attention'],
      ['feelings', 'handle big feelings'], ['loud', 'be in loud or busy places'], ['change', 'deal with changes'], ['friends', 'make or keep friends']] },
    { id: 'cHelps', type: 'checks', label: 'It helps me when…', hint: 'Tick what fits.', options: [
      ['time', 'teachers give me time to think'], ['write', 'someone helps me write things down'], ['tablet', 'I can use a tablet or talk-to-type'], ['break', 'I can take a break'],
      ['pictures', 'I can see a picture schedule'], ['quiet', 'I have a quiet place'], ['next', 'I know what is coming next'], ['listen', 'someone listens to me']] },
    { id: 'cProud', type: 'text', label: 'I am proud that I…' },
    { id: 'cBetter', type: 'text', label: 'I want to get better at…' },
    { id: 'cKnow', type: 'text', label: 'I want grown-ups to know…' }
  ];

  /* ---------- helpers ---------- */
  function split(t) { return String(t || '').split(/[,;\n]+/).map(function (x) { return x.trim().replace(/[.]+$/, ''); }).filter(Boolean); }
  function join(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function sentence(t) { t = String(t || '').trim(); if (!t) return ''; t = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(t) ? t : t + '.'; }
  function lc(t) { t = String(t); return /^(The|A|An|My|Our|When|Help|Being|Having|Using|To|Getting|Learning|Making|Feeling)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function opt(list, id, keys) { var q = list.filter(function (x) { return x.id === id; })[0]; return (keys || []).map(function (k) { var o = q.options.filter(function (x) { return x[0] === k; })[0]; return o ? o[1] : null; }).filter(Boolean); }
  var PRON = {
    he: { they: 'he', They: 'He', them: 'him', their: 'his', Their: 'His', be: 'is', has: 'has', s: 's', es: 'es' },
    she: { they: 'she', They: 'She', them: 'her', their: 'her', Their: 'Her', be: 'is', has: 'has', s: 's', es: 'es' },
    they: { they: 'they', They: 'They', them: 'them', their: 'their', Their: 'Their', be: 'are', has: 'have', s: '', es: '' }
  };
  function P(str, p) { return str.replace(/\{(\w+)\}/g, function (m, k) { return p[k] != null ? p[k] : m; }); }

  /* ---------- generation ---------- */
  function generate(a) {
    a = a || {};
    var p = PRON[a.pronoun] || PRON.they, nm = (a.name || '').trim(), N = nm || 'Our child', Nposs = nm ? nm + '’s' : 'Our child’s', nlow = nm || 'our child';
    var out = [], g = function (id) { return a[id]; }, list = function (id) { return g(id) || []; };

    // 1. who they are
    var words = split(g('words')), loves = split(g('loves')), s1 = '';
    s1 = N + ' is ' + (words.length ? join(words) : 'a unique child with many strengths') + '.';
    if (loves.length) s1 += ' ' + P('{They} love{s} ' + join(loves) + ', and {their} enthusiasm shows when {they} {be} learning about things that matter to {them}.', p);
    out.push(s1);

    // 2. friendships
    var soc = {
      social: N + ' is a very social child who enjoys being around other kids and gets excited about chances to play and connect. Relationships are important to ' + p.them + '.',
      small: N + ' enjoys friendships most with one or two friends or in small groups, and does best when the setting feels comfortable.',
      slow: N + ' sometimes prefers time alone and can take a while to warm up to new people and groups. ' + p.They + ' still value' + p.s + ' connection once ' + p.they + ' feel' + p.s + ' comfortable.',
      varies: 'How ' + nlow + ' feels about being with other kids changes from day to day and place to place.'
    }[g('social')] || '';
    if (g('socialMore')) soc += ' ' + sentence(g('socialMore'));
    if (soc) out.push(soc);

    // 3. what is hard
    var hard = opt(PARENT, 'hard', list('hard')).concat(split(g('hardOther')));
    if (hard.length) {
      var s3 = 'At the same time, as we see at home and at school, ' + nlow + ' finds these things hard: ' + join(hard) + '.';
      if (g('hardWhen')) s3 += ' It shows up most ' + lc(String(g('hardWhen')).replace(/^(when|during|in)\s+/i, function (m) { return m.toLowerCase(); })).replace(/[.]+$/, '') + '.';
      s3 += P(' Even when {they} understand{s} an idea or {be} excited to share it, getting it out clearly can take extra support.', p);
      if (list('hard').indexOf('express') < 0 && list('hard').indexOf('communication') < 0) s3 = s3.replace(/ Even when .*$/, '');
      out.push(s3);
    }
    var aw = { yes: nlow + ' is becoming more aware of differences between ' + p.them + 'self and other kids, and some classmates are starting to notice too. Tools for communication, emotional regulation and social interaction matter even more now, so ' + nlow + ' can keep building good relationships and feel confident.',
      little: nlow + ' is starting to notice differences between ' + p.them + 'self and other kids. Tools for communication, emotional regulation and social interaction will help ' + p.them + ' as friendships become more complex.' }[g('aware')];
    if (aw) out.push(aw.replace(/^./, function (c) { return c.toUpperCase(); }).replace('themself', 'themselves'));

    // 4. supports
    var works = opt(PARENT, 'works', list('works')).concat(split(g('worksOther')));
    if (works.length) out.push('What helps ' + nlow + ' now: ' + join(works) + '. We are grateful for the supports that are already in place, and we want to keep what works.');
    else out.push('We would like to talk with the team about which supports could help ' + nlow + ' most.');

    // 5. thanks
    ['thanks1', 'thanks2'].forEach(function (k) {
      var t = g(k); if (t && (t.name || t.what)) out.push(t.name && t.what ? 'We are truly grateful to ' + t.name + ' for ' + lc(String(t.what).replace(/[.]+$/, '')) + '.' : t.name ? 'We are truly grateful to ' + t.name + ' for the care shown to ' + nlow + '.' : sentence(t.what));
    });

    // 6. long term
    var goalPhrases = { confident: 'grow as a confident learner', friends: 'build lasting friendships', organize: 'learn tools to organize {their} thoughts', share: 'share {their} ideas clearly with others',
      feelings: 'manage big feelings when things are hard', independent: 'become more independent', visible: 'show what {they} really know{s}', advocate: 'speak up for what {they} need{s}', joy: 'keep {their} love of learning' };
    var gl = list('goals').map(function (k) { return P(goalPhrases[k], p); }).filter(Boolean);
    var s6 = '';
    if (gl.length) s6 = 'Our long-term vision is that ' + nlow + ' will ' + join(gl) + '.';
    if (g('hope')) s6 += (s6 ? ' ' : '') + 'In three years, we hope ' + lc(String(g('hope')).replace(/^(that\s+)/i, '')).replace(/[.]+$/, '') + '.';
    if (s6) out.push(s6);

    // 7. first focus and closing
    var s7 = '';
    if (g('first')) s7 += 'The first thing we would like the team to focus on is ' + lc(String(g('first')).replace(/^(is\s+)/i, '')).replace(/[.]+$/, '') + '. ';
    s7 += 'We look forward to working with the school team. With strong teamwork between home and school and the support ' + nlow + ' already has, we believe ' + p.they + ' will keep building confidence, resilience and a love of learning.';
    out.push(s7);

    // child
    var c = [], cg = function (id) { return a[id]; };
    c.push(nm ? 'Hi, my name is ' + nm + '.' : 'Hi! This is my vision.');
    if (cg('cLike')) c.push('I like learning about ' + lc(String(cg('cLike')).replace(/^(about\s+)/i, '')).replace(/[.]+$/, '') + '.');
    if (cg('cFriends')) c.push('With other kids, I like to ' + lc(String(cg('cFriends')).replace(/^(to\s+)/i, '')).replace(/[.]+$/, '') + '.');
    var ch = opt(CHILD, 'cHard', list('cHard'));
    if (ch.length) c.push('Sometimes it can be hard for me to ' + join(ch) + '.');
    var cz = opt(CHILD, 'cHelps', list('cHelps'));
    if (cz.length) c.push('It helps me when ' + join(cz) + '.');
    if (cg('cProud')) c.push('I am proud that I ' + lc(String(cg('cProud')).replace(/^(that\s+)?I\s+/i, '')).replace(/[.]+$/, '') + '.');
    if (cg('cBetter')) c.push('I want to get better at ' + lc(String(cg('cBetter')).replace(/^(at\s+)/i, '')).replace(/[.]+$/, '') + '.');
    if (cg('cKnow')) c.push('I want grown-ups to know ' + lc(String(cg('cKnow')).replace(/^(that\s+)/i, '')).replace(/[.]+$/, '') + '.');
    if (c.length < 2) c.push('I am still thinking about what I want to say. This space is for my own words.');

    return { parentTitle: 'Parent Vision for ' + (nm || 'our child'), childTitle: nm ? nm + '’s Vision' : 'My Vision', parent: out, child: c };
  }

  var api = { PARENT: PARENT, CHILD: CHILD, generate: generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpecialMeVision = api;
})(typeof self !== 'undefined' ? self : this);
