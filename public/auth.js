firebase.auth().onAuthStateChanged(user => {
  const info = document.getElementById('userInfo');
  if (user) {
    if (info) info.textContent = `Logged in as: ${user.email}`;
  } else {
    window.location.href = 'login.html';
  }
});

export function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'login.html';
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
