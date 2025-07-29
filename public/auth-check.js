firebase.auth().onAuthStateChanged(async function (user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const db = firebase.firestore();
  const userUid = user.uid;

  console.log("[auth-check] \ud83d\udd0d Checking user role for UID:", userUid);

  // Step 1: Check if user is a contractor
  const contractorRef = db.collection("contractors").doc(userUid);
  const contractorSnap = await contractorRef.get();

  if (contractorSnap.exists && contractorSnap.data().role === "contractor") {
    console.log("[auth-check] \u2705 User is a contractor");
    localStorage.setItem("contractor_id", userUid);
    await waitForContractorIdAndRedirect();
    return;
  }

  // Step 2: Search all contractor/staff subcollections for this staff UID
  console.log("[auth-check] \ud83d\udd0d Not a contractor, searching staff subcollections...");

  const staffQuery = await db
    .collectionGroup("staff")
    .where(firebase.firestore.FieldPath.documentId(), "==", userUid)
    .get();

  if (!staffQuery.empty) {
    console.log("[auth-check] \u2705 Found matching staff");
    const docSnap = staffQuery.docs[0];
    const data = docSnap.data();
    console.log("[auth-check] \ud83d\udce6 Staff docSnap data:", data);

    const contractorId = data.contractorId;
    console.log("[auth-check] \ud83c\udd94 contractorId:", contractorId);

    if (contractorId) {
      localStorage.setItem("contractor_id", contractorId);
      console.log(`[auth-check] \ud83d\udcbe contractor_id saved to localStorage: ${contractorId}`);
    
      let tries = 0;
      const maxTries = 20;
      const checkInterval = setInterval(() => {
        const stored = localStorage.getItem("contractor_id");
        console.log(`[auth-check] \u23F1 Try ${tries + 1}: contractor_id in localStorage =`, stored);
        if (stored === contractorId) {
          clearInterval(checkInterval);
          console.log("[auth-check] \u2705 contractor_id confirmed in localStorage — redirecting");
          window.location.href = "tally.html";
        } else if (++tries >= maxTries) {
          clearInterval(checkInterval);
          console.error("[auth-check] \u274c Failed to confirm contractor_id in localStorage after timeout");
          firebase.auth().signOut().then(() => {
            window.location.href = "login.html";
          });
        }
      }, 100);
      } else {
        console.warn("[auth-check] \u26a0\ufe0f contractorId is missing or undefined in staff document!");
      }
  } else {
    console.error("[auth-check] \u274c Staff user not found in any subcollection");
    await firebase.auth().signOut();
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
