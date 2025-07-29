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

      // Not a contractor - search staff subcollections across all contractors
      const staffSnapshot = await db.collectionGroup('staff').get();
      let foundContractorId = null;

      staffSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.email &&
          data.email.toLowerCase() === userEmail.toLowerCase()
        ) {
          foundContractorId = data.contractorId;
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
      alert('Login failed: ' + err.message);
    }
  });
});
