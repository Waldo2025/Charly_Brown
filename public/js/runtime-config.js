const __charlyHost = String(window.location.hostname || "").toLowerCase();
const __charlyIsLocalRuntime = __charlyHost === "127.0.0.1" || __charlyHost === "localhost";

window.__CHARLY_CONFIG__ = Object.assign(
  {
    // En localhost prioriza el backend local; en producción usa el proxy same-origin
    // de Firebase Hosting para evitar CORS contra Render.
    apiBaseUrl: __charlyIsLocalRuntime
      ? "http://127.0.0.1:8787/api"
      : "/api",
    geminiApiBaseUrl: __charlyIsLocalRuntime
      ? "http://127.0.0.1:8787/api"
      : "/api",
    remoteApiBaseUrl: __charlyIsLocalRuntime
      ? "http://127.0.0.1:8787/api"
      : "/api",
    veoApiBaseUrl: __charlyIsLocalRuntime
      ? "http://127.0.0.1:8787/api"
      : "/api",
    exportApiBaseUrl: __charlyIsLocalRuntime ? "http://127.0.0.1:8787/api" : "/api",
    allowSameOriginApi: true,
    allowDirectGemini: false,
    forceDirectGemini: false,
    forceBackendGemini: true
  },
  window.__CHARLY_CONFIG__ || {}
);

if (__charlyIsLocalRuntime) {
  window.__CHARLY_CONFIG__.apiBaseUrl = "http://127.0.0.1:8787/api";
} else {
  window.__CHARLY_CONFIG__.apiBaseUrl = "/api";
}
