firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});

export function handleLogout() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
  firebase.auth().signOut().then(() => {
    if (overlay) {
      overlay.style.display = 'none';
    }
    // Clear session-related data but preserve user preferences
    const localKeys = [
      'user_role',
      'contractor_id',
      'role_cached_at',
      'active_session',
      'firestoreSessionId',
      'viewOnlyMode',
      'session_data',
      'sheariq_saved_session',
      'pending_cloud_sessions',
      'contractor_pin',
      'force_offline'
    ];
    localKeys.forEach((k) => localStorage.removeItem(k));

    const sessionKeys = [
      'userRole',
      'launch_override',
      'boot_router_redirect',
      'debug_redirect',
      'launch_checked',
      'launch_redirected',
      'calDiagTip'
    ];
    sessionKeys.forEach((k) => sessionStorage.removeItem(k));
    window.location.replace('login.html');
  });
}

function setupLogoutModal() {
  const modal = document.getElementById('logoutModal');
  const confirmBtn = document.getElementById('logoutConfirmBtn');
  const cancelBtn = document.getElementById('logoutCancelBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!modal || !confirmBtn || !cancelBtn || !logoutBtn) return;
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.style.display = 'flex';
  });
  confirmBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    handleLogout();
  });
  cancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', setupLogoutModal);
