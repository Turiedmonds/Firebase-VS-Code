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

    let shearersUnsub = null;
    let colRef = null;
    let cachedSessions = [];
    let cachedRows = [];
    let cachedGrandTotal = 0;
    let renderPending = false;

    function renderFromCache() {
      if (!cachedSessions.length) {
        listEl.innerHTML = '';
        modalBodyTbody.innerHTML = '';
        return;
      }
      const workType = tabs.querySelector('.siq-segmented__btn.is-active')?.dataset.worktype || 'shorn';
      const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
      const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
      const { rows, grandTotal } = aggregateShearers(cachedSessions, mode, year, workType);
      cachedRows = rows;
      cachedGrandTotal = grandTotal;
      renderTop5Shearers(rows, listEl);
      renderFullShearers(rows, grandTotal, modalBodyTbody);
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
      if (v === 'all' || v === '12m') {
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

    const onSnap = snap => {
      const sessions = [];
      snap.forEach(doc => sessions.push(doc));
      cachedSessions = sessions;
      const years = deriveYearsFromSessions(sessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;
      scheduleRender();
    };
    const onError = err => {
      console.error('[Top5Shearers] listener error:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    };

    try {
      const db = firebase.firestore ? firebase.firestore() : (typeof getFirestore === 'function' ? getFirestore() : null);
      if (!db) throw new Error('Firestore not initialized');
      colRef = db.collection('contractors').doc(contractorId).collection('sessions');
      shearersUnsub = colRef.onSnapshot(onSnap, onError);
    } catch (err) {
      console.error('[Top5Shearers] init failed:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (shearersUnsub) {
          shearersUnsub();
          shearersUnsub = null;
        }
      } else if (!shearersUnsub && colRef) {
        shearersUnsub = colRef.onSnapshot(onSnap, onError);
      }
    });
    window.addEventListener('beforeunload', () => {
      if (shearersUnsub) shearersUnsub();
    });
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

    function parseHoursToDecimal(v) {
      if (v == null) return 0;
      if (typeof v === 'number') {
        if (!isFinite(v)) return 0;
        if (v > 24) return v / 60; // assume minutes
        return v; // assume hours
      }
      const s = String(v).trim().toLowerCase();
      if (!s) return 0;
      const hm = s.match(/^([0-9]+)h\s*([0-9]+)m$/);
      if (hm) {
        return Number(hm[1]) + Number(hm[2])/60;
      }
      const colon = s.match(/^([0-9]+):([0-9]+)$/);
      if (colon) {
        return Number(colon[1]) + Number(colon[2])/60;
      }
      const minutes = s.match(/^([0-9]+)m$/);
      if (minutes) {
        return Number(minutes[1]) / 60;
      }
      const n = Number(s);
      if (!isNaN(n)) {
        if (n > 24) return n / 60;
        return n;
      }
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

    function renderTop5ShedStaff(rows) {
      const top5 = rows.slice(0,5);
      const max = Math.max(1, ...top5.map(r => r.total));
      listEl.innerHTML = top5.map((r, idx) => {
        const pct = Math.round((r.total / max) * 100);
        return `
      <div class="siq-lb-row">
        <div class="siq-lb-rank">${idx + 1}</div>
        <div class="siq-lb-bar">
          <div class="siq-lb-fill" style="width:${pct}%;"></div>
          <div class="siq-lb-name" title="${r.name}">${r.name}</div>
        </div>
        <div class="siq-lb-value">${r.total.toFixed(2)} h</div>
      </div>
    `;
      }).join('');
    }

    function renderFullShedStaff(rows, tableBody) {
      tableBody.innerHTML = rows.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td>${r.total.toFixed(2)}</td>
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

    let staffUnsub = null;
    let colRef = null;
    let cachedSessions = [];
    let renderPending = false;

    function renderFromCache() {
      if (!cachedSessions.length) {
        listEl.innerHTML = '';
        modalBodyTbody.innerHTML = '';
        return;
      }
      const mode = (viewSel.value === 'year') ? 'year' : (viewSel.value || '12m');
      const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
      const rows = aggregateStaff(cachedSessions, mode, year);
      renderTop5ShedStaff(rows);
      renderFullShedStaff(rows, modalBodyTbody);
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
      if (v === 'all' || v === '12m') yearSel.hidden = true;
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

    const onSnap = snap => {
      const sessions = [];
      snap.forEach(doc => sessions.push(doc));
      cachedSessions = sessions;
      const years = deriveYearsFromSessions(sessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (viewSel.value !== 'year') yearSel.hidden = true;
      scheduleRender();
    };
    const onError = err => {
      console.error('[Top5ShedStaff] listener error:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    };

    try {
      const db = firebase.firestore ? firebase.firestore() : (typeof getFirestore === 'function' ? getFirestore() : null);
      if (!db) throw new Error('Firestore not initialized');
      colRef = db.collection('contractors').doc(contractorId).collection('sessions');
      staffUnsub = colRef.onSnapshot(onSnap, onError);
    } catch (err) {
      console.error('[Top5ShedStaff] init failed:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (staffUnsub) { staffUnsub(); staffUnsub = null; }
      } else if (!staffUnsub && colRef) {
        staffUnsub = colRef.onSnapshot(onSnap, onError);
      }
    });
    window.addEventListener('beforeunload', () => { if (staffUnsub) staffUnsub(); });
  })();
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

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

      // After setting contractor_id and after showing the page content:
      if (typeof initTop5ShearersWidget === 'function') {
        try { initTop5ShearersWidget(); } catch (e) { console.error('[Dashboard] initTop5ShearersWidget failed:', e); }
      }
      if (typeof initTop5ShedStaffWidget === 'function') {
        try { initTop5ShedStaffWidget(); } catch (e) { console.error('[Dashboard] initTop5ShedStaffWidget failed:', e); }
      }
    } catch (err) {
      console.error('Failed to fetch contractor profile', err);
      const subheading = document.getElementById('dashboard-subheading');
      if (subheading) {
        subheading.textContent = 'Welcome back, Contractor';
      }
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
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
    { sel: '#top5-shedstaff', text: 'Top 5 Shed Staff — see hours worked and days on site.' },
    { sel: '#btnManageStaff', text: 'Manage Staff — add/remove users and see online status.' },
    { sel: '#farm-summary-btn', text: 'Farm Summary — compare farm totals and visits.' },
    { sel: '#btnViewSavedSessions', text: 'Saved Sessions — reopen previous tally days.' },
    { sel: '#btnReturnToActive', text: 'Return to Active Session — jump back into an unfinished tally (shown only when a session exists).', optional: true },
    { sel: '#btnStartNewDay', text: 'Start New Day — begin today’s tally.' },
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
