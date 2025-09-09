firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) return window.location.replace('login.html');
  const snap = await firebase.firestore().collection('users').doc(user.uid).get();
  const data = snap.data() || {};
  localStorage.setItem('contractor_id', data.contractorId);
  if (data.mustChangePassword) window.location.replace('change-password.html');
});

export function handleLogout() {
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

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
