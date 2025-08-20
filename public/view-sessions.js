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

// ---- PAGING + STATE ----
const PAGE_SIZE = 25;
let _contractorId = null;
let _lastDoc = null;
let _reachedEnd = false;
let _loading = false;
let _totalLoaded = 0;
let allSessions = []; // accumulate fetched docs as plain objects { __id, ...data }

// Parse Date from session fields; prefer 'date' then 'savedAt'
function parseSessionDate(s) {
  const val = s?.date || s?.savedAt;
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d) ? null : d;
}
function yKeyFromDate(d) { return d ? String(d.getFullYear()) : 'Unknown'; }

// Ensure a collapsible year section exists and return it
function ensureYearSection(yearKey) {
  const outer = document.getElementById('sessionListOuter');
  if (!outer) return null;
  let sec = outer.querySelector(`[data-year="${yearKey}"]`);
  if (sec) return sec;

  sec = document.createElement('section');
  sec.setAttribute('data-year', yearKey);
  sec.style.marginBottom = '12px';
  sec.innerHTML = `
    <div class="year-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#151515;border:1px solid #333;padding:8px;">
      <strong>${yearKey}</strong>
      <span class="chev" aria-hidden="true">▾</span>
    </div>
    <div class="year-body" style="border:1px solid #333;border-top:none;padding:8px;"></div>
  `;
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  outer.insertBefore(sec, loadMoreBtn || null);

  // toggle collapse
  const header = sec.querySelector('.year-header');
  header.addEventListener('click', () => {
    const body = sec.querySelector('.year-body');
    const chev = sec.querySelector('.chev');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    chev.textContent = isHidden ? '▾' : '▸';
  });
  return sec;
}
function clearYearSections() {
  const outer = document.getElementById('sessionListOuter');
  if (!outer) return;
  [...outer.querySelectorAll('section[data-year]')].forEach(s => s.remove());
}

// Reuse the existing row look/feel
function renderSessionRowInto(container, docId, data) {
  const station = data.stationName || 'Unnamed Station';
  const dateStr = formatNZDate(data.date || data.savedAt);
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
    ${dateStr || ''}<br>
    🐑 ${totalSheep} | Shearers: ${shearers} | Shed Staff: ${shedStaff}
  `;
  row.appendChild(info);

  const btns = document.createElement('div');

  const viewBtn = document.createElement('button');
  viewBtn.textContent = 'View';
  viewBtn.className = 'tab-button';
  viewBtn.addEventListener('click', () => {
    localStorage.setItem('active_session', JSON.stringify(data));
    localStorage.setItem('firestoreSessionId', docId);
    localStorage.setItem('viewOnlyMode', 'true');
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
      localStorage.setItem('firestoreSessionId', docId);
      localStorage.setItem('viewOnlyMode', 'false');
      window.location.href = 'tally.html?loadedSession=true';
    } else if (pin !== null) {
      alert('Incorrect PIN');
    }
  });
  btns.appendChild(editBtn);

  row.appendChild(btns);
  container.appendChild(row);
}

function updateMetaAndButton() {
  const meta = document.getElementById('sessionListMeta');
  const btn = document.getElementById('loadMoreBtn');
  if (meta) {
    meta.textContent = _totalLoaded
      ? `Loaded ${_totalLoaded} session${_totalLoaded === 1 ? '' : 's'}`
      : '';
  }
  if (btn) {
    if (_reachedEnd) {
      btn.style.display = _totalLoaded ? 'none' : 'inline-block';
      btn.disabled = true;
      btn.textContent = _totalLoaded ? 'Load more' : 'No sessions found';
    } else {
      btn.style.display = 'inline-block';
      btn.disabled = _loading;
      btn.textContent = _loading ? 'Loading…' : 'Load more';
    }
  }
}

function applyFiltersAndRender() {
  const q = (document.getElementById('sfq')?.value || '').trim().toLowerCase();
  const fromV = document.getElementById('sfrom')?.value || '';
  const toV   = document.getElementById('sto')?.value || '';
  const from = fromV ? new Date(fromV + 'T00:00:00') : null;
  const to   = toV   ? new Date(toV   + 'T23:59:59') : null;

  const rows = allSessions.filter(s => {
    const station = (s.stationName || '').toLowerCase();
    if (q && !station.includes(q)) return false;
    const dt = parseSessionDate(s);
    if (from && (!dt || dt < from)) return false;
    if (to && (!dt || dt > to)) return false;
    return true;
  });

  // Clear grouped UI and fallback container
  clearYearSections();
  const fallback = document.getElementById('sessionList');
  if (fallback) fallback.innerHTML = '';

  if (!rows.length) {
    if (fallback) fallback.innerHTML = '<p>No sessions match your filter.</p>';
    return;
  }

  // Newest first within groups
  rows.sort((a, b) => {
    const da = parseSessionDate(a)?.getTime() || 0;
    const db = parseSessionDate(b)?.getTime() || 0;
    return db - da;
  });

  for (const s of rows) {
    const d = parseSessionDate(s);
    const yKey = yKeyFromDate(d);
    const sec = ensureYearSection(yKey);
    const body = sec?.querySelector('.year-body');
    if (!body) continue;
    renderSessionRowInto(body, s.__id, s);
  }
}

async function loadNextPage() {
  if (_loading || _reachedEnd || !_contractorId) return;
  _loading = true;
  updateMetaAndButton();

  try {
    let q = firebase
      .firestore()
      .collection('contractors')
      .doc(_contractorId)
      .collection('sessions')
      .orderBy('date', 'desc')
      .limit(PAGE_SIZE);

    if (_lastDoc) q = q.startAfter(_lastDoc);

    const snap = await q.get();
    if (snap.empty) {
      if (_totalLoaded === 0) {
        const fallback = document.getElementById('sessionList');
        if (fallback) fallback.innerHTML = '<p>No sessions found.</p>';
      }
      _reachedEnd = true;
      return;
    }

    _lastDoc = snap.docs[snap.docs.length - 1];

    snap.forEach(doc => {
      const data = doc.data() || {};
      allSessions.push({ __id: doc.id, ...data });
      _totalLoaded++;
    });

    applyFiltersAndRender();

    if (snap.size < PAGE_SIZE) {
      _reachedEnd = true;
    }
  } catch (err) {
    console.error('Failed to load sessions page', err);
    if (_totalLoaded === 0) {
      const fallback = document.getElementById('sessionList');
      if (fallback) fallback.innerHTML = '<p>Error loading sessions.</p>';
    }
    _reachedEnd = true;
  } finally {
    _loading = false;
    updateMetaAndButton();
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
      localStorage.setItem('contractor_id', contractorId);

      // Reset paging state
      _contractorId = contractorId;
      _lastDoc = null;
      _reachedEnd = false;
      _loading = false;
      _totalLoaded = 0;
      allSessions = [];

      // First page
      await loadNextPage();

      // Reveal page + Return to Dashboard handler (keep existing)
      const page = document.getElementById('page-content');
      if (page) page.style.display = 'block';
      const dashBtn = document.getElementById('backToDashboard');
      if (dashBtn) {
        dashBtn.style.display = 'inline-block';
        dashBtn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }

      // Wire filters and controls
      const sfq   = document.getElementById('sfq');
      const sfrom = document.getElementById('sfrom');
      const sto   = document.getElementById('sto');
      const sapply= document.getElementById('sapply');
      const sclear= document.getElementById('sclear');
      const more  = document.getElementById('loadMoreBtn');
      const exAll = document.getElementById('expandAll');
      const colAll= document.getElementById('collapseAll');

      function applyNow(){ applyFiltersAndRender(); }

      sapply?.addEventListener('click', applyNow);
      sclear?.addEventListener('click', () => {
        if (sfq)   sfq.value = '';
        if (sfrom) sfrom.value = '';
        if (sto)   sto.value = '';
        applyFiltersAndRender();
      });
      // Optional: live typing search
      sfq?.addEventListener('input', applyNow);

      more?.addEventListener('click', () => loadNextPage());

      exAll?.addEventListener('click', () => {
        document.querySelectorAll('section[data-year] .year-body').forEach(b => b.style.display = '');
        document.querySelectorAll('section[data-year] .chev').forEach(c => c.textContent = '▾');
      });
      colAll?.addEventListener('click', () => {
        document.querySelectorAll('section[data-year] .year-body').forEach(b => b.style.display = 'none');
        document.querySelectorAll('section[data-year] .chev').forEach(c => c.textContent = '▸');
      });

    } catch (err) {
      console.error('Failed to verify contractor', err);
      window.location.replace('login.html');
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  });
});

