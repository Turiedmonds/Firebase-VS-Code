// public/change-pin.mod.js
import {
  auth, db, onAuthStateChanged,
  doc, setDoc
} from "./firebase-core.js";

function redirect(url){ window.location.href = url; }

async function savePin(contractorId, newPin){
  const ref = doc(db, 'contractors', contractorId);
  // Preserve existing schema: write pin under contractor doc (same key as before)
  await setDoc(ref, { contractor_pin: newPin }, { merge: true });
}

function start(){
  const form = document.getElementById('changePinForm');
  const input = document.getElementById('newPin');
  const msg = document.getElementById('pinMessage');

  onAuthStateChanged(auth, (user) => {
    if (!user) { redirect('/login.html'); return; }
    let contractorId = null;
    try { contractorId = localStorage.getItem('contractor_id'); } catch(_) {}
    if (!contractorId) { redirect('/auth-check.html'); return; }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPin = (input?.value || '').trim();
      if (!newPin) { if (msg) msg.textContent = 'Enter a PIN.'; return; }
      try {
        await savePin(contractorId, newPin);
        if (msg) msg.textContent = 'PIN updated.';
        form.reset();
      } catch (err) {
        console.error('[change-pin] save failed', err);
        if (msg) msg.textContent = 'Failed to update PIN.';
      }
    });
  });
}

document.readyState === 'loading' ? 
  document.addEventListener('DOMContentLoaded', start) : start();
