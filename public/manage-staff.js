const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();
const STAFF_LIMIT = 10;
const DELETED_STAFF_STATE_KEY = 'deletedStaffSectionState';

let actionOverlay, actionOverlayText, confirmModal, confirmMessage, confirmYesBtn, confirmCancelBtn;

function showActionOverlay(message) {
  if (!actionOverlay) return;
  if (actionOverlayText) actionOverlayText.textContent = message;
  actionOverlay.style.display = 'flex';
  requestAnimationFrame(() => actionOverlay.classList.add('show'));
}

function hideActionOverlay() {
  if (!actionOverlay) return;
  actionOverlay.classList.remove('show');
  actionOverlay.style.display = 'none';
}

function showConfirm(message) {
  return new Promise(resolve => {
    if (!confirmModal || !confirmMessage || !confirmYesBtn || !confirmCancelBtn) {
      resolve(false);
      return;
    }
    confirmMessage.textContent = message;
    confirmModal.style.display = 'flex';
    function cleanup(result) {
      confirmModal.style.display = 'none';
      confirmYesBtn.removeEventListener('click', onYes);
      confirmCancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onCancel() { cleanup(false); }
    confirmYesBtn.addEventListener('click', onYes);
    confirmCancelBtn.addEventListener('click', onCancel);
  });
}


async function loadStaffList(contractorId) {
  const tbody = document.querySelector('#staffTable tbody');
  const summaryEl = document.getElementById('staffSummary');
  tbody.innerHTML = '';

  const snapshot = await db
    .collection('contractors')
    .doc(contractorId)
    .collection('staff')
    .get();
  const docs = snapshot.docs;
  docs.forEach((docSnap, index) => {
    const data = docSnap.data();
    let lastActiveMs = 0;
    if (data.lastActive) {
      if (typeof data.lastActive === 'number') {
        lastActiveMs = data.lastActive;
      } else if (data.lastActive.toMillis) {
        lastActiveMs = data.lastActive.toMillis();
      } else if (data.lastActive.seconds) {
        lastActiveMs = data.lastActive.seconds * 1000;
      }
    }
    const diff = Date.now() - lastActiveMs;
    let status = '⚫ Last seen unknown';
    if (lastActiveMs && diff <= 5 * 60 * 1000) {
      status = '🟢 Online now';
    } else if (lastActiveMs) {
      const mins = Math.round(diff / 60000);
      status = `⚫ Last seen ${mins} mins ago`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${data.name || ''}</td>
      <td>${data.email}</td>
      <td>${status}</td>
      <td><button class="deleteStaffBtn" data-uid="${docSnap.id}" data-email="${data.email}" data-name="${data.name || ''}">🗑 Delete</button></td>`;
    tbody.appendChild(tr);
  });

  if (summaryEl) {
    summaryEl.textContent = `👥 ${docs.length} staff added (limit: ${STAFF_LIMIT})`;
  }

  tbody.querySelectorAll('.deleteStaffBtn').forEach(btn => {
    btn.addEventListener('click', () => deleteStaff(btn));
  });

  await loadDeletedStaff(contractorId);
  const deletedRows = document.querySelectorAll('#deletedStaffTable tbody tr').length;
  const deletedStaffHeader = document.getElementById('deletedStaffHeader');
  const deletedStaffSection = document.getElementById('deletedStaffSection');
  if (deletedStaffHeader && deletedStaffSection) {
    const collapsed = deletedRows === 0 ? true : localStorage.getItem(DELETED_STAFF_STATE_KEY) === 'collapsed';
    deletedStaffSection.classList.toggle('collapsed', collapsed);
    deletedStaffHeader.classList.toggle('expanded', !collapsed);
    if (deletedRows === 0) {
      localStorage.setItem(DELETED_STAFF_STATE_KEY, 'collapsed');
    }
  }
}

async function loadDeletedStaff(contractorId) {
  const tbody = document.querySelector('#deletedStaffTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const snapshot = await db
    .collection('contractors')
    .doc(contractorId)
    .collection('logs')
    .where('type', '==', 'staff_deleted')
    .get();

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    let deletedAt = '';
    if (data.deletedAt) {
      if (typeof data.deletedAt.toMillis === 'function') {
        deletedAt = new Date(data.deletedAt.toMillis()).toLocaleString();
      } else if (data.deletedAt.seconds) {
        deletedAt = new Date(data.deletedAt.seconds * 1000).toLocaleString();
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${data.name || ''}</td>
      <td>${data.email || ''}</td>
      <td>${deletedAt}</td>
      <td><button class="restoreStaffBtn" data-logid="${docSnap.id}" data-name="${data.name || ''}">↩ Restore</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.restoreStaffBtn').forEach(btn => {
    btn.addEventListener('click', () => restoreStaff(btn));
  });

  applyDeletedStaffFilter();
}

function applyDeletedStaffFilter() {
  const input = document.getElementById('deletedStaffSearch');
  const filter = input ? input.value.trim().toLowerCase() : '';
  const rows = document.querySelectorAll('#deletedStaffTable tbody tr');
  rows.forEach(row => {
    const name = row.children[0]?.textContent.toLowerCase() || '';
    const email = row.children[1]?.textContent.toLowerCase() || '';
    row.style.display = !filter || name.includes(filter) || email.includes(filter) ? '' : 'none';
  });
}

async function deleteStaff(btn) {
  const { uid, name } = btn.dataset;
  const confirmed = await showConfirm(`Are you sure you want to delete ${name || 'this staff user'}?`);
  if (!confirmed) return;
  const contractorId = localStorage.getItem('contractor_id');
  if (!contractorId) {
    alert('Missing contractor id');
    return;
  }
  try {
    btn.disabled = true;
    showActionOverlay('Deleting staff…');
    const fn = functions.httpsCallable('deleteStaffUser');
    await fn({ uid, contractorId });
    await loadStaffList(contractorId);
  } catch (err) {
    console.error('Failed to delete staff user', err);
    alert('Error deleting staff member: ' + (err.message || err));
  } finally {
    hideActionOverlay();
    btn.disabled = false;
  }
}

async function restoreStaff(btn) {
  const { logid, name } = btn.dataset;
  const confirmed = await showConfirm(`Are you sure you want to restore ${name || 'this staff user'}?`);
  if (!confirmed) return;
  const contractorId = localStorage.getItem('contractor_id');
  if (!contractorId) {
    alert('Missing contractor id');
    return;
  }
  try {
    btn.disabled = true;
    showActionOverlay('Restoring staff…');
    const fn = functions.httpsCallable('restoreStaffUser');
    await fn({ logId: logid, contractorId });
    await loadStaffList(contractorId);
  } catch (err) {
    console.error('Failed to restore staff user', err);
    alert('Error restoring staff member: ' + (err.message || err));
  } finally {
    hideActionOverlay();
    btn.disabled = false;
  }
}

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const pageContent = document.getElementById('page-content');
    const createOverlay = document.getElementById('add-staff-loading');
    const successModal = document.getElementById('staffSuccessModal');
    const successOkBtn = document.getElementById('successOkBtn');
    actionOverlay = document.getElementById('action-loading');
    actionOverlayText = document.getElementById('action-loading-text');
    confirmModal = document.getElementById('confirmModal');
    confirmMessage = document.getElementById('confirmMessage');
    confirmYesBtn = document.getElementById('confirmYesBtn');
    confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const deletedStaffHeader = document.getElementById('deletedStaffHeader');
    const deletedStaffSection = document.getElementById('deletedStaffSection');
    if (deletedStaffHeader && deletedStaffSection) {
      const storedState = localStorage.getItem(DELETED_STAFF_STATE_KEY);
      const collapsed = storedState === 'collapsed';
      deletedStaffSection.classList.toggle('collapsed', collapsed);
      deletedStaffHeader.classList.toggle('expanded', !collapsed);
      deletedStaffHeader.addEventListener('click', () => {
        const collapsed = deletedStaffSection.classList.toggle('collapsed');
        deletedStaffHeader.classList.toggle('expanded', !collapsed);
        localStorage.setItem(DELETED_STAFF_STATE_KEY, collapsed ? 'collapsed' : 'expanded');
      });
    }
    if (overlay) overlay.style.display = 'flex';
    auth.onAuthStateChanged(async user => {
      if (!user) {
        window.location.replace('login.html');
        return;
      }
      try {
        const docRef = db.collection('contractors').doc(user.uid);
        const snap = await docRef.get();
        const data = snap.exists() ? snap.data() : {};
        if (data.role !== 'contractor') {
          window.location.replace('login.html');
          return;
        }
        const backBtn = document.getElementById('back-to-dashboard-btn');
        if (backBtn) {
          backBtn.style.display = 'inline-block';
          backBtn.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
          });
        }
        if (pageContent) pageContent.style.display = 'block';
      } catch (err) {
        console.error('Failed to verify role', err);
        window.location.replace('login.html');
        return;
      } finally {
        if (overlay) overlay.style.display = 'none';
      }

      const contractorUid = user.uid;
      localStorage.setItem('contractor_id', contractorUid);
      await loadStaffList(contractorUid);

      const deletedSearchInput = document.getElementById('deletedStaffSearch');
      if (deletedSearchInput) {
        deletedSearchInput.addEventListener('input', applyDeletedStaffFilter);
      }

      const addBtn = document.getElementById('addStaffBtn');
      if (successOkBtn) {
        successOkBtn.addEventListener('click', () => {
          if (successModal) successModal.style.display = 'none';
          document.getElementById('staff-name').value = '';
          document.getElementById('staffEmailInput').value = '';
          document.getElementById('new-password').value = '';
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
      const password = document.getElementById('new-password').value.trim();
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
          const createStaffUser = functions.httpsCallable('createStaffUser');
          const result = await createStaffUser({ email, password });
          const uid = result.data.uid;
          console.log('Created staff user UID:', uid);

        const staffRef = db
          .collection('contractors')
          .doc(contractorUid)
          .collection('staff')
          .doc(uid);
        await staffRef.set({
          name: staffName,
          email,
          role,
          contractorId: contractorUid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('\u2705 Reached sendStaffCredentials function');
        console.log('\uD83D\uDCE7 Contractor email:', auth.currentUser?.email);
        console.log('staffName:', staffName, 'staffEmail:', email, 'password:', password);

        try {
          const sendStaffCredentials = functions.httpsCallable('sendStaffCredentials');
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
        await loadStaffList(contractorUid);
        } catch (err) {
          console.error('Failed to add staff member', err);
          alert('Error creating staff member: ' + (err.message || err));
          if (createOverlay) createOverlay.style.display = 'none';
        }
      });
    });
  });
