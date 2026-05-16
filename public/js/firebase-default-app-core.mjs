export function getOrInitFirebaseApp({ getApps, getApp, initializeApp, config }) {
  if (typeof getApps !== "function" || typeof getApp !== "function" || typeof initializeApp !== "function") {
    throw new TypeError("Firebase app helpers invalidos.");
  }
  if (!config || typeof config !== "object") {
    throw new TypeError("Firebase config invalida.");
  }
  return getApps().length ? getApp() : initializeApp(config);
}
