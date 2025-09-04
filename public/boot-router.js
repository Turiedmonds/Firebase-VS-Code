(function(){
  const page = /tally\.html/i.test(location.pathname) ? 'TALLY' : 'DASHBOARD';
  const banner = document.createElement('div');
  banner.id = 'boot-banner';
  Object.assign(banner.style, {
    background: '#ff69b4',
    color: '#000',
    fontWeight: 'bold',
    padding: '4px 6px',
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '2147483647'
  });
  function update(extra){
    banner.textContent = page + ' | __REAL_OFFLINE__=' + window.__REAL_OFFLINE__ + (extra? ' | ' + extra : '');
  }
  window.__BOOT_BANNER__ = banner;
  window.bootBannerAppend = function(msg){
    if (banner.textContent) banner.textContent += ' | ' + msg;
    else banner.textContent = msg;
  };
  document.addEventListener('DOMContentLoaded', function(){
    document.body.insertBefore(banner, document.body.firstChild);
    update();
    const prev = sessionStorage.getItem('debug_redirect');
    if (prev){
      bootBannerAppend(prev);
      sessionStorage.removeItem('debug_redirect');
    }
  });

  function realOffline(){
    if (localStorage.getItem('force_offline') === '1') return Promise.resolve(true);
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(),1200);
    return fetch('/manifest.json', {method:'HEAD',cache:'no-store',signal:controller.signal}).then(()=>{
      clearTimeout(t); return false;
    }).catch(()=>{ clearTimeout(t); return true; });
  }

  realOffline().then(off=>{
    window.__REAL_OFFLINE__ = off;
    update();
    const role = (localStorage.getItem('user_role')||'').toLowerCase();
    if (role === 'contractor' && off && !/tally\.html$/i.test(location.pathname)){
      sessionStorage.setItem('boot_router_redirect','tally');
      sessionStorage.setItem('debug_redirect','boot-router.js→/tally.html');
      bootBannerAppend('redirect→/tally.html (boot-router.js)');
      location.replace('/tally.html');
    }
  });
})();
