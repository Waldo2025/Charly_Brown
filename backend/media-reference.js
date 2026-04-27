function parseFirebaseStorageObjectPath(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "firebasestorage.googleapis.com") {
      const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/[^/]+\/o\/(.+)$/);
      if (!match) return "";
      let objectPath = String(match[1] || "").trim();
      try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
        try { objectPath = decodeURIComponent(objectPath); } catch (_) {}
      }
      return objectPath.replace(/^\/+/, "").trim();
    }
    if (host === "storage.googleapis.com") {
      const parts = String(parsed.pathname || "").split("/").filter(Boolean);
      if (parts.length < 2) return "";
      parts.shift();
      return parts.join("/").trim();
    }
    if (host.endsWith("firebasestorage.app")) {
      return String(parsed.pathname || "").replace(/^\/+/, "").trim();
    }
    return "";
  } catch (_) {
    return "";
  }
}

function normalizePersistedMediaReference(input = {}) {
  const downloadUrl = String(input?.downloadUrl || "").trim();
  const explicitStoragePath = String(input?.storagePath || "").trim().replace(/^\/+/, "");
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
