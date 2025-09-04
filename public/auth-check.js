// Offline-first boot logic for role-based routing
function isForcedOffline() {
  return localStorage.getItem('force_offline') === '1';
}

function isReallyOffline() {
  return !navigator.onLine || isForcedOffline();
}

const ROLE_KEY = 'user_role'; // 'contractor' | 'staff'
const CONTRACTOR_KEY = 'contractor_id'; // string

function withTimeout(promise, ms = 1200) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function resolveRoleOfflineFirst(user) {
  const db = firebase.firestore();
  const uid = user.uid;
  const cachedRole = localStorage.getItem(ROLE_KEY);
  const cachedContractor = localStorage.getItem(CONTRACTOR_KEY);

  if (cachedRole && cachedContractor) {
    return { role: cachedRole, contractorId: cachedContractor, source: 'localStorage' };
  }

  try {
    const contractorSnap = await withTimeout(
      db.collection('contractors').doc(uid).get({ source: 'cache' })
    );
    if (contractorSnap.exists) {
      return { role: 'contractor', contractorId: uid, source: 'cache' };
    }
  } catch (err) {
    console.warn('[auth-check] contractor cache lookup failed', err);
  }

  if (cachedRole === 'staff' && cachedContractor) {
    try {
      const staffSnap = await withTimeout(
        db
          .collection('contractors')
          .doc(cachedContractor)
          .collection('staff')
          .doc(uid)
          .get({ source: 'cache' })
      );
      if (staffSnap.exists) {
        return { role: 'staff', contractorId: cachedContractor, source: 'cache' };
      }
    } catch (err) {
      console.warn('[auth-check] staff cache lookup failed', err);
    }
  }

  if (isReallyOffline()) {
    return {
      role: cachedRole || 'unknown',
      contractorId: cachedContractor || null,
      source: 'offline',
    };
  }

  return { role: 'unknown', contractorId: null, source: 'unknown' };
}

async function refreshRoleOnline(user) {
  if (!navigator.onLine || isForcedOffline()) return null;
  const db = firebase.firestore();
  const uid = user.uid;

  try {
    const contractorSnap = await withTimeout(db.collection('contractors').doc(uid).get());
    if (contractorSnap.exists) {
      localStorage.setItem(ROLE_KEY, 'contractor');
      localStorage.setItem(CONTRACTOR_KEY, uid);
      return { role: 'contractor', contractorId: uid, source: 'server' };
    }
  } catch (err) {
    console.warn('[auth-check] contractor server lookup failed', err);
  }

  const knownId = localStorage.getItem(CONTRACTOR_KEY);
  if (knownId) {
    try {
      const staffSnap = await withTimeout(
        db.collection('contractors').doc(knownId).collection('staff').doc(uid).get()
      );
      if (staffSnap.exists) {
        localStorage.setItem(ROLE_KEY, 'staff');
        localStorage.setItem(CONTRACTOR_KEY, knownId);
        return { role: 'staff', contractorId: knownId, source: 'server' };
      }
    } catch (err) {
      console.warn('[auth-check] staff server lookup failed', err);
    }
  } else {
    try {
      const staffQuery = await withTimeout(
        db
          .collectionGroup('staff')
          .where(firebase.firestore.FieldPath.documentId(), '==', uid)
          .get()
      );
      if (!staffQuery.empty) {
        const docSnap = staffQuery.docs[0];
        const contractorId = docSnap.ref.parent.parent.id;
        localStorage.setItem(ROLE_KEY, 'staff');
        localStorage.setItem(CONTRACTOR_KEY, contractorId);
        return { role: 'staff', contractorId, source: 'server' };
      }
    } catch (err) {
      console.warn('[auth-check] staff collectionGroup lookup failed', err);
    }
  }

  return null;
}

firebase.auth().onAuthStateChanged(async function (user) {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const result = await resolveRoleOfflineFirst(user);

  if (result.role === 'contractor') {
    if (isReallyOffline()) {
      window.location.href = 'tally.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  } else if (result.role === 'staff') {
    window.location.href = 'tally.html';
  } else {
    if (isReallyOffline()) {
      sessionStorage.setItem('offline_banner', 'Offline mode (role not verified)');
      window.location.href = 'tally.html';
    } else {
      handleOfflineRedirect();
    }
  }

  refreshRoleOnline(user);
});

function handleOfflineRedirect() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  const msg = document.createElement('div');
  msg.textContent = 'You appear to be offline. Please reconnect.';
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => location.reload());
  const container = document.createElement('div');
  container.style.marginTop = '20px';
  container.style.textAlign = 'center';
  container.appendChild(msg);
  container.appendChild(retry);
  document.body.appendChild(container);
}

// Reload automatically when connection is restored
window.addEventListener('online', () => location.reload());

