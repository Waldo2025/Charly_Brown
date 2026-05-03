import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from './firebase-web-config.js';
import { bootstrapFirebaseAppCheck } from './firebase-app-check.js';

const app = getApps().length ? getApp() : initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
void bootstrapFirebaseAppCheck(app);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
