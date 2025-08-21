document.addEventListener('DOMContentLoaded', () => {
  // Initialize App Check with the reCAPTCHA site key
  // Replace 'RECAPTCHA_SITE_KEY' with your actual key
  firebase.appCheck().activate('RECAPTCHA_SITE_KEY', true);

  const functions = firebase.functions();
  const form = document.getElementById('forgotPasswordForm');
  const messageDiv = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    try {
      const tokenResult = await firebase.appCheck().getToken();
      const sendReset = functions.httpsCallable('sendPasswordResetEmail');
      await sendReset({ email, appCheckToken: tokenResult.token });
      messageDiv.innerHTML = 'Password reset email sent. <a href="login.html">Return to login</a>';
    } catch (err) {
      let msg = '';
      switch (err.code) {
        case 'functions/invalid-argument':
          msg = 'Please enter a valid email address';
          break;
        case 'functions/failed-precondition':
          msg = 'App verification failed. Please try again';
          break;
        default:
          msg = 'Failed to send reset email. Please try again';
      }
      messageDiv.textContent = msg;
    }
  });
});

