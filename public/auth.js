firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function logout() {
  firebase.auth().signOut().then(() => {
    // Clear any cached session data after sign out
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('login.html');
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
