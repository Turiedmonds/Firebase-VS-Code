import { handleLogout } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  const viewSessionsBtn = document.getElementById('btnViewSavedSessions');
  if (viewSessionsBtn) {
    viewSessionsBtn.addEventListener('click', () => {
      window.location.href = 'view-sessions.html';
    });
  }
});
