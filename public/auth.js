if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .catch(console.error);
}

firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function handleLogout() {
  const confirmed = confirm(
    'Warning: You won’t be able to log back in without internet access. Are you sure you want to log out?'
  );
  if (!confirmed) {
    return;
  }
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
  firebase.auth().signOut().finally(() => {
    if (overlay) {
      overlay.style.display = 'none';
    }
    try {
      localStorage.removeItem('user_role');
      localStorage.removeItem('contractor_id');
    } catch (_) {}
    sessionStorage.clear();
    window.location.replace('login.html');
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
