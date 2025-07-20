 // Firebase is initialized in firebase-init.js
 
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

function showSetupPrompt() {
    const shearers = Math.min(50, parseInt(prompt('How many shearers today?', '')) || 0);
    const counts = parseInt(prompt('How many tally rows (runs) today?', '4')) || 0;
    const staff = parseInt(prompt('How many shed staff today?', '4')) || 0;
    setupDailyLayout(shearers, counts, staff);
}

function setupDailyLayout(shearers, counts, staff) {
    console.log("Setup called with:", shearers, "shearers,", counts, "counts,", staff, "shed staff");

    const headerRowEl = document.getElementById('headerRow');
    const bodyEl = document.getElementById('tallyBody');
    const subtotalRowEl = document.getElementById('subtotalRow');
    const staffTableEl = document.getElementById('shedStaffTable');

    if (headerRowEl) headerRowEl.innerHTML = '<th>Count #</th><th>Count Total</th><th class="sheep-type">Sheep Type</th>';
    if (bodyEl) bodyEl.innerHTML = '';
    if (subtotalRowEl) subtotalRowEl.innerHTML = '<th>Shearer Totals</th>';
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

        updateTotals();
        layoutBuilt = true;
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
    if (subtotalRowEl) subtotalRowEl.innerHTML = '<th>Shearer Totals</th><td></td><td></td>';

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
                tr.innerHTML = '<td><input placeholder="Staff Name" type="text"/></td><td><input min="0" placeholder="0" step="0.1" type="number"/></td>';
                const nameInput = tr.querySelector('td:nth-child(1) input');
                const hoursInput = tr.querySelector('td:nth-child(2) input');
                if (nameInput) {
                    nameInput.value = staff.name || '';
                    adjustShedStaffNameWidth(nameInput);
                    applyInputHistory(nameInput);
                }
                if (hoursInput) {
                    hoursInput.value = staff.hours || '';
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
    const names = Array.from(new Set(getStoredSessions().map(s => s.stationName).filter(Boolean)));
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
    const dates = getStoredSessions()
        .filter(s => s.stationName.trim().toLowerCase() === station.trim().toLowerCase())
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
             adjustShedStaffNameWidth(input);
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
         } else if (input.matches('#shedStaffTable input[type="number"]')) {
             adjustShedStaffHoursWidth(input);
         } else if (input.matches('#headerRow input[type="text"]')) {
             adjustStandNameWidth(input);
         }
     });
     
  // ensure shed staff name width is sized correctly on initialization
     if (input.closest('#shedStaffTable')) {
         adjustShedStaffNameWidth(input);
     }
     
     input.addEventListener('input', () => {
         if (input.matches('#tallyBody td.sheep-type input[type="text"]')) {
             adjustSheepTypeWidth(input);
         } else if (input.matches('#shedStaffTable input[type="text"]')) {
             adjustShedStaffNameWidth(input);
         } else if (input.matches('#shedStaffTable input[type="number"]')) {
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
     adjustRuns(isNineHourDay ? 5 : 4);
     calculateHoursWorked();
      const label = document.getElementById('timeSystemLabel');
     if (label) {
         label.textContent = isNineHourDay ? 'Time System: 9-Hour Day' : 'Time System: 8-Hour Day';
         label.style.color = isNineHourDay ? '#ff0' : '#0f0';
     }
     const hours = document.getElementById('hoursWorked');
     if (hours) updateShedStaffHours(hours.value);
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
         row.innerHTML += `<td><input type="number" value="" onchange="updateTotals()"></td>`;
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
        cell.innerHTML = `<input type="number" value="" onchange="updateTotals()">`;
         row.insertBefore(cell, row.children[row.children.length - 2]);
     }
 
     const subtotalRow = document.getElementById("subtotalRow");
     const cell = document.createElement("td");
     cell.innerText = "0";
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
         const type = typeInput.value.trim();
         if (!type) return;
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
 for (let i = 0; i < numStands; i++) {
     const cell = document.createElement("td");
     cell.innerText = "0";
     subtotalRow.appendChild(cell);
 }
 subtotalRow.innerHTML += `<td></td><td></td>`;
 updateTotals();
 
 function calculateHoursWorked() {
     const startInput = document.getElementById("startTime");
     const endInput = document.getElementById("finishTime");
     const output = document.getElementById("hoursWorked");
 
     if (!startInput || !endInput || !output) return;
 
     const start = new Date("1970-01-01T" + startInput.value);
     const end = new Date("1970-01-01T" + endInput.value);
 
     if (isNaN(start.getTime()) || isNaN(end.getTime())) {
         output.value = "";
         return;
     }
 
     let totalHours = (end - start) / (1000 * 60 * 60);
 
      const breaks = isNineHourDay ?
         [
             ["07:00", "08:00"],
             ["09:45", "10:15"],
             ["12:00", "13:00"],
             ["14:45", "15:15"]
         ] : [
             ["09:00", "09:30"],
             ["11:30", "12:30"],
             ["14:30", "15:00"]
         ];
 
     breaks.forEach(b => {
         const bStart = new Date("1970-01-01T" + b[0]);
         const bEnd = new Date("1970-01-01T" + b[1]);
 
         if (end > bStart && start < bEnd) {
             const overlapStart = new Date(Math.max(start, bStart));
             const overlapEnd = new Date(Math.min(end, bEnd));
             totalHours -= (overlapEnd - overlapStart) / (1000 * 60 * 60);
         }
     });
 
     output.value = totalHours > 0 ? totalHours.toFixed(2) : "0";
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
     if (toggle) toggle.addEventListener('click', toggleTimeFormat);
     if (workdayToggle) workdayToggle.addEventListener('click', toggleWorkdayType);
     if (start) start.addEventListener("change", handleStartTimeChange);
     if (end) end.addEventListener("change", calculateHoursWorked);
 if (hours) {
         hours.addEventListener("input", () => updateShedStaffHours(hours.value));
         updateShedStaffHours(hours.value);
     }
     document.querySelectorAll('#headerRow input[type="text"]').forEach(adjustStandNameWidth);
 document.querySelectorAll('#tallyBody td.sheep-type input[type="text"]').forEach(adjustSheepTypeWidth);
     document.querySelectorAll('#shedStaffTable input[type="text"]').forEach(adjustShedStaffNameWidth);
     document.querySelectorAll('#shedStaffTable input[type="number"]').forEach(adjustShedStaffHoursWidth);
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
 if (e.target.matches('#shedStaffTable input[type="text"]')) {
         adjustShedStaffNameWidth(e.target);
     }
     if (e.target.matches('#shedStaffTable input[type="number"]')) {
         adjustShedStaffHoursWidth(e.target);
     }
 });
 
 function addShedStaff() {
     const body = document.getElementById('shedStaffTable');
     const row = document.createElement('tr');
     row.innerHTML = `<td><input placeholder="Staff Name" type="text"/></td><td><input min="0" placeholder="0" step="0.1" type="number"/></td>`;
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
 
 function saveData() {
     clearHighlights();
     const issues = [];
     const tbody = document.getElementById('tallyBody');
     const header = document.getElementById('headerRow');
     if (!tbody || !header) return;
 
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
 
    // Collect current session data
     const data = collectExportData();
 
     const json = JSON.stringify(data, null, 2);
     localStorage.setItem('sheariq_saved_session', json);
     saveSessionToStorage(data);
 
     alert('Session saved successfully to local storage.');
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
         const typeInput = row.querySelector('.sheep-type input');
         const typeRaw = typeInput ? typeInput.value.trim() : '';
         if (!typeRaw) return;
         const type = optionSet.has(typeRaw) ? typeRaw : 'Other';
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
         th.textContent = t;
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
             const hours = row.querySelector('td:nth-child(2) input')?.value || '';
             if (name.trim() || hours.trim()) {
                 const tr = document.createElement('tr');
                 const nameTd = document.createElement('td');
                 nameTd.textContent = name;
                 const hoursTd = document.createElement('td');
                 hoursTd.textContent = hours;
                 tr.appendChild(nameTd);
                 tr.appendChild(hoursTd);
                 staffBody.appendChild(tr);
             }
         });
     }
 }
 
 function populateStationDropdown() {
     const select = document.getElementById('stationSelect');
     if (!select) return;
     const sessions = getStoredSessions();
     const current = select.value;
     const names = Array.from(new Set(sessions.map(s => s.stationName).filter(Boolean)));
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
         const rawType = (run.sheepType || '').trim();
             const type = optionSet.has(rawType) ? rawType : 'Other';
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
                 const h = parseFloat(st.hours) || 0;
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
 
 export function buildStationSummary() {
     const stationInput = document.getElementById('stationSelect');
     const startInput = document.getElementById('summaryStart');
     const endInput = document.getElementById('summaryEnd');
 
     const station = stationInput?.value.trim() || '';
     const start = startInput?.value;
     const end = endInput?.value;
 
     console.log('Selected station:', station);
     console.log('Selected start:', start, 'end:', end);
 
     const allSessions = getStoredSessions();

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
 
     const optionOrder = Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value);
     const activeTypes = optionOrder.filter(t => totalByType[t] > 0);
     Object.keys(totalByType).forEach(t => { if (!activeTypes.includes(t)) activeTypes.push(t); });
 
      const shearHead = document.querySelector('#stationShearerTable thead tr');
    const shearBody = document.querySelector('#stationShearerTable tbody');
    if (shearHead && shearBody) {
        shearHead.innerHTML = '';
         const sTh = document.createElement('th');
        sTh.textContent = 'Shearer';
        shearHead.appendChild(sTh);
        activeTypes.forEach(t => {
            const th = document.createElement('th');
            th.textContent = t;
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
            hoursTd.textContent = h;
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
             th.textContent = t;
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
         stationName: document.getElementById('stationName')?.value || '',
         teamLeader: document.getElementById('teamLeader')?.value || '',
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
         if (hasData) {
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
         if (rowHasData) {
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
         if (name && hours && (name.value.trim() || hours.value.trim())) {
             data.shedStaff.push({ name: name.value, hours: hours.value });
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
     data.shedStaff.forEach(s => add([s.name, s.hours]));
     add([]);
 
     add(['Sheep Type Totals'], true);
     add(['Sheep Type', 'Total'], true);
   data.sheepTypeTotals.forEach(t => add([t.type, t.total]));

    return { rows, boldRows };
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
        const onSave = () => { cleanup(); saveData(); next(); };
        const onDiscard = () => { cleanup(); next(); };
        const onCancel = () => { cleanup(); };
        saveBtn.addEventListener('click', onSave);
        discardBtn.addEventListener('click', onDiscard);
        cancelBtn.addEventListener('click', onCancel);
    } else {
        if (confirm('You have unsaved work. Save before loading?')) {
            saveData();
            next();
        } else if (confirm('Continue without saving?')) {
            next();
        }
    }
}

function loadSessionObject(session) {
    // Always enforce locking first so any subsequent DOM manipulation
    // doesn't accidentally trigger focus events while unlocked
    enforceSessionLock(session.date);
    populateSessionData(session);
    rebuildRowsFromSession(session);
    layoutBuilt = true;
}

function startSessionLoader(session) {
    confirmUnsavedChanges(() => {
        const summary = `Station: ${session.stationName}\nDate: ${formatDateNZ(session.date)}\nTeam Leader: ${session.teamLeader || ''}\n\nDo you want to load this session?`;
        if (confirm(summary)) {
            loadSessionObject(session);
        }
    });
} 
 
 document.addEventListener('DOMContentLoaded', () => {
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
   const stationNameInput = document.getElementById('stationName');
if (stationNameInput) {
     stationNameInput.addEventListener('change', () => {
       if (window.awaitingSetupPrompt && stationNameInput.value.trim()) {
         window.awaitingSetupPrompt = false;
         showSetupPrompt();
       }
     });
   }



    loadBtn?.addEventListener('click', showLoadSessionModal);
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

    document.addEventListener('focusin', (e) => {
        if (sessionLocked && e.target.matches('#tallySheetView input, #tallySheetView select')) {
            const pin = prompt('\uD83D\uDD10 Enter Contractor PIN to unlock editing:');
            if (pin === '1234') {
                unlockSession();
            } else if (pin !== null) {
                alert('Incorrect PIN');
            }
        }
    });
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
 window.saveData = saveData;
window.showLoadSessionModal = showLoadSessionModal;
window.enforceSessionLock = enforceSessionLock;

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
window.showSetupPrompt = showSetupPrompt;
window.rebuildRowsFromSession = rebuildRowsFromSession;
