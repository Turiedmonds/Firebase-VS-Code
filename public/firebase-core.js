// public/firebase-core.js
// Single modular Firebase init used everywhere (ES modules).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence,
  browserLocalPersistence, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore, serverTimestamp, collection, collectionGroup, doc,
  getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// ⬇️ PASTE your existing values from public/firebase-init.js
const firebaseConfig = {
  apiKey: "AIzaSyD529f2jn9mb8OAip4x6l3IQb7KOaPNxaM",
  authDomain: "sheariq-tally-app.firebaseapp.com",
  projectId: "sheariq-tally-app",
  storageBucket: "sheariq-tally-app.firebasestorage.app",
  messagingSenderId: "201669876235",
  appId: "1:201669876235:web:379fc4035da99f4b09450e"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

export {
  app, auth, db, functions,
  // auth
  onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut,
  // firestore
  serverTimestamp, collection, collectionGroup, doc, getDoc, getDocs,
  setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot,
  // functions
  httpsCallable
};
