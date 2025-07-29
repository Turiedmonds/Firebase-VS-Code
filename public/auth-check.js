firebase.auth().onAuthStateChanged(async function (user) {
  if (user) {
    const db = firebase.firestore();
    const docRef = db.collection("contractors").doc(user.uid);
    console.log("[auth-check] Querying Firestore for UID:", user.uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      const role = userData.role;

      if (role === "contractor") {
        localStorage.setItem("contractor_id", user.uid);
        await waitForContractorIdAndRedirect();
        return;
      } else if (role === "staff") {
        console.log("[auth-check] Found matching staff");
        const contractorId = docSnap.data().contractorId;
        console.log('[auth-check] contractorId from staff profile:', contractorId);
        if (contractorId) {
          localStorage.setItem("contractor_id", contractorId);
          console.log(`[auth-check] localStorage.setItem('contractor_id', '${contractorId}') called`);
          console.log("[auth-check] contractor_id after set:", localStorage.getItem("contractor_id"));

          // Wait until contractor_id is confirmed in localStorage before redirect
          let attempts = 0;
          const maxAttempts = 20; // ~2 seconds
          const interval = setInterval(() => {
            const stored = localStorage.getItem("contractor_id");
            if (stored) {
              console.log("[auth-check] contractor_id confirmed, redirecting to tally.html");
              clearInterval(interval);
              window.location.href = "tally.html";
            } else {
              attempts++;
              if (attempts >= maxAttempts) {
                console.error("[auth-check] contractor_id still missing after timeout, returning to login");
                clearInterval(interval);
                firebase.auth().signOut().then(() => {
                  window.location.href = "login.html";
                });
              }
            }
          }, 100);
        } else {
          console.error("[auth-check] Missing contractorId in staff profile");
          firebase.auth().signOut().then(() => {
            window.location.href = "login.html";
          });
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
