// Firebase Web config is public by design (client SDK).
// Keep secrets only on backend (Functions / Secret Manager).
export const firebaseWebConfig = Object.freeze({
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
});

export function assertFirebaseWebConfig(cfg = firebaseWebConfig) {
  const missing = ["apiKey", "authDomain", "projectId", "appId"].filter((k) => !String(cfg?.[k] || "").trim());
  if (missing.length) {
    throw new Error(`Firebase config incompleta: ${missing.join(", ")}`);
  }
  return cfg;
}
