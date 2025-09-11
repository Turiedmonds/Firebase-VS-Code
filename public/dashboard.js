// ===== Dashboard welcome modal: show ONCE EVER =====

// Returns true if we should show the dashboard welcome on this visit
function shouldShowDashboardWelcomeOnce(){
  try {
    // Only show if never seen before AND (if you have a master enable flag, respect it)
    if (localStorage.getItem('dashboard_welcome_seen') === 'true') return false;

    // Optional master toggle: localStorage['welcome_enabled'] !== 'false'
    var enabled = localStorage.getItem('welcome_enabled');
    if (enabled === 'false') return false;

    // Role guard (optional but nice): only contractors see this dashboard intro
    var role = (localStorage.getItem('user_role') || '').toLowerCase();
    if (role && role !== 'contractor') return false;

    return true;
  } catch(e){ return false; }
}

// Mark as seen forever
function markDashboardWelcomeSeen(){
  try { localStorage.setItem('dashboard_welcome_seen','true'); } catch(e){}
}

// If your app already exposes a function to open the dashboard welcome modal,
// wrap it so it only opens once automatically. We leave a manual "force" path.
(function(){
  var fnNames = ['showWelcomeModal','openWelcomeModal','startOnboarding','openSetupModal','showSetupPrompt'];
  fnNames.forEach(function(name){
    if (typeof window[name] === 'function') {
      var orig = window[name];
      window[name] = function(force){
        if (force === true) return orig.apply(this, arguments); // manual open bypass
        if (!shouldShowDashboardWelcomeOnce()) return;          // auto-open only once
        var res = orig.apply(this, arguments);
        // Hook common "close" / "complete" marks if you have callbacks.
        // If not, mark immediately to ensure once-only behavior.
        markDashboardWelcomeSeen();
        return res;
      };
    }
  });
})();

function isForcedOffline(){ return localStorage.getItem('force_offline') === '1'; }
function isReallyOffline(){ return !navigator.onLine || isForcedOffline(); }

function removeOverlayGate() {
  // Remove common blocking overlays if present
  const candidates = [
    '#boot-gate', '.boot-gate', '.boot-overlay',
    '#loading-overlay', '.loading-overlay',
    '#dashboardOverlay', '#blocker', '.blocker',
    '.boot-hiding'
  ];
  candidates.forEach(sel=>{
    document.querySelectorAll(sel).forEach(el=>{
      el.classList.remove('boot-hiding');
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.display = 'none';
      el.removeAttribute('aria-hidden');
    });
  });
  // Ensure main app area is clickable
  const root = document.getElementById('app') || document.body;
  root.style.pointerEvents = 'auto';
  root.style.opacity = '1';
}

function showOfflineToastOnce(msg){
  if (showOfflineToastOnce._shown) return;
  showOfflineToastOnce._shown = true;
  const t=document.createElement('div');
  t.textContent = msg || 'Offline: cached navigation enabled';
  t.style.position='fixed'; t.style.bottom='16px'; t.style.left='50%';
  t.style.transform='translateX(-50%)';
  t.style.background='rgba(20,20,20,0.95)'; t.style.color='#fff';
  t.style.padding='8px 12px'; t.style.borderRadius='6px';
  t.style.font='14px system-ui'; t.style.zIndex='2147483647';
  document.body.appendChild(t); setTimeout(()=>t.remove(),2200);
}

function handleStartNewDayClick(e){
  e.preventDefault();
  e.stopPropagation();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  if (isReallyOffline()) {
    caches.match('/tally.html').then(res => {
      if (res) {
        location.assign('/tally.html');
      } else {
        alert('Tally page not available offline. Please connect to the internet at least once to cache this page.');
      }
    });
  } else {
    location.assign('/tally.html');
  }
}

function bindOfflineNav() {
  // Bind Start New Day → /tally.html regardless of data
  const candidates = [
    '#btnStartNewDay', '[data-action="start-new-day"]',
    'a[href="/tally.html"]', 'a[data-nav="tally"]'
  ];
  let bound = false;
  candidates.forEach(sel=>{
    document.querySelectorAll(sel).forEach(el=>{
      if (el._offlineBound) return;
      el.addEventListener('click', handleStartNewDayClick, { passive:false });
      el._offlineBound = true;
      bound = true;
    });
  });
  // Add a tiny visible fallback link if nothing was bound
  if (!document.getElementById('offlineOpenTally')) {
    const role = localStorage.getItem('user_role');
    if (role === 'contractor') {
      const bar=document.createElement('div');
      bar.id='offlineOpenTally';
      bar.innerHTML = '<a href="/tally.html" style="color:#ffd86b;text-decoration:underline">Open Tally (Offline)</a>';
      bar.style.position='fixed'; bar.style.top='10px'; bar.style.right='10px';
      bar.style.zIndex='2147483647'; bar.style.font='13px system-ui'; bar.style.background='rgba(0,0,0,.6)';
      bar.style.padding='6px 8px'; bar.style.borderRadius='6px';
      document.body.appendChild(bar);
      // ensure anchor works even if JS elsewhere blocks
      bar.querySelector('a').addEventListener('click', handleStartNewDayClick, { passive:false });
    }
  }
  return bound;
}

function throttle(ms, fn){
  let t=0; return (...a)=>{ const now=Date.now(); if (now-t>ms){ t=now; return fn(...a); } };
}

function getIncidentSessionKey(s){
  if (!s) return '_';
  let d = s.date || s.sessionDate || s.savedAt || s.timestamp || null;
  try {
    if (d && typeof d.toDate === 'function') d = d.toDate();
    else if (d) d = new Date(d);
  } catch (e) { d = null; }
  const ymd = (d && !isNaN(d.getTime())) ? d.toISOString().slice(0,10) : '';
  const station = (s.stationName || s.station || '').trim();
  return ymd + '_' + station;
}

function checkIncidentNotifications(){
  const btn = document.getElementById('incidentNotice');
  if (!btn) return;
  let sessions;
  try {
    sessions = JSON.parse(localStorage.getItem('sheariq_sessions') || '[]');
    sessions = Array.isArray(sessions) ? sessions : [];
  } catch (e) {
    sessions = [];
  }
  const unseen = [];
  sessions.forEach(s => {
    if (Array.isArray(s.incidents) && s.incidents.length) {
      const sessionKey = getIncidentSessionKey(s);
      if (!localStorage.getItem('incident_seen_' + sessionKey)) {
        unseen.push(sessionKey);
      }
    }
  });
  if (unseen.length) {
    btn.disabled = false;
    btn.textContent = 'View incident reports (' + unseen.length + ')';
    btn.addEventListener('click', () => {
      unseen.forEach(k => localStorage.setItem('incident_seen_' + k, '1'));
      location.href = 'incident-reports.html';
    }, { once: true });
  } else {
    btn.disabled = true;
    btn.textContent = 'No incident reports';
  }
}

async function refreshSessionsFromCloud(){
  try {
    const user = firebase.auth().currentUser;
    const contractorId = localStorage.getItem('contractor_id') || user?.uid || null;
    if (!contractorId || !user) {
      checkIncidentNotifications();
      return;
    }
    const snap = await firebase.firestore().collection('contractors').doc(contractorId).collection('sessions').get();
    const arr = [];
    snap.forEach(doc => arr.push(doc.data()));
    localStorage.setItem('sheariq_sessions', JSON.stringify(arr));
  } catch (e) {
    console.error('Failed to refresh sessions', e);
  }
  checkIncidentNotifications();
}

function migrateOldIncidentSeenKeys(){
  const prefix = 'incident_seen_';
  const toMove = [];
  for (let i=0; i<localStorage.length; i++){
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)){
      const rest = key.slice(prefix.length);
      if (/^\d{2}\/\d{2}\/\d{4}_/.test(rest)){
        toMove.push(key);
      }
    }
  }
  toMove.forEach(oldKey=>{
    const rest = oldKey.slice(prefix.length);
    const [datePart, ...stationParts] = rest.split('_');
    const [dd, mm, yyyy] = datePart.split('/');
    const newKey = prefix + `${yyyy}-${mm}-${dd}_${stationParts.join('_')}`;
    const val = localStorage.getItem(oldKey);
    try { localStorage.setItem(newKey, val); } catch(e){}
    try { localStorage.removeItem(oldKey); } catch(e){}
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const role = localStorage.getItem('user_role');
  if (role === 'contractor' && isReallyOffline()) {
    // Mark offline mode on <body> for CSS helpers
    document.body.classList.add('offline-mode');
    // Safety unhide & remove any overlay/gate that might block taps
    removeOverlayGate();
    // Bind Start New Day and other nav right away
    const didBind = bindOfflineNav();
    // Inform the user
    showOfflineToastOnce('Offline mode: cached navigation ready');
    console.log('[Dashboard] Offline Safe Mode active. Buttons bound:', didBind);
  }

  // Also react if the OS flips connectivity while the page is open
  window.addEventListener('online', throttle(800, ()=>{
    document.body.classList.remove('offline-mode');
  }));
  window.addEventListener('offline', throttle(800, ()=>{
    if (localStorage.getItem('user_role') === 'contractor'){
      document.body.classList.add('offline-mode');
      removeOverlayGate();
      bindOfflineNav();
      showOfflineToastOnce('Offline mode: cached navigation ready');
    }
  }));
  migrateOldIncidentSeenKeys();
  checkIncidentNotifications();
  refreshSessionsFromCloud();
});

window.addEventListener('focus', refreshSessionsFromCloud);
firebase.auth().onAuthStateChanged(refreshSessionsFromCloud);
window.addEventListener('storage', e => {
  if (e.key === 'incident_seen_last_update') {
    checkIncidentNotifications();
  }
});

// Auto-open on first dashboard load (only once)
document.addEventListener('DOMContentLoaded', function(){
  try {
    // Contractor default role/pref (as you already do elsewhere)
    localStorage.setItem('user_role','contractor');
    localStorage.setItem('preferred_start','dashboard');
  } catch(e){}

  // Try to auto-open only if truly first time
  if (shouldShowDashboardWelcomeOnce()) {
    // Prefer your actual function name below if you have a specific one:
    if (typeof window.showWelcomeModal === 'function') {
      window.showWelcomeModal(false); // false = not forced (will mark seen)
    } else if (typeof window.openWelcomeModal === 'function') {
      window.openWelcomeModal(false);
    } else if (typeof window.openSetupModal === 'function') {
      window.openSetupModal(false);
    } else if (typeof window.showSetupPrompt === 'function') {
      window.showSetupPrompt(false);
    } else {
      // If no modal function exists, just mark as seen to avoid future tries
      markDashboardWelcomeSeen();
    }
  }
});

// Provide a manual trigger for Help menu to re-open the dashboard welcome
window.forceShowDashboardWelcome = function(){
  // Allow manual show any time, but DO NOT reset the seen flag automatically.
  // Your modal's own "Reset" control can clear the flag if you want.
  if (typeof window.showWelcomeModal === 'function') return window.showWelcomeModal(true);
  if (typeof window.openWelcomeModal === 'function') return window.openWelcomeModal(true);
  if (typeof window.openSetupModal === 'function')   return window.openSetupModal(true);
  if (typeof window.showSetupPrompt === 'function')  return window.showSetupPrompt(true);
  // If there is no modal function, do nothing.
};

// (Optional) Helper for your Help menu "Reset onboarding" action:
window.resetDashboardWelcomeOnce = function(){
  try { localStorage.removeItem('dashboard_welcome_seen'); } catch(e){}
  // Next visit to dashboard will auto-show again.
};

try {
  localStorage.setItem('user_role', 'contractor');
  localStorage.setItem('preferred_start', 'dashboard');
} catch(e) {}


// Unhide content immediately to avoid blank screen offline
const earlyPage = document.getElementById('page-content');
if (earlyPage) earlyPage.style.display = 'block';

function showOfflineNotice() {
  const subheading = document.getElementById('dashboard-subheading');
  if (subheading) {
    subheading.textContent = 'Offline mode: limited features available';
  }
}

// --- Shared helpers for dashboard widgets ---
function formatInt(n) {
  return (n || 0).toLocaleString();
}

