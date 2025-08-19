// firestore-test.js

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Your config (same as in firebase-init.js)
const firebaseConfig = {
  apiKey: "AIzaSyCuQh49AgKbrMvrxcuwsR8Svy86aP3Fg2Q",
  authDomain: "sheariq-tally-app.firebaseapp.com",
  projectId: "sheariq-tally-app",
  storageBucket: "sheariq-tally-app.firebasestorage.app",
  messagingSenderId: "201669876235",
  appId: "1:201669876235:web:379fc4035da99f4b09450e"
};

// Initialize Firebase app + Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test write: Save a dummy session
async function testSaveToFirestore() {
  const contractorId = "test_contractor_123";
  const sessionId = "testfarm_2025-07-26_rangi";

  const docRef = doc(db, `contractors/${contractorId}/sessions/${sessionId}`);

  await setDoc(docRef, {
    stationName: "Test Farm",
    date: "2025-07-26",
    teamLeader: "Rangi",
    test: true,
    timestamp: new Date()
  });

  console.log("✅ Test session saved to Firestore!");
}

testSaveToFirestore();
