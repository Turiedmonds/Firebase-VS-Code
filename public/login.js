document.addEventListener('DOMContentLoaded', () => {
 
  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      // Sign in with Firebase Auth
      const cred = await auth.signInWithEmailAndPassword(email, password);
      console.log('Login success');

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

      // Not a contractor - check staff records for the predefined contractorId
      const contractorId = 'USc1VVmUDHQiWW3yvvcaHbyJVFX2';
      const staffRef = db
        .collection('contractors')
        .doc(contractorId)
        .collection('staff');

      const staffSnapshot = await staffRef
        .where('email', '==', userEmail)
        .limit(1)
        .get();

      if (!staffSnapshot.empty) {
        // ✅ Staff match found, fetch contractor_id and redirect
        const staffDoc = staffSnapshot.docs[0];
        const staffData = staffDoc.data();
        const contractorId = staffData.contractorId;

        if (contractorId) {
          localStorage.setItem('contractor_id', contractorId);
          console.log('[login] 💾 contractor_id stored in localStorage:', contractorId);
          window.location.href = 'tally.html';
        } else {
          console.error('[login] ⚠️ contractorId missing from staff document, cannot continue');
          alert('Your account is missing a contractor ID. Please contact your admin.');
        }
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
      alert('Login failed: ' + err.message);
    }
  });
});