function toYMDFromSavedAt(ts) {
  try {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (!d || isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

function pickFarmName(session) {
  const names = [session?.stationName, session?.farmName, session?.farm, session?.propertyName];
  for (const n of names) {
    if (n && String(n).trim()) {
      return String(n).trim().replace(/\s+/g, ' ');
    }
  }
  return 'Unknown';
}

function getSessionDateYMD(session) {
  const val = session?.date || session?.sessionDate || session?.createdAt || session?.timestamp || session?.savedAt;
  return toYMDFromSavedAt(val);
}

function normalizeName(input) {
  if (!input) return '';
  if (typeof input === 'object') {
    if (input.displayName) input = input.displayName;
    else if (input.name) input = input.name;
    else if (typeof input.id === 'string') input = input.id;
    else if (input.ref && typeof input.ref.id === 'string') input = input.ref.id;
  } 
  const t = String(input).trim().replace(/\s+/g, ' ');
  if (!/[a-zA-Z]/.test(t)) return '';
  const parts = t.split(' ');
  return parts.map(p => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '')).join(' ');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function sum(arr){ return (arr || []).reduce((a,b)=>a + (Number(b)||0), 0); }

function sumSheep(session) {
  let total = 0;
  if (Array.isArray(session?.shearerCounts)) {
    for (const sc of session.shearerCounts) {
      let n = Number(sc?.total);
      if (!Number.isFinite(n)) {
        const arr = Array.isArray(sc?.stands)
          ? sc.stands
          : (Array.isArray(sc?.counts) ? sc.counts : []);
        n = arr.reduce((sum, v) => {
          const m = Number(v);
          return Number.isFinite(m) ? sum + m : sum;
        }, 0);
      }
      if (Number.isFinite(n)) total += n;
    }
  } else if (Array.isArray(session?.tallies)) {
    for (const t of session.tallies) {
      const n = Number(t?.total ?? t?.count ?? t?.tally);
      if (Number.isFinite(n)) total += n;
    }
  } else if (Array.isArray(session?.shearerTallies)) {
    for (const t of session.shearerTallies) {
      const n = Number(t?.total ?? t?.count ?? t?.tally);
      if (Number.isFinite(n)) total += n;
    }
  } else if (Array.isArray(session?.shearers)) {
    for (const sh of session.shearers) {
      if (!Array.isArray(sh?.runs)) continue;
      for (const run of sh.runs) {
        const n = Number(run?.tally ?? run?.count ?? run?.total);
        if (Number.isFinite(n)) total += n;
      }
    }
  }
  return total;
}

// Convert decimal hours to "Hh Mm" (e.g., 7.5 -> "7h 30m")
function hoursToHM(dec) {
  if (!dec || isNaN(dec)) return '0h';
  const totalMins = Math.round(dec * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Convert decimal hours to "H:MM" (zero-padded minutes)
function formatHoursHM(decHours) {
  if (!Number.isFinite(decHours)) return '0:00';
  const totalMins = Math.round(decHours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Render a small line chart with axes and a title.
// valuesArray: array of numeric values
// labelsArray: optional labels for each x-value
// title: optional chart title (defaults to container's aria-label)
function renderSparkline(containerEl, valuesArray, labelsArray = [], title) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  if (!Array.isArray(valuesArray) || valuesArray.length === 0) {
    containerEl.textContent = '';
    return;
  }

  const chartTitle = title || containerEl.getAttribute('aria-label') || '';

  const height = containerEl.clientHeight || 80;
  const margin = { top: 20, right: 10, bottom: 30, left: 40 };
  const width = Math.max(containerEl.clientWidth || 0, valuesArray.length * 30 + margin.left + margin.right);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const max = Math.max(...valuesArray);

  const points = valuesArray.map((v, i) => {
    const x = margin.left + (i / ((valuesArray.length - 1) || 1)) * innerW;
    const y = margin.top + innerH - (max ? (v / max) * innerH : 0);
    return `${x},${y}`;
  }).join(' ');

  // Build x-axis labels if provided
  let xLabels = '';
  if (Array.isArray(labelsArray) && labelsArray.length === valuesArray.length) {
    xLabels = labelsArray.map((lab, i) => {
      const x = margin.left + (i / ((labelsArray.length - 1) || 1)) * innerW;
      const y = margin.top + innerH + 12;
      return `<text x="${x}" y="${y}" text-anchor="middle">${lab}</text>`;
    }).join('');
  }

  // Y-axis labels (0 and max)
  const yLabels = [
    `<text x="${margin.left - 6}" y="${margin.top + innerH}" text-anchor="end">0</text>`,
    `<text x="${margin.left - 6}" y="${margin.top + 4}" text-anchor="end">${max.toLocaleString()}</text>`
  ].join('');

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  if (chartTitle) {
    svg += `<text x="${width / 2}" y="14" text-anchor="middle" class="title">${chartTitle}</text>`;
  }
  svg += `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"/>` +
         `<line class="axis" x1="${margin.left}" y1="${margin.top + innerH}" x2="${margin.left + innerW}" y2="${margin.top + innerH}"/>` +
         xLabels + yLabels;

  if (valuesArray.length === 1) {
    const x = margin.left + innerW / 2;
    const y = margin.top + innerH - (max ? (valuesArray[0] / max) * innerH : 0);
    svg += `<circle cx="${x}" cy="${y}" r="3" class="spark-dot"/>`;
  } else {
    svg += `<polyline class="spark-line" points="${points}"/>`;
  }

  svg += '</svg>';
  containerEl.innerHTML = svg;
}

// Determine busiest and quietest labels/values
function calcPeaks(valuesArray, labelsArray) {
  if (!Array.isArray(valuesArray) || valuesArray.length === 0) return null;
  if (valuesArray.every(v => v === 0)) return null;
  let maxVal = -Infinity, minVal = Infinity;
  let maxIdx = -1, minIdx = -1;
  valuesArray.forEach((v, i) => {
    if (v > maxVal) { maxVal = v; maxIdx = i; }
    if (v < minVal) { minVal = v; minIdx = i; }
  });
  return {
    busiest: maxIdx >= 0 ? { label: labelsArray?.[maxIdx] || '', value: maxVal, index: maxIdx } : null,
    quietest: minIdx >= 0 ? { label: labelsArray?.[minIdx] || '', value: minVal, index: minIdx } : null
  };
}

// Populate a <select> with year options from the current year backwards.
// Defaults to 6 years and sets the select's value to the current year.
function fillYearsSelect(sel, yearsBack = 6) {
  if (!sel) return;
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - yearsBack; y--) years.push(y);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = String(thisYear);
}

// Persist last dashboard widget data to avoid first-paint flash
const dashCache = (() => {
  try { return JSON.parse(localStorage.getItem('dashboard_cache_v1') || '{}'); }
  catch { return {}; }
})();
function saveDashCache(){
  try { localStorage.setItem('dashboard_cache_v1', JSON.stringify(dashCache)); }
  catch{}
}

// Track which leaderboard widgets rendered from cache
const dashCacheRendered = { shearers: false, shedstaff: false, farms: false };

// Simple in-memory session store with one Firestore listener
const SessionStore = (() => {
  let cache = [];
  let unsub = null;
  let contractorId = null;
  let started = false;
  let loadedAllTime = false;
  const listeners = new Set();

  function notify() {
    listeners.forEach(fn => {
      try { fn(cache); } catch (e) { console.error(e); }
    });
  }

  // Derive a usable timestamp from various possible fields on a session
  function deriveSavedAt(data) {
    const convert = val => {
      try {
        if (!val) return null;
        if (typeof val.toDate === 'function') return val; // Firestore Timestamp
        if (val instanceof Date) return firebase.firestore.Timestamp.fromDate(val);
        if (typeof val === 'number') return firebase.firestore.Timestamp.fromMillis(val);
        if (typeof val === 'string') {
          const iso = new Date(val);
          if (!isNaN(iso.getTime())) return firebase.firestore.Timestamp.fromDate(iso);
          const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (m) {
            const d = new Date(`${m[3]}-${m[2]}-${m[1]}`);
            if (!isNaN(d.getTime())) return firebase.firestore.Timestamp.fromDate(d);
          }
        }
      } catch {}
      return null;
    };
    let ts = convert(data?.savedAt);
    if (!ts) ts = convert(data?.date);
    if (!ts) ts = convert(data?.timestamp);
    if (!ts) ts = convert(data?.sessionDate);
    return ts;
  }

  function wrapDoc(doc) {
    const data = doc.data ? doc.data() : doc;
    let ts = deriveSavedAt(data);
    const newData = { ...data };
    if (ts) newData.savedAt = ts;
    return { id: doc.id || data.id, data: () => newData };
  }

  function maybeInitYearFilter() {
    // Query all year dropdowns used by the Top 5 widgets.
    const selects = document.querySelectorAll('.top5-widget .year-select');
    if (!selects.length) return;

    // Determine the year from the first session in cache.
    const first = cache[0];
    if (!first) return;
    const data = typeof first.data === 'function' ? first.data() : first.data;
    let year = null;
    try {
      // Prefer explicit session date if available
      if (data?.date) {
        if (typeof data.date === 'string') {
          const ds = data.date.trim();
          let m = ds.match(/^\d{4}-\d{2}-\d{2}$/);
          if (m) {
            year = parseInt(ds.slice(0, 4), 10);
          } else {
            m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) year = parseInt(m[3], 10);
          }
        } else if (typeof data.date.toDate === 'function') {
          const d = data.date.toDate();
          if (d && !isNaN(d.getTime())) year = d.getFullYear();
        }
      }
      // Fallback to savedAt timestamp
      if (!year && data?.savedAt && typeof data.savedAt.toDate === 'function') {
        const d = data.savedAt.toDate();
        if (d && !isNaN(d.getTime())) year = d.getFullYear();
      }
    } catch {}
    if (!year) return;

    // Initialize each select that doesn't yet have a year selected.
    selects.forEach(sel => {
      if (!sel.value) {
        sel.value = String(year);
        // Trigger downstream widgets to refresh.
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  return {
    start(id, { monthsLive = 12 } = {}) {
      contractorId = id;
      if (started || !id) return;
      const db = firebase.firestore ? firebase.firestore() : (typeof getFirestore === 'function' ? getFirestore() : null);
      if (!db) return;
      const colRef = db.collection('contractors').doc(id).collection('sessions');
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsLive);
      console.info('[SessionStore] start listener');
      unsub = colRef.onSnapshot(snap => {
        let changed = false;
        for (const change of snap.docChanges()) {
          const wrapped = wrapDoc(change.doc);
          const idx = cache.findIndex(d => d.id === wrapped.id);
          const ts = deriveSavedAt(wrapped.data());
          const recent = !ts || ts.toDate().getTime() >= cutoff.getTime();
          if (change.type === 'removed' || !recent) {
            if (idx !== -1) {
              cache.splice(idx, 1);
              changed = true;
            }
          } else if (change.type === 'modified' && idx !== -1) {
            cache[idx] = wrapped;
            changed = true;
          } else if ((change.type === 'added' || change.type === 'modified') && idx === -1) {
            cache.push(wrapped);
            changed = true;
          }
        }
        if (changed) {
          maybeInitYearFilter();
          notify();
        }
      }, err => console.error('[SessionStore] listener error:', err));
      started = true;
    },
    stop() {
      if (unsub) {
        console.info('[SessionStore] stop listener');
        unsub();
      }
      unsub = null;
      started = false;
    },
    getAll() { return cache.slice(); },
    onChange(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    loadAllTimeOnce() {
      if (loadedAllTime || !contractorId) return;
      const db = firebase.firestore ? firebase.firestore() : (typeof getFirestore === 'function' ? getFirestore() : null);
      if (!db) return;
      const colRef = db.collection('contractors').doc(contractorId).collection('sessions');
      colRef.get().then(snap => {
        const existing = new Set(cache.map(d => d.id));
        snap.forEach(doc => {
          const wrapped = wrapDoc(doc);
          if (!existing.has(wrapped.id)) cache.push(wrapped);
        });
        loadedAllTime = true;
        maybeInitYearFilter();
        notify();
      }).catch(err => console.error('[SessionStore] loadAllTimeOnce error:', err));
    },
    ensureYearFilter() {
      maybeInitYearFilter();
    }
  };
})();

function shouldRerender(prev, next) {
  return JSON.stringify(prev) !== JSON.stringify(next);
}

function formatDecimalHoursToHM(value) {
  const n = Number(value || 0);
  const totalMin = Math.round(n * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function renderTop5Shearers(rows, container) {
  const top5 = rows.slice(0, 5);
  const max = Math.max(1, ...top5.map(r => r.total));
  container.innerHTML = top5.map((r, idx) => {
    const pct = Math.round((r.total / max) * 100);
    return `
      <div class="siq-lb-row">
        <div class="siq-lb-rank">${idx + 1}</div>
        <div class="siq-lb-bar">
          <div class="siq-lb-fill" style="width:${pct}%;"></div>
          <div class="siq-lb-name" title="${r.name}">${r.name}</div>
        </div>
        <div class="siq-lb-value">${r.total.toLocaleString()}</div>
      </div>
    `;
  }).join('');
}

function renderTop5ShedStaff(rows, container) {
  const top5 = rows.slice(0, 5);
  const max = Math.max(1, ...top5.map(r => r.total));
  container.innerHTML = top5.map((r, idx) => {
    const pct = Math.round((r.total / max) * 100);
    return `
      <div class="siq-lb-row">
        <div class="siq-lb-rank">${idx + 1}</div>
        <div class="siq-lb-bar">
          <div class="siq-lb-fill" style="width:${pct}%;"></div>
          <div class="siq-lb-name" title="${r.name}">${r.name}</div>
        </div>
        <div class="siq-lb-value">${formatDecimalHoursToHM(r.total)}</div>
      </div>
    `;
  }).join('');
}

function renderTop5Farms(rows, container) {
  const top5 = rows.slice(0, 5);
  const max = Math.max(1, ...top5.map(r => r.sheep));
  container.innerHTML = top5.map((r, idx) => {
    const pct = Math.round((r.sheep / max) * 100);
    return `
      <div class="siq-lb-row">
        <div class="siq-lb-rank">${idx + 1}</div>
        <div class="siq-lb-bar">
          <div class="siq-lb-fill" style="width:${pct}%;"></div>
          <div class="siq-lb-name" title="${r.name}">${r.name}</div>
        </div>
        <div class="siq-lb-value">${formatInt(r.sheep)}</div>
      </div>
    `;
  }).join('');
}

// Render placeholder rows to reserve space until data arrives
function renderSkeletonRows(container) {
  if (!container) return;
  container.innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="siq-lb-row skeleton">
      <div class="siq-lb-rank">&nbsp;</div>
      <div class="siq-lb-bar">
        <div class="siq-lb-fill"></div>
        <div class="siq-lb-name">&nbsp;</div>
      </div>
      <div class="siq-lb-value">&nbsp;</div>
    </div>
  `).join('');
}

function renderEmptyLeaderboard(container, modalTbody, message) {
  if (container) {
    container.innerHTML = `<div class="siq-lb-empty">${message}</div>`;
  }
  if (modalTbody) {
    modalTbody.innerHTML = `<tr><td colspan="3" class="siq-lb-empty">${message}</td></tr>`;
  }
}

function renderCachedTop5Widgets() {
  const offline = isReallyOffline();
  const shearersEl = document.querySelector('#top5-shearers #top5-shearers-list');
  if (shearersEl) {
    if (dashCache.top5Shearers && dashCache.top5Shearers.length) {
      renderTop5Shearers(dashCache.top5Shearers, shearersEl);
      dashCacheRendered.shearers = true;
    } else if (offline) {
      renderEmptyLeaderboard(shearersEl, null, 'Data not available offline');
    } else {
      // No cache yet: show fixed-height skeleton rows to avoid layout jump
      renderSkeletonRows(shearersEl);
    }
  }
  const shedStaffEl = document.querySelector('#top5-shedstaff #top5-shedstaff-list');
  if (shedStaffEl) {
    if (dashCache.top5ShedStaff && dashCache.top5ShedStaff.length) {
      renderTop5ShedStaff(dashCache.top5ShedStaff, shedStaffEl);
      dashCacheRendered.shedstaff = true;
    } else if (offline) {
      renderEmptyLeaderboard(shedStaffEl, null, 'Data not available offline');
    } else {
      renderSkeletonRows(shedStaffEl);
    }
  }
  const farmsEl = document.querySelector('#top5-farms #top5-farms-list');
  if (farmsEl) {
    if (dashCache.top5Farms && dashCache.top5Farms.length) {
      renderTop5Farms(dashCache.top5Farms, farmsEl);
      dashCacheRendered.farms = true;
    } else if (offline) {
      renderEmptyLeaderboard(farmsEl, null, 'Data not available offline');
    } else {
      renderSkeletonRows(farmsEl);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCachedTop5Widgets);
} else {
  renderCachedTop5Widgets();
}

function initTop5ShearersWidget() {
  (function () {
    const flag = localStorage.getItem('dash_top5_shearers_enabled');
    const rootEl = document.getElementById('top5-shearers');
    if (flag === 'false' || !rootEl) {
      if (rootEl) rootEl.remove();
      return;
    }
    // Prefer stored scope; fall back to current auth user
    let contractorId = localStorage.getItem('contractor_id');
    if (!contractorId && firebase?.auth?.currentUser?.uid) {
      contractorId = firebase.auth().currentUser.uid;
      try { localStorage.setItem('contractor_id', contractorId); } catch {}
      console.debug('[Top5Shearers] contractor_id recovered from auth');
    }
    if (!contractorId) {
      console.warn('[Top5Shearers] Missing contractor_id');
      // Render a tiny empty state but do NOT throw.
      const listEl = document.getElementById('top5-shearers-list');
      if (listEl) listEl.innerHTML = `<div class="lb-row"><div class="lb-rank"></div><div class="lb-bar"><div class="lb-name">Data unavailable</div></div><div class="lb-value"></div></div>`;
      return;
    }

    const listEl = rootEl.querySelector('#top5-shearers-list');
    const viewSel = rootEl.querySelector('#shearers-view');
    // Relabel 12M option to current year (no extra text)
    (function labelRollingWithYear(sel) {
      if (!sel) return;
      const opt = [...sel.options].find(o => o.value === '12m');
      if (!opt) return;
      const y = new Date().getFullYear();
      opt.textContent = String(y);

      // auto-update at midnight (handles New Year rollover)
      function refresh() {
        const yy = new Date().getFullYear();
        const o = [...sel.options].find(v => v.value === '12m');
        if (o) o.textContent = String(yy);
      }
      const msToMidnight = (() => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,0);
        return next - now;
      })();
      setTimeout(() => { refresh(); setInterval(refresh, 24*60*60*1000); }, msToMidnight);
    })(viewSel);
    const yearSel = rootEl.querySelector('#shearers-year');
    const viewAllBtn = rootEl.querySelector('#shearers-viewall');
    const tabs = rootEl.querySelector('#worktype-tabs');
    const modal = document.getElementById('shearers-modal');
    const modalBodyTbody = document.querySelector('#shearers-full-table tbody');
    if (!listEl || !viewSel || !yearSel || !viewAllBtn || !tabs || !modal || !modalBodyTbody) {
      console.warn('[Top5Shearers] Missing elements');
      return;
    }


    function isCrutchedType(sheepType) {
      if (!sheepType) return false;
      const s = String(sheepType).toLowerCase();
      return s.includes('crutch');
    }

    function getDateRange(mode, year) {
      const today = new Date();
      if (mode === '12m') {
        const end = today;
        const start = new Date();
        start.setDate(start.getDate() - 365);
        return { start, end };
      }
      if (mode === 'year' && year) {
        const start = new Date(Number(year), 0, 1, 0, 0, 0);
        const end = new Date(Number(year), 11, 31, 23, 59, 59);
        return { start, end };
      }
      return { start: null, end: null };
    }

    function sessionDateToJS(d) {
      if (!d) return null;
      if (typeof d === 'object' && d.toDate) return d.toDate();
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split('-').map(Number);
        const dt = new Date(y, m - 1, day);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    // Map stand index → name from session.stands[], normalizing 1-based indices
    function buildStandIndexNameMap(sessionData) {
      const map = {};
      const arr = Array.isArray(sessionData.stands) ? sessionData.stands : [];

      // Detect if indices look 1-based (no 0 but there is a 1)
      const rawIdx = arr.map((st, i) => (st && st.index != null ? Number(st.index) : i));
      const has0 = rawIdx.includes(0);
      const has1 = rawIdx.includes(1);
      const looksOneBased = !has0 && has1; // e.g., [1,2,3...]

      arr.forEach((st, pos) => {
        // numeric index or fallback to position
        let i = (st && st.index != null) ? Number(st.index) : pos;
        if (!Number.isFinite(i)) i = pos;
        if (looksOneBased) i = i - 1;   // normalize 1-based → 0-based
        if (i < 0) i = 0;

        // resolve name; treat placeholders as missing
        let name = '';
        if (st) name = String(st.name || st.shearerName || st.id || '').trim();
        if (!name || /^stand\s+\d+$/i.test(name)) name = null;

        map[i] = name; // may be null; iterator will handle as unassigned if needed
      });

      return map;
    }

    // Extract tallies (shearerName, count, sheepType, date) from a session doc
    function* iterateTalliesFromSession(sessionDoc) {
      const s = sessionDoc.data ? sessionDoc.data() : sessionDoc; // QueryDocumentSnapshot or plain object
      const sessionDate = sessionDateToJS(s.date || s.sessionDate || s.createdAt || s.timestamp || s.savedAt);

      // Preferred path: shearerCounts[].stands[] + session.stands name map
      if (Array.isArray(s.shearerCounts)) {
        const nameByIndex = buildStandIndexNameMap(s);

        for (const row of s.shearerCounts) {
          const sheepType = row?.sheepType || '';
          const perStand = Array.isArray(row?.stands) && row.stands.length
            ? row.stands
            : (Array.isArray(row?.counts) ? row.counts : []);
          for (let i = 0; i < perStand.length; i++) {
            const raw = perStand[i];
            // raw may be string like "89" or number
            const num = Number(raw);
            if (!isFinite(num) || num <= 0) continue;

            const shearerName = nameByIndex[i] || `Stand ${i + 1}`;
            yield {
              shearerName,
              count: num,
              sheepType,
              date: sessionDate
            };
          }

          // Optional fallback: if there were no per-stand entries but row.total exists,
          // we could attribute it to an "Unknown" shearer. For now, skip to preserve per-shearer accuracy.
          // const totalNum = Number(row?.total);
          // if ((!perStand.length || perStand.every(v => !Number(v))) && isFinite(totalNum) && totalNum > 0) { ... }
        }
        return;
      }

      // Existing generic fallbacks (keep in case of future shapes)
      if (Array.isArray(s.tallies)) {
        for (const t of s.tallies) {
          yield {
            shearerName: t.shearerName || t.shearer || t.name,
            count: Number(t.count || t.tally || 0),
            sheepType: t.sheepType || t.type,
            date: sessionDate
          };
        }
        return;
      }

      if (Array.isArray(s.shearers)) {
        for (const sh of s.shearers) {
          const shearerName = normalizeName(sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id) || 'Unknown';
          const runs = sh.runs || sh.tallies || sh.entries || [];
          for (const r of (runs || [])) {
            yield {
              shearerName,
              count: Number(r.count || r.tally || 0),
              sheepType: r.sheepType || r.type,
              date: sessionDate
            };
          }
          if (typeof sh.total === 'number') {
            yield {
              shearerName,
              count: Number(sh.total),
              sheepType: sh.sheepType || null,
              date: sessionDate
            };
          }
        }
        return;
      }

      if (s.shearerTallies && typeof s.shearerTallies === 'object') {
        for (const [shearerName, entries] of Object.entries(s.shearerTallies)) {
          for (const e of (entries || [])) {
            yield {
              shearerName,
              count: Number(e.count || e.tally || 0),
              sheepType: e.sheepType || e.type,
              date: sessionDate
            };
          }
        }
      }
    }

    function aggregateShearers(sessions, mode, year, workType) {
      const { start, end } = getDateRange(mode, year);
      const wantCrutched = (workType === 'crutched');
      const totals = new Map();
      let grandTotal = 0;
      for (const doc of sessions) {
        for (const t of iterateTalliesFromSession(doc)) {
          if (!t || !t.shearerName) continue;
          if (mode !== 'all') {
            if (!t.date) continue;
            if (start && t.date < start) continue;
            if (end && t.date > end) continue;
          }
          const isCrutch = isCrutchedType(t.sheepType);
          if (wantCrutched && !isCrutch) continue;
          if (!wantCrutched && isCrutch) continue;
          const prev = totals.get(t.shearerName) || 0;
          const next = prev + (t.count || 0);
          totals.set(t.shearerName, next);
          grandTotal += (t.count || 0);
        }
      }
      const rows = Array.from(totals.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);
      return { rows, grandTotal };
    }


    function renderFullShearers(rows, grandTotal, tableBody) {
      tableBody.innerHTML = rows.map((r, idx) => {
        const pct = grandTotal ? ((r.total / grandTotal) * 100) : 0;
        return `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td>${r.total.toLocaleString()}</td>
        <td>${pct.toFixed(1)}%</td>
      </tr>
    `;
      }).join('');
    }

    function deriveYearsFromSessions(sessions) {
      const years = new Set();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const dt = sessionDateToJS(s.date || s.sessionDate || s.createdAt || s.timestamp || s.savedAt);
        if (dt) years.add(dt.getFullYear());
      }
      const arr = Array.from(years).sort((a, b) => b - a);
      const current = (new Date()).getFullYear();
      if (!arr.includes(current)) arr.unshift(current);
      return arr;
    }

    let modalKeyHandler = null;
    let lastFocused = null;
    function trapFocus(e) {
      if (e.key === 'Escape') {
        closeModal('shearers-modal');
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function openModal(id) {
      if (!rootEl) return;
      const m = document.getElementById(id);
      if (!m) return;
      lastFocused = document.activeElement;
      m.setAttribute('aria-hidden', 'false');
      modalKeyHandler = trapFocus;
      m.addEventListener('keydown', modalKeyHandler);
      const focusable = m.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length) focusable[0].focus();
    }

    function closeModal(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.setAttribute('aria-hidden', 'true');
      if (modalKeyHandler) {
        m.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
      }
      if (lastFocused) lastFocused.focus();
    }

      let cachedSessions = SessionStore.getAll();
      let cachedRows = (dashCacheRendered.shearers && dashCache.top5Shearers) ? dashCache.top5Shearers.slice() : [];
      let cachedGrandTotal = 0;
      let renderPending = false;

      SessionStore.onChange(() => {
        cachedSessions = SessionStore.getAll();
        const years = deriveYearsFromSessions(cachedSessions);
        yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (viewSel.value !== 'year') yearSel.hidden = true;
        if (!yearSel.value) SessionStore.ensureYearFilter();
        scheduleRender();
      });

      const years = deriveYearsFromSessions(cachedSessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;
      if (!yearSel.value) SessionStore.ensureYearFilter();

      function renderFromCache() {
        if (!cachedSessions.length) {
          if (!(dashCache.top5Shearers && dashCache.top5Shearers.length)) {
            renderEmptyLeaderboard(listEl, modalBodyTbody, 'No sessions yet');
          }
          return;
        }
        const workType = tabs.querySelector('.siq-segmented__btn.is-active')?.dataset.worktype || 'shorn';
        const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
        const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
          const { rows, grandTotal } = aggregateShearers(cachedSessions, mode, year, workType);
          if (!shouldRerender(cachedRows, rows)) return;
          cachedRows = rows;
          cachedGrandTotal = grandTotal;
          renderTop5Shearers(rows, listEl);
          renderFullShearers(rows, grandTotal, modalBodyTbody);
          // Save latest top rows for instant next load
          const top5Cache = rows.slice(0,5).map(r => ({ name: r.name, total: r.total }));
          if (shouldRerender(dashCache.top5Shearers, top5Cache)) {
            dashCache.top5Shearers = top5Cache;
            saveDashCache();
          }
        }

    function scheduleRender() {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        renderFromCache();
      });
    }
    // Ensure widget renders even when no SessionStore change fires
    scheduleRender();

    tabs.addEventListener('click', e => {
      if (!rootEl) return;
      const btn = e.target.closest('.siq-segmented__btn');
      if (!btn) return;
      tabs.querySelectorAll('.siq-segmented__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      scheduleRender();
    });

      viewSel.addEventListener('change', () => {
        if (!rootEl) return;
        const v = viewSel.value;
        if (v === 'all') {
          yearSel.hidden = true;
          SessionStore.loadAllTimeOnce();
        } else if (v === '12m') {
          yearSel.hidden = true;
        }
        scheduleRender();
      });

    yearSel.addEventListener('change', () => {
      if (!rootEl) return;
      scheduleRender();
    });

    yearSel.addEventListener('focus', () => {
      if (!rootEl) return;
      if (viewSel.value !== 'year') {
        if (![...viewSel.options].some(o => o.value === 'year')) {
          const opt = document.createElement('option');
          opt.value = 'year';
          opt.textContent = 'Specific Year';
          viewSel.appendChild(opt);
        }
        viewSel.value = 'year';
        yearSel.hidden = false;
      }
    });

    viewAllBtn.addEventListener('click', () => {
      if (!rootEl) return;
      openModal('shearers-modal');
    });

    modal.addEventListener('click', e => {
      if (!rootEl) return;
      if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) {
        closeModal('shearers-modal');
      }
    });

      // session data handled via SessionStore
      })();
}

function initTop5ShedStaffWidget() {
  (function () {
    const flag = localStorage.getItem('dash_top5_shedstaff_enabled');
    const rootEl = document.getElementById('top5-shedstaff');
    if (flag === 'false' || !rootEl) {
      if (rootEl) rootEl.remove();
      return;
    }

    let contractorId = localStorage.getItem('contractor_id');
    if (!contractorId && firebase?.auth?.currentUser?.uid) {
      contractorId = firebase.auth().currentUser.uid;
      try { localStorage.setItem('contractor_id', contractorId); } catch {}
      console.debug('[Top5ShedStaff] contractor_id recovered from auth');
    }
    if (!contractorId) {
      console.warn('[Top5ShedStaff] Missing contractor_id');
      const listEl = document.getElementById('top5-shedstaff-list');
      if (listEl) listEl.innerHTML = `<div class="lb-row"><div class="lb-rank"></div><div class="lb-bar"><div class="lb-name">Data unavailable</div></div><div class="lb-value"></div></div>`;
      return;
    }

    const listEl = rootEl.querySelector('#top5-shedstaff-list');
    const viewSel = rootEl.querySelector('#shedstaff-view');
    const yearSel = rootEl.querySelector('#shedstaff-year');
    const viewAllBtn = rootEl.querySelector('#shedstaff-viewall');
    const modal = document.getElementById('shedstaff-modal');
    const modalBodyTbody = document.querySelector('#shedstaff-full-table tbody');
    if (!listEl || !viewSel || !yearSel || !viewAllBtn || !modal || !modalBodyTbody) {
      console.warn('[Top5ShedStaff] Missing elements');
      return;
    }


    (function labelRollingWithYear(sel) {
      if (!sel) return;
      const opt = [...sel.options].find(o => o.value === '12m');
      if (!opt) return;
      const y = new Date().getFullYear();
      opt.textContent = String(y);
      function refresh() {
        const yy = new Date().getFullYear();
        const o = [...sel.options].find(v => v.value === '12m');
        if (o) o.textContent = String(yy);
      }
      const msToMidnight = (() => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1,0,0,0);
        return next - now;
      })();
      setTimeout(() => { refresh(); setInterval(refresh, 24*60*60*1000); }, msToMidnight);
    })(viewSel);

    try {
      const saved = JSON.parse(localStorage.getItem('dash_top5_shedstaff_scope') || '{}');
      if (saved.view) viewSel.value = saved.view;
      if (saved.view === 'year') { yearSel.value = saved.year || ''; yearSel.hidden = false; }
    } catch {}

    function saveScope() {
      try {
        localStorage.setItem('dash_top5_shedstaff_scope', JSON.stringify({ view: viewSel.value, year: yearSel.value }));
      } catch {}
    }

    function getDateRange(mode, year) {
      const today = new Date();
      if (mode === '12m') {
        const end = today;
        const start = new Date();
        start.setDate(start.getDate() - 365);
        return { start, end };
      }
      if (mode === 'year' && year) {
        const start = new Date(Number(year),0,1,0,0,0);
        const end = new Date(Number(year),11,31,23,59,59);
        return { start, end };
      }
      return { start: null, end: null };
    }

    function sessionDateToJS(d) {
      if (!d) return null;
      if (typeof d === 'object' && d.toDate) return d.toDate();
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split('-').map(Number);
        const dt = new Date(y, m - 1, day);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    function parseHoursToDecimal(input) {
      if (input == null) return 0;
      if (typeof input === 'number') {
        if (!isFinite(input)) return 0;
        // If someone stored minutes as a big number (e.g. 390), treat >24 as minutes
        return input > 24 ? input / 60 : input;
      }
      const s = String(input).trim().toLowerCase();
      if (!s) return 0;

      // 1) Plain number: "6", "6.5"
      if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

      // 2) H:MM -> "6:30"
      const hmColon = s.match(/^(\d+):(\d{1,2})$/);
      if (hmColon) {
        const h = parseInt(hmColon[1], 10);
        const m = parseInt(hmColon[2], 10);
        if (m >= 0 && m < 60) return h + m / 60;
      }

      // Normalise common words to h/m
      let norm = s
        .replace(/\s+/g, ' ')
        .replace(/hours?|hrs?/g, 'h')
        .replace(/minutes?|mins?|min\b/g, 'm');

      // 3) "Nh Nm" -> "6h 30m" (also works for "6 hours 30 minutes")
      const h_m = norm.match(/^(\d+)\s*h(?:\s*(\d+)\s*m)?$/); // 6h or 6h 30m
      if (h_m) {
        const h = parseInt(h_m[1], 10);
        const m = h_m[2] ? parseInt(h_m[2], 10) : 0;
        if (!Number.isNaN(h) && !Number.isNaN(m)) return h + m / 60;
      }

      // 4) Compact "NhM" -> "6h30"
      const hCompact = norm.match(/^(\d+)\s*h\s*(\d{1,2})$/); // 6h30
      if (hCompact) {
        const h = parseInt(hCompact[1], 10);
        const m = parseInt(hCompact[2], 10);
        if (m >= 0 && m < 60) return h + m / 60;
      }

      // 5) Minutes-only -> "390m", "90m", "90 min", "90 minutes"
      const mOnly = norm.match(/^(\d+)\s*m$/);
      if (mOnly) return parseInt(mOnly[1], 10) / 60;

      // 6) Hours-only with suffix -> "8h", "8 hr", "8 hrs"
      const hOnly = norm.match(/^(\d+)\s*h$/);
      if (hOnly) return parseInt(hOnly[1], 10);

      // If nothing matched, treat as 0
      return 0;
    }


    function sessionDateString(s) {
      const dt = sessionDateToJS(s.date || s.sessionDate || s.createdAt || s.timestamp || s.savedAt);
      return dt ? dt.toISOString().slice(0,10) : null;
    }

    function* iterateStaffFromSession(sessionDoc) {
      const s = sessionDoc.data ? sessionDoc.data() : sessionDoc;
      const date = sessionDateString(s);
      let arr = [];
      if (Array.isArray(s.shedStaff)) arr = s.shedStaff;
      else if (Array.isArray(s.shedstaff)) arr = s.shedstaff;
      else if (Array.isArray(s.staff)) arr = s.staff;
      else if (Array.isArray(s.staffHours)) arr = s.staffHours;
      else if (Array.isArray(s.staffhours)) arr = s.staffhours;
      else if (s.staffHours && typeof s.staffHours === 'object') {
        for (const [name, hrs] of Object.entries(s.staffHours)) {
          arr.push({ name, hoursWorked: hrs });
        }
      }
      for (const entry of arr) {
        if (!entry) continue;
        const name = normalizeName(entry.name || entry.staffName || entry.displayName || entry.id || entry[0]);
        const hours = parseHoursToDecimal(entry.hoursWorked ?? entry.hours ?? entry.total ?? entry.time ?? entry[1]);
        if (!name || !hours) continue;
        yield { name, hours, date };
      }
    }

    function aggregateStaff(sessions, mode, year) {
      const { start, end } = getDateRange(mode, year);
      const totals = new Map();
      const days = new Map();
      for (const doc of sessions) {
        for (const st of iterateStaffFromSession(doc)) {
          if (mode !== 'all') {
            if (!st.date) continue;
            const dt = new Date(st.date);
            if (start && dt < start) continue;
            if (end && dt > end) continue;
          }
          const prev = totals.get(st.name) || 0;
          totals.set(st.name, prev + st.hours);
          if (!days.has(st.name)) days.set(st.name, new Set());
          if (st.date && st.hours > 0) days.get(st.name).add(st.date);
        }
      }
      return Array.from(totals.entries())
        .map(([name, total]) => ({ name, total, days: days.get(name)?.size || 0 }))
        .sort((a,b) => b.total - a.total);
    }

    function renderFullShedStaff(rows, tableBody) {
      tableBody.innerHTML = rows.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td data-sort="${r.total}">${formatDecimalHoursToHM(r.total)}</td>
        <td>${r.days}</td>
      </tr>
    `).join('');
    }

    function deriveYearsFromSessions(sessions) {
      const years = new Set();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const dt = sessionDateToJS(s.date || s.sessionDate || s.createdAt || s.timestamp || s.savedAt);
        if (dt) years.add(dt.getFullYear());
      }
      const arr = Array.from(years).sort((a,b) => b - a);
      const current = (new Date()).getFullYear();
      if (!arr.includes(current)) arr.unshift(current);
      return arr;
    }

    let modalKeyHandler = null;
    let lastFocused = null;
    function trapFocus(e) {
      if (e.key === 'Escape') { closeModal('shedstaff-modal'); return; }
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function openModal(id) {
      const m = document.getElementById(id); if (!m) return; lastFocused = document.activeElement; m.setAttribute('aria-hidden','false'); modalKeyHandler = trapFocus; m.addEventListener('keydown', modalKeyHandler); const focusable = m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'); if (focusable.length) focusable[0].focus();
    }
    function closeModal(id) {
      const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden','true'); if (modalKeyHandler) { m.removeEventListener('keydown', modalKeyHandler); modalKeyHandler = null; } if (lastFocused) lastFocused.focus();
    }

      let cachedSessions = SessionStore.getAll();
      let cachedSig = (dashCacheRendered.shedstaff && dashCache.top5ShedStaff)
        ? dashCache.top5ShedStaff.map(r => `${r.name}:${Math.round(r.total * 60)}`).join('|')
        : '';
      let renderPending = false;

      function updateYearOptions() {
        const years = deriveYearsFromSessions(cachedSessions);
        yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (viewSel.value !== 'year') yearSel.hidden = true;
        if (!yearSel.value) SessionStore.ensureYearFilter();
      }

      SessionStore.onChange(sessions => {
        cachedSessions = sessions;
        updateYearOptions();
        scheduleRender();
      });

      updateYearOptions();
      scheduleRender();

    function renderFromCache() {
      if (!cachedSessions.length) {
        if (!(dashCache.top5ShedStaff && dashCache.top5ShedStaff.length)) {
          renderEmptyLeaderboard(listEl, modalBodyTbody, 'No sessions yet');
        }
        cachedSig = '';
        return;
      }
      const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
      const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
        const rows = aggregateStaff(cachedSessions, mode, year);
        const sig = rows
          .map(r => `${r.name}:${Math.round(r.total * 60)}`)
          .join('|');
        if (sig === cachedSig) return;
        cachedSig = sig;
        renderTop5ShedStaff(rows, listEl);
        renderFullShedStaff(rows, modalBodyTbody);
        // Save top rows for next load
        const top5Cache = rows.slice(0,5).map(r => ({ name: r.name, total: r.total }));
        if (shouldRerender(dashCache.top5ShedStaff, top5Cache)) {
          dashCache.top5ShedStaff = top5Cache;
          saveDashCache();
        }
      }

    function scheduleRender() {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        renderFromCache();
      });
    }

      viewSel.addEventListener('change', () => {
        const v = viewSel.value;
        if (v === 'all') {
          yearSel.hidden = true;
          SessionStore.loadAllTimeOnce();
        } else if (v === '12m') {
          yearSel.hidden = true;
        }
        saveScope();
        scheduleRender();
      });
    yearSel.addEventListener('change', () => { saveScope(); scheduleRender(); });
    yearSel.addEventListener('focus', () => {
      if (viewSel.value !== 'year') {
        if (![...viewSel.options].some(o => o.value === 'year')) {
          const opt = document.createElement('option');
          opt.value = 'year';
          opt.textContent = 'Specific Year';
          viewSel.appendChild(opt);
        }
        viewSel.value = 'year';
        yearSel.hidden = false;
        saveScope();
      }
    });

    viewAllBtn.addEventListener('click', () => { openModal('shedstaff-modal'); });
    modal.addEventListener('click', e => { if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) closeModal('shedstaff-modal'); });

    // Ensure a redraw with the improved parser:
    if (typeof scheduleRender === 'function') scheduleRender();

      // session data handled via SessionStore
      })();
  }

function initTop5FarmsWidget() {
  (function () {
    const flag = localStorage.getItem('dash_top5_farms_enabled');
    const rootEl = document.getElementById('top5-farms');
    if (flag === 'false' || !rootEl) {
      if (rootEl) rootEl.remove();
      return;
    }

    let contractorId = localStorage.getItem('contractor_id');
    if (!contractorId && firebase?.auth?.currentUser?.uid) {
      contractorId = firebase.auth().currentUser.uid;
      try { localStorage.setItem('contractor_id', contractorId); } catch {}
      console.debug('[Top5Farms] contractor_id recovered from auth');
    }
    if (!contractorId) {
      console.warn('[Top5Farms] Missing contractor_id');
      const listEl = document.getElementById('top5-farms-list');
      if (listEl) listEl.innerHTML = `<div class="lb-row"><div class="lb-rank"></div><div class="lb-bar"><div class="lb-name">Data unavailable</div></div><div class="lb-value"></div></div>`;
      return;
    }

    const listEl = rootEl.querySelector('#top5-farms-list');
    const viewSel = rootEl.querySelector('#farms-view');
    const yearSel = rootEl.querySelector('#farms-year');
    const viewAllBtn = rootEl.querySelector('#farms-viewall');
    const tabs = rootEl.querySelector('#farms-worktype-tabs');
    const modal = document.getElementById('farms-full-modal');
    const modalBodyTbody = document.querySelector('#farms-full-table tbody');
    if (!listEl || !viewSel || !yearSel || !viewAllBtn || !tabs || !modal || !modalBodyTbody) {
      console.warn('[Top5Farms] Missing elements');
      return;
    }


    (function labelRollingWithYear(sel) {
      if (!sel) return;
      const opt = [...sel.options].find(o => o.value === '12m');
      if (!opt) return;
      const y = new Date().getFullYear();
      opt.textContent = String(y);
      function refresh() {
        const yy = new Date().getFullYear();
        const o = [...sel.options].find(v => v.value === '12m');
        if (o) o.textContent = String(yy);
      }
      const msToMidnight = (() => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1,0,0,0);
        return next - now;
      })();
      setTimeout(() => { refresh(); setInterval(refresh, 24*60*60*1000); }, msToMidnight);
    })(viewSel);

    try {
      const saved = JSON.parse(localStorage.getItem('dash_top5_farms_scope') || '{}');
      if (saved.view) viewSel.value = saved.view;
      if (saved.view === 'year') { yearSel.value = saved.year || ''; yearSel.hidden = false; }
    } catch {}

    function saveScope() {
      try {
        localStorage.setItem('dash_top5_farms_scope', JSON.stringify({ view: viewSel.value, year: yearSel.value }));
      } catch {}
    }

    function isCrutchedType(sheepType) {
      if (!sheepType) return false;
      const s = String(sheepType).toLowerCase();
      return s.includes('crutch');
    }

    function getDateRange(mode, year) {
      const today = new Date();
      if (mode === '12m') {
        const end = today;
        const start = new Date();
        start.setDate(start.getDate() - 365);
        return { start, end };
      }
      if (mode === 'year' && year) {
        const start = new Date(Number(year),0,1,0,0,0);
        const end = new Date(Number(year),11,31,23,59,59);
        return { start, end };
      }
      return { start: null, end: null };
    }

    function sessionDateToJS(d) {
      if (!d) return null;
      if (typeof d === 'object' && d.toDate) return d.toDate();
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split('-').map(Number);
        const dt = new Date(y, m - 1, day);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    // Map stand index → name from session.stands[], normalizing 1-based indices
    function buildStandIndexNameMap(sessionData) {
      const map = {};
      const arr = Array.isArray(sessionData.stands) ? sessionData.stands : [];

      // Detect if indices look 1-based (no 0 but there is a 1)
      const rawIdx = arr.map((st, i) => (st && st.index != null ? Number(st.index) : i));
      const has0 = rawIdx.includes(0);
      const has1 = rawIdx.includes(1);
      const looksOneBased = !has0 && has1; // e.g., [1,2,3...]

      arr.forEach((st, pos) => {
        // numeric index or fallback to position
        let i = (st && st.index != null) ? Number(st.index) : pos;
        if (!Number.isFinite(i)) i = pos;
        if (looksOneBased) i = i - 1;   // normalize 1-based → 0-based
        if (i < 0) i = 0;

        // resolve name; treat placeholders as missing
        let name = '';
        if (st) name = String(st.name || st.shearerName || st.id || '').trim();
        if (!name || /^stand\s+\d+$/i.test(name)) name = null;

        map[i] = name; // may be null; iterator will handle as unassigned if needed
      });

      return map;
    }

    // Extract tallies (shearerName, count, sheepType, date) from a session doc
    function* iterateTalliesFromSession(sessionDoc) {
      const s = sessionDoc.data ? sessionDoc.data() : sessionDoc; // QueryDocumentSnapshot or plain object
      const sessionDate = sessionDateToJS(s.date || s.sessionDate || s.createdAt || s.timestamp || s.savedAt);

      // Preferred path: shearerCounts[].stands[] + session.stands name map
      if (Array.isArray(s.shearerCounts)) {
        const nameByIndex = buildStandIndexNameMap(s);

        for (const row of s.shearerCounts) {
          const sheepType = row?.sheepType || '';
          const perStand = Array.isArray(row?.stands) && row.stands.length
            ? row.stands
            : (Array.isArray(row?.counts) ? row.counts : []);
          for (let i = 0; i < perStand.length; i++) {
            const raw = perStand[i];
            // raw may be string like "89" or number
            const num = Number(raw);
            if (!isFinite(num) || num <= 0) continue;

            const shearerName = nameByIndex[i] || `Stand ${i + 1}`;
            yield {
              shearerName,
              count: num,
              sheepType,
              date: sessionDate
            };
          }

          // Optional fallback: if there were no per-stand entries but row.total exists,
          // we could attribute it to an "Unknown" shearer. For now, skip to preserve per-shearer accuracy.
          // const totalNum = Number(row?.total);
          // if ((!perStand.length || perStand.every(v => !Number(v))) && isFinite(totalNum) && totalNum > 0) { ... }
        }
        return;
      }

      // Existing generic fallbacks (keep in case of future shapes)
      if (Array.isArray(s.tallies)) {
        for (const t of s.tallies) {
          yield {
            shearerName: t.shearerName || t.shearer || t.name,
            count: Number(t.count || t.tally || 0),
            sheepType: t.sheepType || t.type,
            date: sessionDate
          };
        }
        return;
      }

      if (Array.isArray(s.shearers)) {
        for (const sh of s.shearers) {
          const shearerName = normalizeName(sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id) || 'Unknown';
          const runs = sh.runs || sh.tallies || sh.entries || [];
          for (const r of (runs || [])) {
            yield {
              shearerName,
              count: Number(r.count || r.tally || 0),
              sheepType: r.sheepType || r.type,
              date: sessionDate
            };
          }
          if (typeof sh.total === 'number') {
            yield {
              shearerName,
              count: Number(sh.total),
              sheepType: sh.sheepType || null,
              date: sessionDate
            };
          }
        }
        return;
      }

      if (s.shearerTallies && typeof s.shearerTallies === 'object') {
        for (const [shearerName, entries] of Object.entries(s.shearerTallies)) {
          for (const e of (entries || [])) {
            yield {
              shearerName,
              count: Number(e.count || e.tally || 0),
              sheepType: e.sheepType || e.type,
              date: sessionDate
            };
          }
        }
      }
    }

    function aggregateFarms(sessions, mode, year, workType) {
      const { start, end } = getDateRange(mode, year);
      const wantCrutched = (workType === 'crutched');
      const totals = new Map();
      const visits = new Map();
      const lastDate = new Map();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const farm = pickFarmName(s);
        if (!farm || farm === 'Unknown') continue;
        const date = getSessionDateYMD(s);
        if (mode !== 'all') {
          const dt = sessionDateToJS(date);
          if (!dt) continue;
          if (start && dt < start) continue;
          if (end && dt > end) continue;
        }
        let sessionTotal = 0;
        for (const t of iterateTalliesFromSession(doc)) {
          const isCrutch = isCrutchedType(t.sheepType);
          if (wantCrutched && !isCrutch) continue;
          if (!wantCrutched && isCrutch) continue;
          sessionTotal += t.count || 0;
        }
        if (!sessionTotal) continue;
        totals.set(farm, (totals.get(farm) || 0) + sessionTotal);
        if (!visits.has(farm)) visits.set(farm, new Set());
        if (date) visits.get(farm).add(date);
        if (date) {
          const prev = lastDate.get(farm);
          if (!prev || date > prev) lastDate.set(farm, date);
        }
      }
      return Array.from(totals.entries())
        .map(([name, sheep]) => {
          const v = visits.get(name)?.size || 0;
          return { name, sheep, visits: v, avg: v ? sheep / v : 0, last: lastDate.get(name) || '' };
        })
        .sort((a, b) => b.sheep - a.sheep);
    }

    function renderFullFarms(rows, tableBody) {
      tableBody.innerHTML = rows.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td data-sort="${r.sheep}">${formatInt(r.sheep)}</td>
        <td>${r.visits}</td>
        <td>${r.visits ? formatInt(Math.round(r.avg)) : '0'}</td>
        <td>${r.last}</td>
      </tr>
    `).join('');
    }

    function deriveYearsFromSessions(sessions) {
      const years = new Set();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const ymd = getSessionDateYMD(s);
        if (ymd) years.add(Number(ymd.slice(0,4)));
      }
      const arr = Array.from(years).sort((a,b) => b - a);
      const current = (new Date()).getFullYear();
      if (!arr.includes(current)) arr.unshift(current);
      return arr;
    }

    let modalKeyHandler = null;
    let lastFocused = null;
    function trapFocus(e) {
      const m = modal;
      if (!m || e.key !== 'Tab') return;
      const focusable = m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function openModal(id) {
      const m = document.getElementById(id); if (!m) return;
      lastFocused = document.activeElement;
      m.setAttribute('aria-hidden','false');
      modalKeyHandler = trapFocus;
      m.addEventListener('keydown', modalKeyHandler);
      const focusable = m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (focusable.length) focusable[0].focus();
    }

    function closeModal(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.setAttribute('aria-hidden','true');
      if (modalKeyHandler) { m.removeEventListener('keydown', modalKeyHandler); modalKeyHandler = null; }
      if (lastFocused) lastFocused.focus();
    }

      let cachedSessions = SessionStore.getAll();
      let cachedRows = (dashCacheRendered.farms && dashCache.top5Farms) ? dashCache.top5Farms.slice() : [];
      let renderPending = false;

      SessionStore.onChange(() => {
        cachedSessions = SessionStore.getAll();
        const years = deriveYearsFromSessions(cachedSessions);
        yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (viewSel.value !== 'year') yearSel.hidden = true;
        if (!yearSel.value) SessionStore.ensureYearFilter();
        scheduleRender();
      });

      const years = deriveYearsFromSessions(cachedSessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;
      if (!yearSel.value) SessionStore.ensureYearFilter();

    function renderFromCache() {
      if (!cachedSessions.length) {
        if (!(dashCache.top5Farms && dashCache.top5Farms.length)) {
          renderEmptyLeaderboard(listEl, modalBodyTbody, 'No sessions yet');
        }
        return;
      }
      const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
      const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
      const workType = tabs.querySelector('.siq-segmented__btn.is-active')?.dataset.worktype || 'shorn';
      const rows = aggregateFarms(cachedSessions, mode, year, workType);

      if (!rows.length) {
        renderEmptyLeaderboard(listEl, modalBodyTbody, 'No farm data');
        cachedRows = [];
        dashCache.top5Farms = [];
        saveDashCache();
        return;
      }

      if (!shouldRerender(cachedRows, rows)) return;
      cachedRows = rows;
      renderTop5Farms(rows, listEl);
      renderFullFarms(rows, modalBodyTbody);
      // Save top farms for fast future paint
      const top5Cache = rows.slice(0,5).map(r => ({ name: r.name, sheep: r.sheep }));
      if (shouldRerender(dashCache.top5Farms, top5Cache)) {
        dashCache.top5Farms = top5Cache;
        saveDashCache();
      }
    }

    function scheduleRender() {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => { renderPending = false; renderFromCache(); });
    }
    // Kick off an initial render so cached sessions populate the view
    scheduleRender();

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.siq-segmented__btn');
      if (!btn) return;
      tabs.querySelectorAll('.siq-segmented__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      scheduleRender();
    });

    viewSel.addEventListener('change', () => {
        const v = viewSel.value;
        if (v === 'all') {
          yearSel.hidden = true;
          SessionStore.loadAllTimeOnce();
        } else if (v === '12m') {
          yearSel.hidden = true;
        }
        saveScope();
        scheduleRender();
      });

    yearSel.addEventListener('change', () => { saveScope(); scheduleRender(); });

    yearSel.addEventListener('focus', () => {
      if (viewSel.value !== 'year') {
        if (![...viewSel.options].some(o => o.value === 'year')) {
          const opt = document.createElement('option');
          opt.value = 'year';
          opt.textContent = 'Specific Year';
          viewSel.appendChild(opt);
        }
        viewSel.value = 'year';
        yearSel.hidden = false;
      }
    });

    viewAllBtn.addEventListener('click', () => { openModal('farms-full-modal'); });
    modal.addEventListener('click', e => { if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) closeModal('farms-full-modal'); });

      // session data handled via SessionStore
    })();
  }

let dashboardInitRan = false;
document.addEventListener('DOMContentLoaded', () => {
  if (dashboardInitRan) return; // avoid duplicate init if script executed twice
  dashboardInitRan = true;
  SessionStore.ensureYearFilter();

  const overlay = document.getElementById('loading-overlay');

  // ---- OFFLINE GUARD: do not re-show overlay or start auth when offline
  const _isReallyOffline = isReallyOffline();

  if (_isReallyOffline) {
    // Hide/remove any blocking overlay so taps work
    if (typeof removeOverlayGate === 'function') {
      try { removeOverlayGate(); } catch(_) {}
    }
    if (overlay) {
      overlay.style.display = 'none';
      overlay.style.pointerEvents = 'none';
      overlay.classList && overlay.classList.remove('boot-hiding');
    }
    // Skip the late auth boot entirely when offline
    return;
  }
  // ---- END OFFLINE GUARD

  // Online path (unchanged)
  if (overlay) overlay.style.display = 'flex';
  if (!(window.firebase && typeof firebase.auth === 'function')) {
    showOfflineNotice && showOfflineNotice();
    if (overlay) overlay.style.display = 'none';
    return;
  }

  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      window.location.replace('login.html');
      if (overlay) overlay.style.display = 'none';
      return;
    }

    try {
      const docRef = firebase.firestore().collection('contractors').doc(user.uid);
      const snap = await docRef.get();
      if (!snap.exists) {
        window.location.replace('login.html');
        return;
      }
      // Persist contractor scope for dashboard widgets
      try {
        localStorage.setItem('contractor_id', user.uid);
        console.debug('[Dashboard] contractor_id set to', user.uid);
      } catch (e) {
        console.warn('[Dashboard] Could not set contractor_id:', e);
      }

      const data = snap.data() || {};
      const name = data.name;
      const subheading = document.getElementById('dashboard-subheading');
      if (subheading) {
        subheading.textContent = name
          ? `Welcome back, ${name}`
          : 'Welcome back, Contractor';
      }

      const pageContent = document.getElementById('page-content');
      if (pageContent) pageContent.style.display = 'block';

      const btnManageStaff = document.getElementById('btnManageStaff');
      if (btnManageStaff) {
        btnManageStaff.addEventListener('click', () => {
          window.location.href = 'manage-staff.html';
        });
      }

      const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
      if (btnViewSavedSessions) {
        btnViewSavedSessions.addEventListener('click', () => {
          const role = localStorage.getItem('user_role');
          const canLoad = localStorage.getItem('staff_can_load_sessions') !== 'false';
          if (role === 'staff' && !canLoad) {
            alert('You do not have permission to view saved sessions.');
            return;
          }
          window.location.href = 'view-sessions.html';
        });
      }

      const btnIncidentReports = document.getElementById('btnIncidentReports');
      if (btnIncidentReports) {
        btnIncidentReports.addEventListener('click', () => {
          window.location.href = 'incident-reports.html';
        });
      }

      const farmSummaryBtn = document.getElementById('farm-summary-btn');
      if (farmSummaryBtn) {
        farmSummaryBtn.addEventListener('click', () => {
          sessionStorage.setItem('launch_override', 'tally');
          window.location.href = 'tally.html?view=farm';
        });
      }

      const btnReturnToActive = document.getElementById('btnReturnToActive');
      const activeSession = localStorage.getItem('active_session');

      // Only reveal the "Return to Active Session" button when an active session exists.
      // Automatic redirection to tally.html has been removed so contractors choose
      // when to resume a session.
      if (btnReturnToActive && activeSession) {
        btnReturnToActive.style.display = 'block';
        btnReturnToActive.addEventListener('click', () => {
          sessionStorage.setItem('launch_override', 'tally');
          try { localStorage.setItem('viewOnlyMode', 'false'); } catch (e) {}
          window.location.href = 'tally.html?loadedSession=true';
        });
      }

      const btnStartNewDay = document.getElementById('btnStartNewDay');
      if (btnStartNewDay && !isReallyOffline()) {
        btnStartNewDay.addEventListener('click', () => {
          sessionStorage.setItem('launch_override', 'tally');
          window.location.href = '/tally.html?newDay=true';
        });
      }

      const btnChangePin = document.getElementById('btnChangePin');
        if (btnChangePin) {
          btnChangePin.addEventListener('click', () => {
            window.location.href = 'change-pin.html';
          });
        }

      const btnChangePassword = document.getElementById('btnChangePassword');
        if (btnChangePassword) {
          btnChangePassword.addEventListener('click', () => {
            window.location.href = 'change-password.html';
          });
        }

      const btnSettings = document.getElementById('btnSettings');
      const settingsModal = document.getElementById('settings-modal');
      function closeSettingsModal(){
        if (!settingsModal) return;
        settingsModal.setAttribute('aria-hidden','true');
        btnSettings?.focus();
      }
      function openSettingsModal(){
        if (!settingsModal || document.body.classList.contains('offline-mode')) return;
        settingsModal.setAttribute('aria-hidden','false');
        const first = settingsModal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        first && first.focus();
      }
      btnSettings?.addEventListener('click', openSettingsModal);
      settingsModal?.addEventListener('click', e => {
        if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) closeSettingsModal();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && settingsModal?.getAttribute('aria-hidden') === 'false') closeSettingsModal();
      });
      window.addEventListener('offline', closeSettingsModal);

        if (!isReallyOffline()) {
          SessionStore.start(user.uid, { monthsLive: 12 });
          if (!localStorage.getItem('savedAtBackfilled') && typeof backfillSavedAtForSessions === 'function') {
            backfillSavedAtForSessions().finally(() => {
              try { localStorage.setItem('savedAtBackfilled', 'true'); } catch {}
            });
          }
        }
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            SessionStore.stop();
          } else if (!isReallyOffline()) {
            SessionStore.start(user.uid, { monthsLive: 12 });
          }
        });
        window.addEventListener('beforeunload', () => { SessionStore.stop(); });

        // After setting contractor_id and after showing the page content:
      if (isReallyOffline()) {
        try { window.renderCachedTop5Widgets && window.renderCachedTop5Widgets(); } catch(_){ }
        console.info('[Dashboard] Skipping live widget init offline.');
      } else {
        if (typeof initTop5ShearersWidget === 'function') {
          try { initTop5ShearersWidget(); } catch (e) { console.error('[Dashboard] initTop5ShearersWidget failed:', e); }
        }
        if (typeof initTop5ShedStaffWidget === 'function') {
          try { initTop5ShedStaffWidget(); } catch (e) { console.error('[Dashboard] initTop5ShedStaffWidget failed:', e); }
        }
        if (typeof initTop5FarmsWidget === 'function') {
          try { initTop5FarmsWidget(); } catch (e) { console.error('[Dashboard] initTop5FarmsWidget failed:', e); }
        }
      }
    } catch (err) {
      console.error('Failed to fetch contractor profile', err);
      showOfflineNotice();
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  }, err => {
    console.error('Auth state failed', err);
    showOfflineNotice();
    if (overlay) overlay.style.display = 'none';
  });
});

// === Dashboard: Welcome + Help Menu + Simple Tour ===
(function initDashboardWelcomeAndHelp(){
  // Default flags
  if (localStorage.getItem('dashboard_welcome_enabled') == null) {
    localStorage.setItem('dashboard_welcome_enabled','true');
  }
  if (localStorage.getItem('dashboard_tour_enabled') == null) {
    localStorage.setItem('dashboard_tour_enabled','true');
  }

  const overlay = document.getElementById('dashboard-welcome-overlay');
  const modal   = document.getElementById('dashboard-welcome-modal');
  const btnOK   = document.getElementById('dw-ok');
  const btnHelp = document.getElementById('dw-help');
  const btnX    = document.getElementById('dw-close');
  const cbDont  = document.getElementById('dw-dont-show');

  const helpBtn     = document.getElementById('help-btn');
  const helpMenu    = document.getElementById('dash-help-menu');
  const helpClose   = document.getElementById('dhm-close');
  const toggleWelcome = document.getElementById('toggle-welcome');
  const toggleTour    = document.getElementById('toggle-tour');
  const btnStartTour  = document.getElementById('btnStartTour');
  const btnSkipTour   = document.getElementById('btnSkipTour');

  // Graceful bail-out if HTML not present
  if (!helpBtn || !helpMenu) return;

  // === HELP MENU OPEN/CLOSE ===
  function openHelpMenu() {
    helpMenu.hidden = false;
    helpBtn.setAttribute('aria-expanded','true');
  }
  function closeHelpMenu() {
    helpMenu.hidden = true;
    helpBtn.setAttribute('aria-expanded','false');
  }
  window.openHelpMenu = openHelpMenu; // allow other buttons to open it

  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (helpMenu.hidden) openHelpMenu(); else closeHelpMenu();
  });
  helpClose?.addEventListener('click', closeHelpMenu);
  document.addEventListener('click', (e) => {
    if (!helpMenu.hidden && !helpMenu.contains(e.target) && e.target !== helpBtn) {
      closeHelpMenu();
    }
  });
  window.addEventListener('resize', () => { if (!helpMenu.hidden) closeHelpMenu(); });

  // Reflect flags in help menu
  function syncHelpMenuChecks() {
    const welcomeEnabled = localStorage.getItem('dashboard_welcome_enabled') !== 'false';
    const tourEnabled    = localStorage.getItem('dashboard_tour_enabled') !== 'false';
    if (toggleWelcome) toggleWelcome.checked = welcomeEnabled;
    if (toggleTour)    toggleTour.checked    = tourEnabled;
  }
  syncHelpMenuChecks();

  toggleWelcome?.addEventListener('change', () => {
    localStorage.setItem('dashboard_welcome_enabled', toggleWelcome.checked ? 'true' : 'false');
  });
  toggleTour?.addEventListener('change', () => {
    localStorage.setItem('dashboard_tour_enabled', toggleTour.checked ? 'true' : 'false');
  });

  // === WELCOME MODAL OPEN/CLOSE & ACCESSIBILITY ===
  const focusableSel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  function trapFocus(e){
    if (e.key === 'Escape') { closeWelcome(); return; }
    if (e.key !== 'Tab') return;
    const nodes = modal.querySelectorAll(focusableSel);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openWelcome() {
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden','false');
    lastFocused = document.activeElement;
    document.addEventListener('keydown', trapFocus);
    setTimeout(() => (btnOK?.focus()), 0);
  }

  function closeWelcome() {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden','true');
    document.removeEventListener('keydown', trapFocus);
    if (cbDont?.checked) localStorage.setItem('dashboard_welcome_done','true');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  window.closeWelcome = closeWelcome; // expose for external use

  btnOK?.addEventListener('click', closeWelcome);
  btnX?.addEventListener('click', closeWelcome);
  btnHelp?.addEventListener('click', () => openHelpMenu());
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) { /* require explicit close */ } });

  // Show only on first login (and when enabled)
  function shouldShowWelcome() {
    const enabled = localStorage.getItem('dashboard_welcome_enabled') !== 'false';
    const done    = localStorage.getItem('dashboard_welcome_done') === 'true';
    return enabled && !done;
  }

  // === SIMPLE DASHBOARD TOUR ===
  // Minimal, self-contained tour with overlay + tooltip.
  let tourIndex = 0;
  let tourCurrent = null;
  const tourOverlay = document.createElement('div');
  tourOverlay.className = 'siq-tour-overlay';
  document.body.appendChild(tourOverlay);

  const tourTip = document.createElement('div');
  tourTip.className = 'siq-tour-tooltip';
  tourTip.innerHTML = `
    <div class="siq-tour-text"></div>
    <div class="siq-tour-ctrls">
      <button class="siq-tour-btn" data-act="prev">Back</button>
      <button class="siq-tour-btn" data-act="next">Next</button>
      <button class="siq-tour-btn primary" data-act="finish">Finish</button>
    </div>
  `;
  document.body.appendChild(tourTip);
  tourTip.style.display = 'none';

  const steps = [
    { sel: '#kpiBar', text: 'Key Metrics — view KPI pills for sheep count, rate, hours, and days worked. Tap any pill for details. Double-tap the sheep count pill to switch between Shorn and Crutched totals.' },
    { sel: '#kpiCalendar', text: 'Calendar — view past sessions on a calendar.' },
    { sel: '#top5-shearers', text: 'Top 5 Shearers — tap “View Full List” to see rankings.' },
    { sel: '#top5-shedstaff', text: 'Top 5 Shed Staff — track hours worked; open “View Full List”.' },
    { sel: '#top5-farms', text: 'Top 5 Farms — view leading farms; open “View All”.' },
    { sel: '#btnManageStaff', text: 'Manage Staff — add/remove users and see online status.' },
    { sel: '#btnViewSavedSessions', text: 'Saved Sessions — reopen previous tally days.' },
    { sel: '#btnIncidentReports', text: 'Incident Reports — review all recorded incidents.' },
    { sel: '#btnReturnToActive', text: 'Return to Active Session — jump back into an unfinished tally (shown only when a session exists).', optional: true },
    { sel: '#btnStartNewDay', text: 'Start New Day — begin today’s tally.' },
    { sel: '#farm-summary-btn', text: 'Farm Summary — compare farm totals and visits.' },
    { sel: '#btnChangePin', text: 'Change Contractor PIN — secure control for edits.' },
    { sel: '#btnSettings', text: 'Settings / Preferences — adjust preferences and change your password.' },
    { sel: '#logoutBtn', text: 'Logout — safely sign out.' }
  ];

  function getStepTargets() {
    // Filter out optional steps if element is hidden/absent
    return steps.filter(s => {
      const el = document.querySelector(s.sel);
      if (!el) return !s.optional ? false : false;
      if (s.sel === '#btnReturnToActive' && el.style.display === 'none') return false;
      return true;
    });
  }

  function positionTipNear(el) {
    const rect = el.getBoundingClientRect();
    const tipRect = tourTip.getBoundingClientRect();
    // Default position: above and centered; if not enough space, go below
    let top = rect.top - tipRect.height - 10;
    let left = rect.left + (rect.width - tipRect.width)/2;
    if (top < 10) top = rect.bottom + 10;
    left = Math.max(10, Math.min(left, window.innerWidth - tipRect.width - 10));
    tourTip.style.top = `${Math.round(top + window.scrollY)}px`;
    tourTip.style.left = `${Math.round(left + window.scrollX)}px`;
  }

  function showTourStep(i) {
    const targets = getStepTargets();
    if (!targets.length) return finishTour();
    tourIndex = Math.max(0, Math.min(i, targets.length - 1));
    const step = targets[tourIndex];
    const el = document.querySelector(step.sel);
    if (!el) return finishTour();

    if (tourCurrent) {
      tourCurrent.classList.remove('tt-highlight');
    }
    tourCurrent = el;
    tourCurrent.classList.add('tt-highlight');

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tourOverlay.classList.add('active');
    tourTip.style.display = 'block';
    tourTip.querySelector('.siq-tour-text').textContent = step.text;

    // After layout, position
    requestAnimationFrame(() => positionTipNear(el));
  }

  function finishTour() {
    tourOverlay.classList.remove('active');
    tourTip.style.display = 'none';
    if (tourCurrent) {
      tourCurrent.classList.remove('tt-highlight');
      tourCurrent = null;
    }
    localStorage.setItem('dashboard_welcome_done','true');
  }

  tourTip.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'prev') showTourStep(tourIndex - 1);
    else if (act === 'next') showTourStep(tourIndex + 1);
    else finishTour();
  });

  function startDashboardTour() {
    const enabled = localStorage.getItem('dashboard_tour_enabled') !== 'false';
    if (!enabled) return;
    showTourStep(0);
  }
  window.startDashboardTour = startDashboardTour; // optional external call

  // Wire Help menu actions
  btnStartTour?.addEventListener('click', () => {
    closeHelpMenu();
    startDashboardTour();
  });
  btnSkipTour?.addEventListener('click', () => {
    localStorage.setItem('dashboard_welcome_done','true');
    closeHelpMenu();
    alert('Tour skipped. You can run it later from the Help menu.');
  });

  // Auto-show welcome on first visit (but don't block auth-driven layout)
  function maybeOpenWelcome() {
    if (!overlay || !modal) return;
    if (!shouldShowWelcome()) return;
    openWelcome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Sync menu checks and conditionally show welcome
      syncHelpMenuChecks();
      maybeOpenWelcome();
    });
  } else {
    syncHelpMenuChecks();
    maybeOpenWelcome();
  }
})();

// === Dashboard prefs sync for Welcome & Tour ===
(function dashboardPrefsSync(){
  // Keys
  const K_WELCOME_ENABLED = 'dashboard_welcome_enabled';
  const K_WELCOME_DONE    = 'dashboard_welcome_done';
  const K_TOUR_ENABLED    = 'dashboard_tour_enabled';
  const K_STAFF_CAN_LOAD  = 'staff_can_load_sessions';
  const LEGACY_STAFF_KEY  = 'dashboard_staff_can_load';

  // Ensure defaults
  const legacyVal = localStorage.getItem(LEGACY_STAFF_KEY);
  if (localStorage.getItem(K_STAFF_CAN_LOAD) == null && legacyVal != null) {
    localStorage.setItem(K_STAFF_CAN_LOAD, legacyVal);
  }
  if (localStorage.getItem(K_WELCOME_ENABLED) == null) localStorage.setItem(K_WELCOME_ENABLED, 'true');
  if (localStorage.getItem(K_TOUR_ENABLED)    == null) localStorage.setItem(K_TOUR_ENABLED, 'true');
  if (localStorage.getItem(K_STAFF_CAN_LOAD)  == null) localStorage.setItem(K_STAFF_CAN_LOAD, 'true');

  // Modal elements
  const overlay   = document.getElementById('dashboard-welcome-overlay');
  const modal     = document.getElementById('dashboard-welcome-modal');
  const cbDont    = document.getElementById('dw-dont-show');
  const cbWelM    = document.getElementById('dw-enable-welcome');
  const cbTourM   = document.getElementById('dw-enable-tour');
  const btnSaveM  = document.getElementById('dw-save');
  const btnStartM = document.getElementById('dw-start');

  // Settings modal elements
  const cbWelS    = document.getElementById('settings-enable-welcome');
  const cbTourS   = document.getElementById('settings-enable-tour');
  const cbStaffLoadS = document.getElementById('settings-allow-staff-load');
  const btnClearLocal = document.getElementById('btnClearLocalData');

  // Help menu elements
  const helpMenu  = document.getElementById('dash-help-menu');
  const cbWelH    = document.getElementById('toggle-welcome');
  const cbTourH   = document.getElementById('toggle-tour');
  const btnSaveH  = document.getElementById('btnSaveHelp');

  // Exposed helpers from earlier code (if present)
  const openHelpMenu = window.openHelpMenu || (()=>{});
  const startDashboardTour = window.startDashboardTour || (()=>{});

  // --- Model ---
  function getPrefs(){
    return {
      welcomeEnabled: localStorage.getItem(K_WELCOME_ENABLED) !== 'false',
      welcomeDone:    localStorage.getItem(K_WELCOME_DONE) === 'true',
      tourEnabled:    localStorage.getItem(K_TOUR_ENABLED) !== 'false',
      staffCanLoadSessions: localStorage.getItem(K_STAFF_CAN_LOAD) !== 'false'
    };
  }
  function setPrefs(next){
    if (typeof next.welcomeEnabled === 'boolean') {
      localStorage.setItem(K_WELCOME_ENABLED, next.welcomeEnabled ? 'true' : 'false');
    }
    if (typeof next.tourEnabled === 'boolean') {
      localStorage.setItem(K_TOUR_ENABLED, next.tourEnabled ? 'true' : 'false');
    }
    if (typeof next.welcomeDone === 'boolean') {
      localStorage.setItem(K_WELCOME_DONE, next.welcomeDone ? 'true' : 'false');
    }
    if (typeof next.staffCanLoadSessions === 'boolean') {
      const val = next.staffCanLoadSessions ? 'true' : 'false';
      localStorage.setItem(K_STAFF_CAN_LOAD, val);
      localStorage.setItem(LEGACY_STAFF_KEY, val);
    }
  }

  // --- View sync ---
  function syncModalFromPrefs(){
    const p = getPrefs();
    if (cbWelM)  cbWelM.checked  = p.welcomeEnabled;
    if (cbTourM) cbTourM.checked = p.tourEnabled;
    if (cbDont)  cbDont.checked  = p.welcomeDone;
  }
  function syncHelpFromPrefs(){
    const p = getPrefs();
    if (cbWelH)  cbWelH.checked  = p.welcomeEnabled;
    if (cbTourH) cbTourH.checked = p.tourEnabled;
  }
  function syncSettingsFromPrefs(){
    const p = getPrefs();
    if (cbWelS)  cbWelS.checked  = p.welcomeEnabled;
    if (cbTourS) cbTourS.checked = p.tourEnabled;
    if (cbStaffLoadS) cbStaffLoadS.checked = p.staffCanLoadSessions;
  }
  // Call once at load so UI matches storage
  syncModalFromPrefs();
  syncHelpFromPrefs();
  syncSettingsFromPrefs();

  // --- Persist from UI (Modal) ---
  function persistFromModal({lockDone=false} = {}){
    const next = {};
    if (cbWelM)  next.welcomeEnabled = !!cbWelM.checked;
    if (cbTourM) next.tourEnabled    = !!cbTourM.checked;
    if (lockDone && cbDont) next.welcomeDone = !!cbDont.checked;
    setPrefs(next);
    // reflect to other UIs
    syncHelpFromPrefs();
    syncSettingsFromPrefs();
  }

  // --- Persist from UI (Help) ---
  function persistFromHelp(){
    const next = {};
    if (cbWelH)  next.welcomeEnabled = !!cbWelH.checked;
    if (cbTourH) next.tourEnabled    = !!cbTourH.checked;
    setPrefs(next);
    // reflect to other UIs
    syncModalFromPrefs();
    syncSettingsFromPrefs();
  }

  // --- Persist from UI (Settings modal) ---
  function persistFromSettings(){
    const next = {};
    if (cbWelS)  next.welcomeEnabled = !!cbWelS.checked;
    if (cbTourS) next.tourEnabled    = !!cbTourS.checked;
    if (cbStaffLoadS) next.staffCanLoadSessions = !!cbStaffLoadS.checked;
    setPrefs(next);
    if (typeof next.staffCanLoadSessions === 'boolean') {
      const uid = localStorage.getItem('contractor_id');
      if (uid) {
        try {
          firebase.firestore().collection('contractors').doc(uid)
            .set({ staffCanLoadSessions: next.staffCanLoadSessions }, { merge: true });
        } catch (e) {
          console.warn('[Dashboard] Failed to update staffCanLoadSessions', e);
        }
      }
    }
    // reflect to other UIs
    syncModalFromPrefs();
    syncHelpFromPrefs();
  }

  // AUTOSAVE on checkbox changes (both places), so choices “stick” even if user closes without pressing Save
  cbWelM?.addEventListener('change', () => persistFromModal());
  cbTourM?.addEventListener('change', () => persistFromModal());
  cbDont?.addEventListener('change', () => persistFromModal({lockDone:true}));

  cbWelH?.addEventListener('change', persistFromHelp);
  cbTourH?.addEventListener('change', persistFromHelp);

  cbWelS?.addEventListener('change', persistFromSettings);
  cbTourS?.addEventListener('change', persistFromSettings);
  cbStaffLoadS?.addEventListener('change', persistFromSettings);

  btnClearLocal?.addEventListener('click', async () => {
    if (!confirm('Clear all local data? You will be signed out and the app will reload.')) return;
    try { localStorage.clear(); } catch {}
    if (window.caches) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      } catch {}
    }
    alert('Local data cleared. The app will reload and you may need to log in again.');
    location.reload();
  });

  // SAVE buttons
  btnSaveM?.addEventListener('click', () => {
    persistFromModal({lockDone:true}); // lock “Don’t show again” if ticked
    if (typeof window.closeWelcome === 'function') {
      window.closeWelcome();
    } else if (overlay) {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden','true');
      document.getElementById('help-btn')?.focus();
    }
  });
  btnSaveH?.addEventListener('click', () => {
    persistFromHelp();
    // Optional: keep help menu open to confirm, or close it:
    const helpBtn = document.getElementById('help-btn');
    if (helpMenu && !helpMenu.hidden && helpBtn) {
      helpMenu.hidden = true;
      helpBtn.setAttribute('aria-expanded','false');
    }
  });

  // Start Tour from modal
  btnStartM?.addEventListener('click', () => {
    // Ensure tour is enabled; if disabled, enable & save immediately
    if (localStorage.getItem(K_TOUR_ENABLED) === 'false') {
      setPrefs({ tourEnabled: true });
      syncModalFromPrefs();
      syncHelpFromPrefs();
      syncSettingsFromPrefs();
    }
    startDashboardTour();
  });
  // Keep “first-visit” rule intact elsewhere in your code:
  // shouldShowWelcome() must check welcomeEnabled && !welcomeDone
  // If you want "Got it" to also mark done when “Don’t show again” is ticked,
  // ensure your existing dw-ok handler calls:
  //   if (cbDont?.checked) setPrefs({ welcomeDone: true });
})();

// One-time backfill utility for adding savedAt to old session docs
async function backfillSavedAtForSessions() {
  const contractorId = localStorage.getItem('contractor_id');
  if (!contractorId) {
    console.warn('[backfillSavedAtForSessions] Missing contractor_id');
    return;
  }
  const db = firebase.firestore();
  const colRef = db.collection('contractors').doc(contractorId).collection('sessions');
  const snap = await colRef.limit(500).get();
  let batch = db.batch();
  let ops = 0;
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.savedAt) continue;
    let ts;
    if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      ts = firebase.firestore.Timestamp.fromDate(new Date(`${data.date}T12:00:00Z`));
    } else {
      ts = firebase.firestore.FieldValue.serverTimestamp();
    }
    batch.set(doc.ref, { savedAt: ts }, { merge: true });
    ops++;
    updated++;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`[backfillSavedAtForSessions] Updated ${updated} session(s)`);
}
window.backfillSavedAtForSessions = backfillSavedAtForSessions;
console.info('[SHEAR iQ] To backfill savedAt on older sessions, run: backfillSavedAtForSessions()');

// === KPI: Sheep Count ===
(function setupKpiSheepCount(){
  const pill = document.getElementById('kpiSheepCount');
  const pillVal = document.getElementById('kpiSheepCountValue');
  const modal = document.getElementById('kpiSheepModal');
  const closeBtn = document.getElementById('kpiSheepClose');
  const closeBtnFooter = document.getElementById('kpiSheepCloseFooter');
  const yearSel = document.getElementById('kpiYearSelect');
  const farmSel = document.getElementById('kpiFarmSelect');
  const offlineNote = document.getElementById('kpiOfflineNote');
  const tblFull = document.querySelector('#kpiFullSheepTable tbody');
  const tblCrutched = document.querySelector('#kpiCrutchedTable tbody');
  const exportBtn = document.getElementById('kpiExportCsv');
  const compareSel = document.getElementById('kpiSheepCompare');
  const summarySections = modal.querySelector('.kpi-sections');
  const monthlyContainer = document.getElementById('kpiSheepMonthly');
  const yearlyContainer = document.getElementById('kpiSheepYearly');

  // --- state + toggle helpers ---
  let currentFull = 0;
  let currentCrutched = 0;
  let showCrutched = false;
  let compareMode = 'summary';

  function renderPill() {
    const val = showCrutched ? currentCrutched : currentFull;
    const label = showCrutched ? 'Crutched' : 'Shorn';
    pillVal.textContent = `${label}: ${val.toLocaleString()}`;
  }

  function togglePill() {
    showCrutched = !showCrutched;
    renderPill();
  }

  if (!pill || !pillVal || !modal || !yearSel || !farmSel) {
    return;
  }

  if (dashCache.kpiSheepCount != null) {
    const kc = dashCache.kpiSheepCount;
    if (typeof kc === 'object') {
      currentFull = Number(kc.full || 0);
      currentCrutched = Number(kc.crutched || 0);
      renderPill();
    } else {
      currentFull = Number(kc);
      currentCrutched = 0;
      renderPill();
    }
  } else if (isReallyOffline()) {
    pillVal.textContent = 'Data not available offline';
    console.info('[Dashboard] Skipping live widget init offline.');
    return;
  }

  // Find contractor id (same logic you already use)
  const contractorId = localStorage.getItem('contractor_id') || (window.firebase?.auth()?.currentUser?.uid) || null;

  // Utility: crutched?
  function isCrutched(name){
    return String(name || '').toLowerCase().includes('crutch');
  }

  // Date helpers (NZ local)
  function yearBounds(y){
    const start = new Date(Date.UTC(y,0,1,0,0,0));
    const end = new Date(Date.UTC(y,11,31,23,59,59));
    return {start, end};
  }

  // Get candidate sessions:
  // Prefer already loaded/cached sessions if your dashboard widgets have them (adjust if you keep them elsewhere).
  async function fetchSessionsForYear(year){
    const { start, end } = yearBounds(year);
    // Try to reuse any global cache if your dashboard sets it (safe fallback if not found)
    if (window.__DASHBOARD_SESSIONS && Array.isArray(window.__DASHBOARD_SESSIONS)) {
      const filtered = window.__DASHBOARD_SESSIONS.filter(s => {
        const ts = s.date || s.savedAt || s.updatedAt;
        const t = ts?.toDate ? ts.toDate() : new Date(ts);
        return t >= start && t <= end;
      });
      offlineNote.hidden = !(!navigator.onLine);
      return filtered;
    }

    // Firestore fallback (compat assumed)
    if (!contractorId || !window.firebase?.firestore) {
      offlineNote.hidden = false;
      return [];
    }
    try {
      const db = firebase.firestore();
      const ref = db.collection('contractors').doc(contractorId).collection('sessions');
      const {start: s, end: e} = yearBounds(year);
      // If you store a timestamp field, prefer that (savedAt/updatedAt/sessionDate). Adjust as needed:
      const q = ref.where('savedAt', '>=', s).where('savedAt', '<=', e);
      const snap = await q.get();
      offlineNote.hidden = true;
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('KPI fetch failed; possibly offline', err);
      offlineNote.hidden = false;
      return [];
    }
  }

  async function fetchSessionsForRange(startYear, endYear){
    const tasks = [];
    for (let y = startYear; y <= endYear; y++) tasks.push(fetchSessionsForYear(y));
    const results = await Promise.all(tasks);
    return results.flat();
  }

  // Extract tallies from a session; adjust to your schema
  function iterTallies(session, fn){
    // Example shapes supported:
    // - session.shearerCounts[ ... ] with .sheepType/.type and .total or .stands
    // - session.shearers[ i ].runs[ j ].tally with .sheepType and .count
    // - session.tallies[ ... ] with .sheepType and .count
    if (Array.isArray(session?.shearerCounts)) {
      session.shearerCounts.forEach(row => {
        const type = row?.sheepType || row?.type || 'Unknown';
        let count = Number(row?.total);
        if (!Number.isFinite(count) && Array.isArray(row?.stands)) {
          count = row.stands.reduce((sum, s) => sum + Number(s?.count ?? s ?? 0), 0);
        }
        if (Number.isFinite(count) && count > 0) {
          fn(type, count, pickFarmName(session), session.date || session.savedAt);
        }
      });
      return;
    }
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        (sh.runs || []).forEach(run => {
          const type = run?.sheepType ?? run?.type ?? 'Unknown';
          const count = Number(run?.tally ?? run?.count ?? 0);
          if (count) fn(type, count, pickFarmName(session), session.date || session.savedAt);
        });
      });
    }
    if (Array.isArray(session?.tallies)) {
      session.tallies.forEach(t => {
        const type = t?.sheepType ?? t?.type ?? 'Unknown';
        const count = Number(t?.count ?? 0);
        if (count) fn(type, count, pickFarmName(session), session.date || session.savedAt);
      });
    }
  }

  function aggregate(sessions, farmFilter){
    const farmsSet = new Set();
    const byTypeFull = new Map();   // type -> { total, farms:Set, topFarm:{name, day, count} }
    const byTypeCrut = new Map();
    let totalFull = 0, totalCrut = 0;

    const perTypeFarmDay = new Map(); // type -> Map<`${farm}|${dayISO}`, sum>

    sessions.forEach(s => {
      const farm = pickFarmName(s) || 'Unknown Farm';
      farmsSet.add(farm);
      iterTallies(s, (type, count, f, dateTs) => {
        const farmName = f || farm;
        if (farmFilter && farmFilter !== '__ALL__' && farmName !== farmFilter) return;

        const bucket = isCrutched(type) ? byTypeCrut : byTypeFull;
        const key = type || 'Unknown';
        const obj = bucket.get(key) || { total: 0, farms: new Set(), topFarm: null };
        obj.total += count;
        obj.farms.add(farmName);
        bucket.set(key, obj);

        if (bucket === byTypeCrut) totalCrut += count; else totalFull += count;

        // track totals per type, farm, and day
        const day = toDayIso(dateTs);
        const k = `${farmName}|${day}`;
        const typeMap = perTypeFarmDay.get(key) || new Map();
        typeMap.set(k, (typeMap.get(k) || 0) + count);
        perTypeFarmDay.set(key, typeMap);
      });
    });

    // Determine top farm/day for each type
    function computeTopFarm(typeMap){
      typeMap.forEach((v, type) => {
        let top = { farm: '-', day: '-', count: 0 };
        const dayMap = perTypeFarmDay.get(type);
        if (dayMap) {
          dayMap.forEach((count, key) => {
            if (count > top.count) {
              const [farm, day] = key.split('|');
              top = { farm, day, count };
            }
          });
        }
        v.topFarm = top;
      });
    }
    computeTopFarm(byTypeFull);
    computeTopFarm(byTypeCrut);

    // Convert to arrays with %
    const fullArr = Array.from(byTypeFull.entries())
      .map(([type, v]) => ({ type, total: v.total, pct: totalFull ? (v.total/totalFull*100) : 0, farms: v.farms.size, top: v.topFarm }))
      .sort((a,b)=>b.total-a.total);

    const crutArr = Array.from(byTypeCrut.entries())
      .map(([type, v]) => ({ type, total: v.total, pct: totalCrut ? (v.total/totalCrut*100) : 0, farms: v.farms.size, top: v.topFarm }))
      .sort((a,b)=>b.total-a.total);

    return { totalFull, totalCrut, fullArr, crutArr, farms: Array.from(farmsSet).sort() };
  }

  function aggregateByMonth(sessions, farmFilter){
    const full = Array(12).fill(0);
    const crutched = Array(12).fill(0);
    sessions.forEach(s => {
      const farm = pickFarmName(s) || 'Unknown Farm';
      if (farmFilter && farmFilter !== '__ALL__' && farm !== farmFilter) return;
      iterTallies(s, (type, count, f, dateTs) => {
        const d = dateTs?.toDate ? dateTs.toDate() : new Date(dateTs);
        const m = d.getMonth();
        if (isCrutched(type)) crutched[m] += count; else full[m] += count;
      });
    });
    const total = full.map((v,i)=>v + crutched[i]);
    return {full, crutched, total};
  }

  function aggregateByYear(sessions, farmFilter, startYear, endYear){
    const years = [];
    const full = [];
    const crutched = [];
    for (let y=startYear; y<=endYear; y++){ years.push(y); full.push(0); crutched.push(0); }
    sessions.forEach(s => {
      const farm = pickFarmName(s) || 'Unknown Farm';
      if (farmFilter && farmFilter !== '__ALL__' && farm !== farmFilter) return;
      const ts = s.date || s.savedAt || s.updatedAt;
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      const y = d.getFullYear();
      if (y < startYear || y > endYear) return;
      const idx = y - startYear;
      iterTallies(s,(type,count)=>{
        if (isCrutched(type)) crutched[idx] += count; else full[idx] += count;
      });
    });
    const total = full.map((v,i)=>v + crutched[i]);
    return {years, full, crutched, total};
  }

  function toDayIso(ts){
    const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
    // normalise to YYYY-MM-DD (NZ local assumed OK for v1)
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function renderTable(tbody, rows){
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.type}</td>
        <td>${r.total.toLocaleString()}</td>
        <td>${r.pct.toFixed(1)}%</td>
        <td>${r.farms}</td>
        <td>${r.top.farm} (${r.top.day})</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderMonthly(data){
    if (!monthlyContainer) return;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = monthNames.map((m,i)=>{
      const full = data.full[i]||0;
      const crut = data.crutched[i]||0;
      const total = full+crut;
      return `<tr><td>${m}</td><td>${full.toLocaleString()}</td><td>${crut.toLocaleString()}</td><td>${total.toLocaleString()}</td></tr>`;
    }).join('');
    monthlyContainer.innerHTML =
      `<div class="kpi-spark" role="img" aria-label="Monthly sheep total trend"></div>`+
      `<table class="kpi-table"><thead><tr><th>Month</th><th>Shorn</th><th>Crutched</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`;
    const spark = monthlyContainer.querySelector('.kpi-spark');
    if (spark) renderSparkline(spark, data.total, monthNames);
  }

  function renderYearly(data){
    if (!yearlyContainer) return;
    const rows = data.years.map((y,i)=>{
      const full = data.full[i]||0;
      const crut = data.crutched[i]||0;
      const total = full+crut;
      return `<tr><td>${y}</td><td>${full.toLocaleString()}</td><td>${crut.toLocaleString()}</td><td>${total.toLocaleString()}</td></tr>`;
    }).join('');
    yearlyContainer.innerHTML =
      `<div class="kpi-spark" role="img" aria-label="Yearly sheep total trend"></div>`+
      `<table class="kpi-table"><thead><tr><th>Year</th><th>Shorn</th><th>Crutched</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`;
    const spark = yearlyContainer.querySelector('.kpi-spark');
    if (spark) renderSparkline(spark, data.total, data.years.map(y=>String(y)));
  }

  function updatePill(full, crutched){
    currentFull = Number(full || 0);
    currentCrutched = Number(crutched || 0);
    renderPill();
    dashCache.kpiSheepCount = { full: currentFull, crutched: currentCrutched };
    saveDashCache();
  }

  function fillYearsSelect(){
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 6; y--) years.push(y);
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(thisYear);
  }

  async function refresh(){
    compareMode = compareSel?.value || 'summary';
    const year = Number(yearSel.value || new Date().getFullYear());
    const farm = farmSel.value || '__ALL__';

    let sessions = [];
    if (compareMode === 'yearly') {
      const startYear = year - 4;
      sessions = await fetchSessionsForRange(startYear, year);

      const farms = Array.from(new Set(sessions.map(s=>pickFarmName(s) || 'Unknown Farm'))).sort();
      const current = farmSel.value;
      farmSel.innerHTML = `<option value="__ALL__">All farms</option>` + farms.map(f=>`<option value="${f}">${f}</option>`).join('');
      if (farms.includes(current)) farmSel.value = current;

      const currentYearSessions = sessions.filter(s=>{
        const ts = s.date || s.savedAt || s.updatedAt;
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return d.getFullYear() === year;
      });
      const aggCurrent = aggregate(currentYearSessions, farm);
      if (pillVal) updatePill(aggCurrent.totalFull, aggCurrent.totalCrut);

      const yearAgg = aggregateByYear(sessions, farm, startYear, year);
      renderYearly(yearAgg);
    } else {
      sessions = await fetchSessionsForYear(year);
      const agg = aggregate(sessions, farm);
      if (pillVal) updatePill(agg.totalFull, agg.totalCrut);

      const current = farmSel.value;
      farmSel.innerHTML =
        `<option value="__ALL__">All farms</option>` +
        agg.farms.map(f => `<option value="${f}">${f}</option>`).join('');
      if (agg.farms.includes(current)) farmSel.value = current;

      if (compareMode === 'monthly') {
        const monthAgg = aggregateByMonth(sessions, farm);
        renderMonthly(monthAgg);
      } else {
        if (tblFull) renderTable(tblFull, agg.fullArr);
        if (tblCrutched) renderTable(tblCrutched, agg.crutArr);
      }
    }

    if (summarySections) summarySections.hidden = compareMode !== 'summary';
    if (monthlyContainer) monthlyContainer.hidden = compareMode !== 'monthly';
    if (yearlyContainer) yearlyContainer.hidden = compareMode !== 'yearly';
  }

  // Open/close modal
  function openModal(){ modal.hidden = false; refresh(); }
  function closeModal(){ modal.hidden = true; }

  // Wire up
  if (pill) {
    let lastTap = 0;
    let tapTimer;
    pill.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        clearTimeout(tapTimer);
        togglePill();
        lastTap = 0;
      } else {
        tapTimer = setTimeout(openModal, 300);
        lastTap = now;
      }
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeBtnFooter) closeBtnFooter.addEventListener('click', closeModal);
  if (yearSel) yearSel.addEventListener('change', refresh);
  if (farmSel) farmSel.addEventListener('change', refresh);
  if (compareSel) compareSel.addEventListener('change', refresh);

  // CSV export (current tables)
  exportBtn?.addEventListener('click', () => {
    let rows;
    if (compareMode === 'monthly' || compareMode === 'yearly') {
      const container = compareMode === 'monthly' ? monthlyContainer : yearlyContainer;
      const label = compareMode === 'monthly' ? 'Month' : 'Year';
      rows = [[label, 'Shorn', 'Crutched', 'Total']];
      container?.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.children].map(td => td.textContent.trim());
        rows.push(cells.slice(0, 4));
      });
    } else {
      rows = [['Section', 'Sheep Type', 'Total', '% of total', 'Farms', 'Top Farm (day)']];
      document.querySelectorAll('#kpiFullSheepTable tbody tr').forEach(tr => {
        const cells = [...tr.children].map(td => td.textContent.trim());
        rows.push(['Shorn', ...cells]);
      });
      document.querySelectorAll('#kpiCrutchedTable tbody tr').forEach(tr => {
        const cells = [...tr.children].map(td => td.textContent.trim());
        rows.push(['Crutched', ...cells]);
      });
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SheepCount_${yearSel.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initial setup
  fillYearsSelect();

  function updateFromStore() {
    window.__DASHBOARD_SESSIONS = SessionStore.getAll().map(d => ({ id: d.id, ...d.data() }));
    refresh();
  }

  SessionStore.onChange(updateFromStore);

  if (SessionStore.getAll().length) {
    updateFromStore();
  }

  if (!isReallyOffline()) {
    SessionStore.start(contractorId, { monthsLive: 12 });
  }
})();

// === KPI: Sheep Per Hour ===
(function setupKpiSheepPerHour(){
  const pill = document.getElementById('kpiSheepPerHour');
  const pillVal = document.getElementById('kpiSheepPerHourValue');
  const modal = document.getElementById('kpiSheepPerHourModal');
  const closeX = document.getElementById('kpiSheepPerHourClose');
  const closeFooter = document.getElementById('kpiSheepPerHourCloseFooter');
  const farmSel = document.getElementById('kpiSPHFarmSelect');
  const typeSel = document.getElementById('kpiSPHTypeSelect');
  const sortSel = document.getElementById('kpiSPHSortSelect');
  const clearBtn = document.getElementById('kpiSPHClearFilters');
  const tblBody = document.querySelector('#kpiSPHTable tbody');

  if (!pill || !pillVal || !modal) return;

  if (dashCache.kpiSheepPerHourRate != null) {
    pillVal.textContent = dashCache.kpiSheepPerHourRate;
  } else if (isReallyOffline()) {
    pillVal.textContent = 'Data not available offline';
    console.info('[Dashboard] Skipping live widget init offline.');
    return;
  }

  const contractorId = localStorage.getItem('contractor_id') || (window.firebase?.auth()?.currentUser?.uid) || null;

  // Returns { hours: Number, displayText: String }.
  // displayText prefers the original user-entered string if available.
  // hours always returns a decimal for math (via parseHours or derived).
  function normalizeSessionHoursDisplay(raw) {
    if (!raw) return { hours: 0, displayText: '0h' };
    const s = String(raw).trim();
    const hours = parseHours ? parseHours(s) : parseFloat(s) || 0;

    // Prefer the original input style for display if it looks like time text:
    const looksLikeTime = /[:h]|m\b/i.test(s);
    if (looksLikeTime) return { hours, displayText: s };

    // Fallback: convert decimal -> Hh Mm for display
    return { hours, displayText: hoursToHM(hours) };
  }

  function parseHours(input){
    if (!input) return 0;
    const s = String(input).trim().toLowerCase();
    const m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return (+m[1]) + (+m[2]/60);
    const hm = s.match(/^(\d+)\s*h(?:\s*(\d+)\s*m)?$/);
    if (hm) return (+hm[1]) + (+hm[2] || 0)/60;
    const minOnly = s.match(/^(\d+)\s*m/);
    if (minOnly) return (+minOnly[1]) / 60;
    if (/^\d+(\.\d+)?$/.test(s)) return +s;
    return 0;
  }

  // Recursively search nested objects/arrays for an hoursWorked field
  function findHoursWorkedDeep(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string' || typeof obj === 'number') return null;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (Array.isArray(item) && item.length >= 2 && /hours\s*worked/i.test(item[0])) {
          return item[1];
        }
        const found = findHoursWorkedDeep(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof obj.hoursWorked === 'string' || typeof obj.hoursWorked === 'number') {
      return obj.hoursWorked;
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const found = findHoursWorkedDeep(val);
      if (found) return found;
    }
    return null;
  }

  function getSessionHours(session){
    const explicit = session.sessionHours || session.sessionLength || session.dayHours || session.hoursWorked || null;
    if (explicit) return parseHours(explicit);
    const st = session.startTime || session.start || null;
    const ft = session.finishTime || session.finish || null;
    if (st && ft) {
      const start = new Date(st);
      const finish = new Date(ft);
      let hrs = (finish - start) / 3600000;
      if (!isNaN(hrs) && hrs > 0) {
        const lunch = parseHours(session.lunchBreak || session.lunch);
        const smoko1 = parseHours(session.morningSmoko);
        const smoko2 = parseHours(session.afternoonSmoko);
        hrs = Math.max(0, hrs - (lunch + smoko1 + smoko2));
        return hrs;
      }
    }
    let maxH = 0;
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        maxH = Math.max(maxH, parseHours(sh.hoursWorked || sh.totalHours || sh.hours));
      });
    }
    if (Array.isArray(session?.shedStaff)) {
      session.shedStaff.forEach(ss => {
        maxH = Math.max(maxH, parseHours(ss.hoursWorked || ss.totalHours || ss.hours));
      });
    }
    if (session && typeof session.hours === 'object' && session.hours) {
      Object.values(session.hours).forEach(h => {
        maxH = Math.max(maxH, parseHours(h));
      });
    }
    return maxH || 0;
  }

  // Preserve original implementation before redefining
  const __old_getSessionHours__ = getSessionHours;

  // NEW: return both number and display for session-level hours
  // Prefers explicit session hours field; else derive from start/finish/breaks;
  // else fallback to largest individual worker hours (existing logic).
  function getSessionHoursInfo(session) {
    // 1) Try explicit session-level hours fields where your app stores them.
    // Common paths to check; keep them safe and optional:
    const explicit =
      findHoursWorkedDeep(session?.meta) ||
      session?.hoursWorked ||
      session?.summary?.hoursWorked ||
      session?.totals?.hoursWorked ||
      findHoursWorkedDeep(session) ||
      null;

    if (explicit) {
      return normalizeSessionHoursDisplay(explicit);
    }

    // 2) Derive from start/finish/breaks if available (reuse existing logic you have):
    // Try to call your existing derivation (if it exists) but capture the original user input
    // if present (e.g., session.meta.hoursInputRaw). Keep this robust & optional.
    let derivedDec = 0;
    try {
      if (typeof __old_getSessionHours__ === 'function') {
        derivedDec = Number(__old_getSessionHours__(session)) || 0;
      }
    } catch (_) {}

    // If you kept a raw input string somewhere like session.meta.hoursInputRaw, prefer it:
    const rawCandidate =
      session?.meta?.hoursInputRaw ||
      session?.hoursInputRaw ||
      null;

    if (rawCandidate) {
      const n = normalizeSessionHoursDisplay(rawCandidate);
      // If parse failed, overwrite hours with derivedDec
      if (!n.hours && derivedDec) n.hours = derivedDec;
      return n;
    }

    // 3) Fallback: decimal only -> Hh Mm for display
    return { hours: derivedDec, displayText: hoursToHM(derivedDec) };
  }

  // Redefine getSessionHours to delegate to new info function
  function getSessionHours(session) {
    if (__old_getSessionHours__ && __old_getSessionHours__ !== getSessionHours) {
      try {
        const n = __old_getSessionHours__(session);
        return (typeof n === 'number' && !isNaN(n)) ? n : 0;
      } catch (_) {}
    }
    const info = getSessionHoursInfo(session);
    return (typeof info.hours === 'number' && !isNaN(info.hours)) ? info.hours : 0;
  }

  function eachShearerHours(session, fn){
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        const raw = sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id;
        const name = normalizeName(raw) || 'Unknown';
        const hours = parseHours(sh.hoursWorked || sh.totalHours || sh.hours);
        if (hours > 0) fn(name, hours);
      });
    } else {
      const rawNames = Array.isArray(session?.stands) ? session.stands : Object.keys(session?.hours || {});
      rawNames.forEach(raw => {
        const name = normalizeName(raw) || 'Unknown';
        const hours = parseHours(session?.hours?.[name] ?? session?.hours?.[raw]);
        if (hours > 0) fn(name, hours);
      });
    }
  }

  function iterShearerTallies(session, fn){
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        const shearerName = normalizeName(sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id) || 'Unknown';
        const runs = sh.runs || sh.tallies || sh.entries || [];
        runs.forEach(run => {
          const type = run?.sheepType ?? run?.type ?? 'Unknown';
          const count = Number(run?.tally ?? run?.count ?? run?.total);
          if (Number.isFinite(count) && count > 0) fn(shearerName, type, count);
        });
        const total = Number(sh.total);
        if (Number.isFinite(total) && total > 0) {
          const type = sh.sheepType || sh.type || 'Unknown';
          fn(shearerName, type, total);
        }
      });
      return;
    }
    if (Array.isArray(session?.shearerCounts)) {
      const names = Array.isArray(session?.stands) ? session.stands : [];
      session.shearerCounts.forEach(row => {
        const type = row?.sheepType || row?.type || 'Unknown';
        const perStand = Array.isArray(row?.stands) ? row.stands : (Array.isArray(row?.counts) ? row.counts : []);
        perStand.forEach((raw,i)=>{
          const cnt = Number(raw?.count ?? raw);
          if (!Number.isFinite(cnt) || cnt <= 0) return;
          const rawName = names[i];
          const name = normalizeName(rawName) || `Stand ${i+1}`;
          fn(name, type, cnt);
        });
      });
      return;
    }
    if (Array.isArray(session?.tallies)) {
      session.tallies.forEach(t => {
        const rawName = t.shearerName || t.shearer || t.name;
        const name = normalizeName(rawName) || 'Unknown';
        const type = t.sheepType || t.type || 'Unknown';
        const cnt = Number(t.count ?? t.tally ?? t.total);
        if (name && Number.isFinite(cnt) && cnt > 0) fn(name, type, cnt);
      });
      return;
    }
    if (session && typeof session.shearerTallies === 'object') {
      Object.entries(session.shearerTallies).forEach(([rawName, entries]) => {
        const name = normalizeName(rawName) || 'Unknown';
        (entries || []).forEach(e => {
          const type = e.sheepType || e.type || 'Unknown';
          const cnt = Number(e.count ?? e.tally ?? e.total);
          if (Number.isFinite(cnt) && cnt > 0) fn(name, type, cnt);
        });
      });
    }
  }

  async function fetchSessions(){
    const cached = SessionStore.getAll ? SessionStore.getAll() : [];
    if (cached.length) {
      return cached.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    if (!contractorId || !window.firebase?.firestore) return [];
    try {
      const db = firebase.firestore();
      const ref = db.collection('contractors').doc(contractorId).collection('sessions');
      const snap = await ref.get();
      return snap.docs.map(d=>({ id:d.id, ...d.data() }));
    } catch(e){
      console.warn('Sheep/hr KPI fetch failed', e);
      return [];
    }
  }

  function aggregate(sessions, farmFilter, typeFilter){
    const daySet = new Set();
    const farmsSet = new Set();
    const typeSet = new Set();
    const shearerMap = new Map();
    let totalSheep = 0;
    let totalHours = 0;
    window.aggTotalMins = 0;
    let sessionCount = 0;
    let lastDisplay = '';

    sessions.forEach(s => {
      const farm = pickFarmName(s) || 'Unknown Farm';
      farmsSet.add(farm);
      if (farmFilter && farm !== farmFilter) return;
      const day = getSessionDateYMD(s);
      if (day) daySet.add(day);

      const hInfo = getSessionHoursInfo(s);
      totalHours += hInfo.hours;
      window.aggTotalMins += Math.round((hInfo.hours || 0) * 60);
      sessionCount++;
      if (sessionCount === 1) lastDisplay = hInfo.displayText;

      const hoursMap = new Map();
      eachShearerHours(s, (name,h)=>{
        hoursMap.set(name, (hoursMap.get(name)||0)+h);
      });

      iterShearerTallies(s,(name,type,count)=>{
        typeSet.add(type || 'Unknown');
        if (typeFilter && type !== typeFilter) return;
        totalSheep += count;
        const entry = shearerMap.get(name) || { sheep:0, hours:0 };
        entry.sheep += count;
        shearerMap.set(name, entry);
      });

      hoursMap.forEach((h,name)=>{
        const entry = shearerMap.get(name) || { sheep:0, hours:0 };
        entry.hours += h;
        shearerMap.set(name, entry);
      });
    });

    window.aggDisplayHours = sessionCount === 1 ? (lastDisplay || hoursToHM((window.aggTotalMins||0)/60)) : hoursToHM((window.aggTotalMins||0)/60);

    const shearerRows = Array.from(shearerMap.entries())
      .map(([name,data])=>({ name, sheep:data.sheep, hours:data.hours, rate: data.hours>0 ? data.sheep/data.hours : 0 }));

    return {
      days: daySet.size,
      totalSheep,
      totalHours,
      shearerRows,
      farms: Array.from(farmsSet).sort(),
      sheepTypes: Array.from(typeSet).sort()
    };
  }

  function renderTable(rows){
    if (!tblBody) return;
    const sortBy = sortSel?.value || 'hours';
    const sorted = [...rows];
    switch (sortBy) {
      case 'sheep':
        sorted.sort((a,b)=> b.sheep - a.sheep);
        break;
      case 'rate':
        sorted.sort((a,b)=> b.rate - a.rate);
        break;
      case 'name':
        sorted.sort((a,b)=> (normalizeName(a.name)||'').localeCompare(normalizeName(b.name)||''));
        break;
      case 'hours':
      default:
        sorted.sort((a,b)=> b.hours - a.hours);
        break;
    }
    tblBody.innerHTML = '';
    sorted.forEach(r => {
      const tr = document.createElement('tr');
      const name = normalizeName(r.name) || 'Unknown';
      tr.innerHTML =
        `<td>${name}</td>`+
        `<td>${r.sheep.toLocaleString()}</td>`+
        `<td>${hoursToHM(r.hours)}</td>`+
        `<td>${r.rate.toFixed(1)}</td>`;
      tblBody.appendChild(tr);
    });
  }

  function updatePill(stats){
    const rate = stats.totalHours > 0 ? (stats.totalSheep / stats.totalHours) : 0;
    const rateText = rate > 0 ? rate.toFixed(1) : '—';
    pillVal.textContent = rateText;
    dashCache.kpiSheepPerHourRate = rateText;
    saveDashCache();
  }

  async function refresh(){
    const sessions = await fetchSessions();
    const overall = aggregate(sessions, null, null);

    const currentFarm = farmSel.value;
    farmSel.innerHTML =
      `<option value="__ALL__">All farms</option>` +
      overall.farms.map(f => `<option value="${f}">${f}</option>`).join('');
    farmSel.value = overall.farms.includes(currentFarm) ? currentFarm : '__ALL__';

    const currentType = typeSel.value;
    typeSel.innerHTML =
      `<option value="__ALL__">All types</option>` +
      overall.sheepTypes.map(t => `<option value="${t}">${t}</option>`).join('');
    typeSel.value = overall.sheepTypes.includes(currentType) ? currentType : '__ALL__';

    updatePill(overall);

    const farm = farmSel.value === '__ALL__' ? null : farmSel.value;
    const type = typeSel.value === '__ALL__' ? null : typeSel.value;
    const viewStats = aggregate(sessions, farm, type);
    renderTable(viewStats.shearerRows);
  }

  function openModal(){ modal.hidden = false; refresh(); }
  function closeModal(){ modal.hidden = true; }

  pill?.addEventListener('click', openModal);
  closeX?.addEventListener('click', closeModal);
  closeFooter?.addEventListener('click', closeModal);
  farmSel?.addEventListener('change', refresh);
  typeSel?.addEventListener('change', refresh);
  sortSel?.addEventListener('change', refresh);
  clearBtn?.addEventListener('click', ()=>{ farmSel.value='__ALL__'; typeSel.value='__ALL__'; sortSel.value='hours'; refresh(); });

  SessionStore.onChange(()=>{ refresh(); });
  if (SessionStore.getAll().length) refresh();
})();

// === KPI: Total Hours (Session Hours for the year) ===
(function setupKpiTotalHours(){
  const pill = document.getElementById('kpiTotalHours');
  const pillVal = document.getElementById('kpiTotalHoursValue');
  const modal = document.getElementById('kpiTotalHoursModal');
  const closeX = document.getElementById('kpiTotalHoursClose');
  const closeFooter = document.getElementById('kpiTotalHoursCloseFooter');

  const yearSel = document.getElementById('kpiTHYearSelect');
  const farmSel = document.getElementById('kpiTHFarmSelect');
  const offlineNote = document.getElementById('kpiTHOfflineNote');

  const tbodySummary = document.getElementById('kpiTHSummary');
  const tblByFarm = document.querySelector('#kpiTHByFarm tbody');
  const tblByPerson = document.querySelector('#kpiTHByPerson tbody');
  const tblByStaff = document.querySelector('#kpiTHByStaff tbody');
  const tblByMonth = document.querySelector('#kpiTHByMonth tbody');
  const exportBtn = document.getElementById('kpiTHExport');

  const contractorId = localStorage.getItem('contractor_id') || (window.firebase?.auth()?.currentUser?.uid) || null;

  if (dashCache.kpiTotalHours != null && pillVal) {
    pillVal.textContent = dashCache.kpiTotalHours;
  } else if (isReallyOffline()) {
    if (pillVal) pillVal.textContent = 'Data not available offline';
    console.info('[Dashboard] Skipping live widget init offline.');
    return;
  }

  // Prefer existing parser if available
  const parseHours = (typeof window.parseHoursToDecimal === 'function')
    ? window.parseHoursToDecimal
    : function basicParseHours(input){
        if (!input) return 0;
        const s = String(input).trim().toLowerCase();
        const m = s.match(/^(\d+):(\d{1,2})$/); // H:MM
        if (m) return (+m[1]) + (+m[2]/60);
        const hm = s.match(/^(\d+)\s*h(?:ours?)?\s*(\d+)\s*m/i) || s.match(/^(\d+)h(\d+)m$/);
        if (hm) return (+hm[1]) + (+hm[2]/60);
        const hOnly = s.match(/^(\d+(?:\.\d+)?)\s*h/);
        if (hOnly) return +hOnly[1];
        const minOnly = s.match(/^(\d+)\s*m/);
        if (minOnly) return (+minOnly[1])/60;
        if (/^\d+(\.\d+)?$/.test(s)) return +s;
        return 0;
      };

  function yearBounds(y){
    const start = new Date(Date.UTC(y,0,1,0,0,0));
    const end = new Date(Date.UTC(y,11,31,23,59,59));
    return {start, end};
  }

  function monthKey(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`; // YYYY-MM
  }

  // Compute a single session's "session hours" (shed operating time, not sum of people)
  function getSessionHours(session){
    // 1) Explicit field (preferred)
    const explicit = session.sessionHours || session.sessionLength || session.dayHours || session.hoursWorked || null;
    if (explicit) return parseHours(explicit);

    // 2) Start/finish times (if present)
    const st = session.startTime || session.start || null;
    const ft = session.finishTime || session.finish || null;
    if (st && ft) {
      const start = new Date(st);
      const finish = new Date(ft);
      let hours = (finish - start) / 3600000;
      if (!isNaN(hours) && hours > 0) {
        // If break length is stored, subtract it
        const lunch = parseHours(session.lunchBreak || session.lunch || 0);
        const smoko1 = parseHours(session.morningSmoko || 0);
        const smoko2 = parseHours(session.afternoonSmoko || 0);
        hours = Math.max(0, hours - (lunch + smoko1 + smoko2));
        return hours;
      }
    }

    // 3) Derive from people’s hours: use the **max** individual hours in the session
    //    (safe proxy for the day's operating time; avoids inflated sums)
    let maxH = 0;

    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        maxH = Math.max(maxH, parseHours(sh.hoursWorked || sh.totalHours || sh.hours));
      });
    }
    if (Array.isArray(session?.shedStaff)) {
      session.shedStaff.forEach(ss => {
        maxH = Math.max(maxH, parseHours(ss.hoursWorked || ss.totalHours || ss.hours));
      });
    }
    if (session && typeof session.hours === 'object' && session.hours) {
      Object.values(session.hours).forEach(h => {
        maxH = Math.max(maxH, parseHours(h));
      });
    }
    return maxH || 0;
  }

  // Helper: iterate shearers with normalized names and hours
  function eachShearerHours(session, fn) {
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        const raw = sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id;
        const name = normalizeName(raw) || 'Unknown';
        const hours = parseHours(sh.hoursWorked || sh.totalHours || sh.hours);
        if (hours > 0) fn(name, hours);
      });
    } else {
      const rawNames = Array.isArray(session?.stands) ? session.stands : Object.keys(session?.hours || {});
      rawNames.forEach(raw => {
        const name = normalizeName(raw) || 'Unknown';
        const hours = parseHours(session?.hours?.[name] ?? session?.hours?.[raw]);
        if (hours > 0) fn(name, hours);
      });
    }
  }

  // Gather per-person hours and roles
  function eachPersonInSession(session, push){
    const dayKey = (session.date && session.date.toDate) ? session.date.toDate() : new Date(session.date || session.savedAt || session.updatedAt || Date.now());
    const dayStr = dayKey.toISOString().slice(0,10); // YYYY-MM-DD

    eachShearerHours(session, (name, hours) => {
      if (hours > 0) push({ name, role: 'Shearer', dateKey: dayStr, hours });
    });

    if (Array.isArray(session?.shedStaff)) {
      session.shedStaff.forEach(ss => {
        const hours = parseHours(ss.hoursWorked || ss.totalHours || ss.hours);
        if (hours > 0) {
          const name = normalizeName(ss.name || ss.staffName || ss.displayName || ss.id) || 'Unknown';
          push({ name, role: 'Shed Staff', dateKey: dayStr, hours });
        }
      });
    }
  }

  // Use dashboard cache if present; else Firestore query
  async function fetchSessionsForYear(year){
    const { start, end } = yearBounds(year);
    if (window.__DASHBOARD_SESSIONS && Array.isArray(window.__DASHBOARD_SESSIONS)) {
      const filtered = window.__DASHBOARD_SESSIONS.filter(s => {
        const ts = s.date || s.savedAt || s.updatedAt;
        const t = ts?.toDate ? ts.toDate() : new Date(ts);
        return t >= start && t <= end;
      });
      offlineNote.hidden = !(!navigator.onLine);
      return filtered;
    }
    if (!contractorId || !window.firebase?.firestore) {
      offlineNote.hidden = false;
      return [];
    }
    try {
      const db = firebase.firestore();
      const ref = db.collection('contractors').doc(contractorId).collection('sessions');
      const snap = await ref.where('savedAt', '>=', start).where('savedAt', '<=', end).get();
      offlineNote.hidden = true;
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Total Hours KPI fetch failed (maybe offline)', e);
      offlineNote.hidden = false;
      return [];
    }
  }

  function fillYearsSelect(sel){
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 6; y--) years.push(y);
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    sel.value = String(thisYear);
  }

  function renderPill(hours){
    const text = isFinite(hours) && hours > 0 ? hoursToHM(hours) : '—';
    pillVal.textContent = text;
    dashCache.kpiTotalHours = text;
    saveDashCache();
  }

  function renderSummary(sessionHours, crewHours, shedStaffHours){
    tbodySummary.innerHTML = `
      <tr><td>Session Hours (pill metric)</td><td>${hoursToHM(sessionHours)}</td></tr>
      <tr><td>Total Hours Worked By All Staff (combined)</td><td>${hoursToHM(crewHours)}</td></tr>
      <tr><td>Shed Staff Hours (combined)</td><td>${hoursToHM(shedStaffHours)}</td></tr>
    `;
  }

  function renderByFarm(rows){
    tblByFarm.innerHTML = '';
    rows.sort((a,b)=>b.sessionHours - a.sessionHours);
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.farm}</td>
        <td>${hoursToHM(r.sessionHours)}</td>
        <td>${hoursToHM(r.shedStaffHours)}</td>
        <td>${r.sessionCount ? hoursToHM(r.sessionHours / r.sessionCount) : '—'}</td>
      `;
      tblByFarm.appendChild(tr);
    });
  }

  function renderByPerson(rows){
    tblByPerson.innerHTML = '';
    const shearers = rows.filter(r => r.role === 'Shearer');
    shearers.sort((a,b)=>b.totalHours - a.totalHours);
    shearers.forEach((r,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.daysWorked}</td>
        <td>${hoursToHM(r.totalHours)}</td>
        <td>${r.daysWorked ? hoursToHM(r.totalHours / r.daysWorked) : '—'}</td>
      `;
      tblByPerson.appendChild(tr);
    });
  }

  function renderByStaff(rows){
    tblByStaff.innerHTML = '';
    const staff = rows.filter(r => r.role === 'Shed Staff');
    staff.sort((a,b)=>b.totalHours - a.totalHours);
    staff.forEach((r,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.daysWorked}</td>
        <td>${hoursToHM(r.totalHours)}</td>
        <td>${r.daysWorked ? hoursToHM(r.totalHours / r.daysWorked) : '—'}</td>
      `;
      tblByStaff.appendChild(tr);
    });
  }

  function renderByMonth(map){
    // map: key YYYY-MM -> hours
    const entries = Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
    tblByMonth.innerHTML = '';
    const monthTotals = [];
    const monthLabels = [];
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    entries.forEach(([k, hours])=>{
      const mIndex = Number(k.slice(5,7)) - 1;
      const label = names[mIndex] || k;
      monthTotals.push(hours);
      monthLabels.push(label);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${hoursToHM(hours)}</td>`;
      tblByMonth.appendChild(tr);
    });
    return { monthTotals, monthLabels };
  }

  function aggregate(sessions, farmFilter){
    let totalSessionHours = 0;
    let totalShedStaffHours = 0;
    let totalCrewHours = 0;

    const byFarm = new Map();   // farm -> { sessionHours, shedStaffHours, sessionCount }
    const byPerson = new Map(); // name|role -> { name, role, days:Set, totalHours }
    const byMonth = new Map();  // YYYY-MM -> hours
    const farmsSet = new Set();

    sessions.forEach(s=>{
      const farm = pickFarmName(s) || 'Unknown Farm';
      if (farmFilter && farmFilter !== '__ALL__' && farm !== farmFilter) return;

      farmsSet.add(farm);

      // Session date (for monthly)
      const ts = s.date || s.savedAt || s.updatedAt;
      const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
      const mKey = monthKey(d);

      // Compute sessionHours safely
      const sessionHours = getSessionHours(s);
      totalSessionHours += sessionHours;
      byMonth.set(mKey, (byMonth.get(mKey) || 0) + sessionHours);

      // Sum crew hours by role (for reference)
      let shedStaffHours = 0;
      let sessionCrewHours = 0;

      const addPerson = (name, role, dayKey, hours) => {
        const key = `${name}|${role}`;
        if (!byPerson.has(key)) byPerson.set(key, { name, role, days:new Set(), totalHours:0 });
        const rec = byPerson.get(key);
        rec.days.add(dayKey);
        rec.totalHours += hours;
      };

      // By person (and role totals)
      eachPersonInSession(s, ({name, role, dateKey, hours})=>{
        addPerson(name, role, dateKey, hours);
        if (role === 'Shed Staff') shedStaffHours += hours;
        sessionCrewHours += hours;
      });

      totalShedStaffHours += shedStaffHours;
      totalCrewHours += sessionCrewHours;

      // By farm rollup
      const f = byFarm.get(farm) || { sessionHours:0, shedStaffHours:0, sessionCount:0 };
      f.sessionHours += sessionHours;
      f.shedStaffHours += shedStaffHours;
      f.sessionCount += 1;
      byFarm.set(farm, f);
    });

    const farmRows = Array.from(byFarm.entries()).map(([farm, v]) => ({
      farm,
      sessionHours: v.sessionHours || 0,
      shedStaffHours: v.shedStaffHours || 0,
      sessionCount: v.sessionCount || 0
    }));

    const personRows = Array.from(byPerson.values()).map(v => ({
      name: v.name,
      role: v.role,
      daysWorked: v.days.size,
      totalHours: v.totalHours
    }));

    return {
      totalSessionHours,
      totalShedStaffHours,
      totalCrewHours,
      farmRows,
      personRows,
      monthMap: byMonth,
      farms: Array.from(farmsSet).sort()
    };
  }

  async function refresh(){
    const year = Number(yearSel.value || new Date().getFullYear());
    const farm = farmSel.value || '__ALL__';

    const { start, end } = yearBounds(year);
    const sessions = await fetchSessionsForYear(year);
    offlineNote.hidden = !( !navigator.onLine );

    // Populate farms select
    const farms = Array.from(new Set(sessions.map(s=>pickFarmName(s) || 'Unknown Farm'))).sort();
    const current = farmSel.value;
    farmSel.innerHTML =
      `<option value="__ALL__">All farms</option>` +
      farms.map(f => `<option value="${f}">${f}</option>`).join('');
    if (farms.includes(current)) farmSel.value = current;

    const agg = aggregate(sessions, farm);

    // Update pill immediately
    renderPill(agg.totalSessionHours);

    // Render modal tables
    renderSummary(agg.totalSessionHours, agg.totalCrewHours, agg.totalShedStaffHours);
    renderByFarm(agg.farmRows);
    renderByPerson(agg.personRows);
    renderByStaff(agg.personRows);
    const monthData = renderByMonth(agg.monthMap);

    const sparkHost = document.getElementById('kpiTHMonthSpark');
    const busiestEl = document.getElementById('kpiTHBusiestBadge');
    const quietestEl = document.getElementById('kpiTHQuietestBadge');

    if (sparkHost && monthData && Array.isArray(monthData.monthTotals)) {
      renderSparkline(sparkHost, monthData.monthTotals, monthData.monthLabels);

      const peaks = calcPeaks(monthData.monthTotals, monthData.monthLabels);
      if (peaks && peaks.busiest) {
        if (busiestEl) {
          busiestEl.hidden = false;
          busiestEl.textContent = `Busiest: ${peaks.busiest.label} (${formatHoursHM(peaks.busiest.value)})`;
        }
      } else if (busiestEl) {
        busiestEl.hidden = true;
      }

      if (peaks && peaks.quietest) {
        if (quietestEl) {
          quietestEl.hidden = false;
          quietestEl.textContent = `Quietest: ${peaks.quietest.label} (${formatHoursHM(peaks.quietest.value)})`;
        }
      } else if (quietestEl) {
        quietestEl.hidden = true;
      }
    }
  }

  function openModal(){ modal.hidden = false; refresh(); }
  function closeModal(){ modal.hidden = true; }

  // Wire events
  pill?.addEventListener('click', openModal);
  closeX?.addEventListener('click', closeModal);
  closeFooter?.addEventListener('click', closeModal);
  yearSel?.addEventListener('change', refresh);
  farmSel?.addEventListener('change', refresh);

  // Init: fill years
  fillYearsSelect(yearSel);

