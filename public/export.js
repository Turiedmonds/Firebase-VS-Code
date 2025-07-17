import { collectExportData, buildExportRows, buildStationSummary, isNineHourDay } from './tally.js';

export function exportDailySummaryCSV() {
    const data = collectExportData();

    const optionSet = new Set(Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value));

    const shearerNames = data.stands.map(s => s.name);
    const standTotals = new Array(shearerNames.length).fill(0);
    const totalsByType = {};

    data.shearerCounts.forEach(run => {
        const type = optionSet.has(run.sheepType) ? run.sheepType : 'Other';
        if (!totalsByType[type]) totalsByType[type] = new Array(shearerNames.length).fill(0);
        run.stands.forEach((val, idx) => {
            const num = parseInt(val) || 0;
            totalsByType[type][idx] += num;
            standTotals[idx] += num;
        });
    });

    const activeIndices = [];
    const activeNames = [];
    standTotals.forEach((t, idx) => {
        if (t > 0 || shearerNames[idx].trim()) {
            activeIndices.push(idx);
            activeNames.push(shearerNames[idx]);
        }
    });

    const filteredTotals = {};
    Object.keys(totalsByType).forEach(type => {
        const arr = activeIndices.map(i => totalsByType[type][i]);
        if (arr.some(v => v)) {
            filteredTotals[type] = arr;
        }
    });

    const activeStandTotals = activeIndices.map(i => standTotals[i]);
    const overallTotal = activeStandTotals.reduce((a, b) => a + b, 0);

    const rows = [];
    const metadataRows = [
        ['Station Name', data.stationName],
        ['Date', data.date],
        ['Team Leader', data.teamLeader],
        ['Comb Type', data.combType],
        ['Start Time', data.startTime],
        ['Finish Time', data.finishTime],
        ['Hours Worked', data.hoursWorked],
        ['Time System', data.timeSystem]
    ];
    metadataRows.forEach(r => rows.push(r));
    rows.push([]);

    rows.push(['Shearer Totals']);
    rows.push(['Sheep Type', ...activeNames, 'Total']);
    Object.keys(filteredTotals).forEach(type => {
        const arr = filteredTotals[type];
        const total = arr.reduce((a, b) => a + b, 0);
        rows.push([type, ...arr, total]);
    });
    rows.push(['Total Sheep', ...activeStandTotals, overallTotal]);
    rows.push([]);

    rows.push(['Shed Staff']);
    rows.push(['Name', 'Hours Worked']);
    data.shedStaff.forEach(s => rows.push([s.name, s.hours]));

    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');

    let fileName = 'export.csv';
    if (data.stationName && data.date) {
        const parts = data.date.split('-');
        if (parts.length === 3) fileName = `${data.stationName}_${parts[2]}-${parts[1]}-${parts[0]}.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadPreviousSession() {
    const json = localStorage.getItem('sheariq_saved_session');
    if (!json) {
        alert('No saved session found.');
        return;
    }
    let data;
    try {
        data = JSON.parse(json);
    } catch (e) {
        alert('No saved session found.');
        return;
    }
    if (!window.confirm('This will replace all current data. Do you want to continue?')) {
        return;
    }

    const dateObj = data.date ? new Date(data.date) : null;
    let formattedDate = data.date || '';
    if (dateObj && !isNaN(dateObj)) {
        formattedDate = dateObj.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    const sessionName = `${formattedDate}${data.stationName ? ' \u2014 ' + data.stationName : ''}`;
    alert(sessionName);

    // Determine required stands and runs
    const targetRuns = Array.isArray(data.shearerCounts) ? data.shearerCounts.length : runs;
    const targetStands = data.shearerCounts && data.shearerCounts[0] ? data.shearerCounts[0].stands.length : numStands;

    while (numStands < targetStands) addStand();
    while (numStands > targetStands) removeStand();
    while (runs < targetRuns) addCount();
    while (runs > targetRuns) removeCount();

    // Clear existing inputs
    document.querySelectorAll('#tallyBody input').forEach(inp => inp.value = '');
    document.querySelectorAll('#shedStaffTable input').forEach(inp => inp.value = '');

// Populate shearer names in header
    const headerRow = document.getElementById('headerRow');
    if (headerRow && Array.isArray(data.stands)) {
        data.stands.forEach((st, idx) => {
            const input = headerRow.children[idx + 1]?.querySelector('input');
            if (input) {
                input.value = st.name || '';
                adjustStandNameWidth(input);
                applyInputHistory(input);
            }
        });
    }
    
    // Basic fields
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

    // Populate shearer counts
    const body = document.getElementById('tallyBody');
    if (body && Array.isArray(data.shearerCounts)) {
        data.shearerCounts.forEach((run, idx) => {
            const row = body.children[idx];
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

    // Populate shed staff
    const staffTable = document.getElementById('shedStaffTable');
    if (staffTable) {
        staffTable.innerHTML = '';
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
                staffTable.appendChild(tr);
            });
        }
    }

    updateTotals();
    updateSheepTypeTotals();
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
 window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}
function collectExportData() {
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

function buildExportRows(data) {
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

export function exportCSV() {
    const data = collectExportData();
    const { rows } = buildExportRows(data);
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    let fileName = 'export.csv';
    if (data.stationName && data.date) {
        const parts = data.date.split('-');
        if (parts.length === 3) fileName = `${data.stationName}_${parts[2]}-${parts[1]}-${parts[0]}.csv`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function exportDailySummaryExcel() {
    if (typeof XLSX === 'undefined') {
        alert('Excel export not available');
        return;
    }

    const data = collectExportData();
    const optionSet = new Set(Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value));

    const shearerNames = data.stands.map(s => s.name);
    const standTotals = new Array(shearerNames.length).fill(0);
    const totalsByType = {};

    data.shearerCounts.forEach(run => {
        const type = optionSet.has(run.sheepType) ? run.sheepType : 'Other';
        if (!totalsByType[type]) totalsByType[type] = new Array(shearerNames.length).fill(0);
        run.stands.forEach((val, idx) => {
            const num = parseInt(val) || 0;
            totalsByType[type][idx] += num;
            standTotals[idx] += num;
        });
    });

    const activeIndices = [];
    const activeNames = [];
    standTotals.forEach((t, idx) => {
        if (t > 0 || shearerNames[idx].trim()) {
            activeIndices.push(idx);
            activeNames.push(shearerNames[idx]);
        }
    });

    const filteredTotals = {};
    Object.keys(totalsByType).forEach(type => {
        const arr = activeIndices.map(i => totalsByType[type][i]);
        if (arr.some(v => v)) {
            filteredTotals[type] = arr;
        }
    });

    const activeStandTotals = activeIndices.map(i => standTotals[i]);
    const overallTotal = activeStandTotals.reduce((a, b) => a + b, 0);

    const rows = [];
    const merges = [];
    const headerRows = [];

    const metadataRows = [
        ['Station Name', data.stationName],
        ['Date', data.date],
        ['Team Leader', data.teamLeader],
        ['Comb Type', data.combType],
        ['Start Time', data.startTime],
        ['Finish Time', data.finishTime],
        ['Hours Worked', data.hoursWorked],
        ['Time System', data.timeSystem]
   ];
    metadataRows.forEach(r => rows.push(r));
    for (let i = rows.length - metadataRows.length; i < rows.length; i++) {
        headerRows.push(i);
    }
    rows.push([]);
    let r = rows.length;
    rows.push(['Shearer Totals']);
    merges.push({ s: { r, c: 0 }, e: { r, c: activeNames.length + 1 } });

    headerRows.push(rows.length);
    rows.push(['Sheep Type', ...activeNames, 'Total']);

    Object.keys(filteredTotals).forEach(type => {
        const arr = filteredTotals[type];
        const total = arr.reduce((a, b) => a + b, 0);
        rows.push([type, ...arr, total]);
    });

    headerRows.push(rows.length);
    rows.push(['Total Sheep', ...activeStandTotals, overallTotal]);

    rows.push([]);
    r = rows.length;
    rows.push(['Shed Staff']);
    merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });

    headerRows.push(rows.length);
    rows.push(['Name', 'Hours Worked']);
    data.shedStaff.forEach(s => rows.push([s.name, s.hours]));

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const border = { style: 'thin', color: { rgb: '000000' } };
    const colWidths = new Array(range.e.c - range.s.c + 1).fill(0);
    for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;
           
            const text = cell.v != null ? String(cell.v) : '';
            if (text) {
                cell.s = cell.s || {};
                cell.s.border = { top: border, bottom: border, left: border, right: border };
                cell.s.alignment = { horizontal: 'center', vertical: 'center' };
                colWidths[C] = Math.max(colWidths[C], text.length);
            }
        }
    }

    headerRows.forEach(hr => {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: hr, c: C })];
            if (!cell) continue;
            cell.s = cell.s || {};
            cell.s.font = { bold: true };
            cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'd9d9d9' } };
        }
    });

  ws['!cols'] = colWidths.map(w => ({ wch: Math.max(w + 2, 15) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');

    let fileName = 'export.xlsx';
    if (data.stationName && data.date) {
        const parts = data.date.split('-');
        if (parts.length === 3) fileName = `${data.stationName}_${parts[2]}-${parts[1]}-${parts[0]}.xlsx`;
    }
    XLSX.writeFile(wb, fileName);
}

export function showExportPrompt() {
    const useExcel = window.confirm('Export as Excel (.xlsx)? Click Cancel for CSV.');
    if (useExcel) exportDailySummaryExcel();
    else exportDailySummaryCSV();
}
export function exportStationSummaryToCSV() {
    buildStationSummary();
    const g = id => document.getElementById(id);

    const metadata = [
        ['Station Name', g('stationName')?.value || ''],
        ['Date', g('date')?.value || ''],
        ['Team Leader', g('teamLeader')?.value || ''],
        ['Comb Type', g('combType')?.value || ''],
        ['Start Time', g('startTime')?.value || ''],
        ['Finish Time', g('finishTime')?.value || ''],
        ['Hours Worked', g('hoursWorked')?.value || ''],
        ['Time System', isNineHourDay ? '9-Hour Day' : '8-Hour Day'],
        ['Exported', new Date().toLocaleString()]
    ];

    const rows = metadata.map(r => r.slice());
    rows.push([]);

    const addTable = (title, tableId) => {
        const table = g(tableId);
        if (!table) return;
        rows.push([title]);
        const header = Array.from(table.querySelectorAll('thead tr th')).map(th => th.textContent.trim());
        if (header.length) rows.push(header);
        table.querySelectorAll('tbody tr').forEach(tr => {
            const cells = Array.from(tr.children).map(td => td.textContent.trim());
            rows.push(cells);
        });
        rows.push([]);
    };

    addTable('Shearers', 'stationShearerTable');
    addTable('Shed Staff', 'stationStaffTable');
    addTable('Team Leader', 'stationLeaderTable');
    addTable('Comb Types', 'stationCombTable');
    addTable('Totals', 'stationTotalTable');

    if (rows[rows.length - 1].length === 0) rows.pop();

    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');

    let stationName = metadata[0][1] || 'Station';
    let date = metadata[1][1];
    if (date && date.includes('-')) {
        const parts = date.split('-');
        if (parts.length === 3) date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
        date = new Date().toISOString().split('T')[0];
    }

    const fileName = `${stationName}_${date}_StationSummary.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Expose functions used by inline handlers
window.showExportPrompt = showExportPrompt;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('stationSummaryExport')?.addEventListener('click', exportStationSummaryToCSV);
});