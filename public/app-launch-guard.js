// public/app-launch-guard.js
(function () {
  if (sessionStorage.getItem('launch_checked') === '1') return;
  sessionStorage.setItem('launch_checked', '1');

  function pageIs(name) {
    const p = location.pathname.toLowerCase();
    return p.endsWith('/' + name) || p.endsWith(name);
  }

  function coldEntry() {
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      return !nav || nav.type === 'navigate' || nav.type === 'reload';
    } catch { return true; }
  }

  function redirect(to) {
    if (sessionStorage.getItem('launch_redirected') === '1') return;
    sessionStorage.setItem('launch_redirected', '1');
    window.location.replace(to);
  }

  if (!coldEntry()) return;

  const role = (localStorage.getItem('user_role') || '').toLowerCase();
  const pref = (localStorage.getItem('preferred_start') || '').toLowerCase();
  let want = '';

  if (role === 'contractor') {
    want = 'dashboard.html';
  } else if (role === 'staff') {
    want = 'tally.html';
  } else {
    if (pref === 'dashboard') want = 'dashboard.html';
    else if (pref === 'tally') want = 'tally.html';
  }

  if (!want) return;

  if (want === 'dashboard.html' && !pageIs('dashboard.html')) redirect('dashboard.html');
  if (want === 'tally.html' && !pageIs('tally.html')) redirect('tally.html');
})();

