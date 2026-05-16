import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { getOrInitFirebaseApp } from "./firebase-default-app-core.mjs";

export function getDefaultFirebaseApp(config = firebaseWebConfig) {
  return getOrInitFirebaseApp({
    getApps,
    getApp,
    initializeApp,
    config: assertFirebaseWebConfig(config)
  });
}
