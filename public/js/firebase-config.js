import {
  getFirestore, collection, query, where, getDocs, doc, 
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
  } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";

const app = getDefaultFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
