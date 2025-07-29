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

      const contractorId = "USc1VVmUDHQiWW3yvvcaHbyJVFX2"; // <- Your contractor UID
      const staffRef = db.collection('contractors')
                         .doc(contractorId)
                         .collection('staff');

      const query = await staffRef.where("email", "==", email).limit(1).get();

      if (!query.empty) {
        const userDoc = query.docs[0].data();
        const role = userDoc.role;

        if (role === "contractor") {
          window.location.href = 'dashboard.html';
        } else if (role === "staff") {
          window.location.href = 'tally.html';
        } else {
          alert("Unauthorized role: " + role);
        }
      } else {
        alert("No role found in staff records for this user.");
      }

    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed: " + err.message);
    }
  });
});
 