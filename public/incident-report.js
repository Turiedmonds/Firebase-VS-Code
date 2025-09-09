document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('incidentContainer');
  const raw = localStorage.getItem('incident_session') || localStorage.getItem('active_session');
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to parse incident session', e);
  }
  localStorage.removeItem('incident_session');
  if (!data || !Array.isArray(data.incidents) || !data.incidents.length) {
    container.innerHTML = '<p>No incident report for this session.</p>';
  } else {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Time</th><th>Name</th><th>Description</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    data.incidents.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.time || ''}</td><td>${i.name || ''}</td><td>${i.description || ''}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }
  document.getElementById('backBtn')?.addEventListener('click', () => {
    window.history.back();
  });
});
