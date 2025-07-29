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
        }
      }
    } else {
      console.error("User document not found in contractors collection");
    }

    window.location.href = "tally.html";
  } else {
    window.location.href = "login.html";
  }
});
