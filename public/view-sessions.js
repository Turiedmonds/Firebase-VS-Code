// view-sessions.js — Presets + specific day + station filter + search + pagination
// Default to TODAY. If none today, auto-fallback to last saved day (banner shown).
// Does not modify how sessions are saved or loaded. We only list and call existing loaders.

(function () {
  const $ = (s) => document.querySelector(s);

  const ui = {
    overlay: $('#loading-overlay'),
    back: $('#back-to-dashboard'),

    preset: $('#sess-preset'),
    fromWrap: $('#custom-from-wrap'),
    toWrap: $('#custom-to-wrap'),
    from: $('#sess-from'),
    to: $('#sess-to'),
    day: $('#sess-day'),

    station: $('#sess-station'),
    stationList: $('#station-list'),
    search: $('#sess-search'),

    sort: $('#sess-sort'),
    size: $('#sess-size'),
    prev: $('#sess-prev'),
    next: $('#sess-next'),
    range: $('#sess-range'),

    tbody: $('#sessions-tbody'),
    empty: $('#sessions-empty'),
    banner: $('#sessions-banner'),
  };

  const state = {
    contractorId: null,

    // Filters
    preset: 'today',   // today | 7d | 14d | month | custom
    day: null,         // yyyy-mm-dd
    from: null,        // yyyy-mm-dd (custom)
    to: null,          // yyyy-mm-dd (custom)
    station: '',       // exact (forces 10/page)
    q: '',             // contains search (stationLower substring)

    // Sort/paging
    sortMode: 'newest', // newest | oldest | station_az
    pageSize: 25,
    pageIndex: 0,

    // Firestore cursors
    cursorStack: [],
    lastDoc: null,

    // Local
    localAll: [],

    // Known stations
    stations: new Set(),

    // Render state
    hasRowsLastLoad: false,
  };

  // ===== Helpers =====
  function showOverlay(on) {
    if (!ui.overlay) return;
    ui.overlay.style.display = on ? 'flex' : 'none';
    requestAnimationFrame(() => ui.overlay.classList.toggle('show', on));
  }
  function isOnline(){ return navigator.onLine; }
  function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}

  function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }

  function nzDate(val){
    if(!val) return '';
    const d = val instanceof Date ? val : new Date(val);
    if(isNaN(d)) return '';
    const dd=String(d.getDate()).padStart(2,'0');
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const yy=d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }
  function nzDateTime(val){
    if(!val) return '';
    const d = val instanceof Date ? val : new Date(val);
    if(isNaN(d)) return '';
    return d.toLocaleString('en-NZ', { hour12: false });
  }
  function fmtNZ(d){
    if(!(d instanceof Date) || isNaN(d)) return '';
    const dd=String(d.getDate()).padStart(2,'0');
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const yy=d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }
  function setBanner(message){
    if(!ui.banner) return;
    if(!message){ ui.banner.hidden = true; ui.banner.textContent=''; return; }
    ui.banner.textContent = message;
    ui.banner.hidden = false;
  }

  function getActiveRange(){
    if(state.day){
      const d = new Date(state.day);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    const now = new Date();
    if(state.preset==='today') return { from: startOfDay(now), to: endOfDay(now) };
    if(state.preset==='7d'){ const f=new Date(now); f.setDate(f.getDate()-6); return { from:startOfDay(f), to:endOfDay(now) }; }
    if(state.preset==='14d'){ const f=new Date(now); f.setDate(f.getDate()-13); return { from:startOfDay(f), to:endOfDay(now) }; }
    if(state.preset==='month'){ const f=new Date(now.getFullYear(), now.getMonth(), 1); const t=new Date(now.getFullYear(), now.getMonth()+1, 0); return { from:startOfDay(f), to:endOfDay(t) }; }
    if(state.from && state.to) return { from:startOfDay(new Date(state.from)), to:endOfDay(new Date(state.to)) };
    // fallback
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  function mapDocToRow(d){
    const x = d.data ? d.data() : d;
    const savedAt = x.savedAt?.toDate ? x.savedAt.toDate() : (x.savedAt ? new Date(x.savedAt) : null);
    const sessionDate = x.sessionDate?.toDate ? x.sessionDate.toDate() : (x.sessionDate ? new Date(x.sessionDate) : null);
    const station = x.station || '';
    if(station) state.stations.add(station);
    return {
      id: d.id || x.id || '',
      station,
      stationLower: x.stationLower || station.toLowerCase(),
      totalSheep: x.totalSheep ?? x.meta?.sheep ?? '',
      stands: x.stands ?? x.meta?.stands ?? '',
      staff: x.staffCount ?? x.meta?.staff ?? '',
      date: sessionDate || savedAt || null,
      lastSaved: savedAt || x.updatedAt || x.createdAt || null
    };
  }
  function updateStationDatalist(){
    if(!ui.stationList) return;
    const opts = [...state.stations].sort((a,b)=>a.localeCompare(b)).map(s=>`<option value="${s}"></option>`).join('');
    ui.stationList.innerHTML = opts;
  }

  function renderRows(rows, startIdx, endIdx){
    ui.tbody.innerHTML = '';
    state.hasRowsLastLoad = !!(rows && rows.length);
    if(!rows.length){
      ui.empty.hidden = false;
      ui.range.textContent = '—';
      ui.prev.disabled = true;
      ui.next.disabled = true;
      return;
    }
    ui.empty.hidden = true;

    const frag = document.createDocumentFragment();
    for(const r of rows){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${nzDate(r.date)}</td>
        <td title="${esc(r.station)}">${esc(r.station)}</td>
        <td>${r.totalSheep ?? ''}</td>
        <td>${r.stands ?? ''}</td>
        <td>${r.staff ?? ''}</td>
        <td>${nzDateTime(r.lastSaved)}</td>
        <td><button class="action-btn" data-id="${esc(r.id)}">Load</button></td>
      `;
      frag.appendChild(tr);
    }
    ui.tbody.appendChild(frag);
    ui.range.textContent = `${startIdx}–${endIdx}`;

    // Wire load buttons to existing loader(s)
    ui.tbody.querySelectorAll('.action-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        if(typeof window.loadSessionFromFirestore === 'function'){
          window.loadSessionFromFirestore(id);
        } else if(typeof window.loadSessionById === 'function'){
          window.loadSessionById(id);
        } else {
          console.warn('[Saved Sessions] No loader found for session', id);
        }
      });
    });
  }

  // ===== Firestore =====
  function baseQuery(db, range){
    let ref = db.collection('contractors').doc(state.contractorId).collection('sessions');
    if(range?.from) ref = ref.where('savedAt', '>=', range.from);
    if(range?.to)   ref = ref.where('savedAt', '<=', range.to);

    if(state.sortMode === 'oldest') ref = ref.orderBy('savedAt', 'asc');
    else ref = ref.orderBy('savedAt', 'desc'); // newest or station_az uses client-sort

    return ref.limit(state.pageSize);
  }

  async function loadPage(direction='first'){
    const db = firebase.firestore();
    const range = getActiveRange();

    // Page-size rule: station filter → 10/page
    const stationActive = !!state.station.trim();
    if(stationActive){ state.pageSize = 10; ui.size.disabled = true; }
    else { ui.size.disabled = false; state.pageSize = parseInt(ui.size.value,10) || 25; }

    let query = baseQuery(db, range);

    // Server prefix search if ONLY q is set (no station/day/custom)
    const searchOnly = state.q && !stationActive && !state.day && state.preset!=='custom';
    if(searchOnly){
      try{
        const q = state.q.toLowerCase();
        query = db.collection('contractors').doc(state.contractorId).collection('sessions')
          .orderBy('stationLower').startAt(q).endAt(q+'\uf8ff')
          .orderBy('savedAt','desc') // may need composite index; if not available, catch below
          .limit(state.pageSize);
      }catch(e){
        // fall back to baseQuery + client filter
        query = baseQuery(db, range);
      }
    }

    if(direction==='next' && state.lastDoc) query = query.startAfter(state.lastDoc);
    else if(direction==='prev' && state.cursorStack.length>1){
      state.cursorStack.pop();
      const prevCursor = state.cursorStack[state.cursorStack.length-1];
      query = baseQuery(db, range).startAfter(prevCursor);
    }

    const snap = await query.get();
    const docs = snap.docs;

    if(docs.length){
      if(direction==='first'){ state.cursorStack = [docs[0]]; state.pageIndex = 0; }
      else if(direction==='next'){ state.cursorStack.push(docs[0]); state.pageIndex++; }
      else if(direction==='prev'){ state.pageIndex = Math.max(0, state.pageIndex-1); }
      state.lastDoc = docs[docs.length-1];
    }

    let rows = docs.map(mapDocToRow);

    // Exact station filter (client)
    if(stationActive){
      const s = state.station.trim().toLowerCase();
      rows = rows.filter(r => (r.stationLower || '') === s);
    }
    // Contains search (client)
    if(state.q){
      const q = state.q.toLowerCase();
      rows = rows.filter(r => (r.stationLower || '').includes(q));
    }

    // Client sort for station_az and others
    if(state.sortMode==='station_az'){
      rows.sort((a,b)=> (a.station||'').localeCompare(b.station||'') || +new Date(b.lastSaved||0)-+new Date(a.lastSaved||0));
    } else if(state.sortMode==='oldest'){
      rows.sort((a,b)=> +new Date(a.lastSaved||0)-+new Date(b.lastSaved||0));
    } else {
      rows.sort((a,b)=> +new Date(b.lastSaved||0)-+new Date(a.lastSaved||0));
    }

    const startIdx = docs.length ? state.pageIndex*state.pageSize + 1 : 0;
    const endIdx   = docs.length ? state.pageIndex*state.pageSize + rows.length : 0;

    renderRows(rows, startIdx, endIdx);
    updateStationDatalist();

    ui.prev.disabled = state.cursorStack.length <= 1;
    ui.next.disabled = docs.length < state.pageSize;
  }

  async function findMostRecentSavedDay(){
    const db = firebase.firestore();
    const ref = db.collection('contractors').doc(state.contractorId).collection('sessions')
      .orderBy('savedAt','desc').limit(1);
    const snap = await ref.get();
    if(snap.empty) return null;
    const d = snap.docs[0]; const x = d.data()||{};
    const savedAt = x.savedAt?.toDate ? x.savedAt.toDate() : (x.savedAt ? new Date(x.savedAt) : null);
    const sessionDate = x.sessionDate?.toDate ? x.sessionDate.toDate() : (x.sessionDate ? new Date(x.sessionDate) : null);
    const base = sessionDate || savedAt;
    if(!base || isNaN(+base)) return null;
    return { from: startOfDay(base), to: endOfDay(base) };
  }

  // ===== Local fallback =====
  function loadLocalAll(){
    const items = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith('session:')) continue;
      try{
        const x = JSON.parse(localStorage.getItem(k));
        items.push(mapDocToRow({ id: x.id || k.replace('session:',''), data: () => x }));
      }catch{}
    }
    return items;
  }

  function applyLocalFiltersSort(all){
    const range = getActiveRange();
    let rows = all.filter(r => {
      const t = +new Date(r.lastSaved || 0);
      return t >= +range.from && t <= +range.to;
    });

    if(state.station){
      const s = state.station.trim().toLowerCase();
      rows = rows.filter(r => (r.stationLower || '') === s);
    }
    if(state.q){
      const q = state.q.toLowerCase();
      rows = rows.filter(r => (r.stationLower || '').includes(q));
    }

    if(state.sortMode==='station_az'){
      rows.sort((a,b)=> (a.station||'').localeCompare(b.station||'') || +new Date(b.lastSaved||0)-+new Date(a.lastSaved||0));
    } else if(state.sortMode==='oldest'){
      rows.sort((a,b)=> +new Date(a.lastSaved||0)-+new Date(b.lastSaved||0));
    } else {
      rows.sort((a,b)=> +new Date(b.lastSaved||0)-+new Date(a.lastSaved||0));
    }

    return rows;
  }

  function renderLocalPage(direction='first'){
    if(state.station.trim()){ state.pageSize=10; ui.size.disabled = true; }
    else { ui.size.disabled=false; state.pageSize=parseInt(ui.size.value,10)||25; }

    if(direction==='first'){ state.localAll = applyLocalFiltersSort(loadLocalAll()); state.pageIndex=0; }
    else if(direction==='next'){ state.pageIndex++; }
    else if(direction==='prev'){ state.pageIndex = Math.max(0, state.pageIndex-1); }

    const total = state.localAll.length;
    const maxIdx = Math.max(0, Math.ceil(total/state.pageSize)-1);
    state.pageIndex = Math.min(state.pageIndex, maxIdx);

    const start = state.pageIndex*state.pageSize;
    const end   = Math.min(start+state.pageSize, total);
    const rows  = state.localAll.slice(start, end);

    renderRows(rows, total ? start+1 : 0, total ? end : 0);
    ui.prev.disabled = state.pageIndex <= 0;
    ui.next.disabled = state.pageIndex >= maxIdx;
  }

  // ===== Fallback to last saved day when Today has none =====
  let appliedTodayFallback = false;
  function findMostRecentSavedDayLocal(){
    let newest=null;
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith('session:')) continue;
      try{
        const x = JSON.parse(localStorage.getItem(k));
        const savedAt = x?.savedAt ? new Date(x.savedAt) : null;
        const sessionDate = x?.sessionDate ? new Date(x.sessionDate) : null;
        const base = sessionDate && !isNaN(+sessionDate) ? sessionDate : (savedAt && !isNaN(+savedAt) ? savedAt : null);
        if(!base) continue;
        if(!newest || +base > +newest) newest = base;
      }catch{}
    }
    if(!newest) return null;
    return { from: startOfDay(newest), to: endOfDay(newest) };
  }

  async function maybeFallbackToMostRecentDay(online){
    if(state.preset!=='today') return false;
    if(state.day) return false;
    if(state.hasRowsLastLoad) return false;
    if(appliedTodayFallback) return false;

    let range = null;
    if(online && state.contractorId && window.firebase?.firestore){
      try{ range = await findMostRecentSavedDay(); }catch(e){ console.warn('findMostRecentSavedDay failed, try local', e); }
    }
    if(!range) range = findMostRecentSavedDayLocal();
    if(!range){ setBanner(null); return false; }

    appliedTodayFallback = true;
    state.preset='custom'; ui.preset.value='custom';
    ui.fromWrap.hidden = false; ui.toWrap.hidden = false;

    const yyyy = range.from.getFullYear();
    const mm = String(range.from.getMonth()+1).padStart(2,'0');
    const dd = String(range.from.getDate()).padStart(2,'0');
    const isoDay = `${yyyy}-${mm}-${dd}`;

    state.from = isoDay; state.to = isoDay;
    ui.from.value = isoDay; ui.to.value = isoDay;

    setBanner(`No sessions today. Showing last saved day: ${fmtNZ(range.from)}.`);
    await refresh('first');
    return true;
  }

  // ===== Wiring =====
  function wire(){
    ui.back?.addEventListener('click', ()=> window.location.href='dashboard.html');

    ui.preset.addEventListener('change', ()=>{
      state.preset = ui.preset.value;
      const custom = state.preset==='custom';
      ui.fromWrap.hidden = !custom;
      ui.toWrap.hidden = !custom;
      // clear specific day
      state.day = null; ui.day.value = '';
      appliedTodayFallback = false; setBanner(null);
      refresh('first');
    });

    ui.from.addEventListener('change', ()=>{ state.from = ui.from.value || null; appliedTodayFallback=false; setBanner(null); refresh('first'); });
    ui.to.addEventListener('change',   ()=>{ state.to   = ui.to.value   || null; appliedTodayFallback=false; setBanner(null); refresh('first'); });

    ui.day.addEventListener('change', ()=>{
      state.day = ui.day.value || null;
      appliedTodayFallback=false; setBanner(null);
      refresh('first');
    });

    ui.station.addEventListener('input', debounce(()=>{
      state.station = ui.station.value.trim();
      appliedTodayFallback=false; setBanner(null);
      refresh('first');
    },200));

    ui.search.addEventListener('input', debounce(()=>{
      state.q = ui.search.value.trim();
      appliedTodayFallback=false; setBanner(null);
      refresh('first');
    },250));

    ui.sort.addEventListener('change', ()=>{ state.sortMode = ui.sort.value; appliedTodayFallback=false; setBanner(null); refresh('first'); });
    ui.size.addEventListener('change', ()=>{ appliedTodayFallback=false; setBanner(null); refresh('first'); });

    ui.prev.addEventListener('click', ()=> refresh('prev'));
    ui.next.addEventListener('click', ()=> refresh('next'));
  }

  async function refresh(direction='first'){
    try{
      showOverlay(true);
      if(isOnline() && state.contractorId && window.firebase?.firestore){
        if(direction==='first'){ state.cursorStack=[]; state.lastDoc=null; state.pageIndex=0; }
        await loadPage(direction);
      } else {
        renderLocalPage(direction);
      }
      await maybeFallbackToMostRecentDay(isOnline());
    } catch(e){
      console.error('[Saved Sessions] refresh failed', e);
      ui.tbody.innerHTML = '';
      ui.empty.hidden = false;
      ui.range.textContent = '—';
      ui.prev.disabled = true;
      ui.next.disabled = true;
      setBanner(null);
    } finally {
      showOverlay(false);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    firebase.auth().onAuthStateChanged(async (user)=>{
      if(!user){ window.location.replace('login.html'); return; }
      let cid = localStorage.getItem('contractor_id') || user.uid;
      try{ localStorage.setItem('contractor_id', cid); }catch{}
      state.contractorId = cid;

      ui.preset.value='today'; state.preset='today';
      ui.sort.value='newest';  state.sortMode='newest';
      ui.size.value='25';      state.pageSize=25;

      ui.fromWrap.hidden = true; ui.toWrap.hidden = true;

      wire();
      refresh('first'); // load TODAY by default
    });
  });
})();
