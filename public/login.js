document.addEventListener('DOMContentLoaded', () => {

  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      console.log("Login success");

      if (db && cred.user) {
        const docRef = db.collection('contractors').doc(cred.user.uid);
        try {
          const snap = await docRef.get();
          const role = snap.exists ? snap.data().role : null;

          if (role === 'contractor') {
            window.location.href = 'dashboard.html';
          } else if (role === 'staff') {
            window.location.href = 'tally.html';
          }
        } catch (err) {
          console.error('Failed to fetch user role:', err);
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed: " + err.message);
    }
  });
});
