import {
    initializeApp
  } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
  import {
    getFirestore, collection, query, where, getDocs, doc, 
    updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
  } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
  import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
  } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";
  
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };