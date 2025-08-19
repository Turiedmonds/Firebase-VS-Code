// view-sessions.js
// Loads and displays sessions for the logged-in contractor.

function formatNZDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

SessionState.ready().then(state => {
  if (state.user_role !== 'contractor') {
    window.location.replace('auth-check.html');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    SessionState.ready().then(s => {
      if (s.user_role !== 'contractor') {
        window.location.replace('auth-check.html');
      }
    });
  }
});

async function fetchSessions(contractorId) {
  const listEl = document.getElementById('sessionList');
  if (!listEl) return;
  listEl.innerHTML = '';

  try {
    const snap = await firebase
      .firestore()
      .collection('contractors')
      .doc(contractorId)
      .collection('sessions')
      .orderBy('date', 'desc')
      .get();

    if (snap.empty) {
      const msg = document.createElement('p');
      msg.textContent = 'No sessions found.';
      listEl.appendChild(msg);
      return;
    }

    snap.forEach(doc => {
      const data = doc.data() || {};
      const station = data.stationName || 'Unnamed Station';
      const dateStr = formatNZDate(data.date);
      const totalSheep = Array.isArray(data.shearerCounts)
        ? data.shearerCounts.reduce((sum, r) => sum + (parseInt(r.total, 10) || 0), 0)
        : 0;
      const shearers = Array.isArray(data.stands) ? data.stands.length : 0;
      const shedStaff = Array.isArray(data.shedStaff) ? data.shedStaff.length : 0;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '10px';
      row.style.marginBottom = '10px';
      row.style.border = '1px solid #333';
      row.style.background = '#111';

      const info = document.createElement('div');
      info.innerHTML = `
        <strong>${station}</strong><br>
        ${dateStr}<br>
        🐑 ${totalSheep} | Shearers: ${shearers} | Shed Staff: ${shedStaff}
      `;
      row.appendChild(info);

      const btns = document.createElement('div');

      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View';
      viewBtn.className = 'tab-button';
      viewBtn.addEventListener('click', () => {
        // Save session data and ID to localStorage
        localStorage.setItem('active_session', JSON.stringify(data));
        localStorage.setItem('firestoreSessionId', doc.id);
        localStorage.setItem('viewOnlyMode', 'true');
        // Redirect to tally page with loadedSession flag
        window.location.href = 'tally.html?loadedSession=true';
      });
      btns.appendChild(viewBtn);

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'tab-button';
      editBtn.style.marginLeft = '6px';
      editBtn.addEventListener('click', () => {
        const pin = prompt('\uD83D\uDD10 Enter Contractor PIN to edit:');
        if (pin === '1234') {
          const editable = { ...data, viewOnly: false };
          localStorage.setItem('active_session', JSON.stringify(editable));
          localStorage.setItem('firestoreSessionId', doc.id);
          localStorage.setItem('viewOnlyMode', 'false');
          window.location.href = 'tally.html?loadedSession=true';
        } else if (pin !== null) {
          alert('Incorrect PIN');
        }
      });
      btns.appendChild(editBtn);

      row.appendChild(btns);
      listEl.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load sessions', err);
    const msg = document.createElement('p');
    msg.textContent = 'Error loading sessions.';
    listEl.appendChild(msg);
  }
}

// Main entry

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    try {
      const doc = await firebase.firestore().collection('contractors').doc(user.uid).get();
      if (!doc.exists) {
        window.location.replace('login.html');
        return;
      }
      const contractorId = doc.id;
      SessionState.set('contractor', contractorId);
      await fetchSessions(contractorId);

      const page = document.getElementById('page-content');
      if (page) page.style.display = 'block';
      const dashBtn = document.getElementById('backToDashboard');
      if (dashBtn) {
        dashBtn.style.display = 'inline-block';
        dashBtn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }
    } catch (err) {
      console.error('Failed to verify contractor', err);
      window.location.replace('login.html');
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  });
});

