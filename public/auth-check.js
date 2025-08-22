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
  let contractorSnap;
  try {
    contractorSnap = await contractorRef.get();
  } catch (err) {
    console.error("[auth-check] \u274c Failed to fetch contractor record:", err);
    handleOfflineRedirect();
    return;
  }

  if (contractorSnap.exists && contractorSnap.data().role === "contractor") {
    console.log("[auth-check] \u2705 User is a contractor");
    localStorage.setItem("contractor_id", userUid);
    localStorage.setItem("role", "contractor");
    await waitForContractorIdAndRedirect();
    return;
  }

  // Step 2: Search all contractor/staff subcollections for this staff UID
  console.log("[auth-check] \ud83d\udd0d Not a contractor, searching staff subcollections...");

  let staffQuery;
  try {
    staffQuery = await db
      .collectionGroup("staff")
      .where(firebase.firestore.FieldPath.documentId(), "==", userUid)
      .get();
  } catch (err) {
    console.error("[auth-check] \u274c Failed to fetch staff record:", err);
    handleOfflineRedirect();
    return;
  }

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
            localStorage.setItem("role", role);
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

function handleOfflineRedirect() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }

  const storedRole = localStorage.getItem('role');
  const contractorId = localStorage.getItem('contractor_id');

  if (storedRole && contractorId) {
    console.warn('[auth-check] \u26a0\ufe0f Offline. Using cached data for role:', storedRole);
    window.location.href = 'tally.html';
  } else {
    const msg = document.createElement('div');
    msg.textContent = 'You appear to be offline. Please reconnect.';
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => location.reload());
    const container = document.createElement('div');
    container.style.marginTop = '20px';
    container.style.textAlign = 'center';
    container.appendChild(msg);
    container.appendChild(retry);
    document.body.appendChild(container);
  }
}

// Reload automatically when connection is restored
window.addEventListener('online', () => location.reload());
