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
        await waitForContractorIdAndRedirect();
        return;
      } else if (role === "staff") {
        const staffSnapshot = await firebase.firestore()
          .collection("users")
          .where("email", "==", user.email)
          .limit(1)
          .get();

        if (!staffSnapshot.empty) {
          const staffData = staffSnapshot.docs[0].data();
          const contractorId = staffData.contractorId;

          if (contractorId) {
            localStorage.setItem("contractor_id", contractorId);
            console.log("[auth-check.js] \u2705 Stored contractor_id in localStorage for staff:", contractorId);
            await waitForContractorIdAndRedirect();
            return;
          } else {
            console.error("[auth-check.js] \u274C Missing contractorId in staff document");
            window.location.href = "login.html";
            return;
          }
        } else {
          console.error("[auth-check.js] \u274C Staff user not found in Firestore");
          window.location.href = "login.html";
          return;
        }
      }

      await waitForContractorIdAndRedirect();
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

async function waitForContractorIdAndRedirect(maxWaitMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (localStorage.getItem('contractor_id')) {
      console.log('[auth-check.js] \uD83D\uDE80 Redirecting to tally.html');
      window.location.href = 'tally.html';
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.error('[auth-check.js] \u23F3 Timeout waiting for contractor_id');
  window.location.href = 'login.html';
}
