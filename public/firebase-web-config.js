// Firebase Web config is public by design (client SDK).
// Keep secrets only on backend (Functions / Secret Manager).
export const firebaseWebConfig = Object.freeze({
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
});

export function assertFirebaseWebConfig(cfg = firebaseWebConfig) {
  const missing = ["apiKey", "authDomain", "projectId", "appId"].filter((k) => !String(cfg?.[k] || "").trim());
  if (missing.length) {
    throw new Error(`Firebase config incompleta: ${missing.join(", ")}`);
  }
  return cfg;
}
