if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .catch(console.error);
}

SessionState.ready().then(state => {
  if (!state.uid) {
    window.location.href = 'login.html';
  }
});

export async function handleLogout() {
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
  try {
    await firebase.auth().signOut();
  } finally {
    if (overlay) {
      overlay.style.display = 'none';
    }
    SessionState.clear();
    sessionStorage.clear();
    window.location.replace('login.html');
  }
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
