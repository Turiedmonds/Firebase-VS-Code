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
    localStorage.setItem('user_role', 'contractor'); // NEW
    console.log('[auth-check] role=contractor saved');
    window.location.href = "dashboard.html";
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
            localStorage.setItem("contractor_id", contractorId);
            localStorage.setItem('user_role', 'staff'); // NEW
            console.log('[auth-check] role=staff saved');
            window.location.href = "tally.html";
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