SessionStore.onChange(refresh);
  if (SessionStore.getAll().length) refresh();
})();

// === KPI: Days Worked (unique session-days) ===
(function setupKpiDaysWorked(){
  const pill = document.getElementById('kpiDaysWorked');
  const pillVal = document.getElementById('kpiDaysWorkedValue');
  const modal = document.getElementById('kpiDaysWorkedModal');
  const closeX = document.getElementById('kpiDaysWorkedClose');
  const closeFooter = document.getElementById('kpiDaysWorkedCloseFooter');

  const yearSel = document.getElementById('kpiDWYearSelect');
  const farmSel = document.getElementById('kpiDWFarmSelect');
  const offlineNote = document.getElementById('kpiDWOfflineNote');

  const tbodySummary = document.getElementById('kpiDWSummary');
  const tblByFarm = document.querySelector('#kpiDWByFarm tbody');
  const tblByPerson = document.querySelector('#kpiDWByPerson tbody');
  const tblByMonth = document.querySelector('#kpiDWByMonth tbody');
  const tblStreaks = document.querySelector('#kpiDWStreaks tbody');
  const reliabilityEl = document.getElementById('kpiDWReliability');
  const highestAttendanceEl = document.getElementById('kpiDWHighestAttendance');
  const mostConsecutiveEl = document.getElementById('kpiDWMostConsecutiveDays');
  const monthTrendEl = document.getElementById('kpiDWMonthTrend');
  const monthSparkEl = document.getElementById('kpiDWMonthSpark');
  const exportBtn = document.getElementById('kpiDWExport');
  let exportExtras = new Map();

  const contractorId = localStorage.getItem('contractor_id') || (window.firebase?.auth()?.currentUser?.uid) || null;

  if (dashCache.kpiDaysWorked != null && pillVal) {
    pillVal.textContent = dashCache.kpiDaysWorked;
  } else if (isReallyOffline()) {
    if (pillVal) pillVal.textContent = 'Data not available offline';
    console.info('[Dashboard] Skipping live widget init offline.');
    return;
  }

  function yearBounds(y){
    const start = new Date(Date.UTC(y,0,1,0,0,0));
    const end = new Date(Date.UTC(y,11,31,23,59,59));
    return {start, end};
  }
  function toDayIso(ts){
    const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function monthKeyFromDay(dayStr){
    return dayStr.slice(0,7); // YYYY-MM
  }

  const shortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function fmtMonthLabel(ym) {
    // ym may be 'YYYY-MM' or a Date/ISO string. Normalize to 'Mon YYYY'
    if (!ym) return '';
    let y = '', m = '';
    if (typeof ym === 'string' && /^\d{4}-\d{2}$/.test(ym)) {
      y = ym.slice(0,4);
      m = ym.slice(5,7);
    } else {
      // fallback: try to parse into a Date and reconstruct
      const d = new Date(ym);
      if (!isNaN(d)) {
        y = String(d.getFullYear());
        m = String(d.getMonth()+1).padStart(2,'0');
      } else {
        return ym; // give up, show original
      }
    }
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const idx = Math.max(0, Math.min(11, parseInt(m,10)-1));
    return `${names[idx]} ${y}`;
  }


  function calcPeaks(values, labels){
    if(!values.length) return {busiest:null, quietest:null};
    let maxIdx=0, minIdx=0;
    values.forEach((v,i)=>{ if(v>values[maxIdx]) maxIdx=i; if(v<values[minIdx]) minIdx=i; });
    return {
      busiest: { label: labels[maxIdx], value: values[maxIdx] },
      quietest: { label: labels[minIdx], value: values[minIdx] }
    };
  }

  function calcAttendance(personMap, allDays){
    const total = allDays.size;
    const arr=[];
    personMap.forEach((set,key)=>{
      const [name,role]=key.split('|');
      const pct = total ? (set.size/total)*100 : 0;
      arr.push({name,role,days:set.size,attendancePct:pct});
    });
    return arr;
  }

  function calcStreaks(daySet){
    const days = Array.from(daySet).sort();
    if(!days.length) return {length:0,startISO:null,endISO:null};
    let longest={length:1,start:days[0],end:days[0]};
    let currStart=days[0], prev=days[0], currLen=1;
    for(let i=1;i<days.length;i++){
      const d=days[i];
      const diff=(new Date(d)-new Date(prev))/86400000;
      if(diff===1){
        currLen++; prev=d;
      } else {
        if(currLen>longest.length) longest={length:currLen,start:currStart,end:prev};
        currStart=d; prev=d; currLen=1;
      }
    }
    if(currLen>longest.length) longest={length:currLen,start:currStart,end:prev};
    return {length:longest.length,startISO:longest.start,endISO:longest.end};
  }

  function formatDate(d){
    if(!d) return '';
    const dt=new Date(d);
    const day=String(dt.getDate()).padStart(2,'0');
    const month=String(dt.getMonth()+1).padStart(2,'0');
    const year=dt.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Map stand index -> shearer name (normalized); adapted from Top 5 Shearers widget
  function buildStandIndexNameMap(sessionData) {
    const map = {};
    const arr = Array.isArray(sessionData?.stands) ? sessionData.stands : [];
    const rawIdx = arr.map((st, i) => (st && st.index != null ? Number(st.index) : i));
    const has0 = rawIdx.includes(0);
    const has1 = rawIdx.includes(1);
    const looksOneBased = !has0 && has1;
    arr.forEach((st, pos) => {
      let i = (st && st.index != null) ? Number(st.index) : pos;
      if (!Number.isFinite(i)) i = pos;
      if (looksOneBased) i = i - 1;
      if (i < 0) i = 0;
      let name = normalizeName(st?.name || st?.shearerName || st?.id);
      if (!name || /^stand\s+\d+$/i.test(name)) name = null;
      map[i] = name;
    });
    return map;
  }

  // Collect unique shearer names from a session, handling multiple schema shapes
  function collectShearerNames(sessionDoc) {
    const s = sessionDoc?.data ? sessionDoc.data() : sessionDoc;
    const names = new Set();

    if (Array.isArray(s.shearers)) {
      s.shearers.forEach(sh => {
        const n = normalizeName(sh.name || sh.shearerName || sh.displayName || sh.shearer || sh.id);
        if (n) names.add(n);
      });
    }

    const standMap = buildStandIndexNameMap(s);
    Object.values(standMap).forEach(n => { if (n) names.add(n); });

    if (Array.isArray(s.shearerCounts)) {
      s.shearerCounts.forEach(run => {
        if (Array.isArray(run.stands)) {
          run.stands.forEach((st, i) => {
            let n;
            if (typeof st === 'object') {
              n = normalizeName(st.name || st.shearerName || st.id);
            } else {
              n = normalizeName(st);
            }
            if (n) names.add(n);
            else if (standMap[i]) names.add(standMap[i]);
          });
        }
      });
    }

    if (Array.isArray(s.tallies)) {
      s.tallies.forEach(t => {
        const n = normalizeName(t.shearerName || t.shearer || t.name);
        if (n) names.add(n);
      });
    }

    if (s.shearerTallies && typeof s.shearerTallies === 'object') {
      Object.keys(s.shearerTallies).forEach(k => {
        const n = normalizeName(k);
        if (n) names.add(n);
      });
    }

    return Array.from(names);
  }

  // Collect shed staff / crew names from common shapes + merge with shearers
  function collectAllPeople(sessionDoc) {
    const s = sessionDoc?.data ? sessionDoc.data() : sessionDoc;
    const names = new Set();

    // 1) Shearers (reuse existing logic)
    try {
      collectShearerNames(sessionDoc).forEach(n => { if (n) names.add(n); });
    } catch {}

    // 2) Shed staff / crew arrays (best-effort across schema variants)
    const staffArrays = [
      s.shedStaff, s.shedstaff, s.staff, s.crew, s.shed_hands, s.shedHands
    ].filter(Array.isArray);

    staffArrays.forEach(arr => {
      arr.forEach(item => {
        let n;
        if (typeof item === 'string') n = item;
        else if (item && typeof item === 'object') {
          n = item.name || item.displayName || item.staffName || item.id;
        }
        n = normalizeName(n);
        if (n) names.add(n);
      });
    });

    // 3) Generic people blocks (if present)
    if (Array.isArray(s.people)) {
      s.people.forEach(p => {
        const n = normalizeName(p?.name || p?.displayName || p?.id);
        if (n) names.add(n);
      });
    }

    return Array.from(names);
  }

  async function fetchSessionsForYear(year){
    const { start, end } = yearBounds(year);
    if (window.__DASHBOARD_SESSIONS && Array.isArray(window.__DASHBOARD_SESSIONS)) {
      return window.__DASHBOARD_SESSIONS.filter(s=>{
        const ts = s.date || s.savedAt || s.updatedAt;
        const t = ts?.toDate ? ts.toDate() : new Date(ts);
        return t >= start && t <= end;
      });
    }
    if (!contractorId || !window.firebase?.firestore) return [];
    const db = firebase.firestore();
    const ref = db.collection('contractors').doc(contractorId).collection('sessions');
    const snap = await ref.where('savedAt', '>=', start).where('savedAt', '<=', end).get();
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }

  function aggregate(sessions, farmFilter){
    const allDaySet = new Set();
    const farmDayMap = new Map(); // farm -> Set(days)
    const farmWorkersMap = new Map(); // farm -> Set(worker names)
    const personDayMap = new Map(); // person|role -> Set(days)
    const monthDayMap = new Map();  // month -> Set(days)
    const farmsSet = new Set();
    let sessionCount = 0;

    sessions.forEach(s=>{
      const farm = pickFarmName(s) || 'Unknown Farm';
      if (farmFilter && farmFilter !== '__ALL__' && farm !== farmFilter) return;

      sessionCount++;
      farmsSet.add(farm);
      const dayStr = toDayIso(s.date || s.savedAt || s.updatedAt);
      allDaySet.add(dayStr);

      if(!farmDayMap.has(farm)) farmDayMap.set(farm, new Set());
      farmDayMap.get(farm).add(dayStr);

      const people = collectAllPeople(s);
      if(!farmWorkersMap.has(farm)) farmWorkersMap.set(farm, new Set());
      people.forEach(n => farmWorkersMap.get(farm).add(n));

      function addPerson(name, role){
        const key = `${name}|${role}`;
        if (!personDayMap.has(key)) personDayMap.set(key, new Set());
        personDayMap.get(key).add(dayStr);
      }
      const shearerNames = collectShearerNames(s);
      shearerNames.forEach(name => addPerson(name || 'Unknown', 'Shearer'));

      const staffArrays = [s.shedStaff, s.shedstaff, s.staff, s.crew, s.shed_hands, s.shedHands].filter(Array.isArray);
      staffArrays.forEach(arr => {
        arr.forEach(ss => {
          let n;
          if (typeof ss === 'string') n = ss;
          else if (ss && typeof ss === 'object') {
            n = ss.name || ss.displayName || ss.staffName || ss.id;
          }
          n = normalizeName(n);
          addPerson(n || 'Unknown', 'Shed Staff');
        });
      });

      const mKey = monthKeyFromDay(dayStr);
      if (!monthDayMap.has(mKey)) monthDayMap.set(mKey, new Set());
      monthDayMap.get(mKey).add(dayStr);
    });

    const farmRows = Array.from(farmDayMap.entries()).map(([farm, daySet]) => {
      const teamDays = daySet.size;
      const uniqueWorkers = (farmWorkersMap.get(farm) || new Set()).size;
      return {
        farm,
        teamDays,
        uniqueWorkers
      };
    }).sort((a,b)=> b.teamDays - a.teamDays || a.farm.localeCompare(b.farm));

    const personRows = Array.from(personDayMap.entries()).map(([key,set])=>{
      const [name,role] = key.split('|');
      return {name, role, days:set.size, daySet:set};
    }).sort((a,b)=>b.days-a.days || a.name.localeCompare(b.name));

    const monthRows = Array.from(monthDayMap.entries())
      .map(([month,set])=>({month, days:set.size}))
      .sort((a,b)=>a.month.localeCompare(b.month));

    return { total: allDaySet.size, sessionCount, allDays: allDaySet, farmRows, personRows, monthRows, personDayMap, farms:Array.from(farmsSet).sort() };
  }

  function renderPill(val){
    const text = val>0 ? val : '—';
    pillVal.textContent = text;
    dashCache.kpiDaysWorked = text;
    saveDashCache();
  }
  function renderSummary(totalDays, sessionCount){
    const daysEl = tbodySummary.querySelector('#kpiDWDaysCount');
    if (daysEl) daysEl.textContent = totalDays;
    const sessEl = tbodySummary.querySelector('#kpiDWSessionsCount');
    if (sessEl) sessEl.textContent = sessionCount;
  }
  function renderByFarm(rows){
    const tbody = document.querySelector('#kpiDWByFarm tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.farm)}</td>
      <td>${r.teamDays}</td>
      <td>${r.uniqueWorkers}</td>
    </tr>
    `).join('');
  }
  function renderByPerson(rows){ tblByPerson.innerHTML = rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.role}</td><td>${r.days}</td></tr>`).join(''); }
  function renderByMonth(rows){ tblByMonth.innerHTML = rows.map(r=>`<tr><td>${fmtMonthLabel(r.month)}</td><td>${r.days}</td></tr>`).join(''); }
  function renderStreaks(rows){ tblStreaks.innerHTML = rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.role}</td><td>${r.length}</td><td>${formatDate(r.startISO)}–${formatDate(r.endISO)}</td></tr>`).join(''); }

  async function refresh(){
    const year = Number(yearSel.value||new Date().getFullYear());
    const farm = farmSel.value||'__ALL__';
    const sessions = await fetchSessionsForYear(year);
    const agg = aggregate(sessions, farm);

    const farms = agg.farms;
    farmSel.innerHTML = `<option value="__ALL__">All farms</option>` + farms.map(f=>`<option value="${f}">${f}</option>`).join('');
    if (farms.includes(farm)) farmSel.value = farm;

    offlineNote.hidden = navigator.onLine;

    const attendanceArr = calcAttendance(agg.personDayMap, agg.allDays);
    exportExtras = new Map();
    attendanceArr.forEach(a=>{ exportExtras.set(`${a.name}|${a.role}`, {attendancePct:a.attendancePct}); });

    reliabilityEl && (reliabilityEl.hidden = agg.allDays.size === 0);
    highestAttendanceEl && (highestAttendanceEl.hidden = true);
    mostConsecutiveEl && (mostConsecutiveEl.hidden = true);

    if (agg.allDays.size && attendanceArr.length){
      const best = attendanceArr.reduce((a,b)=>b.attendancePct>a.attendancePct?b:a);
      if (highestAttendanceEl) {
        highestAttendanceEl.textContent = `Highest Attendance: ${best.name} (${best.attendancePct.toFixed(0)}%)`;
        highestAttendanceEl.hidden = false;
      }
    }

    const streakRows = [];
    agg.personDayMap.forEach((set,key)=>{
      const [name,role]=key.split('|');
      const st = calcStreaks(set);
      streakRows.push({name, role, ...st});
      const ex = exportExtras.get(`${name}|${role}`) || {};
      ex.longestStreak = st.length;
      exportExtras.set(`${name}|${role}`, ex);
    });
    streakRows.sort((a,b)=>b.length - a.length || a.name.localeCompare(b.name));
    renderStreaks(streakRows);

    if (agg.allDays.size && streakRows.length){
      const bestStreak = streakRows.reduce((a,b)=> (b.length>a.length) || (b.length===a.length && b.startISO<a.startISO) ? b : a );
      if (mostConsecutiveEl) {
        mostConsecutiveEl.textContent = `Most Consecutive Days: ${bestStreak.name} (${bestStreak.length} days, ${formatDate(bestStreak.startISO)}–${formatDate(bestStreak.endISO)})`;
        mostConsecutiveEl.hidden = false;
      }
    }
    renderPill(agg.total);
    renderSummary(agg.total, agg.sessionCount);
    renderByFarm(agg.farmRows);
    renderByPerson(agg.personRows);

    const monthTotals = agg.monthRows.map(r=>r.days);
    const monthLabels = agg.monthRows.map(r=> shortMonthNames[Number(r.month.slice(5))-1]);
    monthTrendEl && (monthTrendEl.hidden = agg.allDays.size === 0);
    if (agg.allDays.size && monthTotals.length){
      renderSparkline(monthSparkEl, monthTotals, monthLabels);
    } else if (monthSparkEl) {
      monthSparkEl.textContent='';
    }

    // === Fill Busiest/Quietest/Monthly Average pills for Days Worked ===
    (function updateDWMonthPills(){
      const busiestEl  = document.getElementById('kpiDWBusiestMonth');
      const quietestEl = document.getElementById('kpiDWQuietestMonth');
      const avgEl      = document.getElementById('kpiDWMonthlyAverage');

      if (!busiestEl || !quietestEl || !avgEl) return;

      // Guard: no data
      if (!Array.isArray(monthTotals) || monthTotals.length === 0) {
        busiestEl.hidden = quietestEl.hidden = avgEl.hidden = true;
        return;
      }

      // Find busiest/quietest using existing helper if you have it
      const peaks = (typeof calcPeaks === 'function')
        ? calcPeaks(monthTotals, monthLabels)
        : null;

      // Busiest Month
      if (peaks && peaks.busiest && peaks.busiest.value > 0) {
        busiestEl.textContent = `Busiest Month: ${peaks.busiest.label} (${peaks.busiest.value})`;
        busiestEl.hidden = false;
      } else {
        busiestEl.hidden = true;
      }

      // Quietest Month
      if (peaks && peaks.quietest) {
        quietestEl.textContent = `Quietest Month: ${peaks.quietest.label} (${peaks.quietest.value})`;
        quietestEl.hidden = false;
      } else {
        quietestEl.hidden = true;
      }

      // Monthly Average (over months that appear in the table)
      // If you’d rather ignore true zeros, change the filter to > 0.
      const considered = monthTotals.filter(v => Number.isFinite(v));
      const avg = considered.length ? Math.round(sum(considered) / considered.length) : 0;
      if (avg > 0) {
        avgEl.textContent = `Monthly Average: ${avg}`;
        avgEl.hidden = false;
      } else {
        avgEl.hidden = true;
      }
    })();

    renderByMonth(agg.monthRows);
  }

  function openModal(){ modal.hidden=false; refresh(); }
  function closeModal(){ modal.hidden=true; }

  pill?.addEventListener('click', openModal);
  closeX?.addEventListener('click', closeModal);
  closeFooter?.addEventListener('click', closeModal);
  yearSel?.addEventListener('change', refresh);
  farmSel?.addEventListener('change', refresh);
  exportBtn?.addEventListener('click',()=>{
    const rows=[["Metric","Count"]];
    rows.push(["Days Worked (total)",pillVal.textContent]);
    tblByFarm.querySelectorAll('tr').forEach(tr=>{
      const c=[...tr.children].map(td=>td.textContent);
      rows.push(["Farm",...c]);
    });
    tblByPerson.querySelectorAll('tr').forEach(tr=>{
      const c=[...tr.children].map(td=>td.textContent);
      const key=`${c[1]}|${c[2]}`;
      const ex=exportExtras.get(key)||{};
      const att=ex.attendancePct!=null?ex.attendancePct.toFixed(1)+'%':'';
      const streak=ex.longestStreak!=null?ex.longestStreak:'';
      rows.push(["Person",...c,att,streak]);
    });
    tblByMonth.querySelectorAll('tr').forEach(tr=>{
      const c=[...tr.children].map(td=>td.textContent);
      rows.push(["Month",...c]);
    });
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`DaysWorked_${yearSel.value}.csv`; a.click();
    URL.revokeObjectURL(url);
  });

  // Init: fill years
  fillYearsSelect(yearSel);

  SessionStore.onChange(refresh);
  if (SessionStore.getAll().length) refresh();
})();

//// BEGIN:CALENDAR:JS ////
(function(){
  console.log('[Calendar] init block start');
  const btn = document.getElementById('kpiCalendar');
  const modal = document.getElementById('calendarModal');
  const btnCloseX = document.getElementById('calendarClose');
  const btnCloseFooter = document.getElementById('calendarCloseFooter');
  const host = document.getElementById('calendarHost');
  const yearSel = document.getElementById('calendarYearSelect');
  const titleEl = document.getElementById('calendarTitle');

  if (!btn || !modal || !host || !yearSel || !titleEl) {
    console.warn('[Calendar] Required elements not found (btn/modal/host/yearSel/title).');
    return;
  }

  let calendar = window.calendar || null;
  let unlisten = null;

  const calTabs = modal.querySelectorAll('.fm-tab');
  const calPanels = {
    calendar: modal.querySelector('#calPanel-calendar'),
    summary: modal.querySelector('#calPanel-summary'),
    planner: modal.querySelector('#calPanel-planner')
  };
  const fmFilters = document.getElementById('fmFilters');
  const farmSel = document.getElementById('fmFilterFarm');
  const fromInput = document.getElementById('fmYearFrom');
  const toInput = document.getElementById('fmYearTo');
  const exportBtn = document.getElementById('fmExportCSV');
  const genBtn = document.getElementById('fmGenerate');
  const lockChk = document.getElementById('fmLockPast');
  const lockWrap = document.getElementById('fmLockWrapper');
  const resetBtn = document.getElementById('fmResetFilters');
  const summaryBody = document.querySelector('#farmMonthsSummaryTable tbody');
  const plannerBody = document.querySelector('#farmMonthsPlannerTable tbody');
  const PREF_KEY = 'farmMonthsPrefs';
  let plannerData = {};
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear = new Date().getFullYear();

  const detailModal = document.getElementById('session-detail-modal');
  const detailBody = document.getElementById('session-detail-body');

  function showSessionDetail(lines){
    if (!detailModal || !detailBody){
      alert(lines.join('\n'));
      return;
    }
    detailBody.textContent = lines.join('\n');
    detailModal.setAttribute('aria-hidden','false');
  }

  function hideSessionDetail(){
    detailModal?.setAttribute('aria-hidden','true');
  }

  detailModal?.addEventListener('click', e => {
    if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) hideSessionDetail();
  });

  fillYearsSelect(yearSel);

  yearSel.addEventListener('change', () => {
    const year = Number(yearSel.value);
    if (calendar && !isNaN(year)) {
      const month = calendar.getDate().getMonth();
      calendar.gotoDate(new Date(year, month, 1));
    }
  });

  // Prefer existing parser if available
  const parseHours = (typeof window.parseHoursToDecimal === 'function')
    ? window.parseHoursToDecimal
    : function basicParseHours(input){
        if (!input) return 0;
        const s = String(input).trim().toLowerCase();
        const m = s.match(/^(\d+):(\d{1,2})$/); // H:MM
        if (m) return (+m[1]) + (+m[2]/60);
        const hm = s.match(/^(\d+)\s*h(?:ours?)?\s*(\d+)\s*m/i) || s.match(/^(\d+)h(\d+)m$/);
        if (hm) return (+hm[1]) + (+hm[2]/60);
        const hOnly = s.match(/^(\d+(?:\.\d+)?)\s*h/);
        if (hOnly) return +hOnly[1];
        const minOnly = s.match(/^(\d+)\s*m/);
        if (minOnly) return (+minOnly[1])/60;
        if (/^\d+(\.\d+)?$/.test(s)) return +s;
        return 0;
      };

  function computeHostHeight(){
    const header = modal.querySelector('.kpi-modal-header');
    const footer = modal.querySelector('.kpi-actions');
    const chrome = (header?.offsetHeight || 0) + (footer?.offsetHeight || 0);
    const cardMax = Math.floor(window.innerHeight * 0.96); // match card max-height
    const h = Math.max(360, cardMax - chrome);
    host.style.height = h + 'px';
  }

  // Convert sessions to FullCalendar events
  function sessionsToEvents(docs){
    const events = [];
    for (const doc of (docs || [])) {
      const s = (typeof doc?.data === 'function') ? doc.data() : doc?.data;
      if (!s) continue;
      const ymd = (typeof getSessionDateYMD === 'function') ? getSessionDateYMD(s) : null;
      if (!ymd) continue;
      const farm = (typeof pickFarmName === 'function') ? pickFarmName(s) : 'Farm';
      const sheep = (typeof sumSheep === 'function') ? sumSheep(s) : 0;

      events.push({
        title: `${farm} — ${Number(sheep).toLocaleString()} sheep`,
        start: ymd,
        allDay: true,
        extendedProps: {
          farm,
          sheep,
          teamLeader: s.teamLeader || '',
          startTime: s.startTime || s.start || '',
          finishTime: s.finishTime || s.finish || '',
          raw: s
        }
      });
    }
    return events;
  }

  // Add numeric date badges to list view headers and dark theme polish
  function decorateListHeaders(){
    if (!calendar) return;
    // Only for list views
    const viewType = calendar.view?.type || '';
    if (!/list/.test(viewType)) return;

    const cushions = host.querySelectorAll('.fc-list-day-cushion');
    cushions.forEach(cushion => {
      // Remove old badge if present (idempotent)
      cushion.querySelectorAll('.fc-daynum-badge').forEach(b => b.remove());

      // Anchor usually carries the date attr
      const a = cushion.querySelector('a[data-date]') || cushion.querySelector('a');
      const dateStr = a?.getAttribute?.('data-date');
      if (!dateStr) return;

      const d = new Date(dateStr);
      if (isNaN(d)) return;
      const dayNum = d.getDate();

      const badge = document.createElement('span');
      badge.className = 'fc-daynum-badge';
      badge.textContent = String(dayNum);

      // Insert badge at the start of the cushion content
      cushion.firstChild ? cushion.insertBefore(badge, cushion.firstChild) : cushion.appendChild(badge);
    });
  }

  function loadPrefs(){
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if(p.farm) farmSel.value = p.farm;
      fromInput.value = p.from || `${currentYear}-01`;
      toInput.value = p.to || `${currentYear}-12`;
    } catch(e){
      fromInput.value = `${currentYear}-01`;
      toInput.value = `${currentYear}-12`;
    }
  }
  function savePrefs(){
    const p = {
      farm: farmSel.value,
      from: fromInput.value,
      to: toInput.value
    };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch(e){}
  }

  function updateFilterIndicators(){
    if(farmSel) farmSel.classList.toggle('filter-active', farmSel.value !== '__ALL__');
    if(fromInput) fromInput.classList.toggle('filter-active', fromInput.value !== `${currentYear}-01`);
    if(toInput) toInput.classList.toggle('filter-active', toInput.value !== `${currentYear}-12`);
  }

  function getEvents(){
    if(!window.calendar || typeof window.calendar.getEvents !== 'function') return [];
    const ev = window.calendar.getEvents();
    const fromYear = parseInt(fromInput.value.slice(0,4));
    const toYear = parseInt(toInput.value.slice(0,4));
    return ev.filter(e => {
      const d = e.start; if(!d) return false;
      const y = d.getFullYear();
      if(y < fromYear || y > toYear) return false;
      const farm = e.extendedProps?.farm || e.extendedProps?.station || 'Unknown';
      if(farmSel.value !== '__ALL__' && farmSel.value !== farm) return false;
      return true;
    });
  }

  function populateFilters(events){
    const farms = new Set();
    events.forEach(e => {
      if(e.extendedProps?.farm) farms.add(e.extendedProps.farm);
    });
    function fill(sel, set){
      const cur = sel.value;
      sel.innerHTML = '<option value="__ALL__">All</option>';
      Array.from(set).sort().forEach(v => {
        const o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
      });
      sel.value = cur || '__ALL__';
    }
    fill(farmSel, farms);
  }

  function renderSummary(){
    const events = getEvents();
    populateFilters(events);
    const data = {};
    events.forEach(e => {
      const farm = e.extendedProps?.farm || e.extendedProps?.station || 'Unknown';
      const month = e.start.getMonth();
      const sheep = Number(e.extendedProps?.totalSheep || e.extendedProps?.sheep || 0);
      if(!data[farm]) data[farm] = Array(12).fill(0).map(()=>({days:0,sheep:0}));
      data[farm][month].days += 1;
      data[farm][month].sheep += sheep;
    });
    summaryBody.innerHTML = '';
    Object.keys(data).sort().forEach(f => {
      const tr=document.createElement('tr');
      const th=document.createElement('th'); th.textContent=f; tr.appendChild(th);
      data[f].forEach(cell => {
        const td=document.createElement('td');
        if(cell.days===0 && cell.sheep===0){
          td.textContent='—';
          td.classList.add('heat-level-0');
        } else {
          td.textContent=`${cell.days}d / ${cell.sheep}`;
          let lvl;
          if (cell.days <= 2) lvl = 1;
          else if (cell.days <= 4) lvl = 2;
          else if (cell.days <= 6) lvl = 3;
          else if (cell.days <= 9) lvl = 4;
          else lvl = 5;
          td.classList.add('heat-level-'+lvl);
        }
        tr.appendChild(td);
      });
      summaryBody.appendChild(tr);
    });
  }

  function generateDraft(){
    const events = getEvents();
    const data = {};
    events.forEach(e => {
      const farm = e.extendedProps?.farm || e.extendedProps?.station || 'Unknown';
      const month = e.start.getMonth();
      const year = e.start.getFullYear();
      const sheep = Number(e.extendedProps?.totalSheep || e.extendedProps?.sheep || 0);
      if(!data[farm]) data[farm] = Array(12).fill(0).map(()=>({days:0,sheep:0,years:new Set()}));
      const cell=data[farm][month];
      cell.days += 1;
      cell.sheep += sheep;
      cell.years.add(year);
    });
    plannerData = {};
    Object.keys(data).forEach(f => {
      plannerData[f] = Array(12).fill(0).map(()=>({days:0,sheep:0}));
      data[f].forEach((cell,i) => {
        const yrs = cell.years.size || 1;
        plannerData[f][i].days = Math.round(cell.days / yrs);
        plannerData[f][i].sheep = Math.round(cell.sheep / yrs);
      });
    });
    renderPlannerTable();
  }

  function renderPlannerTable(){
    plannerBody.innerHTML = '';
    const plannerYear = currentYear + 1;
    Object.keys(plannerData).sort().forEach(f => {
      const tr=document.createElement('tr');
      const th=document.createElement('th'); th.textContent=f; tr.appendChild(th);
      plannerData[f].forEach((cell,idx) => {
        const td=document.createElement('td');
        td.dataset.farm=f; td.dataset.month=idx;
        td.contentEditable = !(lockChk.checked && plannerYear === currentYear && idx < (new Date()).getMonth());
        if(cell.days || cell.sheep) td.textContent = `${cell.days}d / ${cell.sheep}`;
        if(cell.days >= 8) td.classList.add('busy');
        td.addEventListener('input', onEditCell);
        tr.appendChild(td);
      });
      plannerBody.appendChild(tr);
    });
  }

  function onEditCell(e){
    const td=e.target;
    const f=td.dataset.farm;
    const m=Number(td.dataset.month);
    const val=td.textContent.trim();
    const match=val.match(/(\d+)d\s*\/\s*(\d+)/i);
    let days=0, sheep=0;
    if(match){ days=parseInt(match[1],10); sheep=parseInt(match[2],10); }
    plannerData[f][m]={days,sheep};
    if(days>=8) td.classList.add('busy'); else td.classList.remove('busy');
  }

  function exportCSV(){
    const rows=[[ 'Farm', ...months ]];
    summaryBody.querySelectorAll('tr').forEach(tr => {
      const cols=[tr.querySelector('th').textContent.trim()];
      tr.querySelectorAll('td').forEach(td=>cols.push(td.textContent.trim()));
      rows.push(cols.join(','));
    });
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='farm-month-summary.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function showTab(id){
    calTabs.forEach(t=>t.classList.remove('is-active'));
    calTabs.forEach(t=>{ if(t.dataset.tab===id) t.classList.add('is-active'); });
    Object.keys(calPanels).forEach(k=>calPanels[k].hidden = (k!==id));
    fmFilters.hidden = (id==='calendar');
    exportBtn.hidden = (id!=='summary');
    genBtn.hidden = lockWrap.hidden = (id!=='planner');
    if(titleEl){
      if(id==='planner') titleEl.textContent = `Draft Plan for ${currentYear + 1}`;
      else if(id==='summary') titleEl.textContent = 'Yearly Calendar Overview';
      else titleEl.textContent = 'Sessions Calendar';
    }
    if(id==='summary') renderSummary();
    if(id==='planner') {
      if(!Object.keys(plannerData).length) generateDraft();
      else renderPlannerTable();
    }
  }

  function refreshActive(){
    const active = modal.querySelector('.fm-tab.is-active')?.dataset.tab;
    if(active==='summary') renderSummary();
    if(active==='planner') renderPlannerTable();
  }

  function ensureCalendar(){
    if (calendar) return;
    if (typeof FullCalendar === 'undefined') {
      console.error('[Calendar] FullCalendar not loaded.');
      return;
    }
    calendar = new FullCalendar.Calendar(host, {
      initialView: (window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth'),
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
      height: '100%',
      contentHeight: 'auto',
      firstDay: 1, // Monday (NZ)
      dayMaxEvents: true,
      eventDisplay: 'block',
      allDayText: '', // remove label entirely
      datesSet(){ // runs on initial render & when navigating months or changing views
        decorateListHeaders();
        if (yearSel && calendar) {
          yearSel.value = String(calendar.getDate().getFullYear());
        }
      },
      viewDidMount(){ // extra safety
        decorateListHeaders();
      },
      eventClick(info){
        const e = info.event.extendedProps || {};
        const lines = [
          e.farm || 'Farm',
          `${(e.sheep||0).toLocaleString()} sheep`,
          `Date: ${info.event.startStr}`
        ];
        if (e.teamLeader) lines.push(`Team Leader: ${e.teamLeader}`);
        if (e.startTime) lines.push(`Start Time: ${e.startTime}`);
        if (e.finishTime) lines.push(`Finish Time: ${e.finishTime}`);
        showSessionDetail(lines);
      }
    });
    window.calendar = calendar;

    // Seed with cached sessions if available
    try {
      const cached = (typeof SessionStore?.getAll === 'function') ? SessionStore.getAll() : [];
      calendar.addEventSource(sessionsToEvents(cached));
    } catch (e) { console.warn('[Calendar] preload events failed', e); }
  }

  function onResize(){
    computeHostHeight();
    if (calendar) {
      const want = (window.innerWidth < 640) ? 'listMonth' : 'dayGridMonth';
      if (calendar.view.type !== want) calendar.changeView(want);
      calendar.updateSize();
      decorateListHeaders();
    }
  }

  function openCalendarModal(){
    console.log('[Calendar] open');
    loadPrefs();
    updateFilterIndicators();
    showTab('calendar');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    computeHostHeight();
    requestAnimationFrame(() => {
      ensureCalendar();
      if (calendar) {
        calendar.render();
        calendar.rerenderEvents();
        setTimeout(() => {
          calendar.updateSize();
          decorateListHeaders();
        }, 40); // iOS Safari safety tick
      }
    });

    // Live updates
    if (!unlisten && typeof SessionStore?.onChange === 'function') {
      unlisten = SessionStore.onChange(docs => {
        try {
          const events = sessionsToEvents(docs);
          if (calendar) {
            calendar.removeAllEvents();
            calendar.addEventSource(events);
            calendar.updateSize();
            decorateListHeaders();
          }
        } catch (e) { console.warn('[Calendar] onChange update failed', e); }
      });
    }

    window.addEventListener('resize', onResize, { passive:true });
    window.addEventListener('orientationchange', onResize, { passive:true });
  }

  function closeCalendarModal(){
    if (typeof unlisten === 'function') {
      unlisten();
      unlisten = null;
    }
    console.log('[Calendar] close');
    modal.hidden = true;
    document.body.style.overflow = '';
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    savePrefs();
  }

  btn.addEventListener('click', openCalendarModal);
  btnCloseX?.addEventListener('click', closeCalendarModal);
  btnCloseFooter?.addEventListener('click', closeCalendarModal);
  modal.addEventListener('click', (e)=>{
    if (e.target === modal) closeCalendarModal();
  });
  calTabs.forEach(tab=>tab.addEventListener('click',()=>showTab(tab.dataset.tab)));
  exportBtn?.addEventListener('click', exportCSV);
  genBtn?.addEventListener('click', generateDraft);
  lockChk?.addEventListener('change', renderPlannerTable);
  [farmSel, fromInput, toInput].forEach(el=>el?.addEventListener('change', ()=>{savePrefs();refreshActive();updateFilterIndicators();}));
  resetBtn?.addEventListener('click', ()=>{
    farmSel.value='__ALL__';
    fromInput.value=`${currentYear}-01`;
    toInput.value=`${currentYear}-12`;
    savePrefs();
    updateFilterIndicators();
    refreshActive();
  });

  console.log('[Calendar] init block ready');
})();
//// END:CALENDAR:JS ////

