(function(){
  const page = /tally\.html/i.test(location.pathname) ? 'TALLY' : 'DASHBOARD';
  function update(extra){}
  window.bootBannerAppend = function(msg){};
  document.addEventListener('DOMContentLoaded', function(){
    const prev = sessionStorage.getItem('debug_redirect');
    if (prev){
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
