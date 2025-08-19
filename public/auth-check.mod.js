// public/auth-check.mod.js
import {
  auth, db,
  onAuthStateChanged,
  doc, getDoc,
  collectionGroup, query, where, limit, getDocs
} from "./firebase-core.js";

const redirect = (url) => { window.location.href = url; };

const setContractorId = (id) => {
  try { localStorage.setItem("contractor_id", id); } catch (_) {}
};

async function resolveRoleAndRedirect(user) {
  // Try contractor: contractors/{uid}
  const contractorRef = doc(db, "contractors", user.uid);
  const contractorSnap = await getDoc(contractorRef);
  if (contractorSnap.exists()) {
    setContractorId(user.uid);
    redirect("/tally.html");
    return;
  }

  // Try staff by uid in collectionGroup('staff')
  let contractorId = null;

  // 1) Prefer uid match (fast + exact)
  const qByUid = query(
    collectionGroup(db, "staff"),
    where("uid", "==", user.uid),
    limit(1)
  );
  let cgSnap = await getDocs(qByUid);
  if (!cgSnap.empty) {
    const snap = cgSnap.docs[0];
    // Path: contractors/{contractorId}/staff/{staffId}
    const segments = snap.ref.path.split("/");
    // ["contractors", "{id}", "staff", "{staffId}"]
    contractorId = segments[1];
  } else {
    // 2) Fallback to email match if older docs don’t store uid
    // (Optional but preserves legacy behavior)
    if (user.email) {
      const qByEmail = query(
        collectionGroup(db, "staff"),
        where("email", "==", user.email),
        limit(1)
      );
      cgSnap = await getDocs(qByEmail);
      if (!cgSnap.empty) {
        const snap = cgSnap.docs[0];
        const segments = snap.ref.path.split("/");
        contractorId = segments[1];
      }
    }
  }

  if (contractorId) {
    setContractorId(contractorId);
    redirect("/tally.html");
    return;
  }

  // No role doc found → send back to login
  redirect("/login.html");
}

function start() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      redirect("/login.html");
      return;
    }
    resolveRoleAndRedirect(user).catch((err) => {
      console.error("[auth-check] role resolution failed:", err);
      redirect("/login.html");
    });
  });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start)
  : start();

