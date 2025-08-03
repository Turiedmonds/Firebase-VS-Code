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

    const btnManageStaff = document.getElementById('btnManageStaff');
    if (btnManageStaff) {
      btnManageStaff.addEventListener('click', () => {
        window.location.href = 'manage-staff.html';
      });
    }

    const btnFarmSummary = document.getElementById('btnFarmSummary');
    btnFarmSummary?.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = 'farm-summary.html';
    });


    const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
    if (btnViewSavedSessions) {
      btnViewSavedSessions.addEventListener('click', () => {
        window.location.href = 'view-sessions.html';
      });
    }

    const btnReturnToActive = document.getElementById('btnReturnToActive');
    const activeSession = localStorage.getItem('tally_session');
    if (btnReturnToActive && activeSession) {
      btnReturnToActive.style.display = 'block';
      btnReturnToActive.addEventListener('click', () => {
        window.location.href = 'tally.html';
      });
    }

    const btnStartNewDay = document.getElementById('btnStartNewDay');
    if (btnStartNewDay) {
      btnStartNewDay.addEventListener('click', () => {
        window.location.href = 'tally.html?newDay=true';
      });
    }
  });
});
