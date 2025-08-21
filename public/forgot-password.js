document.addEventListener('DOMContentLoaded', () => {
  const functions = firebase.functions();
  const form = document.getElementById('forgotPasswordForm');
  const messageDiv = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    try {
      const sendReset = functions.httpsCallable('sendPasswordResetEmail');
      await sendReset({ email });
    } catch (err) {
      if (err.code === 'functions/invalid-argument') {
        messageDiv.textContent = 'Please enter a valid email address';
        return;
      }
    }
    messageDiv.innerHTML = 'Password reset email sent. <a href="login.html">Return to login</a>';
  });
});

