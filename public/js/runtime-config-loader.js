(function () {
  if (window.__cbRuntimeConfigLoaderInit) return;
  window.__cbRuntimeConfigLoaderInit = true;
  const runtimeConfigVersion = "2026-06-25.1";

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const shouldLoadLocalOverride = isLocalHost || window.__CHARLY_ENABLE_RUNTIME_CONFIG__ === true;

  function injectConfigScript(src, kind) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.runtimeConfig = kind;
      script.onload = () => resolve(true);
      script.onerror = function () {
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  window.__CHARLY_RUNTIME_CONFIG_READY__ = (async () => {
    await injectConfigScript(`js/runtime-config.js?v=${encodeURIComponent(runtimeConfigVersion)}`, "runtime");
    if (shouldLoadLocalOverride) {
      const localCandidates = [
        "js/config.local.js",
        "./config.local.js",
        "/config.local.js"
      ];
      for (const src of localCandidates) {
        try {
          const probe = await fetch(src, { method: "GET", cache: "no-store" });
          if (!probe.ok) continue;
          await injectConfigScript(`${src}${src.includes("?") ? "&" : "?"}ts=${Date.now()}`, "local");
          break;
        } catch (_) {
          // try next candidate
        }
      }
    }
    return window.__CHARLY_CONFIG__ || {};
  })();
})();
