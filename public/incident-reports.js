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

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('incidentBody');
  const fromInput = document.getElementById('filterFrom');
  const toInput = document.getElementById('filterTo');
  const applyBtn = document.getElementById('applyFilters');
  const clearBtn = document.getElementById('clearFilters');
  const backBtn = document.getElementById('backBtn');

  let allIncidents = [];

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
    const filtered = allIncidents.filter(it => {
      const d = it.date;
      if (fromVal && d < fromVal) return false;
      if (toVal && d > toVal) return false;
      return true;
    });
    render(filtered);
  }

  applyBtn.addEventListener('click', applyFilters);
  clearBtn.addEventListener('click', () => {
    fromInput.value = '';
    toInput.value = '';
    render(allIncidents);
  });
  backBtn?.addEventListener('click', () => window.history.back());

  async function loadIncidents() {
    const contractorId = localStorage.getItem('contractor_id');
    if (!contractorId) {
      render([]);
      return;
    }
    try {
      const snap = await firebase.firestore().collection('contractors').doc(contractorId).collection('sessions').get();
      allIncidents = [];
      snap.forEach(doc => {
        const data = doc.data();
        const date = parseSessionDate(data);
        const station = data.stationName || '';
        if (Array.isArray(data.incidents)) {
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
      render(allIncidents);
    } catch (e) {
      console.error('Failed to load incidents', e);
      render([]);
    }
  }

  loadIncidents();
});
