import { handleLogout } from './auth.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
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

function initTop5StaffWidget() {
  (function () {
    const rootEl = document.getElementById('top5-staff');
    if (!rootEl) return;

    // Resolve contractor scope same as Shearers
    let contractorId = localStorage.getItem('contractor_id');
    if (!contractorId && firebase?.auth?.currentUser?.uid) {
      contractorId = firebase.auth().currentUser.uid;
      try { localStorage.setItem('contractor_id', contractorId); } catch {}
    }
    if (!contractorId) return;

    const listEl = rootEl.querySelector('#top5-staff-list');
    const viewSel = rootEl.querySelector('#staff-view');
    const yearSel = rootEl.querySelector('#staff-year');
    const viewAllBtn = rootEl.querySelector('#staff-viewall');
    const modal = document.getElementById('staff-modal');
    const fullListEl = document.getElementById('staff-full-list');
    if (!listEl || !viewSel || !yearSel || !viewAllBtn || !modal || !fullListEl) return;

    // Helpers (same pattern as Shearers)
    function sessionDateToJS(d) {
      if (!d) return null;
      if (typeof d === 'object' && d.toDate) return d.toDate();
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    function getDateRange(mode, year) {
      const today = new Date();
      if (mode === '12m') {
        const end = today, start = new Date(); start.setDate(start.getDate() - 365);
        return { start, end };
      }
      if (mode === 'year' && year) {
        const start = new Date(Number(year), 0, 1, 0, 0, 0);
        const end = new Date(Number(year), 11, 31, 23, 59, 59);
        return { start, end };
      }
      return { start: null, end: null };
    }

    // Iterate staff hours across supported shapes
    function* iterateStaffHoursFromSession(sessionDoc) {
      const s = sessionDoc.data ? sessionDoc.data() : sessionDoc;
      const dt = sessionDateToJS(s.date || s.sessionDate || s.createdAt);

      if (Array.isArray(s.shedStaff)) {
        for (const st of s.shedStaff) {
          const name = (st?.name || st?.staffName || st?.displayName || '').trim();
          const hours = Number(st?.hours ?? st?.totalHours ?? st?.hoursWorked ?? 0);
          if (name && hours > 0) yield { name, hours, date: dt };
        }
        return;
      }
      if (Array.isArray(s.staffCounts)) {
        for (const row of s.staffCounts) {
          const name = (row?.name || row?.staffName || '').trim();
          const hours = Number(row?.hours ?? row?.totalHours ?? 0);
          if (name && hours > 0) yield { name, hours, date: dt };
        }
        return;
      }
      if (s.staffHours && typeof s.staffHours === 'object') {
        for (const [nameRaw, val] of Object.entries(s.staffHours)) {
          const name = String(nameRaw).trim();
          const hours = Number(val);
          if (name && hours > 0) yield { name, hours, date: dt };
        }
        return;
      }
      if (Array.isArray(s.staff)) {
        for (const st of s.staff) {
          const name = (st?.name || st?.staffName || '').trim();
          const hours = Number(st?.hoursWorked ?? st?.hours ?? 0);
          if (name && hours > 0) yield { name, hours, date: dt };
        }
      }
    }

    function deriveYearsFromSessions(sessions) {
      const years = new Set();
      for (const doc of sessions) {
        const s = doc.data ? doc.data() : doc;
        const d = sessionDateToJS(s.date || s.sessionDate || s.createdAt);
        if (d) years.add(d.getFullYear());
      }
      const arr = Array.from(years).sort((a, b) => b - a);
      const current = (new Date()).getFullYear();
      if (!arr.includes(current)) arr.unshift(current);
      return arr;
    }

    function aggregateStaff(sessions, mode, year) {
      const { start, end } = getDateRange(mode, year);
      const totals = new Map(); // name -> total hours
      for (const doc of sessions) {
        for (const e of iterateStaffHoursFromSession(doc)) {
          if (!e || !e.name) continue;
          if (mode !== 'all') {
            if (!e.date) continue;
            if (start && e.date < start) continue;
            if (end && e.date > end) continue;
          }
          totals.set(e.name, (totals.get(e.name) || 0) + (e.hours || 0));
        }
      }
      return Array.from(totals.entries())
        .map(([name, hours]) => ({ name, hours }))
        .sort((a, b) => b.hours - a.hours);
    }

    function renderRows(rows, container, limit = null) {
      const slice = limit ? rows.slice(0, limit) : rows;
      const max = Math.max(1, ...slice.map(r => r.hours));
      container.innerHTML = slice.map((r, idx) => {
        const pct = Math.round((r.hours / max) * 100);
        return `
          <div class="siq-lb-row">
            <div class="siq-lb-rank">${idx + 1}</div>
            <div class="siq-lb-bar">
              <div class="siq-lb-fill" style="width:${pct}%;"></div>
              <div class="siq-lb-name" title="${r.name}">${r.name}</div>
            </div>
            <div class="siq-lb-value">${r.hours.toLocaleString()}</div>
          </div>
        `;
      }).join('');
    }

    // UI events (no Staff tabs)
    viewSel.addEventListener('change', () => {
      yearSel.hidden = viewSel.value !== 'year';
      scheduleRender();
    });
    yearSel.addEventListener('change', scheduleRender);

    // Modal open/close
    function openModal() { modal.setAttribute('aria-hidden', 'false'); }
    function closeModal() { modal.setAttribute('aria-hidden', 'true'); }
    viewAllBtn.addEventListener('click', openModal);
    modal.addEventListener('click', e => {
      if (e.target.matches('[data-close-modal], .siq-modal__backdrop')) closeModal();
    });

    // Live data
    let unsub = null, colRef = null, cachedSessions = [], renderPending = false, lastRows = [];

    function scheduleRender() {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        const mode = viewSel.value || '12m';
        const year = (mode === 'year') ? (yearSel.value || new Date().getFullYear()) : null;
        lastRows = aggregateStaff(cachedSessions, mode, year);
        renderRows(lastRows, listEl, 5);
        renderRows(lastRows, fullListEl, null);
      });
    }

    const onSnap = snap => {
      const sessions = [];
      snap.forEach(doc => sessions.push(doc));
      cachedSessions = sessions;
      const years = deriveYearsFromSessions(sessions);
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSel.hidden = viewSel.value !== 'year';
      scheduleRender();
    };
    const onError = err => {
      console.error('[Top5Staff] listener error:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    };

    try {
      const db = firebase.firestore ? firebase.firestore() : null;
      if (!db) throw new Error('Firestore not initialized');
      colRef = db.collection('contractors').doc(contractorId).collection('sessions');
      unsub = colRef.onSnapshot(onSnap, onError);
    } catch (err) {
      console.error('[Top5Staff] init failed:', err);
      listEl.innerHTML = '<p class="siq-inline-error">Data unavailable</p>';
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (unsub) { unsub(); unsub = null; } }
      else if (!unsub && colRef) { unsub = colRef.onSnapshot(onSnap, onError); }
    });
    window.addEventListener('beforeunload', () => { if (unsub) unsub(); });
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

      const btnFarmSummary = document.getElementById('farm-summary-btn');
      btnFarmSummary?.addEventListener('click', () => {
        console.log('Farm Summary button clicked');
        window.location.href = 'farm-summary.html';
      });

      const btnViewSavedSessions = document.getElementById('btnViewSavedSessions');
      if (btnViewSavedSessions) {
        btnViewSavedSessions.addEventListener('click', () => {
          window.location.href = 'view-sessions.html';
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
      if (typeof initTop5StaffWidget === 'function') {
        try { initTop5StaffWidget(); } catch (e) { console.error('[Dashboard] initTop5StaffWidget failed:', e); }
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
