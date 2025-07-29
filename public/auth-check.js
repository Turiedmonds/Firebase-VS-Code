firebase.auth().onAuthStateChanged(async function (user) {
  if (user) {
    const db = firebase.firestore();
    const docRef = db.collection("contractors").doc(user.uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      const role = userData.role;

      let contractorId;

      if (role === "contractor") {
        contractorId = user.uid;
      } else if (role === "staff") {
        contractorId = userData.contractorId;
      }

      if (contractorId) {
        localStorage.setItem('contractor_id', contractorId);
        console.log('[auth-check] contractor_id stored, redirecting to tally.html');
        setTimeout(() => {
          window.location.href = 'tally.html';
        }, 200); // short delay to ensure it sticks
        return;
      } else {
        console.error("Missing contractorId in profile");
      }
    } else {
      console.error("User document not found in contractors collection");
    }

    // If we reach this point without a contractor ID, return to login
    window.location.href = 'login.html';
  } else {
    window.location.href = "login.html";
  }
});
