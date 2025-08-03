import { handleLogout } from './auth.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
}

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

    const btnFarmSummary = document.getElementById('farm-summary-btn');
    btnFarmSummary?.addEventListener('click', () => {
      console.log('Farm Summary button clicked');
      window.location.href = 'farm-summary.html';
    });

    const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
    if (btnViewSavedSessions) {
      btnViewSavedSessions.addEventListener('click', () => {
        window.location.href = 'view-sessions.html';
      });
    }

    const btnReturnToActive = document.getElementById('btnReturnToActive');
    const activeSession = localStorage.getItem('active_session');

    // Only reveal the "Return to Active Session" button when an active session exists.
    // Automatic redirection to tally.html has been removed so contractors choose
    // when to resume a session.
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

    const btnChangePin = document.getElementById('btnChangePin');
    if (btnChangePin) {
      btnChangePin.addEventListener('click', () => {
        window.location.href = 'change-pin.html';
      });
    }
  });
});
