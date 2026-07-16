function parseFirebaseStorageObjectPath(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "");
    if (pathname.includes("/api/assets/proxy-media") || pathname.includes("/api/assets/proxy-image")) {
      const proxyStoragePath = String(parsed.searchParams.get("storagePath") || "").trim();
      if (proxyStoragePath) {
        let objectPath = proxyStoragePath;
        for (let i = 0; i < 3; i += 1) {
          if (!/%[0-9a-f]{2}/i.test(objectPath)) break;
          try { objectPath = decodeURIComponent(objectPath); } catch (_) { break; }
        }
        return objectPath.replace(/^\/+/, "").trim();
      }
      const nestedUrl = String(parsed.searchParams.get("url") || "").trim();
      const nestedPath = parseFirebaseStorageObjectPath(nestedUrl);
      if (nestedPath) return nestedPath;
    }
    if (host === "firebasestorage.googleapis.com") {
      const match = pathname.match(/^\/(?:v0\/)?b\/[^/]+\/o\/(.+)$/);
      if (!match) return "";
      let objectPath = String(match[1] || "").trim();
      try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      for (let i = 0; i < 3; i += 1) {
        if (!/%[0-9a-f]{2}/i.test(objectPath)) break;
        try { objectPath = decodeURIComponent(objectPath); } catch (_) { break; }
      }
      return objectPath.replace(/^\/+/, "").trim();
    }
    if (host === "storage.googleapis.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length < 2) return "";
      parts.shift();
      let objectPath = parts.join("/").trim();
      try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      return objectPath;
    }
    if (host.endsWith("firebasestorage.app")) {
      let objectPath = pathname.replace(/^\/+/, "").trim();
      if (objectPath.startsWith("o/")) objectPath = objectPath.slice(2);
      try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
        try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      }
      return objectPath.replace(/^\/+/, "").trim();
    }
    return "";
  } catch (_) {
    return "";
  }
}

function normalizePersistedMediaReference(input = {}) {
  const downloadUrl = String(input?.downloadUrl || "").trim();
  const explicitStoragePath = String(input?.storagePath || "").trim().replace(/^\/+/, "");
  if (/^(?:data|blob):/i.test(downloadUrl)) {
    return {
      downloadUrl: "",
      storagePath: explicitStoragePath
    };
  }
  const storagePath = explicitStoragePath || parseFirebaseStorageObjectPath(downloadUrl);
  if (!storagePath && !downloadUrl) {
    return { downloadUrl: "", storagePath: "" };
  }
  return {
    storagePath,
    downloadUrl: storagePath ? "" : downloadUrl
  };
}

module.exports = {
  normalizePersistedMediaReference
};
