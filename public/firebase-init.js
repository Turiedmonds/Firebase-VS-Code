(function() {
  const firebaseConfig = {
    apiKey: "AIzaSyCuQh49AgKbrMvrxcuwsR8Svy86aP3Fg2Q",
    authDomain: "sheariq-tally-app.firebaseapp.com",
    projectId: "sheariq-tally-app",
    storageBucket: "sheariq-tally-app.firebasestorage.app",
    messagingSenderId: "201669876235",
    appId: "1:201669876235:web:379fc4035da99f4b09450e"
  };

  if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
    firebase.initializeApp(firebaseConfig);
  }
})();