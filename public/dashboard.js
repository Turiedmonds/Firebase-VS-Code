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

import { handleLogout } from './auth.js';

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
  const d = session?.date;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return toYMDFromSavedAt(session?.savedAt);
}

function sumSheep(session) {
  let total = 0;
  if (Array.isArray(session?.shearerCounts)) {
    for (const sc of session.shearerCounts) {
      const n = Number(sc?.total);
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

  return {
    start(id, { monthsLive = 12 } = {}) {
      contractorId = id;
      if (started || !id) return;
      const db = firebase.firestore ? firebase.firestore() : (typeof getFirestore === 'function' ? getFirestore() : null);
      if (!db) return;
      const colRef = db.collection('contractors').doc(id).collection('sessions');
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsLive);
      const ts = firebase.firestore.Timestamp.fromDate(cutoff);
      console.info('[SessionStore] start listener');
      unsub = colRef.where('savedAt', '>=', ts).onSnapshot(snap => {
        let changed = false;
        for (const change of snap.docChanges()) {
          const idx = cache.findIndex(d => d.id === change.doc.id);
          if (change.type === 'removed' && idx !== -1) {
            cache.splice(idx, 1);
            changed = true;
          } else if (change.type === 'modified' && idx !== -1) {
            cache[idx] = change.doc;
            changed = true;
          } else if (change.type === 'added' && idx === -1) {
            cache.push(change.doc);
            changed = true;
          }
        }
        if (changed) notify();
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
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const ts = firebase.firestore.Timestamp.fromDate(cutoff);
      colRef.where('savedAt', '<', ts).get().then(snap => {
        const existing = new Set(cache.map(d => d.id));
        snap.forEach(doc => { if (!existing.has(doc.id)) cache.push(doc); });
        loadedAllTime = true;
        notify();
      }).catch(err => console.error('[SessionStore] loadAllTimeOnce error:', err));
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

function renderCachedTop5Widgets() {
  const shearersEl = document.querySelector('#top5-shearers #top5-shearers-list');
  if (shearersEl) {
    if (dashCache.top5Shearers && dashCache.top5Shearers.length) {
      renderTop5Shearers(dashCache.top5Shearers, shearersEl);
      dashCacheRendered.shearers = true;
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
    } else {
      renderSkeletonRows(shedStaffEl);
    }
  }
  const farmsEl = document.querySelector('#top5-farms #top5-farms-list');
  if (farmsEl) {
    if (dashCache.top5Farms && dashCache.top5Farms.length) {
      renderTop5Farms(dashCache.top5Farms, farmsEl);
      dashCacheRendered.farms = true;
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
      const sessionDate = sessionDateToJS(s.date || s.sessionDate || s.createdAt);

      // Preferred path: shearerCounts[].stands[] + session.stands name map
      if (Array.isArray(s.shearerCounts)) {
        const nameByIndex = buildStandIndexNameMap(s);

        for (const row of s.shearerCounts) {
          const sheepType = row?.sheepType || '';
          const perStand = Array.isArray(row?.stands) ? row.stands : [];
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
          const shearerName = sh.name || sh.shearerName || sh.displayName || sh.id || 'Unknown';
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
        const dt = sessionDateToJS(s.date || s.sessionDate || s.createdAt);
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
        scheduleRender();
      });

      const years = deriveYearsFromSessions(cachedSessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;

      function renderFromCache() {
        if (!cachedSessions.length) {
          if (!(dashCache.top5Shearers && dashCache.top5Shearers.length)) {
            listEl.innerHTML = '';
            modalBodyTbody.innerHTML = '';
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


    function normalizeName(name) {
      if (!name) return '';
      const t = String(name).trim().replace(/\s+/g, ' ');
      const parts = t.split(' ');
      return parts.map(p => p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '').join(' ');
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
          listEl.innerHTML = '';
          modalBodyTbody.innerHTML = '';
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
    const modal = document.getElementById('farms-full-modal');
    const modalBodyTbody = document.querySelector('#farms-full-table tbody');
    if (!listEl || !viewSel || !yearSel || !viewAllBtn || !modal || !modalBodyTbody) {
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
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    function aggregateFarms(sessions, mode, year) {
      const { start, end } = getDateRange(mode, year);
      const totals = new Map();
      const visits = new Map();
      const lastDate = new Map();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const sheep = sumSheep(s);
        const farm = pickFarmName(s);
        if (!sheep || !farm || farm === 'Unknown') continue;
        const date = getSessionDateYMD(s);
        if (mode !== 'all') {
          const dt = sessionDateToJS(date);
          if (!dt) continue;
          if (start && dt < start) continue;
          if (end && dt > end) continue;
        }
        totals.set(farm, (totals.get(farm) || 0) + sheep);
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
        .sort((a,b) => b.sheep - a.sheep);
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
        scheduleRender();
      });

      const years = deriveYearsFromSessions(cachedSessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;

    function renderFromCache() {
      if (!cachedSessions.length) {
        if (!(dashCache.top5Farms && dashCache.top5Farms.length)) {
          listEl.innerHTML = '';
          modalBodyTbody.innerHTML = '';
        }
        return;
      }
      const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
      const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
        const rows = aggregateFarms(cachedSessions, mode, year);
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
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  if (!(window.firebase && typeof firebase.auth === 'function')) {
    showOfflineNotice();
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

      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
      }

      const btnManageStaff = document.getElementById('btnManageStaff');
      if (btnManageStaff) {
        btnManageStaff.addEventListener('click', () => {
          window.location.href = 'manage-staff.html';
        });
      }

      const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
      if (btnViewSavedSessions) {
        btnViewSavedSessions.addEventListener('click', () => {
          window.location.href = 'view-sessions.html';
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
          window.location.href = 'tally.html';
        });
      }

      const btnStartNewDay = document.getElementById('btnStartNewDay');
      if (btnStartNewDay) {
        btnStartNewDay.addEventListener('click', () => {
          sessionStorage.setItem('launch_override', 'tally');
          window.location.href = 'tally.html?newDay=true';
        });
      }

      const btnChangePin = document.getElementById('btnChangePin');
        if (btnChangePin) {
          btnChangePin.addEventListener('click', () => {
            window.location.href = 'change-pin.html';
          });
        }

        SessionStore.start(user.uid, { monthsLive: 12 });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            SessionStore.stop();
          } else {
            SessionStore.start(user.uid, { monthsLive: 12 });
          }
        });
        window.addEventListener('beforeunload', () => { SessionStore.stop(); });

        // After setting contractor_id and after showing the page content:
      if (typeof initTop5ShearersWidget === 'function') {
        try { initTop5ShearersWidget(); } catch (e) { console.error('[Dashboard] initTop5ShearersWidget failed:', e); }
      }
      if (typeof initTop5ShedStaffWidget === 'function') {
        try { initTop5ShedStaffWidget(); } catch (e) { console.error('[Dashboard] initTop5ShedStaffWidget failed:', e); }
      }
      if (typeof initTop5FarmsWidget === 'function') {
        try { initTop5FarmsWidget(); } catch (e) { console.error('[Dashboard] initTop5FarmsWidget failed:', e); }
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
    { sel: '#top5-shearers', text: 'Top 5 Shearers — tap “View Full List” to see rankings.' },
    { sel: '#btnManageStaff', text: 'Manage Staff — add/remove users and see online status.' },
    { sel: '#btnViewSavedSessions', text: 'Saved Sessions — reopen previous tally days.' },
    { sel: '#btnReturnToActive', text: 'Return to Active Session — jump back into an unfinished tally (shown only when a session exists).', optional: true },
    { sel: '#btnStartNewDay', text: 'Start New Day — begin today’s tally.' },
    { sel: '#farm-summary-btn', text: 'Farm Summary — compare farm totals and visits.' },
    { sel: '#btnChangePin', text: 'Change Contractor PIN — secure control for edits.' },
    { sel: '#btnSettings', text: 'Settings / Preferences — coming soon (not yet enabled).' },
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
    if (localStorage.getItem('dashboard_welcome_enabled') === 'false') return;
    if (localStorage.getItem('dashboard_welcome_done') === 'true') return;
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

  // Ensure defaults
  if (localStorage.getItem(K_WELCOME_ENABLED) == null) localStorage.setItem(K_WELCOME_ENABLED, 'true');
  if (localStorage.getItem(K_TOUR_ENABLED)    == null) localStorage.setItem(K_TOUR_ENABLED, 'true');

  // Modal elements
  const overlay   = document.getElementById('dashboard-welcome-overlay');
  const modal     = document.getElementById('dashboard-welcome-modal');
  const cbDont    = document.getElementById('dw-dont-show');
  const cbWelM    = document.getElementById('dw-enable-welcome');
  const cbTourM   = document.getElementById('dw-enable-tour');
  const btnSaveM  = document.getElementById('dw-save');
  const btnStartM = document.getElementById('dw-start');

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
      tourEnabled:    localStorage.getItem(K_TOUR_ENABLED) !== 'false'
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
  // Call once at load so UI matches storage
  syncModalFromPrefs();
  syncHelpFromPrefs();

  // --- Persist from UI (Modal) ---
  function persistFromModal({lockDone=false} = {}){
    const next = {};
    if (cbWelM)  next.welcomeEnabled = !!cbWelM.checked;
    if (cbTourM) next.tourEnabled    = !!cbTourM.checked;
    if (lockDone && cbDont) next.welcomeDone = !!cbDont.checked;
    setPrefs(next);
    // reflect to help menu
    syncHelpFromPrefs();
  }

  // --- Persist from UI (Help) ---
  function persistFromHelp(){
    const next = {};
    if (cbWelH)  next.welcomeEnabled = !!cbWelH.checked;
    if (cbTourH) next.tourEnabled    = !!cbTourH.checked;
    setPrefs(next);
    // reflect to modal
    syncModalFromPrefs();
  }

  // AUTOSAVE on checkbox changes (both places), so choices “stick” even if user closes without pressing Save
  cbWelM?.addEventListener('change', () => persistFromModal());
  cbTourM?.addEventListener('change', () => persistFromModal());
  cbDont?.addEventListener('change', () => persistFromModal({lockDone:true}));

  cbWelH?.addEventListener('change', persistFromHelp);
  cbTourH?.addEventListener('change', persistFromHelp);

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

  // Extract tallies from a session; adjust to your schema
  function iterTallies(session, fn){
    // Example shapes supported:
    // - session.shearers[ i ].runs[ j ].tally with .sheepType and .count
    // - session.tallies[ ... ] with .sheepType and .count
    if (Array.isArray(session?.shearers)) {
      session.shearers.forEach(sh => {
        (sh.runs || []).forEach(run => {
          const type = run?.sheepType ?? run?.type ?? 'Unknown';
          const count = Number(run?.tally ?? run?.count ?? 0);
          if (count) fn(type, count, session.farmName, session.date || session.savedAt);
        });
      });
    }
    if (Array.isArray(session?.tallies)) {
      session.tallies.forEach(t => {
        const type = t?.sheepType ?? t?.type ?? 'Unknown';
        const count = Number(t?.count ?? 0);
        if (count) fn(type, count, session.farmName, session.date || session.savedAt);
      });
    }
  }

  function aggregate(sessions, farmFilter){
    const farmsSet = new Set();
    const byTypeFull = new Map();   // type -> { total, farms:Set, topFarm:{name, day, count} }
    const byTypeCrut = new Map();
    let totalFull = 0, totalCrut = 0;

    const perFarmDay = new Map(); // key `${farm}|${dayISO}` -> sum that day

    sessions.forEach(s => {
      const farm = s.farmName || 'Unknown Farm';
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

        // track top farm/day per type
        const day = toDayIso(dateTs);
        const k = `${farmName}|${day}`;
        const prev = perFarmDay.get(k) || 0;
        perFarmDay.set(k, prev + count);
      });
    });

    // Compute top farm/day per type (approximation using perFarmDay totals)
    function computeTopFarm(typeMap){
      // We’ll assign top farm/day globally per map, then each row can show it (simple for v1)
      // More precise per-type/day can be added later if needed.
      let top = { farm: '-', day: '-', count: 0 };
      perFarmDay.forEach((count, key) => {
        if (count > top.count) {
          const [farm, day] = key.split('|');
          top = { farm, day, count };
        }
      });
      // Attach same global top as reference (keeps UI simple)
      typeMap.forEach(v => { v.topFarm = top; });
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

  function toDayIso(ts){
    const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
    // normalise to YYYY-MM-DD (NZ local assumed OK for v1)
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function renderTable(tbody, rows){
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

  function updatePill(value){
    pillVal.textContent = Number(value || 0).toLocaleString();
  }

  function fillYearsSelect(){
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 6; y--) years.push(y);
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(thisYear);
  }

  async function refresh(){
    const year = Number(yearSel.value || new Date().getFullYear());
    const farm = farmSel.value || '__ALL__';
    const sessions = await fetchSessionsForYear(year);
    const agg = aggregate(sessions, farm);
    updatePill(agg.totalFull);

    // Populate farm list (keep current selection if possible)
    const current = farmSel.value;
    farmSel.innerHTML = `<option value="__ALL__">All farms</option>` + agg.farms.map(f=>`<option value="${f}">${f}</option>`).join('');
    if (agg.farms.includes(current)) farmSel.value = current;

    renderTable(tblFull, agg.fullArr);
    renderTable(tblCrutched, agg.crutArr);
  }

  // Open/close modal
  function openModal(){ modal.hidden = false; refresh(); }
  function closeModal(){ modal.hidden = true; }

  // Wire up
  if (pill) pill.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeBtnFooter) closeBtnFooter.addEventListener('click', closeModal);
  if (yearSel) yearSel.addEventListener('change', refresh);
  if (farmSel) farmSel.addEventListener('change', refresh);

  // CSV export (current tables)
  exportBtn?.addEventListener('click', () => {
    const rows = [['Section','Sheep Type','Total','Percent','Farms','Top Farm (day)']];
    document.querySelectorAll('#kpiFullSheepTable tbody tr').forEach(tr=>{
      const cells=[...tr.children].map(td=>td.textContent.trim());
      rows.push(['Full Sheep', ...cells]);
    });
    document.querySelectorAll('#kpiCrutchedTable tbody tr').forEach(tr=>{
      const cells=[...tr.children].map(td=>td.textContent.trim());
      rows.push(['Crutched', ...cells]);
    });
    const csv = rows.map(r=>r.map(v=>`"${v.replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SheepCount_${yearSel.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initial draw (fill years + pill value)
  fillYearsSelect();
  refresh();
})();
