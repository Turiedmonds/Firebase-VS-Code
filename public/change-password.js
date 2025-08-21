firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('passwordForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageEl = document.getElementById('message');
    messageEl.textContent = '';

    if (newPassword !== confirmPassword) {
      messageEl.textContent = 'New passwords do not match.';
      messageEl.style.color = '#ff4d4d';
      return;
    }

    const credential = firebase.auth.EmailAuthProvider.credential(
      user.email,
      currentPassword
    );

    messageEl.textContent = 'Updating password...';
    messageEl.style.color = '#fff';

    try {
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);
      messageEl.textContent = 'Password updated successfully.';
      messageEl.style.color = '#4caf50';
      form.reset();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.style.color = '#ff4d4d';
    }
  });

  document.getElementById('btnReturnToDashboard').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
});

// Toggle show/hide for password inputs
document.querySelectorAll('.toggle-password').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (target.type === 'password') {
      target.type = 'text';
      btn.textContent = 'Hide';
    } else {
      target.type = 'password';
      btn.textContent = 'Show';
    }
  });
});
