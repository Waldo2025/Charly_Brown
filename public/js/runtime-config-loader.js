(function () {
  if (window.__cbRuntimeConfigLoaderInit) return;
  window.__cbRuntimeConfigLoaderInit = true;
  const runtimeConfigVersion = "2026-06-25.1";

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const shouldLoadLocalOverride = isLocalHost || window.__CHARLY_ENABLE_RUNTIME_CONFIG__ === true;

  function injectConfigScript(src, kind) {
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.runtimeConfig = kind;
    script.onerror = function () {
      script.remove();
    };
    document.head.appendChild(script);
  }

  injectConfigScript(`js/runtime-config.js?v=${encodeURIComponent(runtimeConfigVersion)}`, "runtime");
  if (shouldLoadLocalOverride) {
    (async () => {
      const localCandidates = [
        "js/config.local.js",
        "./config.local.js",
        "/config.local.js"
      ];
      for (const src of localCandidates) {
        try {
          const probe = await fetch(src, { method: "GET", cache: "no-store" });
          if (!probe.ok) continue;
          injectConfigScript(src, "local");
          break;
        } catch (_) {
          // try next candidate
        }
      }
    })();
  }
})();
