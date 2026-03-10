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
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
  
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
