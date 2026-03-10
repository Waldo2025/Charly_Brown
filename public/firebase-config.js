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
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.appspot.com",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };