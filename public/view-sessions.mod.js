// public/view-sessions.mod.js
import {
  auth, db, onAuthStateChanged,
  collection, doc, getDocs, query, orderBy
} from "./firebase-core.js";

function redirect(url){ window.location.href = url; }

async function fetchSessions(contractorId){
  const ref = collection(db, 'contractors', contractorId, 'sessions');
  const q = query(ref, orderBy('date','desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderSessions(list){
  const container = document.getElementById('sessionsContainer');
  if (!container) return;
  if (!list.length) { container.innerHTML = '<p>No sessions found.</p>'; return; }
  container.innerHTML = '';
  list.forEach(s => {
    const el = document.createElement('div');
    el.className = 'session-row';
    const dt = (s.date && s.date.toDate) ? s.date.toDate() : s.date;
    const dstr = dt instanceof Date ? dt.toLocaleDateString() : (dt || '');
    el.textContent = `${dstr} — ${s.stationName || 'Unknown'} — ${s.totalSheep || 0} sheep`;
    el.addEventListener('click', () => {
      // preserve existing navigation behavior if an onclick was used before
      if (window.loadSessionById) { window.loadSessionById(s.id); }
    });
    container.appendChild(el);
  });
}

function start(){
  onAuthStateChanged(auth, async (user) => {
    if (!user) { redirect('/login.html'); return; }
    let contractorId = null;
    try { contractorId = localStorage.getItem('contractor_id'); } catch(_) {}
    if (!contractorId) { redirect('/auth-check.html'); return; }

    try {
      const sessions = await fetchSessions(contractorId);
      renderSessions(sessions);
    } catch (e) {
      console.error('[view-sessions] fetch failed', e);
      const c = document.getElementById('sessionsContainer');
      if (c) c.innerHTML = '<p>Could not load sessions.</p>';
    }
  });
}

document.readyState === 'loading' ? 
  document.addEventListener('DOMContentLoaded', start) : start();
