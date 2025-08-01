firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function logout() {
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
  firebase.auth().signOut().then(() => {
    if (overlay) {
      overlay.style.display = 'none';
    }
    // Clear any cached session data after sign out
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('login.html');
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
