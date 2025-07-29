firebase.auth().onAuthStateChanged(async function (user) {
  if (user) {
    const db = firebase.firestore();
    const docRef = db.collection("contractors").doc(user.uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      const role = userData.role;

      if (role === "contractor") {
        localStorage.setItem("contractor_id", user.uid);
      } else if (role === "staff") {
        const contractorId = userData.contractorId;
        if (contractorId) {
          localStorage.setItem("contractor_id", contractorId);
        } else {
          console.error("Missing contractorId in staff profile");
          alert("Your staff profile is incomplete. Please contact your contractor.");
          firebase.auth().signOut();
          return;
        }
      }

      waitForContractorId();
      return;
    } else {
      console.error("User document not found in contractors collection");
    }

    // If we reach this point without a contractor ID, return to login
    window.location.href = 'login.html';
  } else {
    window.location.href = "login.html";
  }
});

function waitForContractorId() {
  let attempts = 0;
  const interval = setInterval(() => {
    if (localStorage.getItem('contractor_id')) {
      clearInterval(interval);
      window.location.href = 'tally.html';
    } else if (++attempts >= 20) {
      clearInterval(interval);
      console.error('contractor_id not available after waiting');
      window.location.href = 'login.html';
    }
  }, 100);
}
