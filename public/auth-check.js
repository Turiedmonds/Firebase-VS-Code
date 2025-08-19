// === FAST PATH: bootstrap redirect from localStorage (works offline) ===
(function fastRoleBootstrap(){
  try {
    const role = SessionState.get().user_role;
    if (role === 'contractor') {
      // Contractors always land on the dashboard
      window.location.replace('dashboard.html');
      return;
    }
    if (role === 'staff') {
      // Staff always land on the tally page
      window.location.replace('tally.html');
      return;
    }
    // If no role saved, fall through to the normal Firebase/Firestore checks below
  } catch (e) {
    // If localStorage is blocked for any reason, fall through safely
    console.warn('[auth-check] fastRoleBootstrap failed:', e);
  }
})();

// Watchdog: if auth checks take too long but we do have a saved role, go anyway.
(function watchdogRedirect(){
  try {
    const savedRole = SessionState.get().user_role;
    if (!savedRole) return; // nothing to do

    setTimeout(() => {
      if (!window.__authCheckRedirected) {
        console.warn('[auth-check] watchdog redirect');
        if (savedRole === 'staff') {
          window.location.replace('tally.html');
        } else if (savedRole === 'contractor') {
          window.location.replace('dashboard.html');
        }
      }
    }, 6000); // 6s grace period
  } catch(e){}
})();

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
    SessionState.set('contractor', userUid);
    console.log('[auth-check] role=contractor saved');
    window.location.href = "dashboard.html";
    window.__authCheckRedirected = true;
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
        const data = docSnap.data();
        console.log("[auth-check] \u2705 Found staff record:", data);

        const contractorId = data.contractorId;
        console.log("contractorId:", contractorId);

        if (contractorId) {
          try {
            SessionState.set('staff', contractorId);
            console.log('[auth-check] role=staff saved');
            window.location.href = "tally.html";
            window.__authCheckRedirected = true;
          } catch (e) {
            console.error("\u274c Failed to set contractor_id:", e);
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
