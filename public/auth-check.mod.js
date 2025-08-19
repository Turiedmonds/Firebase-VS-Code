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
  // Contractor check: contractors/{uid}
  const contractorRef = doc(db, "contractors", user.uid);
  const contractorSnap = await getDoc(contractorRef);
  if (contractorSnap.exists()) {
    setContractorId(user.uid);
    redirect("/tally.html");
    return;
  }

  // Staff check via collectionGroup('staff')
  let contractorId = null;

  // Prefer uid match if present on staff docs
  const qByUid = query(
    collectionGroup(db, "staff"),
    where("uid", "==", user.uid),
    limit(1)
  );
  let cgSnap = await getDocs(qByUid);
  if (!cgSnap.empty) {
    const snap = cgSnap.docs[0];
    const segments = snap.ref.path.split("/"); // contractors/{id}/staff/{staffId}
    contractorId = segments[1];
  } else if (user.email) {
    // Fallback to email for legacy docs
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

  if (contractorId) {
    setContractorId(contractorId);
    redirect("/tally.html");
    return;
  }

  // No role found
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

