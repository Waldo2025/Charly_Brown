const SW_VERSION = (() => {
  try {
    return new URL(self.location.href).searchParams.get("v") || "20260409a";
  } catch (_) {
    return "20260409a";
  }
})();
const CACHE_SHELL = `cb-lg-shell-${SW_VERSION}`;
const CACHE_CONTENT = `cb-lg-content-${SW_VERSION}`;
const CACHE_RUNTIME = `cb-lg-runtime-${SW_VERSION}`;
const CACHE_PREFIX = "cb-lg-";

const SHELL_ASSETS = [
  "/lecturasGame.html",
  "/lecturasGame.js",
  "/lecturasGame.css",
  "/lecturasGame-order.app.js",
  "/lecturasGame-synonyms.app.js",
  "/lecturasGame-trace.app.js",
  "/lecturasGame-caps.app.js",
  "/lecturasGame.services.js",
  "/lecturasGame.webmanifest",
  "/firebase-web-config.js",
  "/api-client.js",
  "/chromeLayout.js",
  "/sidebar.js",
  "/sidebar.css",
  "/header.css",
  "/favicon.ico",
  "/logoCharly.png"
];

const ALLOWED_REMOTE_HOSTS = new Set([
  "www.gstatic.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com"
]);

function isSameOrigin(url = "") {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isGameRoute(pathname = "") {
  const p = String(pathname || "");
  return p.includes("lecturasGame");
}

function isApiRequest(url = "") {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    return u.pathname.startsWith("/api/") || u.pathname.includes("identitytoolkit") || u.pathname.includes("securetoken");
  } catch (_) {
    return false;
  }
}

function isAllowedRemote(req = null) {
  try {
    if (!req?.url || isSameOrigin(req.url)) return true;
    const u = new URL(req.url);
    return ALLOWED_REMOTE_HOSTS.has(String(u.hostname || "").toLowerCase());
  } catch (_) {
    return false;
  }
}

function isCriticalGameAsset(url = null) {
  try {
    if (!url || url.origin !== self.location.origin) return false;
    const pathname = String(url.pathname || "");
    if (pathname === "/lecturasGame-sw.js" || pathname === "/lecturasGame-build.js") return true;
    return /^\/lecturasGame(?:[-.\w]*)\.(?:js|css|html|webmanifest)$/i.test(pathname);
  } catch (_) {
    return false;
  }
}

async function cleanupLegacyCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map((key) => {
      if (key === CACHE_SHELL || key === CACHE_CONTENT || key === CACHE_RUNTIME) return Promise.resolve();
      if (key.startsWith(CACHE_PREFIX) || key.startsWith("cb-lecturas-game-")) return caches.delete(key);
      return Promise.resolve();
    })
  );
}

async function putRuntimeBounded(cacheName = CACHE_RUNTIME, req = null, resp = null, maxEntries = 120) {
  if (!req || !resp) return;
  const cache = await caches.open(cacheName);
  await cache.put(req, resp.clone());
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i += 1) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    await shell.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await cleanupLegacyCaches();
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (String(event?.data?.type || "") === "CB_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isApiRequest(req.url)) return;
  if (!isAllowedRemote(req)) return;

  const url = new URL(req.url);
  const sameOrigin = isSameOrigin(req.url);
  const isNavigation = req.mode === "navigate";

  if (isNavigation && sameOrigin && isGameRoute(url.pathname)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        await putRuntimeBounded(CACHE_RUNTIME, req, fresh, 40);
        return fresh;
      } catch (_) {
        return (await caches.match(req))
          || (await caches.match("/lecturasGame.html"))
          || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin) {
    if (!isGameRoute(url.pathname) && !isCriticalGameAsset(url)) return;
    if (isCriticalGameAsset(url)) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(req);
          await putRuntimeBounded(CACHE_RUNTIME, req, fresh, 220);
          return fresh;
        } catch (_) {
          return (await caches.match(req)) || Response.error();
        }
      })());
      return;
    }
    event.respondWith((async () => {
      const shellHit = await caches.match(req);
      if (shellHit) return shellHit;
      try {
        const fresh = await fetch(req);
        const contentLike = url.pathname.includes("lecturas-agent") || url.pathname.includes("lecturasASC");
        await putRuntimeBounded(contentLike ? CACHE_CONTENT : CACHE_RUNTIME, req, fresh, contentLike ? 220 : 120);
        return fresh;
      } catch (_) {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const destination = String(req.destination || "");
      if (["style", "font", "image", "audio"].includes(destination)) {
        await putRuntimeBounded(CACHE_RUNTIME, req, fresh, 140);
      }
      return fresh;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
