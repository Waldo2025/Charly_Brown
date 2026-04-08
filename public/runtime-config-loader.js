(function () {
  if (window.__cbRuntimeConfigLoaderInit) return;
  window.__cbRuntimeConfigLoaderInit = true;

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

  injectConfigScript("runtime-config.js", "runtime");
  if (shouldLoadLocalOverride) {
    injectConfigScript("config.local.js", "local");
  }
})();
