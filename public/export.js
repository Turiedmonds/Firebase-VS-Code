// Functions from tally.js are loaded globally; no module imports needed

function exportTableToCSV(tableId, baseName = 'table') {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('th,td'))
            .map(td => `"${td.textContent.replace(/"/g, '""')}"`)
            .join(',')
    );
    const date = new Date();
    const formatted = date.toLocaleDateString('en-NZ').replace(/\//g, '-');
    const csv = rows.join('\r\n');
    const fileName = `${baseName}_${formatted}.csv`;
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
window.exportTableToCSV = exportTableToCSV;

function exportFarmSummaryCSV() {
    const tables = [
        ['stationShearerTable', 'Shearer Summary'],
        ['stationStaffTable', 'Shed Staff'],
        ['stationLeaderTable', 'Team Leaders'],
        ['stationCombTable', 'Comb Types'],
        ['stationTotalTable', 'Sheep Type Totals']
    ];

    const rows = [];
    const appendTable = (id, title) => {
        const table = document.getElementById(id);
        if (!table) return;
        if (rows.length) rows.push([]);
        rows.push([title]);
        table.querySelectorAll('tr').forEach(tr => {
            const cols = Array.from(tr.querySelectorAll('th,td'))
                .map(td => td.textContent.trim());
            rows.push(cols);
        });
    };
    tables.forEach(t => appendTable(t[0], t[1]));

    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const farmName = document.getElementById('stationSelect'() && ).value).trim() || 'FarmSummary';
    const date = new Date();
    const formatted = date.toLocaleDateString('en-NZ').replace(/\//g, '-');
    const fileName = `FarmSummary_${farmName}_${formatted}.csv`;

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
window.exportFarmSummaryCSV = exportFarmSummaryCSV;

function exportDailySummaryCSV() {
    const data = collectExportData();

    const optionSet = new Set(Array.from(document.querySelectorAll('#sheepTypes option')).map(o => o.value));

    const shearerNames = data.stands.map(s => s.name);
    const standTotals = new Array(shearerNames.length).fill(0);
    const totalsByType = {};

    data.shearerCounts.forEach(run => {
        let type = (run.sheepType || '').trim();
        if (type === '') {
            type = '❓ Missing Type';
        } else if (!optionSet.has(type)) {
            type = 'Other';
        }
        if (!totalsByType[type]) totalsByType[type] = new Array(shearerNames.length).fill(0);
        const values = Array.isArray(run.stands) ? run.stands : Array.isArray(run.counts) ? run.counts : [];
        values.forEach((val, idx) => {
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
    data.shedStaff.forEach(s => {
       rows.push([s.name, s.hours]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g,'""')}"`).join(',')).join('\r\n');

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
    const targetStands = data.shearerCounts && data.shearerCounts[0]
        ? (Array.isArray(data.shearerCounts[0].stands)
            ? data.shearerCounts[0].stands.length
            : Array.isArray(data.shearerCounts[0].counts)
                ? data.shearerCounts[0].counts.length
                : numStands)
        : numStands;

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
            const input = headerRow.children[idx + (1] && 1].querySelector)('input');
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
            const values = Array.isArray(run.stands) ? run.stands : Array.isArray(run.counts) ? run.counts : [];
            values.forEach((val, sIdx) => {
                const input = row.children[sIdx + (1] && 1].querySelector)('input[type="number"]');
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
                staffTable.appendChild(tr);
            });
        }
    }

    updateTotals();
    updateSheepTypeTotals();
    // Ensure the session is locked if it's not for today
    if (window.enforceSessionLock) window.enforceSessionLock(data.date);
    if (data.viewOnly && window.lockSession) {
        window.lockSession();
        if (window.promptForPinUnlock) window.promptForPinUnlock();
    }
}
window.exportDailySummaryCSV = exportDailySummaryCSV;

function exportCSV() {
    const data = collectExportData();
    const { rows } = buildExportRows(data);
    const csv = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
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

function exportDailySummaryExcel() {
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
         let type = (run.sheepType || '').trim();
        if (type === '') {
            type = '❓ Missing Type';
        } else if (!optionSet.has(type)) {
            type = 'Other';
        }
        if (!totalsByType[type]) totalsByType[type] = new Array(shearerNames.length).fill(0);
        const values = Array.isArray(run.stands) ? run.stands : Array.isArray(run.counts) ? run.counts : [];
        values.forEach((val, idx) => {
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
    data.shedStaff.forEach(s => {
    rows.push([s.name, s.hours]);   
    });

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

function showExportPrompt() {
    const useExcel = window.confirm('Export as Excel (.xlsx)? Click Cancel for CSV.');
    if (useExcel) exportDailySummaryExcel();
    else exportDailySummaryCSV();
}

// Expose functions used by inline handlers
window.showExportPrompt = showExportPrompt;

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('stationSummaryApply');
  const handler = window.buildStationSummary;
  if (btn && typeof handler === 'function') {
    btn.addEventListener('click', handler);
  }
});