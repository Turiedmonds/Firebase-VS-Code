(function() {
  const firebaseConfig = {
    apiKey: "AIzaSyD529f2jn9mb8OAip4x6l3IQb7KOaPNxaM",
    authDomain: "sheariq-tally-app.firebaseapp.com",
    projectId: "sheariq-tally-app",
    storageBucket: "sheariq-tally-app.firebasestorage.app",
    messagingSenderId: "201669876235",
    appId: "1:201669876235:web:379fc4035da99f4b09450e"
  };

  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
})();
