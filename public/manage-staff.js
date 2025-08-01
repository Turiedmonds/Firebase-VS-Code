import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD529f2jn9mb8OAip4x6l3IQb7KOaPNxaM',
  authDomain: 'sheariq-tally-app.firebaseapp.com',
  projectId: 'sheariq-tally-app',
  storageBucket: 'sheariq-tally-app.firebasestorage.app',
  messagingSenderId: '201669876235',
  appId: '1:201669876235:web:379fc4035da99f4b09450e'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const createOverlay = document.getElementById('add-staff-loading');
    const successModal = document.getElementById('staffSuccessModal');
    const successOkBtn = document.getElementById('successOkBtn');
    if (overlay) overlay.style.display = 'flex';
    onAuthStateChanged(auth, async user => {
      if (!user) {
        window.location.replace('login.html');
        return;
    }
    try {
      const docRef = doc(collection(db, 'contractors'), user.uid);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : {};
      if (data.role !== 'contractor') {
        window.location.replace('login.html');
        return;
      }
    } catch (err) {
      console.error('Failed to verify role', err);
      window.location.replace('login.html');
      return;
    }
      if (overlay) overlay.style.display = 'none';

      const addBtn = document.getElementById('addStaffBtn');
      if (successOkBtn) {
        successOkBtn.addEventListener('click', () => {
          if (successModal) successModal.style.display = 'none';
          document.getElementById('staff-name').value = '';
          document.getElementById('staffEmailInput').value = '';
          document.getElementById('staff-password').value = '';
          document.getElementById('staffRoleSelect').value = 'staff';
        });
      }
      addBtn.addEventListener('click', async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          alert('Not authenticated');
          return;
        }

        const contractorUid = currentUser.uid;
      const staffName = document.getElementById('staff-name').value.trim();
      const email = document.getElementById('staffEmailInput').value.trim();
      const password = document.getElementById('staff-password').value.trim();
      const role = document.getElementById('staffRoleSelect').value;
      if (!staffName) {
        alert('Please enter a name');
        return;
      }
      if (!email) {
        alert('Please enter an email address');
        return;
      }
      if (!password || password.length < 6) {
        alert('Temporary password must be at least 6 characters');
        return;
      }

        console.log('\uD83D\uDCE4 Creating staff user with', { email, password });

        try {
          if (createOverlay) createOverlay.style.display = 'flex';
          const createStaffUser = httpsCallable(functions, 'createStaffUser');
          const result = await createStaffUser({ email, password });
          const uid = result.data.uid;
          console.log('Created staff user UID:', uid);

        const staffRef = doc(db, 'contractors', contractorUid, 'staff', uid);
        await setDoc(staffRef, {
          name: staffName,
          email,
          role,
          contractorId: contractorUid,
          createdAt: serverTimestamp()
        });

        console.log('\u2705 Reached sendStaffCredentials function');
        console.log('\uD83D\uDCE7 Contractor email:', auth.currentUser?.email);
        console.log('staffName:', staffName, 'staffEmail:', email, 'password:', password);

        try {
          const sendStaffCredentials = httpsCallable(functions, 'sendStaffCredentials');
          const response = await sendStaffCredentials({
            staffName,
            staffEmail: email,
            password,
            contractorEmail: auth.currentUser.email
          });
          console.log('\uD83D\uDCE8 Staff credentials email sent successfully:', response.data);
        } catch (error) {
          console.error('\u274C Email function failed:', error.message || error);
          throw error;
        }

        console.log('Staff member added successfully');
        if (createOverlay) createOverlay.style.display = 'none';
        if (successModal) successModal.style.display = 'flex';
        } catch (err) {
          console.error('Failed to add staff member', err);
          alert('Error creating staff member: ' + (err.message || err));
          if (createOverlay) createOverlay.style.display = 'none';
        }
      });
    });
  });
