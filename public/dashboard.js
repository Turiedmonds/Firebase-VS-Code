import { handleLogout } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      return;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }

    const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
    if (btnViewSavedSessions) {
      btnViewSavedSessions.addEventListener('click', () => {
        window.location.href = 'view-sessions.html';
      });
    }
  });
});
