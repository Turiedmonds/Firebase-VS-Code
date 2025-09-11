function formatNZDate(d) {
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseSessionDate(s) {
  const val = s?.date || s?.savedAt;
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function getIncidentSessionKey(s){
  const date = parseSessionDate(s);
  const ymd = date ? date.toISOString().slice(0,10) : '';
  const station = (s.stationName || s.station || '').trim();
  return `${ymd}_${station}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('incidentBody');
  const fromInput = document.getElementById('filterFrom');
  const toInput = document.getElementById('filterTo');
  const applyBtn = document.getElementById('applyFilters');
  const clearBtn = document.getElementById('clearFilters');
  const backBtn = document.getElementById('backBtn');
  const exportBtn = document.getElementById('exportBtn');

  let allIncidents = [];

  function setDefaultDateRange() {
    const now = new Date();
    const year = now.getFullYear();
    fromInput.value = new Date(year, 0, 1).toISOString().slice(0, 10);
    toInput.value = new Date(year, 11, 31).toISOString().slice(0, 10);
  }

  setDefaultDateRange();

  function render(list) {
    tbody.innerHTML = '';
    if (!list.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5">No incidents found.</td>';
      tbody.appendChild(tr);
      return;
    }
    list.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatNZDate(it.date)}</td><td>${it.time || ''}</td><td>${it.name || ''}</td><td>${it.description || ''}</td><td>${it.station || ''}</td>`;
      tbody.appendChild(tr);
    });
  }

  function applyFilters() {
    const fromVal = fromInput.value ? new Date(fromInput.value) : null;
    const toVal = toInput.value ? new Date(toInput.value) : null;
    if (toVal) toVal.setDate(toVal.getDate() + 1);
    const filtered = allIncidents.filter(it => {
      const d = it.date;
      if (fromVal && d < fromVal) return false;
      if (toVal && d >= toVal) return false;
      return true;
    });
    render(filtered);
  }

  applyBtn.addEventListener('click', applyFilters);
  clearBtn.addEventListener('click', () => {
    setDefaultDateRange();
    applyFilters();
  });
  backBtn?.addEventListener('click', () => window.history.back());
  exportBtn?.addEventListener('click', () => {
    window.exportTableToCSV('incidentTable', 'incident_reports');
  });

  async function loadIncidents() {
    const user = firebase.auth().currentUser;
    const contractorId = localStorage.getItem('contractor_id') || user?.uid || null;
    if (!contractorId || !user) {
      render([]);
      return;
    }
    try {
      const snap = await firebase.firestore().collection('contractors').doc(contractorId).collection('sessions').get();
      allIncidents = [];
      const seenKeys = [];
      snap.forEach(doc => {
        const data = doc.data();
        const date = parseSessionDate(data);
        const station = data.stationName || '';
        if (Array.isArray(data.incidents)) {
          const sessionKey = getIncidentSessionKey({ date, stationName: station });
          if (data.incidents.length) seenKeys.push(sessionKey);
          data.incidents.forEach(i => {
            allIncidents.push({ date, station, time: i.time, name: i.name, description: i.description });
          });
        }
      });
      allIncidents.sort((a, b) => {
        const ad = a.date ? a.date.getTime() : 0;
        const bd = b.date ? b.date.getTime() : 0;
        return bd - ad;
      });
      applyFilters();
      seenKeys.forEach(k => localStorage.setItem('incident_seen_' + k, '1'));
      localStorage.setItem('incident_seen_last_update', Date.now().toString());
    } catch (e) {
      console.error('Failed to load incidents', e);
      render([]);
    }
  }

  firebase.auth().onAuthStateChanged(() => {
    loadIncidents();
  });
});
