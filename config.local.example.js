// Copy this file to CharlyBrown/config.local.js and fill local values.
// Do NOT commit config.local.js.
window.__CHARLY_CONFIG__ = {
  // Backend HTTP para Gemini (proxy seguro con GEMINI_API_KEY en servidor).
  apiBaseUrl: "http://127.0.0.1:8787",
  googleGenAiBrowserModuleUrl: "./vendor/google-genai/index.mjs",
  // Bloquear llamadas directas desde el cliente a Gemini.
  allowDirectGemini: false,
  forceDirectGemini: false,
  forceBackendGemini: true,
  firebase: {
    apiKey: "__FIREBASE_WEB_API_KEY_LOCAL__",
    authDomain: "charly-brown.firebaseapp.com",
    projectId: "charly-brown",
    storageBucket: "charly-brown.firebasestorage.app",
    messagingSenderId: "128488238449",
    appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
    measurementId: "G-RL0BMDZKE6"
  },
  appCheck: {
    enabled: false,
    provider: "recaptcha-enterprise",
    siteKey: "__RECAPTCHA_ENTERPRISE_SITE_KEY__",
    debugToken: false
  },
  huggingFaceApiKey: "__HF_API_KEY_LOCAL__"
};
