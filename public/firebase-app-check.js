import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app-check.js";

let appCheckBootstrapPromise = null;

function resolveAppCheckConfig() {
  const raw = window.__CHARLY_CONFIG__?.appCheck || {};
  const provider = String(raw.provider || "recaptcha-enterprise").trim().toLowerCase();
  const siteKey = String(raw.siteKey || "").trim();
  const enabled = raw.enabled !== false && !!siteKey;
  return {
    enabled,
    provider,
    siteKey,
    isDebug: raw.debugToken === true || String(raw.debugToken || "").trim().toLowerCase() === "true",
  };
}

export async function bootstrapFirebaseAppCheck(app) {
  if (!app) return null;
  if (appCheckBootstrapPromise) return appCheckBootstrapPromise;

  appCheckBootstrapPromise = (async () => {
    const cfg = resolveAppCheckConfig();
    if (!cfg.enabled) {
      console.debug("[app-check] Omitido: falta site key o appCheck.enabled=false.");
      return null;
    }

    if (cfg.isDebug) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    if (cfg.provider !== "recaptcha-enterprise") {
      console.warn(`[app-check] Provider no soportado en frontend: ${cfg.provider}`);
      return null;
    }

    try {
      return initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(cfg.siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.warn("[app-check] No se pudo inicializar App Check:", error);
      return null;
    }
  })();

  return appCheckBootstrapPromise;
}
