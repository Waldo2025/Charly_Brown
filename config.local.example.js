// Copy this file to CharlyBrown/config.local.js and fill local values.
// Do NOT commit config.local.js.
window.__CHARLY_CONFIG__ = {
  // Modo directo Gemini solo permitido en localhost (desarrollo explícito).
  allowDirectGemini: true,
  // Compatibilidad: mantener esta bandera en true para entorno local existente.
  forceDirectGemini: true,
  // Si quieres forzar backend /api incluso en localhost, usa true.
  forceBackendGemini: false,
  firebase: {
    apiKey: "__FIREBASE_WEB_API_KEY_LOCAL__",
    authDomain: "charly-brown.firebaseapp.com",
    projectId: "charly-brown",
    storageBucket: "charly-brown.firebasestorage.app",
    messagingSenderId: "128488238449",
    appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
    measurementId: "G-RL0BMDZKE6"
  },
  geminiApiKey: "__GEMINI_API_KEY_LOCAL__",
  huggingFaceApiKey: "__HF_API_KEY_LOCAL__"
};
