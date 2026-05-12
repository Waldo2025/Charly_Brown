const __charlyHost = String(window.location.hostname || "").toLowerCase();
const __charlyIsLocalRuntime = __charlyHost === "127.0.0.1" || __charlyHost === "localhost";

window.__CHARLY_CONFIG__ = Object.assign(
  {
    // En localhost prioriza el backend local; fuera de localhost usa Render.
    apiBaseUrl: __charlyIsLocalRuntime
      ? "http://127.0.0.1:8787/api"
      : "https://charly-brown-gemini-backend.onrender.com/api",
    remoteApiBaseUrl: "https://charly-brown-gemini-backend.onrender.com/api",
    allowSameOriginApi: __charlyIsLocalRuntime,
    allowDirectGemini: false,
    forceDirectGemini: false,
    forceBackendGemini: true
  },
  window.__CHARLY_CONFIG__ || {}
);
