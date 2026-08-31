import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "/js/firebase-default-app.js";

// Instancia segura de Firebase App específica para MarcieBlogEditor
const app = getDefaultFirebaseApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
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
