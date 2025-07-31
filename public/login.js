document.addEventListener('DOMContentLoaded', () => {

  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;

  const emailInput = document.getElementById('email');
  if (emailInput) {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }

  const rememberMeCheckbox = document.getElementById('rememberMe');
  if (rememberMeCheckbox) {
    const saved = localStorage.getItem('rememberMe');
    if (saved === 'true') {
      rememberMeCheckbox.checked = true;
    }
  }

  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePassword');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
    });
  }

  const loginForm = document.getElementById('loginForm');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const loadingOverlay = document.getElementById('login-loading-overlay');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      requestAnimationFrame(() => loadingOverlay.classList.add('show'));
    }
    if (submitButton) submitButton.disabled = true;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const remember = document.getElementById('rememberMe').checked;
    localStorage.setItem('rememberMe', remember ? 'true' : 'false');
    if (remember) {
      localStorage.setItem('savedEmail', email);
    } else {
      localStorage.removeItem('savedEmail');
    }

    try {
      const persistence = remember
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistence);
      // Sign in with Firebase Auth
      const cred = await auth.signInWithEmailAndPassword(email, password);
      console.log('Login success');
      const errorDiv = document.getElementById('login-error');
      if (errorDiv) errorDiv.textContent = '';

      // Get UID and email of the authenticated user
      const { uid, email: userEmail } = cred.user;

      // Check if the user is a contractor by looking for a document
      // at contractors/{UID}
      const contractorDoc = await db.collection('contractors').doc(uid).get();
      if (contractorDoc.exists) {
        // Use replace to ensure a hard reload after login
        window.location.href = 'dashboard.html';
        return;
      }

      // Not a contractor - search staff subcollections across all contractors
      const staffSnapshot = await db.collectionGroup('staff').get();
      let foundContractorId = null;

      staffSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log("Checking role:", data.role);
        if (
          data.email &&
          data.email.toLowerCase() === userEmail.toLowerCase() &&
          ((data.role || "").toLowerCase().trim() === "staff")
        ) {
          foundContractorId = data.contractorId;
        } else if (!data.role) {
          console.error("Role field missing in staff document:", doc.id);
        }
      });

      if (foundContractorId) {
        localStorage.setItem('contractor_id', foundContractorId);
        console.log('[login] 💾 contractor_id stored in localStorage:', foundContractorId);
        window.location.href = 'tally.html';
      } else {
        // No matching staff record
        alert('No role found in staff records for this user.');
        await auth.signOut();
        // Clear any cached session data after sign out
        localStorage.clear();
        sessionStorage.clear();
      }

    } catch (err) {
      console.error('Login error:', err);
      console.log('Firebase Auth error code:', err.code);
      const errorDiv = document.getElementById('login-error');
      let message = '';

      switch (err.code) {
        case 'auth/invalid-email':
          message = 'Please enter a valid email address';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-login-credentials':
          message = 'Incorrect email or password';
          break;
        case 'auth/too-many-requests':
          message = 'Too many failed attempts. Try again later';
          break;
        case 'auth/network-request-failed':
          message = 'Network error. Check your internet connection';
          break;
        case 'auth/user-disabled':
          message = 'This account has been disabled. Contact your administrator';
          break;
        default:
          message = 'Login failed. Please try again';
      }

      if (errorDiv) {
        errorDiv.textContent = message;
      } else {
        alert(message);
      }
    } finally {
      if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
        loadingOverlay.style.display = 'none';
      }
      if (submitButton) submitButton.disabled = false;
    }
  });
});
