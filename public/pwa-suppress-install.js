// Suppress Android's automatic PWA install prompt completely
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();            // Block the install mini-infobar / prompt
  // Do not store the event; ensure prompt() cannot be called later
  window.deferredPrompt = null;
  console.log('[PWA] Install prompt suppressed (manual install only, like iOS).');
});

// Optional: log when the user installs manually via browser menu
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed manually via browser menu.');
});
