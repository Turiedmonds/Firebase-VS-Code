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
    const docSnap = staffQuery.docs[0];
    const role = docSnap.data().role;

    if (role === "staff") {
      console.log("[auth-check] \u2705 Found matching staff");
      const data = docSnap.data();
      console.log("[auth-check] \ud83d\udce6 Staff docSnap data:", data);

      const contractorId = data.contractorId;
      console.log("[auth-check] \ud83c\udd94 contractorId:", contractorId);

      if (contractorId) {
        try {
          localStorage.setItem("contractor_id", contractorId);
          const confirmed = localStorage.getItem("contractor_id");
          console.log("\u2705 contractor_id saved in localStorage:", confirmed);

          if (confirmed === contractorId) {
            window.location.href = "tally.html";
          } else {
            console.error("\u274c contractor_id not stored properly \u2014 halting");
            await firebase.auth().signOut();
            window.location.href = "login.html";
          }
        } catch (e) {
          console.error("\u274c Failed to set contractor_id in localStorage:", e);
          await firebase.auth().signOut();
          window.location.href = "login.html";
        }
      } else {
        console.warn("\u26a0\ufe0f contractorId is missing in staff record");
        await firebase.auth().signOut();
        window.location.href = "login.html";
      }
    } else {
      console.error("[auth-check] \u274c Staff user not found in any subcollection");
      await firebase.auth().signOut();
      window.location.href = "login.html";
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
