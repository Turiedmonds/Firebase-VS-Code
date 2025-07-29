firebase.auth().onAuthStateChanged(async function(user) {
  if (user) {
    const db = firebase.firestore();
    const docRef = db.collection('contractors').doc(user.uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      const role = userData.role;

      if (role === 'contractor') {
        localStorage.setItem('contractor_id', user.uid);
      } else if (role === 'staff') {
        const contractorId = userData.contractorId;
        localStorage.setItem('contractor_id', contractorId);
      }
    }

    // Proceed to tally.html or your app's main page
    window.location.href = 'tally.html';
  } else {
    window.location.href = 'login.html';
  }
});
