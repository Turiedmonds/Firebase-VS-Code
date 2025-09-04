(function(){
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(reg => { console.log('SW registered:', reg.scope); })
      .catch(err => { console.log('SW reg failed:', err); });
  });
})();
