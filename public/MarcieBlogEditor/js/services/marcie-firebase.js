import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "/js/firebase-default-app.js";

// Instancia segura de Firebase App específica para MarcieBlogEditor
const app = getDefaultFirebaseApp();

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false
  });
} catch (_) {
  firestoreDb = getFirestore(app);
}

export const auth = getAuth(app);
export const db = firestoreDb;
export const storage = getStorage(app);

export function getCurrentUser() {
  return auth?.currentUser || null;
}

export function subscribeToAuth(callback) {
  if (typeof callback !== "function") return () => {};
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

export default {
  app,
  auth,
  db,
  storage,
  getCurrentUser,
  subscribeToAuth
};
