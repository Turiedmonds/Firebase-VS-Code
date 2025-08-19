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

  const role = (SessionState.get().user_role || '').toLowerCase();

  if (role === 'contractor') {
    if (!pageIs('dashboard.html')) redirect('dashboard.html');
  } else if (role === 'staff') {
    if (!pageIs('tally.html')) redirect('tally.html');
  } else {
    if (!pageIs('auth-check.html')) redirect('auth-check.html');
  }
})();

