firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function logout() {
  const confirmed = confirm(
    'Logging out now will prevent offline access. Continue?'
  );
  if (!confirmed) {
    return;
  }
  firebase.auth().signOut().then(() => {
    // Clear any cached session data after sign out
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('login.html');
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
