 // Firebase is initialized in firebase-init.js

export function formatHoursWorked(decimal) {
  if (isNaN(decimal)) return "";
  const hours = Math.floor(decimal);
  const minutes = Math.round((decimal - hours) * 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
 
export function parseHoursWorked(str) {
  if (!str) return 0;
  const match = String(str).trim().match(/^(\d+)h(?:\s*(\d+)m)?$/);
  if (!match) return parseFloat(str) || 0;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours + minutes / 60;
}

// Detect simple age category keywords within a sheep type name
// Returns "lamb", "adult" or "unknown"
function detectAgeCategory(sheepTypeName) {
  const name = String(sheepTypeName || '').toLowerCase();
  if (name.includes('lamb')) return 'lamb';
  const adultTerms = ['ram', 'ewe', 'wether', 'full wool', 'stud', 'shear'];
  for (const term of adultTerms) {
    if (name.includes(term)) return 'adult';
  }
  return 'unknown';
}



// Helper to calculate hour difference between two HH:MM strings
function getTimeDiffInHours(startStr, endStr) {
  const start = new Date(`1970-01-01T${startStr}`);
  const end = new Date(`1970-01-01T${endStr}`);
  const diffMs = end - start;
  return diffMs / (1000 * 60 * 60);
}

// Default lunch break length in minutes
let lunchBreakDurationMinutes = 60;

function updateLunchToggleButton() {
    const btn = document.getElementById('lunchToggle');
   if (btn) btn.textContent = 'Lunch Break';
}

let lunchIndicatorYellow = false;

function updateLunchIndicatorText() {
  const text = lunchBreakDurationMinutes === 60
    ? "Lunch Break: 1 hour"
    : "Lunch Break: 45 min";
  const el = document.getElementById("lunchIndicator");
  if (el) {
    el.textContent = text;
    el.style.color = lunchIndicatorYellow ? '#ff0' : '#0f0';
  } 
}

function toggleLunchBreak() {
    lunchBreakDurationMinutes = lunchBreakDurationMinutes === 60 ? 45 : 60;
    updateLunchToggleButton();
    calculateHoursWorked();
}

// Determine how many minutes of break time the provided finish time falls into
// returning the value rounded up to the nearest 15 minute block.
function getWorkedBreakMinutes(finishTimeStr, breaks) {
  const finish = new Date("1970-01-01T" + finishTimeStr);
  let workedMinutes = 0;

  breaks.forEach(([startStr, endStr]) => {
    const start = new Date("1970-01-01T" + startStr);
    const end = new Date("1970-01-01T" + endStr);

    if (finish > start && finish <= end) {
      const diff = Math.floor((finish - start) / 60000);
      const rounded = Math.ceil(diff / 15) * 15;
      workedMinutes += rounded;
    }
  });
  return workedMinutes;
}

// Backwards compatible helper that now returns the worked break minutes
// Determine if the given time falls within any defined break.
// Finishing exactly at the start of a break should not count as
// working during that break, so we use a strict greater-than check.
function isTimeWithinBreaks(timeStr, breaks) {
  const time = new Date("1970-01-01T" + timeStr);
  return breaks.some(([start, end]) => {
    const bStart = new Date("1970-01-01T" + start);
    const bEnd = new Date("1970-01-01T" + end);
    return time > bStart && time <= bEnd;
  });
}

function getDynamicBreaks(startTimeStr) {
  const base = new Date("1970-01-01T" + startTimeStr);
  if (isNaN(base)) return [];
  const addMinutes = mins => new Date(base.getTime() + mins * 60000).toTimeString().slice(0, 5);
  if (isNineHourDay) {
    return [
      [addMinutes(120), addMinutes(180)],
      [addMinutes(285), addMinutes(315)],
      [addMinutes(420), addMinutes(480)],
      [addMinutes(585), addMinutes(615)]
    ];
  } else {
    return [
      [addMinutes(120), addMinutes(150)],
      [addMinutes(270), addMinutes(270 + lunchBreakDurationMinutes)],
      [addMinutes(450), addMinutes(480)]
    ];
  }
}

 document.addEventListener("DOMContentLoaded", () => {
    const table = document.getElementById("tallyTable");
    if (table) {
        table.addEventListener("input", () => {
            updateTotals();
            updateSheepTypeTotals();
        });
    }
});
 
 
 const defaultStands = 0;
 const defaultRuns = 0;
 const minStands = 1;
 const minRuns = 1;
 let numStands = defaultStands;
let runs = defaultRuns;
let is24HourFormat = true;
export let isNineHourDay = false;
let promptedNineHour = false;
let layoutBuilt = false
let isSetupComplete = false;
let hasUserStartedEnteringData = false;
// Track whether any tally or shed staff inputs have been interacted with
let hasTouchedTallyInputs = false;
// Ensure the Finish Time warning is only shown once
let hasShownFinishTimeWarning = false;

// === Autosave state ===
let autosaveTimer = null;
let lastSavedJson = '';
let lastLocalSave = 0;
let lastCloudSave = 0;
// Remember the generated Firestore document ID once all required fields are provided
let firestoreSessionId = '';

let autosaveHideTimer = null;

function updateAutosaveIndicator() {
    const el = document.getElementById('autosaveInfo');
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    el.innerText = `Autosaved ${time}`;
    el.style.display = 'block';
}

function showAutosaveStatus(message) {
    const el = document.getElementById('autosaveStatus');
    if (!el) return;
    el.innerText = message;
    el.style.display = 'block';
    if (autosaveHideTimer) clearTimeout(autosaveHideTimer);
    autosaveHideTimer = setTimeout(() => {
        el.style.display = 'none';
    }, 3000);
}

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        const data = collectExportData();
        const json = JSON.stringify(data);
        if (json === lastSavedJson) return;
        const now = Date.now();
        let saved = false;

        // Always save to localStorage if 10s passed
        if (now - lastLocalSave >= 10000) {
            saveData(false);
            lastLocalSave = now;
            saved = true;
        }

        // Only save to Firestore if station, date, and leader are all filled in
        const hasAllKeys = data.stationName && data.date && data.teamLeader;
        if (hasAllKeys && now - lastCloudSave >= 10000) {
            saveSessionToFirestore(false);
            lastCloudSave = now;
            saved = true;
        }

        if (saved) {
            lastSavedJson = json;
            updateAutosaveIndicator();
        }
    }, 3000);
}

 // Dynamic sheep type list will be saved to localStorage under 'sheep_types'
 function getSheepTypes() {
     try {
         const arr = JSON.parse(localStorage.getItem('sheep_types') || '[]');
         return Array.isArray(arr) ? arr.sort() : [];
     } catch (e) {
         return [];
     }
 }
 
 const SHEEP_TYPES = getSheepTypes();
 
 function refreshSheepTypes() {
     const types = getSheepTypes();
     SHEEP_TYPES.splice(0, SHEEP_TYPES.length, ...types);
 }
 
 function saveSessionToStorage(session) {
     let arr;
     try {
         arr = JSON.parse(localStorage.getItem('sheariq_sessions') || '[]');
     } catch (e) { arr = []; }
 
     if (!Array.isArray(arr)) arr = [];
 
     // Find existing entry for same date and station
     const idx = arr.findIndex(s => s.date === session.date && s.stationName === session.stationName);
     if (idx >= 0) {
         arr[idx] = session; // update existing
     } else {
         arr.push(session); // add new
     }
 
     // Save the updated list of sessions
     localStorage.setItem('sheariq_sessions', JSON.stringify(arr));
 
     // === NEW: Update dynamic sheep type list ===
     let sheepTypeSet = new Set(JSON.parse(localStorage.getItem('sheep_types') || '[]'));
     if (Array.isArray(session.shearerCounts)) {
         session.shearerCounts.forEach(run => {
             const type = (run.sheepType || '').trim();
             if (type) sheepTypeSet.add(type);
         });
     }
 
     // Save updated list back to localStorage
     localStorage.setItem('sheep_types', JSON.stringify([...sheepTypeSet]));
 }
 
 function getStoredSessions() {
    try {
        const arr = JSON.parse(localStorage.getItem('sheariq_sessions') || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function hasUnsavedChanges() {
    const selectors = [
        '#stationName', '#teamLeader', '#combType',
        '#startTime', '#finishTime', '#hoursWorked',
        '#headerRow input', '#tallyBody input', '#shedStaffTable input'
    ];
    return selectors.some(sel =>
        Array.from(document.querySelectorAll(sel)).some(el => el.value && el.value.trim())
    );
}



function isoFromNZDate(str) {
    if (!str) return '';
    const parts = str.split(/[\/]/);
    if (parts.length !== 3) return str;
    const [dd, mm, yy] = parts;
    return `${yy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

function getLastSession() {
    const sessions = getStoredSessions();
    if (!sessions.length) return null;
    sessions.sort((a,b)=> (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    return sessions[0];
}


function setupDailyLayout(shearers, counts, staff) {
    console.log("Setup called with:", shearers, "shearers,", counts, "counts,", staff, "shed staff");

    hasUserStartedEnteringData = false;

    const headerRowEl = document.getElementById('headerRow');
    const bodyEl = document.getElementById('tallyBody');
    const subtotalRowEl = document.getElementById('subtotalRow');
    const staffTableEl = document.getElementById('shedStaffTable');

    if (headerRowEl) headerRowEl.innerHTML = '<th>Count #</th><th>Count Total</th><th class="sheep-type">Sheep Type</th>';
    if (bodyEl) bodyEl.innerHTML = '';
    if (subtotalRowEl) {
        while (subtotalRowEl.firstChild) {
            subtotalRowEl.removeChild(subtotalRowEl.firstChild);
        }
        subtotalRowEl.appendChild(document.createElement("th")).innerText = "Shearer Totals";
    }
    if (staffTableEl) staffTableEl.innerHTML = '';

    numStands = 0;
    runs = 0;

    for (let i = 0; i < shearers; i++) {
        addStand();
    }

    // Wait until after layout is stable
    requestAnimationFrame(() => {
        console.log("Adding", counts, "count rows");
        for (let i = 0; i < counts; i++) {
            console.log("Adding count row:", i + 1);
            addCount();
        }

        console.log("Adding", staff, "shed staff rows");
        for (let i = 0; i < staff; i++) {
            console.log("Adding shed staff row:", i + 1);
            addShedStaff();
        }

        const totalCell = document.createElement("td");
        totalCell.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;">
  <div style="font-size: 0.75em;">Total</div>
  <div id="grandTotalValue">0</div>
</div>`;
        totalCell.style.backgroundColor = "#000";
        totalCell.style.color = "#fff";
        totalCell.style.textAlign = "center";
        subtotalRowEl.appendChild(totalCell);

        const spacerCell = document.createElement("td");
        spacerCell.innerText = "Total Today";
         spacerCell.style.backgroundColor = "#000";
        spacerCell.style.color = "#fff";
        spacerCell.style.textAlign = "center";
        subtotalRowEl.appendChild(spacerCell);

        updateTotals();
        layoutBuilt = true;
        isSetupComplete = true;
        showView('tallySheetView');

        const stationName = document.getElementById('stationName')?.value.trim();
        const titleEl = document.getElementById('summaryTitle');
        if (titleEl && stationName) {
          titleEl.textContent = `${stationName} \u2014 Daily Summary`;
        }
    });
}




function populateSessionData(data) {
    if (!data) return;
  const runCount = Array.isArray(data.shearerCounts) ? data.shearerCounts.length : 0;
    const standCount = Array.isArray(data.stands) ? data.stands.length : (runCount && data.shearerCounts[0] ? data.shearerCounts[0].stands.length : 0);

    const headerRowEl = document.getElementById('headerRow');
    const bodyEl = document.getElementById('tallyBody');
    const subtotalRowEl = document.getElementById('subtotalRow');
    const staffTableEl = document.getElementById('shedStaffTable');

    if (headerRowEl) headerRowEl.innerHTML = '<th>Count #</th><th>Count Total</th><th class="sheep-type">Sheep Type</th>';
    if (bodyEl) bodyEl.innerHTML = '';
    if (subtotalRowEl) {
        while (subtotalRowEl.firstChild) {
            subtotalRowEl.removeChild(subtotalRowEl.firstChild);
        }
        subtotalRowEl.appendChild(document.createElement("th")).innerText = "Shearer Totals";
    }

    const totalCell = document.createElement("td");
    totalCell.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;">
  <div style="font-size: 0.75em;">Total</div>
  <div id="grandTotalValue">0</div>
</div>`;
    totalCell.style.backgroundColor = "#000";
    totalCell.style.color = "#fff";
    totalCell.style.textAlign = "center";
    subtotalRowEl.appendChild(totalCell);


    const spacerCell = document.createElement("td");
    spacerCell.innerText = "Total Today";
    spacerCell.style.backgroundColor = "#000";
    spacerCell.style.color = "#fff";
    spacerCell.style.textAlign = "center";
    subtotalRowEl.appendChild(spacerCell);

    numStands = 0;
    runs = 0;

    setWorkdayType(data.timeSystem === '9-hr');

    for (let i = 0; i < standCount; i++) addStand();
    while (runs < runCount) addCount();
    while (runs > runCount) removeCount();  

    document.querySelectorAll('#tallyBody input').forEach(inp => inp.value = '');
    document.querySelectorAll('#shedStaffTable input').forEach(inp => inp.value = '');

    if (headerRowEl && Array.isArray(data.stands)) {
        data.stands.forEach((st, idx) => {
         const input = headerRowEl.children[idx + 1]?.querySelector('input');   
            if (input) {
                input.value = st.name || '';
                adjustStandNameWidth(input);
                applyInputHistory(input);
            }
        });
    }

    const assign = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    assign('date', data.date);
    assign('stationName', data.stationName);
    assign('teamLeader', data.teamLeader);
    assign('combType', data.combType);
    assign('startTime', data.startTime);
    assign('finishTime', data.finishTime);
    assign('hoursWorked', data.hoursWorked);

    setWorkdayType(data.timeSystem === '9-hr');
    updateShedStaffHours(data.hoursWorked || '');

    if (bodyEl && Array.isArray(data.shearerCounts)) {
        data.shearerCounts.forEach((run, idx) => {
            const row = bodyEl.children[idx];
            if (!row) return;
            run.stands.forEach((val, sIdx) => {
                const input = row.children[sIdx + 1]?.querySelector('input[type="number"]');
                if (input) input.value = val;
            });
            const typeInput = row.querySelector('.sheep-type input');
            if (typeInput) {
                typeInput.value = run.sheepType || '';
                adjustSheepTypeWidth(typeInput);
            }
        });
    }

    if (staffTableEl) {
        staffTableEl.innerHTML = '';
        if (Array.isArray(data.shedStaff)) {
            data.shedStaff.forEach(staff => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><input placeholder="Staff Name" type="text"/></td><td><input placeholder="e.g. 8h 30m" type="text" class="hours-input"/></td>';
                const nameInput = tr.querySelector('td:nth-child(1) input');
                const hoursInput = tr.querySelector('td:nth-child(2) input');
                if (nameInput) {
                    nameInput.value = staff.name || '';
                    adjustShedStaffNameWidth(nameInput);
                    applyInputHistory(nameInput);
                }
                if (hoursInput) {
                    hoursInput.value = formatHoursWorked(parseHoursWorked(staff.hours));
                    adjustShedStaffHoursWidth(hoursInput);
                }
                staffTableEl.appendChild(tr);
            });
        }
    }

updateTotals();
    updateSheepTypeTotals();
    layoutBuilt = true;
}

let sessionLocked = false;
function lockSession() {
    sessionLocked = true;
    document.querySelectorAll('#tallySheetView input').forEach(inp => inp.readOnly = true);
    document.querySelectorAll('#tallySheetView select').forEach(sel => sel.disabled = true);
}

function unlockSession() {
    sessionLocked = false;
    document.querySelectorAll('#tallySheetView input').forEach(inp => inp.readOnly = false);
    document.querySelectorAll('#tallySheetView select').forEach(sel => sel.disabled = false);

    // Ensure a Firestore document ID exists when unlocking a view-only session
    if (!firestoreSessionId &&
        document.getElementById('stationName') &&
        document.getElementById('date') &&
        document.getElementById('teamLeader')) {
        const station = document.getElementById('stationName').value.trim().replace(/\s+/g, '_');
        const date = document.getElementById('date').value;
        const leader = document.getElementById('teamLeader').value.trim().replace(/\s+/g, '_');
        if (station && date && leader) {
            firestoreSessionId = `${station}_${date}_${leader}`;
        }
    }
}

function promptForPinUnlock() {
    const pin = prompt('\uD83D\uDD10 Enter Contractor PIN to unlock editing:');
    const correctPIN = localStorage.getItem('contractor_pin') || '1234';
    if (pin === correctPIN) {
        unlockSession();
    } else if (pin !== null) {
        alert('Incorrect PIN');
    }
}

function enforceSessionLock(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr !== today) lockSession();
    else unlockSession();
}

function populateStationOptions() {
    const list = document.getElementById('loadStationList');
    if (!list) return;
    list.innerHTML = '';
    const nameMap = new Map();
    getStoredSessions().forEach(s => {
        const trimmed = (s.stationName || '').trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (!nameMap.has(key)) nameMap.set(key, trimmed);
    });
    const names = Array.from(nameMap.values());
    names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        list.appendChild(opt);
    });
}

function populateDateOptions(station) {
    const list = document.getElementById('loadDateList');
    if (!list) return;
    list.innerHTML = '';
    const target = (station || '').trim().toLowerCase();
    const dates = getStoredSessions()
        .filter(s => (s.stationName || '').trim().toLowerCase() === target)
        .map(s => s.date);
    Array.from(new Set(dates)).forEach(d => {
        const opt = document.createElement('option');
        opt.value = formatDateNZ(d);
        list.appendChild(opt);
    });
}

function showLoadSessionModal() {
    const modal = document.getElementById('loadSessionModal');
    const step1 = document.getElementById('loadSessionStep1');
    const step2 = document.getElementById('loadSessionStep2');
    if (modal && step1 && step2) {
        step1.style.display = 'block';
        step2.style.display = 'none';
        modal.style.display = 'flex';
    }
}

function hideLoadSessionModal() {
    const modal = document.getElementById('loadSessionModal');
    if (modal) modal.style.display = 'none';
}

function showLoadOptionsModal() {
    const modal = document.getElementById('loadOptionsModal');
    if (modal) modal.style.display = 'flex';
}

function hideLoadOptionsModal() {
    const modal = document.getElementById('loadOptionsModal');
    if (modal) modal.style.display = 'none';
}

function showCloudSessionModal() {
    const modal = document.getElementById('cloudSessionModal');
    if (modal) modal.style.display = 'flex';
}

function hideCloudSessionModal() {
    const modal = document.getElementById('cloudSessionModal');
    if (modal) modal.style.display = 'none';
}

function populateCloudSessionDropdown(list) {
    const select = document.getElementById('cloudSessionSelect');
    if (!select) return;
    select.innerHTML = '';
    list.forEach(item => {
        const opt = document.createElement('option');
        const date = formatDateNZ(item.date);
        const leader = item.teamLeader ? ` - ${item.teamLeader}` : '';
        opt.value = item.id;
        opt.textContent = `${date} - ${item.stationName}${leader}`;
        select.appendChild(opt);
    });
}

function showSetupModal() {
    const modal = document.getElementById('setupModal');
    if (modal) modal.style.display = 'flex';
}

function hideSetupModal() {
    const modal = document.getElementById('setupModal');
    if (modal) modal.style.display = 'none';
}

function confirmSetupModal() {
    const shearers = parseInt(document.getElementById('setupShearers').value, 10) || 0;
    const counts = parseInt(document.getElementById('setupRuns').value, 10) || 0;
    const staff = parseInt(document.getElementById('setupStaff').value, 10) || 0;
    const lunchSelect = document.getElementById('lunchLength');
    if (lunchSelect) {
        lunchBreakDurationMinutes = parseInt(lunchSelect.value, 10);
    }
    updateLunchToggleButton();
    updateLunchIndicatorText();
    hideSetupModal();
    setupDailyLayout(shearers, counts, staff);
}

 function adjustStandNameWidth(input) {
     const len = input.value.length || input.placeholder.length || 1;
     input.style.width = (len + 1) + 'ch';
 }
 
 function adjustSheepTypeWidth(input) {
     const len = input.value.length || input.placeholder.length || 1;
     const width = Math.max(len + 4, 10);
     input.style.width = width + 'ch';
 }
 
 function adjustShedStaffNameWidth(input) {
   const len = input.value.length || input.placeholder.length || 1;
     input.style.width = (len + 1) + 'ch';
 }
 
 function adjustShedStaffHoursWidth(input) {
     const len = input.value.length || input.placeholder.length || 1;
     input.style.width = (len + 1) + 'ch';
 }
 
 function getHistoryKey(input) {
     return (input.name || input.placeholder || input.id || '').replace(/\s+/g, '_');
 }
 
 function applyInputHistory(input) {
     if (!input || input.type !== 'text' || input.id === 'hoursWorked') return;
     const key = getHistoryKey(input);
     if (!key) return;
 
     const existingId = input.getAttribute('list');
     const listId = existingId || ('hist_' + key);
     let list = document.getElementById(listId);
     if (!list) {
         list = document.createElement('datalist');
         list.id = listId;
         document.body.appendChild(list);
     }
     if (!existingId) input.setAttribute('list', listId);
     try {
         const items = JSON.parse(localStorage.getItem(key) || '[]');
         const existingValues = new Set(Array.from(list.options).map(o => o.value));
         if (!existingId) list.innerHTML = '';
         if (Array.isArray(items)) {
             items.forEach(v => {
                 if (!existingValues.has(v)) {
                     const opt = document.createElement('option');
                     opt.value = v;
                     list.appendChild(opt);
                 }
             });
         }
     } catch (e) {}
 
     input.addEventListener('blur', () => {
        if (input.closest('#shedStaffTable')) {
            if (input.matches('.hours-input')) {
                adjustShedStaffHoursWidth(input);
            } else {
                adjustShedStaffNameWidth(input);
            }
        }
         const val = input.value.trim();
         if (!val) return;
         let arr;
         try {
             arr = JSON.parse(localStorage.getItem(key) || '[]');
             if (!Array.isArray(arr)) arr = [];
         } catch (e) {
             arr = [];
         }
         if (!arr.includes(val)) {
             arr.push(val);
             localStorage.setItem(key, JSON.stringify(arr));
             const exists = Array.from(list.options).some(o => o.value === val);
             if (!exists) {
                 const opt = document.createElement('option');
                 opt.value = val;
                 list.appendChild(opt);
             }
         }
           if (input.matches('#tallyBody td.sheep-type input[type="text"]')) {
             adjustSheepTypeWidth(input);
         } else if (input.matches('#shedStaffTable .hours-input')) {
             adjustShedStaffHoursWidth(input);
         } else if (input.matches('#headerRow input[type="text"]')) {
             adjustStandNameWidth(input);
         }
     });
     
  // ensure shed staff inputs are sized correctly on initialization
    if (input.closest('#shedStaffTable')) {
        if (input.matches('.hours-input')) {
            adjustShedStaffHoursWidth(input);
        } else {
            adjustShedStaffNameWidth(input);
        }
    }
     
     input.addEventListener('input', () => {
         if (input.matches('#tallyBody td.sheep-type input[type="text"]')) {
             adjustSheepTypeWidth(input);
         } else if (input.matches('#shedStaffTable td:nth-child(1) input')) {
             adjustShedStaffNameWidth(input);
         } else if (input.matches('#shedStaffTable .hours-input')) {
            adjustShedStaffHoursWidth(input);
             adjustShedStaffHoursWidth(input);
         } else if (input.matches('#headerRow input[type="text"]')) {
             adjustStandNameWidth(input);
         }
     });
 }
 
 function formatTimeDisplay(h, m, use24) {
     const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
     if (use24) return value;
     let hour12 = h % 12;
     if (hour12 === 0) hour12 = 12;
     const suffix = h < 12 ? 'AM' : 'PM';
     return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
 }
 
 function formatDateNZ(dateStr) {
     if (!dateStr) return '';
     const parts = dateStr.split('-');
     if (parts.length !== 3) return dateStr;
     return `${parts[2]}/${parts[1]}/${parts[0]}`;
 }
 
 function generateTimeOptions() {
     const startSelect = document.getElementById('startTime');
     const finishSelect = document.getElementById('finishTime');
     if (!startSelect || !finishSelect) return;
     const startVal = startSelect.value;
     const endVal = finishSelect.value;
     startSelect.innerHTML = '';
     finishSelect.innerHTML = '';
      // Add blank option so the field appears empty until a time is chosen
     const blankStart = document.createElement('option');
     blankStart.value = '';
     blankStart.textContent = '';
     startSelect.appendChild(blankStart);
     const blankEnd = document.createElement('option');
     blankEnd.value = '';
     blankEnd.textContent = '';
     finishSelect.appendChild(blankEnd);
     for (let h = 4; h <= 22; h++) {
         for (let m = 0; m < 60; m += 15) {
             const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
             const display = formatTimeDisplay(h, m, is24HourFormat);
             const optStart = document.createElement('option');
             optStart.value = value;
             optStart.textContent = display;
             startSelect.appendChild(optStart);
             const optEnd = document.createElement('option');
             optEnd.value = value;
             optEnd.textContent = display;
             finishSelect.appendChild(optEnd);
         }
     }
     if (startVal) startSelect.value = startVal;
     if (endVal) finishSelect.value = endVal;
 }
 
 function toggleTimeFormat() {
     is24HourFormat = !is24HourFormat;
     const btn = document.getElementById('timeFormatToggle');
     if (btn) {
         btn.textContent = is24HourFormat ? 'Switch to 12-hour format' : 'Switch to 24-hour format';
     }
     generateTimeOptions();
     calculateHoursWorked();
 }
 
 function adjustRuns(desired) {
     const body = document.getElementById('tallyBody');
     if (!body) return;
     while (runs < desired) {
         body.appendChild(createRow(runs));
         runs++;
     }
     while (runs > desired) {
         if (body.lastElementChild) body.removeChild(body.lastElementChild);
         runs--;
     }
     updateTotals();
 }
 
 function setWorkdayType(nineHour) {
    isNineHourDay = nineHour;
    calculateHoursWorked();
     const label = document.getElementById('timeSystemLabel');
     if (label) {
         label.textContent = isNineHourDay ? 'Time System: 9-Hour Day' : 'Time System: 8-Hour Day';
         label.style.color = isNineHourDay ? '#ff0' : '#0f0';
     }
     const hours = document.getElementById('hoursWorked');
    if (hours) updateShedStaffHours(hours.value);
    if (isNineHourDay && lunchBreakDurationMinutes !== 60) {
        lunchBreakDurationMinutes = 60;
    }
    updateLunchToggleButton();
    updateLunchIndicatorText();
}
 
 function toggleWorkdayType() {
     const switchToNine = !isNineHourDay;
     const msg = switchToNine ? 'Switch to 9-hour day system?' : 'Switch to 8-hour day system?';
     if (confirm(msg)) {
         setWorkdayType(switchToNine);
     }
 }
 
 function handleStartTimeChange() {
     const start = document.getElementById('startTime');
     if (start && start.value === '05:00' && !promptedNineHour) {
         promptedNineHour = true;
         if (confirm('Is this a 9-hour day?')) {
             setWorkdayType(true);
         } else {
             setWorkdayType(false);
         }
     }
     calculateHoursWorked();
 }
 
 
 function createRow(runIndex) {
     const row = document.createElement("tr");
     row.innerHTML = `<td>Count ${runIndex + 1}</td>`;
     for (let i = 0; i < numStands; i++) {
        row.innerHTML += `<td><input type="number" value=""></td>`; 
     }
     row.innerHTML += `<td class="run-total">0</td>`;
     row.innerHTML += `<td class="sheep-type"><input type="text" list="sheepTypes" placeholder="Sheep Type"></td>`;
     const sheepInput = row.querySelector('.sheep-type input');
    if (sheepInput) {
         adjustSheepTypeWidth(sheepInput);
         applyInputHistory(sheepInput);
     }
     return row;
 }
 
 function addStand() {
     numStands++;
     const header = document.getElementById("headerRow");
     const newHeader = document.createElement("th");
     newHeader.innerHTML = `Stand ${numStands}<br><input type="text" placeholder="Name">`;
     const input = newHeader.querySelector('input');
    if (input) {
         adjustStandNameWidth(input);
         applyInputHistory(input);
     }
     header.insertBefore(newHeader, header.children[header.children.length - 2]);
 
     const tallyBody = document.getElementById("tallyBody");
     for (let i = 0; i < runs; i++) {
         const row = tallyBody.children[i];
         const cell = document.createElement("td");
         cell.innerHTML = `<input type="number" value="">`;
         row.insertBefore(cell, row.children[row.children.length - 2]);
     }
 
     const subtotalRow = document.getElementById("subtotalRow");
    const cell = document.createElement("td");
    cell.innerText = "0";
    cell.style.backgroundColor = "#000";
    cell.style.color = "#fff";
    cell.style.textAlign = "center";
    subtotalRow.insertBefore(cell, subtotalRow.children[subtotalRow.children.length - 2]);
}
 
 function addCount() {
    const body = document.getElementById("tallyBody");
    const row = createRow(runs); // Use current count
    body.appendChild(row);
    runs++; // Now safely increment
}
 
 function removeCount() {
   if (runs <= minRuns) return;  
 
     const body = document.getElementById("tallyBody");
     if (body.lastElementChild) {
         body.removeChild(body.lastElementChild);
     }
     runs--;
     updateTotals();
 }
 
 
 function removeStand() {
      if (numStands <= minStands) return;
 
     const header = document.getElementById("headerRow");
     header.removeChild(header.children[numStands]);
 
     const tallyBody = document.getElementById("tallyBody");
     for (let i = 0; i < runs; i++) {
         const row = tallyBody.children[i];
         row.removeChild(row.children[numStands]);
     }
 
     const subtotalRow = document.getElementById("subtotalRow");
     subtotalRow.removeChild(subtotalRow.children[numStands]);
 
     numStands--;
     updateTotals();
 }
 
 
 function updateTotals() {
    const tbody = document.getElementById("tallyBody");
    let dailyTotal = 0;

    for (let i = 0; i < tbody.children.length; i++) {
        const row = tbody.children[i];
        let total = 0;
        for (let j = 1; j <= numStands; j++) {
            total += Number(row.children[j].children[0].value);
        }
        const runTotalCell = row.querySelector(".run-total");
        if (runTotalCell) runTotalCell.innerText = total;
        dailyTotal += total;
    }

    const subtotalRow = document.getElementById("subtotalRow");
    if (!subtotalRow) return;
    // Ensure the first cell always shows the label and is not overwritten
    if (subtotalRow.children[0]) {
        subtotalRow.children[0].innerText = "Shearer Totals";
    }

    for (let i = 1; i <= numStands; i++) {
        let colTotal = 0;
        for (let j = 0; j < tbody.children.length; j++) {
            colTotal += Number(tbody.children[j].children[i].children[0].value);
        }
        const cell = subtotalRow.children[i];
        if (cell) cell.innerText = colTotal;
    }

    const finalCell = subtotalRow.children[numStands + 1];
    if (finalCell) finalCell.innerText = dailyTotal;

    updateSheepTypeTotals();
}

 
 function updateSheepTypeTotals() {
     const tbody = document.getElementById('tallyBody');
     const totals = {};
     let grandTotal = 0;
     tbody.querySelectorAll('tr').forEach(row => {
        const typeInput = row.querySelector('.sheep-type input');
        if (!typeInput) return;
        const tallyInputs = row.querySelectorAll('td input[type="number"]');
        const hasTally = Array.from(tallyInputs).some(inp => inp.value.trim() !== '');
        if (!hasTally) return; // skip empty row
        let type = typeInput.value.trim();
        if (type === "") {
            type = "❓ Missing Type";
        }
         const runTotal = parseInt(row.querySelector('.run-total').innerText) || 0;
        totals[type] = (totals[type] || 0) + runTotal;
        grandTotal += runTotal;
    });
 
     const table = document.getElementById('sheepTypeTotalsTable');
     if (!table) return;
     const body = table.querySelector('tbody');
     body.innerHTML = '';
     Object.keys(totals).forEach(type => {
        const tr = document.createElement('tr');
        const tdType = document.createElement('td');
        const label = (type === "❓ Missing Type")
            ? `<span class="missing-type">${type}</span>`
            : type;
        tdType.innerHTML = label;   
         tdType.textContent = type;
         const tdTotal = document.createElement('td');
         tdTotal.textContent = totals[type];
         tr.appendChild(tdType);
         tr.appendChild(tdTotal);
         body.appendChild(tr);
     });
     const totalRow = document.createElement('tr');
     const label = document.createElement('td');
     label.textContent = 'Total';
     const value = document.createElement('td');
     value.textContent = grandTotal;
     totalRow.appendChild(label);
     totalRow.appendChild(value);
     body.appendChild(totalRow);
 }
 
 // Initialize table with default rows
 for (let i = 0; i < runs; i++) {
     document.getElementById("tallyBody").appendChild(createRow(i));
 }
 
 // Init subtotal row
const subtotalRow = document.getElementById("subtotalRow");
subtotalRow.innerHTML = '<th>Shearer Totals</th>';
for (let i = 0; i < numStands; i++) {
    const cell = document.createElement("td");
    cell.innerText = "0";
    cell.style.backgroundColor = "#000";
    cell.style.color = "#fff";
    cell.style.textAlign = "center";
    subtotalRow.appendChild(cell);
}
// Final daily total (sum of all shearer counts)
const totalCell = document.createElement("td");
totalCell.innerText = "0";
totalCell.style.backgroundColor = "#000";
totalCell.style.color = "#fff";
totalCell.style.textAlign = "center";
subtotalRow.appendChild(totalCell);
// Empty cell under "Sheep Type" labelled with "Total Today"
const spacerCell = document.createElement("td");
spacerCell.innerText = "Total Today";
subtotalRow.appendChild(spacerCell);
updateTotals();

function calculateHoursWorked() {
    const startInput = document.getElementById("startTime");
    const endInput = document.getElementById("finishTime");
    const output = document.getElementById("hoursWorked");

    if (!startInput || !endInput || !output) return;

    const startStr = startInput.value;
    const endStr = endInput.value;
    const start = new Date("1970-01-01T" + startStr);
    const end = new Date("1970-01-01T" + endStr); 

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        output.value = "";
        updateShedStaffHours("");
        return;
    }

    let totalMinutes = (end - start) / 60000;

   const breakWindows = getDynamicBreaks(startStr);
    console.log("Break windows", breakWindows);
    const labels = isNineHourDay
        ? ["Breakfast", "Morning Smoko", "Lunch", "Afternoon Smoko"]
        : ["Morning Smoko", "Lunch", "Afternoon Smoko"];

    breakWindows.forEach(([bStartStr, bEndStr], idx) => {
        const bStart = new Date("1970-01-01T" + bStartStr);
         const bEnd = new Date("1970-01-01T" + bEndStr);

        if (end <= bStart || start >= bEnd) return;

        if (end > bStart && end <= bEnd) {
            const workedStart = start > bStart ? start : bStart;
            const worked = Math.round((end - workedStart) / 60000);
            const label = labels[idx] || `Break ${idx + 1}`;
            console.log(`Finish within ${label}: worked ${worked} minutes`);
            if (!confirm(`You worked into ${label}. Add ${worked} minutes as paid time?`)) {
                totalMinutes -= worked;
            }
        } else {
            const overlapStart = start > bStart ? start : bStart;
            const overlapEnd = end < bEnd ? end : bEnd;
            const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);
            totalMinutes -= overlapMinutes;

        }
    });
 
    const totalHours = totalMinutes / 60;
    output.value = totalHours > 0 ? formatHoursWorked(totalHours) : "0h";
    updateShedStaffHours(output.value);
}
 
 function updateShedStaffHours(value) {
     const table = document.getElementById('shedStaffTable');
     if (!table) return;
     table.querySelectorAll('tr').forEach(row => {
         const input = row.querySelector('td:nth-child(2) input');
         if (input) {
             input.value = value;
             adjustShedStaffHoursWidth(input);
         }
     });
 }
 
 document.addEventListener("DOMContentLoaded", function () {
     generateTimeOptions();
     const start = document.getElementById("startTime");
     const end = document.getElementById("finishTime");
     const hours = document.getElementById("hoursWorked");
     const toggle = document.getElementById('timeFormatToggle');
    const workdayToggle = document.getElementById('workdayToggle');
    const lunchBtn = document.getElementById('lunchToggle');
    const lunchIndicator = document.getElementById('lunchIndicator');
    if (toggle) toggle.addEventListener('click', toggleTimeFormat);
    if (workdayToggle) workdayToggle.addEventListener('click', toggleWorkdayType);
    if (lunchBtn && lunchIndicator) {
      lunchBtn.addEventListener('click', () => {
        lunchBreakDurationMinutes = lunchBreakDurationMinutes === 60 ? 45 : 60;
        lunchIndicatorYellow = !lunchIndicatorYellow;
        lunchIndicator.style.color = lunchIndicatorYellow ? '#ff0' : '#0f0';
        updateLunchIndicatorText();
        alert(`✅ Lunch break set to ${lunchBreakDurationMinutes === 60 ? '1 hour' : '45 minutes'}`);
      });
      
      // Set initial display
      updateLunchIndicatorText();
    }
    updateLunchToggleButton();
   if (end) {
     end.addEventListener('change', () => {
       if (!hasTouchedTallyInputs && !hasShownFinishTimeWarning) {
         const enteredTime = end.value;
         end.value = '';
         showFinishTimeWarningModal(() => {
           end.value = enteredTime;
           hasShownFinishTimeWarning = true;
           calculateHoursWorked();
         }, () => {
           end.value = '';
         });
       } else {
         calculateHoursWorked();
       }
     });
   }
 if (hours) {
         hours.addEventListener("input", () => updateShedStaffHours(hours.value));
         updateShedStaffHours(hours.value);
     }
     document.querySelectorAll('#headerRow input[type="text"]').forEach(adjustStandNameWidth);
 document.querySelectorAll('#tallyBody td.sheep-type input[type="text"]').forEach(adjustSheepTypeWidth);
     document.querySelectorAll('#shedStaffTable td:nth-child(1) input').forEach(adjustShedStaffNameWidth);
    document.querySelectorAll('#shedStaffTable .hours-input').forEach(adjustShedStaffHoursWidth);
    document.querySelectorAll('input[type="text"]').forEach(applyInputHistory);
});
 
 document.addEventListener('input', function(e) {
     if (e.target.matches('#headerRow input[type="text"]')) {
         adjustStandNameWidth(e.target);
     }
      if (e.target.matches('#tallyBody td.sheep-type input[type="text"]')) {
         adjustSheepTypeWidth(e.target);
          updateSheepTypeTotals();
     }
if (e.target.matches('#shedStaffTable td:nth-child(1) input')) {
        adjustShedStaffNameWidth(e.target);
    }
    if (e.target.matches('#shedStaffTable .hours-input')) {
        adjustShedStaffHoursWidth(e.target);
    }
 });
 
 function addShedStaff() {
     const body = document.getElementById('shedStaffTable');
     const row = document.createElement('tr');
     row.innerHTML = `<td><input placeholder="Staff Name" type="text"/></td><td><input placeholder="e.g. 8h 30m" type="text" class="hours-input"/></td>`;
     body.appendChild(row);
     const hours = document.getElementById('hoursWorked');
     const nameInput = row.querySelector('td:nth-child(1) input');
     const hoursInput = row.querySelector('td:nth-child(2) input');
     if (hours && hoursInput) {
         hoursInput.value = hours.value;
     }
     if (nameInput) {
         adjustShedStaffNameWidth(nameInput);
         applyInputHistory(nameInput);
     }
     if (hoursInput) adjustShedStaffHoursWidth(hoursInput);
 }
 
 function removeShedStaff() {
     const body = document.getElementById('shedStaffTable');
     if (body.lastElementChild) {
         body.removeChild(body.lastElementChild);
     }
 }
 
 function clearHighlights() {
    document.querySelectorAll('.highlight-error').forEach(el => el.classList.remove('highlight-error'));
}

// Remove completely empty shearer columns, count rows and shed staff rows
function cleanUpEmptyRowsAndColumns(manual = false) {
    const table = document.getElementById('tallyTable');
    const headerRow = document.getElementById('headerRow');
    const body = document.getElementById('tallyBody');
    const subtotalRow = document.getElementById('subtotalRow');
    const staffTable = document.getElementById('shedStaffTable');
    if (!table || !headerRow || !body || !subtotalRow) return;

    // === CLEAN EMPTY STANDS (columns) ===
    for (let col = numStands; col >= 1; col--) {
        let isEmpty = true;
        for (let r = 0; r < body.rows.length; r++) {
            const inp = body.rows[r].cells[col]?.querySelector('input');
            if (inp && inp.value.trim() !== '') { isEmpty = false; break; }
        }
        const headerInp = headerRow.cells[col]?.querySelector('input');
        if (headerInp && headerInp.value.trim() !== '') isEmpty = false;
        if (isEmpty) {
            headerRow.deleteCell(col);
            for (let r = 0; r < body.rows.length; r++) body.rows[r].deleteCell(col);
            subtotalRow.deleteCell(col);
            numStands--;
        }
    }

    // === CLEAN EMPTY COUNT ROWS ===
    for (let r = body.rows.length - 1; r >= 0; r--) {
        const row = body.rows[r];
        let isEmpty = true;
        for (let c = 1; c <= numStands; c++) {
            const inp = row.cells[c]?.querySelector('input');
            if (inp && inp.value.trim() !== '') { isEmpty = false; break; }
        }
        const typeInput = row.querySelector('.sheep-type input');
        if (typeInput && typeInput.value.trim() !== '') isEmpty = false;
        if (isEmpty) {
            body.deleteRow(r);
            runs--;
        }
    }

    // === CLEAN EMPTY SHED STAFF ROWS ===
    if (staffTable) {
        for (let i = staffTable.rows.length - 1; i >= 0; i--) {
            const row = staffTable.rows[i];
            const nameInput = row.querySelector("input[type='text']");
            const name = nameInput?.value.trim() || '';

            // Remove row if no name is entered
            if (name === '') {
                staffTable.deleteRow(i);
            }
        }
    }

    updateTotals();
    updateSheepTypeTotals();
}
 
let saveCallback = null;
let manualSave = false;

function performSave(saveLocal, saveCloud, manual) {
    const finishTime = document.getElementById('finishTime')?.value;
    const sessionHasEnded = finishTime && finishTime.trim() !== '';

    if ((isSetupComplete && hasUserStartedEnteringData) || manual) {
        if (sessionHasEnded || manual) {
            cleanUpEmptyRowsAndColumns(manual);
        }
    }
    clearHighlights();
    const issues = [];
    const tbody = document.getElementById('tallyBody');
    const header = document.getElementById('headerRow');
    if (!tbody || !header) return;

    if (manual) {
        // Check empty stand columns
        for (let s = 1; s <= numStands; s++) {
            const inputs = Array.from(tbody.querySelectorAll(`tr td:nth-child(${s + 1}) input`));
            const empty = inputs.every(inp => !inp.value.trim());
            if (empty) {
                issues.push(`Stand ${s} has no data. Please remove unused stands.`);
                const headerInput = header.children[s].querySelector('input');
                if (headerInput) headerInput.classList.add('highlight-error');
                inputs.forEach(i => i.classList.add('highlight-error'));
            }
        }

        // Check empty count rows
        Array.from(tbody.querySelectorAll('tr')).forEach((row, idx) => {
            const standInputs = Array.from(row.querySelectorAll('td input[type="number"]')).slice(0, numStands);
            const sheepType = row.querySelector('.sheep-type input');
            const allEmpty = standInputs.every(i => !i.value.trim()) && (!sheepType || !sheepType.value.trim());
            if (allEmpty) {
                issues.push(`Count ${idx + 1} has no data. Please remove unused counts.`);
                standInputs.forEach(i => i.classList.add('highlight-error'));
                if (sheepType) sheepType.classList.add('highlight-error');
            }
        });

        // Check empty shed staff rows
        document.querySelectorAll('#shedStaffTable tr').forEach((row, idx) => {
            const name = row.querySelector('td:nth-child(1) input');
            const hours = row.querySelector('td:nth-child(2) input');
            if (name && hours && !name.value.trim() && !hours.value.trim()) {
                issues.push(`Shed Staff row ${idx + 1} has no data. Please remove unused rows.`);
                name.classList.add('highlight-error');
                hours.classList.add('highlight-error');
            }
        });

        if (issues.length) {
            window.alert(issues.join('\n'));
            return;
        }
    }
 
    // Collect current session data
    const data = collectExportData();
    data.viewOnly = true; // Lock session by default
    data.meta = data.meta || {};
    data.meta.date = new Date().toLocaleDateString("en-NZ");
   
    if (saveLocal) {
        const json = JSON.stringify(data, null, 2);
        localStorage.setItem('sheariq_saved_session', json);
        saveSessionToStorage(data);
        if (manual) {
            alert('Session saved successfully to local storage.');
        }
    }

    if (saveCloud) {
        saveSessionToFirestore(true);
    }
}

function saveData(manual = false, callback) {
    manualSave = manual;
    saveCallback = typeof callback === 'function' ? callback : null;
    const modal = document.getElementById('saveOptionsModal');
    if (manual) {
        if (modal) modal.style.display = 'flex';
    } else {
        performSave(true, false, false);
    }
}

function handleSaveOption(option) {
    const modal = document.getElementById('saveOptionsModal');
    const saveLocal = option === 'local' || option === 'both';
    const saveCloud = option === 'cloud' || option === 'both';
    performSave(saveLocal, saveCloud, manualSave);
    if (manualSave) {
        showAutosaveStatus('\ud83d\udcbe Saved locally');
    }
    if (modal) modal.style.display = 'none';
    if (typeof saveCallback === 'function') {
        const cb = saveCallback;
        saveCallback = null;
        cb();
    }
    manualSave = false;
}
 
 function showView(id) {
     document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
     const view = document.getElementById(id);
     if (view) view.style.display = 'block';
     document.querySelectorAll('.tab-button').forEach(btn => {
         btn.classList.toggle('active', btn.dataset.view === id);
     });
     if (id === 'summaryView') buildSummary();
      if (id === 'stationSummaryView') {
         populateStationDropdown();
         buildStationSummary();
     }
 }
 
 function buildSummary() {
     const headerRow = document.getElementById('headerRow');
     const tallyBody = document.getElementById('tallyBody');
     if (!headerRow || !tallyBody) return;
 
     const numStandsLocal = numStands;
     const names = [];
     for (let i = 1; i <= numStandsLocal; i++) {
         const input = headerRow.children[i]?.querySelector('input');
         const name = input && input.value.trim() ? input.value.trim() : `Stand ${i}`;
         names.push(name);
     }
 
     const optionSet = new Set(Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value));
     const totals = {};
     const standTotals = new Array(numStandsLocal).fill(0);
     Array.from(tallyBody.querySelectorAll('tr')).forEach(row => {
        const tallyInputs = row.querySelectorAll('td input[type="number"]');
        const hasTally = Array.from(tallyInputs).some(inp => inp.value.trim() !== '');
        if (!hasTally) return; // skip empty row
       
        const typeInput = row.querySelector('.sheep-type input');
        let typeRaw = typeInput ? typeInput.value.trim() : '';
        if (typeRaw === '') {
            typeRaw = '❓ Missing Type';
        }
        const type = (optionSet.has(typeRaw) || typeRaw === '❓ Missing Type') ? typeRaw : 'Other';
         if (!totals[type]) totals[type] = new Array(numStandsLocal).fill(0);
        for (let s = 1; s <= numStandsLocal; s++) {
            const val = parseInt(row.children[s]?.querySelector('input')?.value) || 0;
            totals[type][s-1] += val;
            standTotals[s-1] += val;
        }
    });
 
     const types = Object.keys(totals);
     const theadRow = document.querySelector('#summaryTable thead tr');
     const tbody = document.getElementById('summaryTableBody');
     if (!theadRow || !tbody) return;
     theadRow.innerHTML = '';
     const shearerTh = document.createElement('th');
    shearerTh.textContent = 'Shearer';
    theadRow.appendChild(shearerTh);
    types.forEach(t => {
        const th = document.createElement('th');
        const label = (t === '❓ Missing Type')
            ? `<span class="missing-type">${t}</span>`
            : t;
        th.innerHTML = label;
        theadRow.appendChild(th);
    });
     const totalTh = document.createElement('th');
     totalTh.textContent = 'Total';
     theadRow.appendChild(totalTh);
     tbody.innerHTML = '';
 
     names.forEach((name, idx) => {
         let rowTotal = 0;
         const tr = document.createElement('tr');
         const nameTd = document.createElement('td');
         nameTd.textContent = name;
         tr.appendChild(nameTd);
         types.forEach(t => {
             const td = document.createElement('td');
             const val = totals[t] ? totals[t][idx] : 0;
             rowTotal += val;
             td.textContent = val;
             tr.appendChild(td);
         });
         const totalTd = document.createElement('td');
         totalTd.textContent = rowTotal;
         tr.appendChild(totalTd);
         tbody.appendChild(tr);
     });
 
     const totalRow = document.createElement('tr');
     const labelTh = document.createElement('th');
     labelTh.textContent = 'Total Sheep';
     totalRow.appendChild(labelTh);
     types.forEach(t => {
         const th = document.createElement('th');
         const sum = totals[t].reduce((a,b) => a + b, 0);
        th.textContent = sum;
         totalRow.appendChild(th);
     });
     const grand = standTotals.reduce((a,b) => a + b, 0);
     const grandTh = document.createElement('th');
     grandTh.textContent = grand;
     totalRow.appendChild(grandTh);
     tbody.appendChild(totalRow);
 
     const staffBody = document.getElementById('summaryShedStaff');
     if (staffBody) {
         staffBody.innerHTML = '';
          document.querySelectorAll('#shedStaffTable tr').forEach(row => {
            const name = row.querySelector('td:nth-child(1) input')?.value || '';
            const hoursStr = row.querySelector('td:nth-child(2) input')?.value || '';
            if (name.trim() || hoursStr.trim()) {
                const tr = document.createElement('tr');
                const nameTd = document.createElement('td');
                nameTd.textContent = name;
                const hoursTd = document.createElement('td');
                 hoursTd.textContent = hoursStr;
                tr.appendChild(nameTd);
                tr.appendChild(hoursTd);
                staffBody.appendChild(tr);
            }
        });
    }
}
 
async function populateStationDropdown() {
    const select = document.getElementById('stationSelect');
    if (!select) return;
    const current = select.value;
    const sessions = await listSessionsFromFirestore();
    const nameMap = new Map();
    sessions.forEach(s => {
        const trimmed = (s.stationName || '').trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (!nameMap.has(key)) nameMap.set(key, trimmed);
    });
    const names = Array.from(nameMap.values());
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    select.appendChild(blank);
    names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}
 
 function aggregateStationData(sessions) {
     const optionSet = new Set(Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value));
     const shearerData = {};
     const staffData = {};
     const leaders = {};
     const combs = {};
     const totalByType = {};
     let grandTotal = 0;
 
     sessions.forEach(s => {
         const standNames = (s.stands || []).map(st => st.name || '');
         (s.shearerCounts || []).forEach(run => {
        let rawType = (run.sheepType || '').trim();
            if (rawType === '') {
                rawType = '❓ Missing Type';
            }
            const type = (optionSet.has(rawType) || rawType === '❓ Missing Type') ? rawType : 'Other';
             run.stands.forEach((val, idx) => {
                 const name = standNames[idx] || `Stand ${idx+1}`;
                 const num = parseInt(val) || 0;
                 if (!shearerData[name]) {
                     shearerData[name] = { total: 0 };
                     }
                 if (!Object.prototype.hasOwnProperty.call(shearerData[name], type)) {
                     shearerData[name][type] = 0;
                 }
                 shearerData[name][type] += num;
                 shearerData[name].total += num;
                 totalByType[type] = (totalByType[type] || 0) + num;
                 grandTotal += num;
             });
         });
 
         if (Array.isArray(s.shedStaff)) {
            s.shedStaff.forEach(st => {
                const h = parseHoursWorked(st.hours);
                if (!st.name) return;
                staffData[st.name] = (staffData[st.name] || 0) + h;
            });
        }
 
         if (s.teamLeader) {
             const totalSheep = (s.shearerCounts || []).reduce((a,b) => a + (parseInt(b.total)||0), 0);
             if (!leaders[s.teamLeader]) leaders[s.teamLeader] = { total: 0, dates: new Set() };
             leaders[s.teamLeader].total += totalSheep;
             leaders[s.teamLeader].dates.add(s.date);
         }
 
         if (s.combType) {
             if (!combs[s.combType]) combs[s.combType] = new Set();
             combs[s.combType].add(s.date);
         }
     });
 
     return { shearerData, staffData, leaders, combs, totalByType, grandTotal };
}

// Determine sheep age/sex category from a type name
export function detectSheepCategory(sheepTypeName) {
   const name = (sheepTypeName || "").toLowerCase().trim();
  const ewe = /\bewes?\b/.test(name);
  const ram = /\brams?\b/.test(name);
  const lamb = /\blambs?\b/.test(name);
  const wether = /\bwethers?\b/.test(name);
  const mixed = /\bmixed\b/.test(name);
  const longTail = /\blong tail\b/.test(name);

  if (ewe && !lamb) return 'adult-female';
  if (ewe && lamb) return 'lamb-female';
  if (ram && lamb) return 'lamb-male';
  if ((wether && lamb) || mixed || longTail) return 'lamb-wether';
  if (wether && !lamb) return 'adult-male';
  if (ram && !lamb) return 'adult-male';
  return 'unknown';
}
 
export async function buildStationSummary() {
    const stationInput = document.getElementById('stationSelect');
    const startInput = document.getElementById('summaryStart');
    const endInput = document.getElementById('summaryEnd');
 
     const station = stationInput?.value.trim() || '';
     const start = startInput?.value;
     const end = endInput?.value;
 
     console.log('Selected station:', station);
     console.log('Selected start:', start, 'end:', end);
 
    const allSessions = await listSessionsFromFirestore();

    // Normalize station names for comparison
    const targetStation = station.toLowerCase();
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const sessions = allSessions.filter(s => {
        const storedStation = (s.stationName || '').trim().toLowerCase();
        if (station && storedStation !== targetStation) return false;
        const sessionDate = new Date(s.date);
        if (startDate && sessionDate < startDate) return false;
        if (endDate && sessionDate > endDate) return false;
        return true;
    });
     
     console.log('Filtered sessions:', sessions);
 
     const msg = document.getElementById('stationNoData');
     if (msg) msg.style.display = sessions.length ? 'none' : 'block';
     const { shearerData, staffData, leaders, combs, totalByType, grandTotal } = aggregateStationData(sessions);
 
     const adultFemales = [];
    const lambFemales = [];
    const lambMales = [];
    const lambWethers = [];
    const adultMales = [];
    const unknowns = [];

    Object.keys(totalByType).forEach(t => {
        if (totalByType[t] <= 0) return;
        switch (detectSheepCategory(t)) {
            case 'adult-female':
                adultFemales.push(t); break;
            case 'lamb-female':
                lambFemales.push(t); break;
            case 'lamb-male':
                lambMales.push(t); break;
            case 'lamb-wether':
                lambWethers.push(t); break;
            case 'adult-male':
                adultMales.push(t); break;
            default:
                unknowns.push(t); break;
        }
    });

    const activeTypes = [].concat(adultFemales, lambFemales, lambMales, lambWethers, adultMales, unknowns);
 
      const shearHead = document.querySelector('#stationShearerTable thead tr');
    const shearBody = document.querySelector('#stationShearerTable tbody');
    if (shearHead && shearBody) {
        shearHead.innerHTML = '';
         const sTh = document.createElement('th');
        sTh.textContent = 'Shearer';
        shearHead.appendChild(sTh);
        activeTypes.forEach(t => {
            const th = document.createElement('th');
            const label = (t === '❓ Missing Type')
                ? `<span class="missing-type">${t}</span>`
                : t;
           const age = detectAgeCategory(t);
            th.innerHTML = `<span title="Age: ${age}">${label}</span>`;
            shearHead.appendChild(th);
        });
        const totTh = document.createElement('th');
        totTh.textContent = 'Total';
        shearHead.appendChild(totTh);

        shearBody.innerHTML = '';
        const rows = Object.entries(shearerData).sort((a,b)=>b[1].total-a[1].total);
        rows.forEach(([name,data]) => {
             const trimmed = name?.trim() || '';
            if (!trimmed) return;
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = trimmed;
            tr.appendChild(nameTd);
            activeTypes.forEach(t => {
                const td = document.createElement('td');
                td.textContent = data[t];
                tr.appendChild(td);
            });
            const totalTd = document.createElement('td');
            totalTd.textContent = data.total;
            tr.appendChild(totalTd);
            shearBody.appendChild(tr);
        });
    }

    const staffBody = document.querySelector('#stationStaffTable tbody');
    if (staffBody) {
        staffBody.innerHTML = '';
        const rows = Object.entries(staffData).sort((a,b)=>b[1]-a[1]);
        rows.forEach(([n,h])=>{
            const trimmed = n?.trim() || '';
            if (!trimmed) return;
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = trimmed;
            const hoursTd = document.createElement('td');
            hoursTd.textContent = formatHoursWorked(h);
            tr.appendChild(nameTd);
            tr.appendChild(hoursTd);
            staffBody.appendChild(tr);
        });
    }

    const leaderBody = document.querySelector('#stationLeaderTable tbody');
    if (leaderBody) {
        leaderBody.innerHTML = '';
        const rows = Object.entries(leaders).sort((a,b)=>b[1].total-a[1].total);
        rows.forEach(([n,o])=>{
            const trimmed = n?.trim() || '';
            if (!trimmed) return;
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = trimmed;
            const totalTd = document.createElement('td');
            totalTd.textContent = o.total;
            const datesTd = document.createElement('td');
            datesTd.textContent = Array.from(o.dates).map(formatDateNZ).join(', ');
            tr.appendChild(nameTd);
             tr.appendChild(totalTd);
             tr.appendChild(datesTd);
             leaderBody.appendChild(tr);
         });
     }
 
      const combBody = document.querySelector('#stationCombTable tbody');
    if (combBody) {
        combBody.innerHTML = '';
         const rows = Object.entries(combs);
        rows.forEach(([c,set])=>{
            const trimmed = c?.trim() || '';
            if (!trimmed) return;
            const tr = document.createElement('tr');
            const combTd = document.createElement('td');
            combTd.textContent = trimmed;
            const datesTd = document.createElement('td');
            datesTd.textContent = Array.from(set).map(formatDateNZ).join(', ');
            tr.appendChild(combTd);
            tr.appendChild(datesTd);
            combBody.appendChild(tr);
        });
    }
 
     const totalHead = document.querySelector('#stationTotalTable thead tr');
     const totalBody = document.querySelector('#stationTotalTable tbody');
     if (totalHead && totalBody) {
        totalHead.innerHTML = '';
         activeTypes.forEach(t=>{
            const th = document.createElement('th');
            const label = (t === '❓ Missing Type')
                ? `<span class="missing-type">${t}</span>`
                : t;
            const age = detectAgeCategory(t);
            th.innerHTML = `<span title="Age: ${age}">${label}</span>`;
            totalHead.appendChild(th);
        });
         const grandTh = document.createElement('th');
         grandTh.textContent = 'Grand Total';
         totalHead.appendChild(grandTh);
 
         totalBody.innerHTML = '';
         const tr = document.createElement('tr');
         activeTypes.forEach(t=>{
             const td = document.createElement('td');
             td.textContent = totalByType[t] || 0;
             tr.appendChild(td);
         });
         const totalTd = document.createElement('td');
         totalTd.textContent = grandTotal;
         tr.appendChild(totalTd);
         totalBody.appendChild(tr);
    }
    document.dispatchEvent(new CustomEvent('station-summary-updated'));
}
 
export function clearStationSummaryView() {
    document.querySelector('#stationShearerTable thead')?.replaceChildren();
    document.querySelector('#stationShearerTable tbody')?.replaceChildren();
    document.querySelector('#stationStaffTable tbody')?.replaceChildren();
    document.querySelector('#stationLeaderTable tbody')?.replaceChildren();
    document.querySelector('#stationCombTable tbody')?.replaceChildren();
    document.querySelector('#stationTotalTable thead')?.replaceChildren();
    document.querySelector('#stationTotalTable tbody')?.replaceChildren();
    const msg = document.getElementById('stationNoData');
    if (msg) msg.style.display = 'block';
}

export function collectExportData() {
     const data = {
         date: document.getElementById('date')?.value || '',
        stationName: document.getElementById('stationName')?.value.trim() || '',
        teamLeader: document.getElementById('teamLeader')?.value.trim() || '',
         combType: document.getElementById('combType')?.value || '',
         startTime: document.getElementById('startTime')?.value || '',
         finishTime: document.getElementById('finishTime')?.value || '',
         hoursWorked: document.getElementById('hoursWorked')?.value || '',
         timeSystem: isNineHourDay ? '9-hr' : '8-hr',
         stands: [],
         shearerCounts: [],
         shedStaff: [],
         sheepTypeTotals: []
     };

     const finishTime = document.getElementById('finishTime')?.value;
     const sessionHasEnded = finishTime && finishTime.trim() !== '';
 
     const header = document.getElementById('headerRow');
     const tbody = document.getElementById('tallyBody');
     if (!header || !tbody) return data;
 
    for (let s = 1; s <= numStands; s++) {
        const headerInput = header.children[s]?.querySelector('input');
        const name = headerInput && headerInput.value.trim() ? headerInput.value.trim() : `Stand ${s}`;
        let hasData = !!(headerInput && headerInput.value.trim());
        if (!hasData) {
            for (let r = 0; r < tbody.children.length; r++) {
                const val = tbody.children[r].children[s]?.querySelector('input[type="number"]')?.value;
                if (val && val.trim()) { hasData = true; break; }
            }
        }
        if (!sessionHasEnded || hasData) {
            data.stands.push({ index: s, name });
        }
    }
 
    Array.from(tbody.querySelectorAll('tr')).forEach((row, idx) => {
        let rowHasData = false;
        const standVals = [];
        data.stands.forEach(s => {
            const input = row.children[s.index]?.querySelector('input[type="number"]');
            const val = input ? input.value : '';
            if (val.trim()) rowHasData = true;
            standVals.push(val);

        });
        const typeInput = row.querySelector('.sheep-type input');
        const sheepType = typeInput ? typeInput.value : '';
        if (sheepType.trim()) rowHasData = true;
        if (!sessionHasEnded || rowHasData) {
            data.shearerCounts.push({
                count: idx + 1,
                stands: standVals,
                total: row.querySelector('.run-total')?.innerText || '0',
                sheepType
            });
        }
    });
 
    document.querySelectorAll('#shedStaffTable tr').forEach(row => {
        const name = row.querySelector('td:nth-child(1) input');
        const hours = row.querySelector('td:nth-child(2) input');
        const hasData = name && hours && (name.value.trim() || hours.value.trim());
        if (!sessionHasEnded || hasData) {
            data.shedStaff.push({ name: name?.value || '', hours: hours?.value || '' });
        }
    });
 
     document.querySelectorAll('#sheepTypeTotalsTable tbody tr').forEach(tr => {
         const cells = tr.querySelectorAll('td');
         if (cells.length >= 2) {
             data.sheepTypeTotals.push({ type: cells[0].textContent, total: cells[1].textContent });
         }
     });
 
     return data;
 }
 
export function buildExportRows(data) {
     const rows = [];
     const boldRows = [];
     const add = (arr, bold=false) => {
         rows.push(arr);
         if (bold) boldRows.push(rows.length - 1);
     };
 
     add(['Station Name', data.stationName]);
     add(['Date', data.date]);
     add(['Team Leader', data.teamLeader]);
     add(['Comb Type', data.combType]);
     add(['Start Time', data.startTime]);
     add(['Finish Time', data.finishTime]);
    add(['Hours Worked', data.hoursWorked]);
    add(['Time System', data.timeSystem]);
     add([]);
 
 add(['Shearer Tallies'], true);
     const headerRow = ['Count #', ...data.stands.map(s => s.name), 'Total', 'Sheep Type'];
     add(headerRow, true);
     data.shearerCounts.forEach(run => {
         const row = [run.count, ...run.stands, run.total, run.sheepType];
         add(row);
     });
     add([]);
 
     add(['Shed Staff'], true);
     add(['Name', 'Hours Worked'], true);
      data.shedStaff.forEach(s => {
        add([s.name, s.hours]);
    });
     add([]);
 
     add(['Sheep Type Totals'], true);
     add(['Sheep Type', 'Total'], true);
    data.sheepTypeTotals.forEach(t => add([t.type, t.total]));

    return { rows, boldRows };
}

function updateUIForRole(role) {
    const admin = role === 'admin';
    const ids = ['saveCloudBtn', 'saveBothBtn', 'loadCloudBtn', 'exportFarmSummaryBtn'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (admin) el.removeAttribute('disabled');
            else el.setAttribute('disabled', 'disabled');
        }
    });
}

// Verify the signed-in user exists either as a contractor document or within
// a contractor's users subcollection
export async function verifyContractorUser() {
  const user = firebase.auth().currentUser;
  console.log('[verifyContractorUser] Current user:', user);

  const db = firebase.firestore();

  // First, check if this user is a contractor by UID
  const contractorSnap = await db.collection('contractors').doc(user.uid).get();
  if (contractorSnap.exists) {
    console.log('[verifyContractorUser] User is a contractor');
    localStorage.setItem('contractor_id', user.uid);
    return 'contractor';
  }

  console.log('[verifyContractorUser] Not a contractor, scanning staff collections');

  // Search across all contractors/{contractorId}/staff subcollections
  const query = await db.collectionGroup('staff')
                        .where('email', '==', user.email)
                        .where('role', '==', 'staff')
                        .limit(1)
                        .get();

  if (!query.empty) {
    const staffDoc = query.docs[0];
    const contractorId = staffDoc.ref.parent.parent.id;
    const staffUid = firebase.auth().currentUser.uid;
    await db.collection('contractors')
            .doc(contractorId)
            .collection('staff')
            .doc(staffUid)
            .update({ lastActive: firebase.firestore.FieldValue.serverTimestamp() });
    localStorage.setItem('contractor_id', contractorId);
    console.log('[verifyContractorUser] Found matching staff for contractor', contractorId);
    return 'staff';
  }

  console.log('No matching user found');
  alert('You are not authorised for this account.');
  firebase.auth().signOut();
  return null;
}

// Save the current session to Firestore under
// contractors/{contractorId}/sessions/[stationName_date_teamLeader]
export async function saveSessionToFirestore(showStatus = false) {
  if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.auth) {
    return;
  }

  const currentUser = firebase.auth().currentUser;
  if (!currentUser) return;

  const data = collectExportData();
  const station = (data.stationName || '').trim().replace(/\s+/g, '_');
  const date = data.date || '';
  const leader = (data.teamLeader || '').trim().replace(/\s+/g, '_');
  if (!(station && date && leader)) return;

  if (!firestoreSessionId) {
    firestoreSessionId = `${station}_${date}_${leader}`;
  }

  // ✅ Use contractorId from localStorage
  const contractorId = localStorage.getItem('contractor_id');
  if (!contractorId) {
    console.error('Missing contractor_id in localStorage');
    return;
  }

  const path = `contractors/${contractorId}/sessions/${firestoreSessionId}`;
  await firebase.firestore()
    .doc(path)
    .set({
      ...data,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

  if (showStatus) {
    alert('✅ Session saved to the cloud!');
    showAutosaveStatus('\u2601\ufe0f Saved to cloud');
  }
}

// Fetch list of all sessions for this contractor from Firestore
export async function listSessionsFromFirestore() {
    if (typeof firebase === 'undefined' ||
        !firebase.firestore ||
        !firebase.auth) {
        return [];
    }

    const contractorId = localStorage.getItem('contractor_id');
    if (!contractorId) {
        console.error('Missing contractor_id');
        return [];
    }

    try {
        // Sessions are stored under the contractor UID so this
        // will return sessions saved by any user on the account
        const snap = await firebase.firestore()
            .collection('contractors')
            .doc(contractorId)
            .collection('sessions')
            .get();

        const sessions = snap.docs.map(doc => {
            const d = doc.data() || {};
            return { id: doc.id, ...d };
        });

        const seen = new Set();
        const uniqueSessions = sessions.filter(session => {
            if (seen.has(session.id)) return false;
            seen.add(session.id);
            return true;
        });

        return uniqueSessions;
    } catch (err) {
        console.error('❌ Failed to list sessions from Firestore:', err);
        return [];
    }
}

// Fetch a specific session document by ID
export async function loadSessionFromFirestore(id) {
    if (!id || typeof firebase === 'undefined' ||
        !firebase.firestore || !firebase.auth) {
        return null;
    }

    const contractorId = localStorage.getItem('contractor_id');
    if (!contractorId) {
        console.error('Missing contractor_id');
        return null;
    }

    try {
        const docSnap = await firebase.firestore()
            .collection('contractors')
            .doc(contractorId)
            .collection('sessions')
            .doc(id)
            .get();
        if (docSnap.exists) {
            return docSnap.data();
        }
        return null;
    } catch (err) {
        console.error('❌ Failed to load session from Firestore:', err);
        return null;
    }
}

function confirmUnsavedChanges(next) {
    if (!hasUnsavedChanges()) { next(); return; }
    const modal = document.getElementById('unsavedModal');
    const saveBtn = document.getElementById('unsavedSaveBtn');
    const discardBtn = document.getElementById('unsavedDiscardBtn');
    const cancelBtn = document.getElementById('unsavedCancelBtn');
    if (modal && saveBtn && discardBtn && cancelBtn) {
        modal.style.display = 'flex';
        const cleanup = () => {
            modal.style.display = 'none';
            saveBtn.removeEventListener('click', onSave);
            discardBtn.removeEventListener('click', onDiscard);
            cancelBtn.removeEventListener('click', onCancel);
        };
        const onSave = () => { cleanup(); saveData(true, next); };
        const onDiscard = () => { cleanup(); next(); };
        const onCancel = () => { cleanup(); };
        saveBtn.addEventListener('click', onSave);
        discardBtn.addEventListener('click', onDiscard);
        cancelBtn.addEventListener('click', onCancel);
    } else {
        if (confirm('You have unsaved work. Save before loading?')) {
            saveData(true, next);
        } else if (confirm('Continue without saving?')) {
            next();
        }
    }
}

function confirmSaveReset(full) {
    const modal = document.getElementById('unsavedModal');
    const saveBtn = document.getElementById('unsavedSaveBtn');
    const discardBtn = document.getElementById('unsavedDiscardBtn');
    const cancelBtn = document.getElementById('unsavedCancelBtn');
    const msgEl = modal?.querySelector('p');
    if (modal && saveBtn && discardBtn && cancelBtn && msgEl) {
        const originalText = msgEl.textContent;
        const origSave = saveBtn.textContent;
        const origDiscard = discardBtn.textContent;
        msgEl.textContent = 'Do you want to save the current session before resetting?';
        saveBtn.textContent = 'Save & Reset';
        discardBtn.textContent = 'Just Reset';
        modal.style.display = 'flex';
        const cleanup = () => {
            modal.style.display = 'none';
            msgEl.textContent = originalText;
            saveBtn.textContent = origSave;
            discardBtn.textContent = origDiscard;
            saveBtn.removeEventListener('click', onSave);
            discardBtn.removeEventListener('click', onDiscard);
            cancelBtn.removeEventListener('click', onCancel);
        };
        const onSave = () => { cleanup(); saveData(true, () => { if (typeof performReset === 'function') performReset(full); }); };
        const onDiscard = () => { cleanup(); if (typeof performReset === 'function') performReset(full); };
        const onCancel = () => { cleanup(); };
        saveBtn.addEventListener('click', onSave);
        discardBtn.addEventListener('click', onDiscard);
        cancelBtn.addEventListener('click', onCancel);
    } else {
        const save = confirm('Do you want to save the current session before resetting?');
        if (save) {
            saveData(true, () => { if (typeof performReset === 'function') performReset(full); });
        } else if (confirm('Reset without saving?')) {
            if (typeof performReset === 'function') performReset(full);
        }
    }
}

function showFinishTimeWarningModal(onConfirm, onCancel) {
    const modal = document.createElement('div');
    modal.id = 'finishWarningModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <h2>⚠️ Heads up</h2>
        <p>Entering a Finish Time now will trigger automatic cleanup — all empty rows and columns will be removed. 
        Make sure you’ve entered all shearers, shed staff, and tallies first.</p>
        <div class="modal-buttons">
          <button id="confirmFinishTime">OK, Continue</button>
          <button id="cancelFinishTime">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    document.getElementById('confirmFinishTime').onclick = () => {
        modal.remove();
        if (typeof onConfirm === 'function') onConfirm();
    };

    document.getElementById('cancelFinishTime').onclick = () => {
        modal.remove();
        if (typeof onCancel === 'function') onCancel();
    };
}

// Clears the current tally layout and counters without prompting
function resetTallySheet() {
    const headerRowEl = document.getElementById('headerRow');
    const bodyEl = document.getElementById('tallyBody');
    const subtotalRowEl = document.getElementById('subtotalRow');
    const staffTableEl = document.getElementById('shedStaffTable');
    const totalsBodyEl = document.querySelector('#sheepTypeTotalsTable tbody');

    if (headerRowEl) headerRowEl.innerHTML = '<th>Count #</th><th>Count Total</th><th class="sheep-type">Sheep Type</th>';
    if (bodyEl) bodyEl.innerHTML = '';
    if (subtotalRowEl) subtotalRowEl.innerHTML = '<th>Shearer Totals</th>';
    if (staffTableEl) staffTableEl.innerHTML = '';
    if (totalsBodyEl) totalsBodyEl.innerHTML = '';

    numStands = 0;
    runs = 0;
    layoutBuilt = false;
    isSetupComplete = false;
    hasUserStartedEnteringData = false;
}

// Clear any stored metadata so a new day's session doesn't reuse old values
function resetForNewDay() {
  firestoreSessionId = null;

  // Clean up old session metadata safely
  try {
    stationName = null;
    teamLeader = null;
    sessionDate = null;
  } catch (e) {
    // Ignore if not declared — this prevents crashes
  }

  // Clear saved data from localStorage if it exists
  try {
    localStorage.removeItem('session_data');
  } catch (e) {
    // Ignore any errors
  }
}

function loadSessionObject(session) {
    // Cancel any pending autosave to avoid unintended saves while loading
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }

    // Precompute the Firestore document ID for this session
    firestoreSessionId = '';
    if (!session.viewOnly && session.stationName && session.date && session.teamLeader) {
        const station = String(session.stationName).trim().replace(/\s+/g, '_');
        const leader = String(session.teamLeader).trim().replace(/\s+/g, '_');
        firestoreSessionId = `${station}_${session.date}_${leader}`;
    }

    // Mark the loaded data as the latest saved state
    lastSavedJson = JSON.stringify(session);
    const now = Date.now();
    lastLocalSave = now;
    lastCloudSave = now;
    
    // Always enforce locking first so any subsequent DOM manipulation
    // doesn't accidentally trigger focus events while unlocked
    enforceSessionLock(session.date);
    if (session.viewOnly) {
       lockSession(); // Let focusin listener handle PIN prompt if needed
    }
    populateSessionData(session);
    rebuildRowsFromSession(session);
    layoutBuilt = true;

}

function startSessionLoader(session) {
    const today = new Date().toLocaleDateString("en-NZ");
    const current = collectExportData();
    if (current && formatDateNZ(current.date) === today) {
        if (!localStorage.getItem("session_today_backup")) {
            current.meta = current.meta || {};
            current.meta.date = today;
            delete current.viewOnly; // ensure today's backup isn't locked
            localStorage.setItem("session_today_backup", JSON.stringify(current));
        }
    }
    confirmUnsavedChanges(() => {
        const summary = `Station: ${session.stationName}\nDate: ${formatDateNZ(session.date)}\nTeam Leader: ${session.teamLeader || ''}\n\nDo you want to load this session?`;
        if (confirm(summary)) {
            loadSessionObject(session);
        }
    });
}

function restoreTodaySession() {
  const backup = localStorage.getItem("session_today_backup");
  if (!backup) {
    alert("No backup session found.");
    return;
  }

  try {
    const session = JSON.parse(backup);
    delete session.viewOnly; // ensure restored session is editable
    const summary = `Return to today\u2019s session?\n\nStation: ${session.stationName}\nDate: ${formatDateNZ(session.date)}\nTeam Leader: ${session.teamLeader || ''}`;
    if (!confirm(summary)) return;

    startSessionLoader(session);
    localStorage.removeItem("session_today_backup");
  } catch (e) {
    console.error("\u274c Failed to restore today\u2019s session:", e);
    alert("Something went wrong restoring your session.");
  }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const isLoadedSession = params.get('loadedSession') === 'true';
    const isNewDay = params.get('newDay') === 'true';

    if (isLoadedSession) {
        const json = localStorage.getItem('active_session');
        if (json) {
            try {
                const session = JSON.parse(json);
                const viewOnly = localStorage.getItem('viewOnlyMode') === 'true';
                session.viewOnly = viewOnly;
                const fsId = localStorage.getItem('firestoreSessionId');
                if (fsId) firestoreSessionId = fsId;
                loadSessionObject(session);
            } catch (e) {
                console.error('Failed to parse active_session', e);
            }
        }
    } else if (isNewDay) {
        resetForNewDay();
    }

    const storedRole = sessionStorage.getItem('userRole');
    if (storedRole) updateUIForRole(storedRole);
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    showView('tallySheetView');

    const loadBtn = document.getElementById('loadSessionBtn');
    const lastBtn = document.getElementById('loadLastBtn');
    const otherBtn = document.getElementById('loadOtherBtn');
    const cancelBtn = document.getElementById('cancelLoadBtn');
    const confirmBtn = document.getElementById('confirmLoadBtn');
    const backBtn = document.getElementById('loadSessionBackBtn');
    const stationInput = document.getElementById('loadStationInput');
    const dateInput = document.getElementById('loadDateInput');
    const partialResetBtn = document.getElementById('partialResetBtn');
    const fullResetBtn = document.getElementById('fullResetBtn');
     const setupConfirmBtn = document.getElementById('setupConfirmBtn');
    const setupCancelBtn = document.getElementById('setupCancelBtn');
    const stationNameInput = document.getElementById('stationName');
    const saveLocalBtn = document.getElementById('saveLocalBtn');
    const saveCloudBtn = document.getElementById('saveCloudBtn');
    const saveBothBtn = document.getElementById('saveBothBtn');
    const loadLocalBtn = document.getElementById('loadLocalBtn');
    const loadCloudBtn = document.getElementById('loadCloudBtn');
    const cloudSelect = document.getElementById('cloudSessionSelect');
    const cloudConfirmBtn = document.getElementById('loadCloudConfirmBtn');
    const cloudCancelBtn = document.getElementById('cancelCloudLoadBtn');
    if (!layoutBuilt && !getLastSession()) {
    window.awaitingSetupPrompt = true;
  }
  if (stationNameInput) {
      stationNameInput.addEventListener('change', () => {
        if (window.awaitingSetupPrompt && stationNameInput.value.trim()) {
          window.awaitingSetupPrompt = false;
        showSetupModal(); // safer version that works
        }
      });
    }

const interceptReset = (full) => (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmSaveReset(full);
    };
    partialResetBtn?.addEventListener('click', interceptReset(false), true);
    fullResetBtn?.addEventListener('click', interceptReset(true), true);



    loadBtn?.addEventListener('click', showLoadOptionsModal);
    loadLocalBtn?.addEventListener('click', () => {
        hideLoadOptionsModal();
        showLoadSessionModal();
    });
    loadCloudBtn?.addEventListener('click', async () => {
        hideLoadOptionsModal();
        const sessions = await listSessionsFromFirestore();
        populateCloudSessionDropdown(sessions);
        showCloudSessionModal();
    });
    cloudCancelBtn?.addEventListener('click', hideCloudSessionModal);
    cloudConfirmBtn?.addEventListener('click', async () => {
        const id = cloudSelect?.value;
        if (!id) { alert('Please select a session'); return; }
        hideCloudSessionModal();
        const session = await loadSessionFromFirestore(id);
        if (session) {
            startSessionLoader(session);
        } else {
            alert('Failed to load session from cloud.');
        }
    });
    cancelBtn?.addEventListener('click', hideLoadSessionModal);
    lastBtn?.addEventListener('click', () => {
        const session = getLastSession();
        hideLoadSessionModal();
        if (!session) { alert('No saved sessions found.'); return; }
        startSessionLoader(session);
    });
    otherBtn?.addEventListener('click', () => {
        populateStationOptions();
        stationInput.value = '';
        dateInput.value = '';
        document.getElementById('loadSessionStep1').style.display = 'none';
        document.getElementById('loadSessionStep2').style.display = 'block';
    });
    backBtn?.addEventListener('click', () => {
        document.getElementById('loadSessionStep2').style.display = 'none';
        document.getElementById('loadSessionStep1').style.display = 'block';
    });
    stationInput?.addEventListener('input', () => populateDateOptions(stationInput.value));
     setupConfirmBtn?.addEventListener('click', confirmSetupModal);
    setupCancelBtn?.addEventListener('click', hideSetupModal);
    confirmBtn?.addEventListener('click', () => {
        const station = stationInput.value.trim();
        const dateNZ = dateInput.value.trim();
        if (!station || !dateNZ) { alert('Please enter station and date'); return; }
        const iso = isoFromNZDate(dateNZ);
        const session = getStoredSessions().find(s =>
            s.stationName.trim().toLowerCase() === station.toLowerCase() && s.date === iso);
        if (!session) { alert('Session not found'); return; }
    hideLoadSessionModal();
      startSessionLoader(session);
    });

    saveLocalBtn?.addEventListener('click', () => handleSaveOption('local'));
    saveCloudBtn?.addEventListener('click', () => handleSaveOption('cloud'));
    saveBothBtn?.addEventListener('click', () => handleSaveOption('both'));

    const exportBtn = document.getElementById('exportFarmSummaryBtn');
    exportBtn?.addEventListener('click', () => {
        exportFarmSummaryCSV();
    });

    document.addEventListener('focusin', (e) => {
        if (sessionLocked && e.target.matches('#tallySheetView input, #tallySheetView select')) {
           promptForPinUnlock();
        }
    });

    document.addEventListener('input', (e) => {
        if (!hasUserStartedEnteringData && (
            e.target.matches('#tallyBody input[type="number"]') ||
            e.target.matches('#tallyBody td.sheep-type input[type="text"]') ||
            e.target.matches('#shedStaffTable td:nth-child(1) input')
        )) {
            hasUserStartedEnteringData = true;
        }
        if (e.target.closest('#tallyBody') || e.target.closest('#shedStaffTable')) {
            hasTouchedTallyInputs = true;
        }
        if (e.target.matches('input, textarea')) {
            scheduleAutosave();
        }
    });
    document.addEventListener('change', (e) => {
        if (e.target.matches('select')) {
            scheduleAutosave();
        }
    });

function showSetupPrompt() {
    const shearers = parseInt(prompt('How many shearers today?', '')) || 0; 
    const counts = parseInt(prompt('How many tally rows (runs) today?', '')) || 0;
    const staff = parseInt(prompt('How many shed staff today?', '')) || 0;
    setupDailyLayout(shearers, counts, staff);
}

    window.showSetupPrompt = showSetupPrompt;
    window.showSetupModal = showSetupModal;
    window.hideSetupModal = hideSetupModal;
    window.confirmSetupModal = confirmSetupModal;
});
 
 // Expose functions for inline handlers
 window.addStand = addStand;
 window.removeStand = removeStand;
 window.addCount = addCount;
 window.removeCount = removeCount;
 window.addShedStaff = addShedStaff;
 window.removeShedStaff = removeShedStaff;
 window.lockSession = lockSession;
 window.unlockSession = unlockSession;
window.promptForPinUnlock = promptForPinUnlock;
window.saveData = saveData;
window.showLoadSessionModal = showLoadSessionModal;
window.enforceSessionLock = enforceSessionLock;
window.restoreTodaySession = restoreTodaySession;
window.saveSessionToFirestore = saveSessionToFirestore;
window.listSessionsFromFirestore = listSessionsFromFirestore;
window.loadSessionFromFirestore = loadSessionFromFirestore;
window.updateUIForRole = updateUIForRole;


// === Rebuild tally rows from saved session data ===

function rebuildRowsFromSession(session) {
const body = document.getElementById('tallyBody');
    if (!body || !session || !Array.isArray(session.shearerCounts)) return;
    body.innerHTML = '';
    runs = 0;
    session.shearerCounts.forEach((row, idx) => {
        const tr = createRow(idx);
        const values = Array.isArray(row.counts)
            ? row.counts
            : Array.isArray(row.stands)
                ? row.stands
                : [];
        values.forEach((val, sIdx) => {
            const inp = tr.children[sIdx + 1]?.querySelector('input[type="number"]');
            if (inp) inp.value = val;
        });
        const typeInput = tr.querySelector('.sheep-type input');
        if (typeInput) {
            typeInput.value = row.sheepType || '';
            adjustSheepTypeWidth(typeInput);
        }
        body.appendChild(tr);
        runs++;
    });
 updateTotals();   
}

window.rebuildRowsFromSession = rebuildRowsFromSession;
window.resetTallySheet = resetTallySheet;
window.resetForNewDay = resetForNewDay;

function initTallyTour() {
  const steps = [
    { selector: '#app-title', text: 'This is your live Tally sheet. Record today\u2019s tallies and staff here.' },
    { selector: '#add-stand-btn', text: 'Add Stand creates a new shearer column for today\u2019s session.' },
    { selector: '#save-session-btn', text: 'Save Session stores your progress; with cloud sync it saves to Firestore.' },
    { selector: '#load-session-btn', text: 'Load a previous session by station and date. Past sessions are view-only unless unlocked.' },
    { selector: '#export-csv-btn', text: 'Export today\u2019s data to CSV for payroll or records.' },
    { selector: '#new-day-reset-btn', text: 'Start a fresh day while keeping your setup. Clears today\u2019s entries.' },
    { selector: '#pin-lock-indicator', text: 'Past sessions open locked. Contractors can unlock with their PIN.' },
    { selector: '#back-to-dashboard-btn', text: 'Return to the Contractor Dashboard for staff management and summaries.' }
  ];

  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
  }

  ready(() => {
    const helpBtn = document.getElementById('tour-help-btn');
    const overlay = document.getElementById('tour-overlay');
    if (!helpBtn || !overlay) return; // Tour elements not present
    const backdrop = document.getElementById('tour-backdrop');
    const tooltip = document.getElementById('tour-tooltip');
    const content = document.getElementById('tour-content');
    const prevBtn = document.getElementById('tour-prev-btn');
    const nextBtn = document.getElementById('tour-next-btn');
    const skipBtn = document.getElementById('tour-skip-btn');

    let currentIndex = 0;
    let auto = false;
    let lastFocused = null;

    function findStep(start, dir) {
      for (let i = start; i >= 0 && i < steps.length; i += dir) {
        if (document.querySelector(steps[i].selector)) return i;
      }
      return null;
    }

    function positionTooltip(target) {
      if (!target) return;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });

      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      tooltip.style.top = '0px';
      tooltip.style.left = '0px';

      const rect = target.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      const margin = 8;
      let top = rect.bottom + margin;
      if (top + ttRect.height > window.innerHeight) {
        top = rect.top - ttRect.height - margin;
      }
      if (top < 0) {
        top = Math.max((window.innerHeight - ttRect.height) / 2, margin);
      }
      let left = rect.left + rect.width / 2 - ttRect.width / 2;
      left = Math.min(Math.max(left, margin), window.innerWidth - ttRect.width - margin);
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.visibility = 'visible';
    }

    function showStep(index) {
      const step = steps[index];
      const target = document.querySelector(step.selector);
      if (!target) {
        const next = findStep(index + 1, 1);
        if (next === null) return finish();
        return showStep(next);
      }
      currentIndex = index;
      content.textContent = step.text;
      overlay.classList.remove('tour-hidden');
      overlay.setAttribute('aria-hidden', 'false');
      prevBtn.disabled = findStep(index - 1, -1) === null;
      nextBtn.textContent = findStep(index + 1, 1) === null ? 'Finish' : 'Next';
      positionTooltip(target);
      tooltip.focus();
    }

    function next() {
      const nextIdx = findStep(currentIndex + 1, 1);
      if (nextIdx === null) {
        finish();
      } else {
        showStep(nextIdx);
      }
    }

    function prev() {
      const prevIdx = findStep(currentIndex - 1, -1);
      if (prevIdx !== null) showStep(prevIdx);
    }

    function close() {
      overlay.classList.add('tour-hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onKey);
      if (lastFocused) lastFocused.focus();
    }

    function finish() {
      if (auto) localStorage.setItem('tally_tour_done', 'true');
      close();
    }

    function skip() {
      if (auto) localStorage.setItem('tally_tour_done', 'true');
      close();
    }

    function start(isAuto) {
      auto = isAuto;
      lastFocused = document.activeElement;
      document.addEventListener('keydown', onKey);
      const first = findStep(0, 1);
      if (first === null) return; // nothing to show
      showStep(first);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    }

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    skipBtn.addEventListener('click', skip);
    backdrop.addEventListener('click', skip);
    helpBtn.addEventListener('click', () => start(false));

    if (localStorage.getItem('tally_tour_done') !== 'true') {
      start(true);
    }
  });
}

async function setup() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  try {
    const role = await verifyContractorUser();
    if (role === 'contractor') {
      const btn = document.getElementById('back-to-dashboard-btn');
      if (btn) {
        btn.style.display = 'inline-block';
        btn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }
    }
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    setup().finally(() => initTallyTour());
  } else {
    initTallyTour();
  }
});
