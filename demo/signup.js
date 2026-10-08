/* SpecialMe demo: trial sign-up (same table as the main site, tagged source = demo). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
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
