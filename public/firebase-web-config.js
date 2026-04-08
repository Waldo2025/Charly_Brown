// Firebase Web config is public by design (client SDK).
// Keep secrets only on backend (Functions / Secret Manager).
const DEFAULT_FIREBASE_WEB_CONFIG = Object.freeze({
  apiKey: "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
});

export const firebaseWebConfig = Object.freeze({
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || DEFAULT_FIREBASE_WEB_CONFIG.apiKey,
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || DEFAULT_FIREBASE_WEB_CONFIG.authDomain,
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || DEFAULT_FIREBASE_WEB_CONFIG.projectId,
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || DEFAULT_FIREBASE_WEB_CONFIG.storageBucket,
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || DEFAULT_FIREBASE_WEB_CONFIG.messagingSenderId,
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || DEFAULT_FIREBASE_WEB_CONFIG.appId,
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || DEFAULT_FIREBASE_WEB_CONFIG.measurementId
});

export function assertFirebaseWebConfig(cfg = firebaseWebConfig) {
  const missing = ["apiKey", "authDomain", "projectId", "appId"].filter((k) => !String(cfg?.[k] || "").trim());
  if (missing.length) {
    throw new Error(`Firebase config incompleta: ${missing.join(", ")}`);
  }
  return cfg;
}

export function getFirebaseAuthorizedDomains() {
  const configured = window.__CHARLY_CONFIG__?.firebase?.authorizedDomains;
  if (!Array.isArray(configured)) return [];
  return configured
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}
