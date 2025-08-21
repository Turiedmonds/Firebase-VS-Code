document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const form = document.getElementById('forgotPasswordForm');
  const messageDiv = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    try {
      await auth.sendPasswordResetEmail(email);
      messageDiv.innerHTML = 'Password reset email sent. <a href="login.html">Return to login</a>';
    } catch (err) {
      let msg = '';
      switch (err.code) {
        case 'auth/invalid-email':
          msg = 'Please enter a valid email address';
          break;
        case 'auth/user-not-found':
          msg = 'No user found with that email';
          break;
        default:
          msg = 'Failed to send reset email. Please try again';
      }
      messageDiv.textContent = msg;
    }
  });
});

