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

      // ✅ Wait for contractor_id to be truly available
      let attempts = 0;
      const maxAttempts = 20; // ~2 seconds total

      const checkContractorIdReady = setInterval(() => {
        const readyId = localStorage.getItem("contractor_id");
        if (readyId) {
          clearInterval(checkContractorIdReady);
          console.log("✅ contractor_id is ready:", readyId);
          window.location.href = "tally.html";
        }

        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(checkContractorIdReady);
          console.error("❌ contractor_id still not found after waiting");
          alert("Something went wrong while signing in. Please try again.");
          firebase.auth().signOut();
        }
      }, 100);
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
