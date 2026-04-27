window.__CHARLY_CONFIG__ = Object.assign(
  {
    // Produccion: usar el backend API dedicado en Render.
    apiBaseUrl: "https://charly-brown-gemini-backend.onrender.com/api",
    allowSameOriginApi: false,
    allowDirectGemini: false,
    forceDirectGemini: false,
    forceBackendGemini: true
  },
  window.__CHARLY_CONFIG__ || {}
);
