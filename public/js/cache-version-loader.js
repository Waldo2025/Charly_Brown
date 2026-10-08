(function () {
  if (window.__cbCacheVersionLoaderInit) return;
  window.__cbCacheVersionLoaderInit = true;

  const fallbackVersion = "2026-1.0.10.929-charly-source-files";

  /* ── 1. Aplicar CSS inmediatamente con la versión fallback ──────────
   * Evita FOUC: los <link data-cache-href> reciben su href de forma
   * síncrona antes de que el parser continúe con el <body>.
   * Si luego se resuelve una versión más reciente desde /version.json,
   * los estilos se actualizan sin flash visible (mismos archivos).      */
  appendStyles(fallbackVersion, document);

  async function clearObsoleteBrowserCaches() {
    if ("serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
      } catch (_) {
        // El arranque debe continuar aunque el navegador bloquee esta API.
      }
    }

    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (_) {
        // El cache HTTP se evita igualmente mediante versiones y cabeceras no-store.
      }
    }

    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("page:"))
        .forEach((key) => localStorage.removeItem(key));
    } catch (_) {
      // No borrar preferencias ni sesiones si localStorage no está disponible.
    }
  }

  async function resolveCacheVersion() {
    let cachedVersion = "";
    try { cachedVersion = localStorage.getItem("cb_cache_version") || ""; } catch (_) {}
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Version manifest unavailable");
      const manifest = await response.json();
      const build = manifest.build || manifest.cache_version || manifest.version;
      if (typeof build !== "string" || !/^[\w.-]{1,100}$/.test(build)) throw new Error("Invalid version manifest");
      const currentVersion = build;
      try { localStorage.setItem("cb_cache_version", currentVersion); } catch (_) {}
      return currentVersion;
    } catch (_) {
      return cachedVersion || fallbackVersion;
    } finally {
      clearTimeout(timeout);
    }
  }

  function withVersion(src, version) {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return "";
    if (/^(?:https?:)?\/\//i.test(cleanSrc)) return cleanSrc;
    const url = new URL(cleanSrc, document.baseURI);
    url.searchParams.set("v", version);
    return url.href;
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
    return new Promise((resolve, reject) => {
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
      script.onerror = () => {
        node.dataset.cacheVersionLoaded = "0";
        reject(new Error(`No se pudo cargar ${src}`));
      };
      node.replaceWith(script);
    });
  }

  async function loadVersionedAssets(version) {
    window.__CHARLY_CACHE_VERSION__ = version;
    /* Actualizar CSS con la versión definitiva (si cambió del fallback) */
    appendStyles(version, document);
    const scripts = Array.from(document.querySelectorAll("script[data-cache-src]:not([data-cache-version-loaded='1'])"));
    const support = scripts.filter(node => !["app", "deferred"].includes(node.dataset.cacheRole));

    /* ── Cargar scripts secuencialmente para respetar dependencias ────── */
    for (const script of support) await loadScript(script, version);
    /* app y deferred siguen secuenciales: dependen de los anteriores   */
    for (const script of scripts.filter(node => node.dataset.cacheRole === "app")) await loadScript(script, version);
    for (const script of scripts.filter(node => node.dataset.cacheRole === "deferred")) await loadScript(script, version);
  }

  clearObsoleteBrowserCaches().catch(() => {});

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
    try { await loadVersionedAssets(version); }
    catch (error) {
      console.error("Error al iniciar la aplicación", error);
      window.dispatchEvent(new CustomEvent("charly:load-error", { detail: { message: error.message } }));
    }
  }, { once: true });
})();
