document.addEventListener('DOMContentLoaded', () => {

  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;
  const CACHE_NAME = 'sheariq-pwa-v12';

  async function finalizeLogin(role, contractorId, uid) {
    localStorage.setItem('user_role', role);
    localStorage.setItem('contractor_id', contractorId);
    localStorage.setItem('role_cached_at', String(Date.now()));

    if (navigator.serviceWorker?.controller) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll([
          '/tally.html',
          '/dashboard.html',
          '/styles.css',
          '/tally.js',
          '/dashboard.js',
          '/auth-check.js'
        ]);
      } catch (err) {
        console.warn('Cache pre-warm failed', err);
      }
    }

    if (db) {
      try {
        if (role === 'contractor') {
          await db.collection('contractors').doc(uid).get();
        } else if (role === 'staff' && contractorId) {
          await db
            .collection('contractors').doc(contractorId)
            .collection('staff').doc(uid)
            .get();
        }
      } catch (err) {
        console.warn('Firestore pre-warm failed', err);
      }
    }
  }

  async function cacheStaffCanLoad(contractorId) {
    if (!db || !contractorId) return;
    const CANONICAL_KEY = 'staff_can_load_sessions';
    const LEGACY_KEY = 'dashboard_staff_can_load';
    try {
      const snap = await db.collection('contractors').doc(contractorId).get();
      const canLoad = snap.data()?.staffCanLoadSessions;
      if (typeof canLoad === 'boolean') {
        const val = canLoad ? 'true' : 'false';
        localStorage.setItem(CANONICAL_KEY, val);
        localStorage.setItem(LEGACY_KEY, val);
        return;
      }
    } catch (err) {
      console.warn('staffCanLoadSessions fetch failed', err);
    }
    const existing =
      localStorage.getItem(CANONICAL_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (existing != null) {
      localStorage.setItem(CANONICAL_KEY, existing);
      localStorage.setItem(LEGACY_KEY, existing);
    }
  }

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

  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        const isPassword = target.type === 'password';
        target.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? 'Hide' : 'Show';
      }
    });
  });

  const loginForm = document.getElementById('loginForm');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const loadingOverlay = document.getElementById('loading-overlay');
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
        await finalizeLogin('contractor', uid, uid);
        await cacheStaffCanLoad(uid);
        // Use replace to ensure a hard reload after login
        window.location.href = 'dashboard.html';
        return;
      }

      // Fallback: search contractors collection by email
      let contractorByEmailSnap = await db
        .collection('contractors')
        .where('email', '==', userEmail)
        .limit(1)
        .get();

      if (contractorByEmailSnap.empty && userEmail.toLowerCase() !== userEmail) {
        contractorByEmailSnap = await db
          .collection('contractors')
          .where('email', '==', userEmail.toLowerCase())
          .limit(1)
          .get();
      }

      if (!contractorByEmailSnap.empty) {
        const contractorId = contractorByEmailSnap.docs[0].id;
        await finalizeLogin('contractor', contractorId, uid);
        await cacheStaffCanLoad(contractorId);
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
        await finalizeLogin('staff', foundContractorId, uid);
        await cacheStaffCanLoad(foundContractorId);
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
