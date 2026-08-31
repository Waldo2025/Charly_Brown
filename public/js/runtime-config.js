const __charlyHost = String(window.location.hostname || "").toLowerCase();
const __charlyIsLocalRuntime = __charlyHost === "127.0.0.1" || __charlyHost === "localhost";
const __charlyGoogleApiBase = "https://charly-brown.web.app/api";
const __charlyMarcieApiBase = "https://us-central1-charly-brown.cloudfunctions.net/geminiApi";

window.__CHARLY_CONFIG__ = Object.assign(
  {
    // El servidor local solo entrega archivos estáticos. Las APIs siempre pasan por
    // Firebase Hosting/Functions salvo que un config.local explícito active useLocalApi.
    apiBaseUrl: __charlyIsLocalRuntime
      ? __charlyGoogleApiBase
      : "/api",
    geminiApiBaseUrl: __charlyIsLocalRuntime
      ? __charlyGoogleApiBase
      : "/api",
    remoteApiBaseUrl: __charlyIsLocalRuntime
      ? __charlyGoogleApiBase
      : "/api",
    marcieApiBaseUrl: __charlyMarcieApiBase,
    veoApiBaseUrl: __charlyIsLocalRuntime
      ? __charlyGoogleApiBase
      : "/api",
    exportApiBaseUrl: __charlyIsLocalRuntime ? __charlyGoogleApiBase : "/api",
    useLocalApi: false,
    allowSameOriginApi: true,
    allowDirectGemini: false,
    forceDirectGemini: false,
    forceBackendGemini: true
  },
  window.__CHARLY_CONFIG__ || {}
);

if (__charlyIsLocalRuntime) {
  if (window.__CHARLY_CONFIG__.useLocalApi !== true) {
    window.__CHARLY_CONFIG__.apiBaseUrl = __charlyGoogleApiBase;
  }
} else {
  window.__CHARLY_CONFIG__.apiBaseUrl = "/api";
}
