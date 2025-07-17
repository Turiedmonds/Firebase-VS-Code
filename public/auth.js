firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'login.html';
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
