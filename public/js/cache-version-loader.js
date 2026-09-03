(function () {
  if (window.__cbCacheVersionLoaderInit) return;
  window.__cbCacheVersionLoaderInit = true;

  const fallbackVersion = "2026-1.0.10.858";

  function resolveCacheVersion() {
    // El loader publicado es la fuente autoritativa del cache-buster. El banner
    // consulta version.json una sola vez y fuera de la ruta crítica.
    return Promise.resolve(fallbackVersion);
  }

  function withVersion(src, version) {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return "";
    if (/^(?:https?:)?\/\//i.test(cleanSrc)) return cleanSrc;
    const separator = cleanSrc.includes("?") ? "&" : "?";
    return cleanSrc + separator + "v=" + encodeURIComponent(version);
  }

  function appendStyles(version, root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = Array.from(scope.querySelectorAll("link[data-cache-href]"));
    nodes.forEach((node) => {
      if (node.dataset.cacheVersionLoaded === "1") return;
      const href = withVersion(node.getAttribute("data-cache-href"), version);
      if (!href) return;
      node.setAttribute("href", href);
      node.dataset.cacheVersionLoaded = "1";
      node.removeAttribute("data-cache-href");
    });
  }

  function loadScript(node, version) {
    return new Promise((resolve) => {
      const src = withVersion(node.getAttribute("data-cache-src"), version);
      if (!src) {
        resolve();
        return;
      }
      if (node.dataset.cacheVersionLoaded === "1") {
        resolve();
        return;
      }
      node.dataset.cacheVersionLoaded = "1";
      const script = document.createElement("script");
      const type = String(node.getAttribute("data-cache-type") || node.getAttribute("type") || "").trim();
      if (type) script.type = type;
      if (node.hasAttribute("defer")) script.defer = true;
      if (node.hasAttribute("async")) script.async = true;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      node.replaceWith(script);
    });
  }

  async function loadVersionedAssets(version) {
    window.__CHARLY_CACHE_VERSION__ = version;
    appendStyles(version, document);
    const scripts = Array.from(document.querySelectorAll("script[data-cache-src]:not([data-cache-version-loaded='1'])"));
    await Promise.all(scripts.map((script) => loadScript(script, version)));
  }

  const ready = resolveCacheVersion().then((version) => {
    window.__CHARLY_CACHE_VERSION__ = version;
    const observer = new MutationObserver(() => {
      appendStyles(version, document);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    appendStyles(version, document);
    return version;
  });

  document.addEventListener("DOMContentLoaded", async () => {
    const version = await ready;
    await loadVersionedAssets(version);
  }, { once: true });
})();
