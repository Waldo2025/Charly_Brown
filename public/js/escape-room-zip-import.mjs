const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,(.*)$/i;

const MIME_BY_EXTENSION = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", pdf: "application/pdf"
};

export function isSafeArchivePath(path = "") {
  const raw = String(path || "").trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  try {
    return !decodeURIComponent(raw).split("/").some((part) => part === ".." || part === "");
  } catch (_) {
    return false;
  }
}

export function findEscapeRoomManifestPath(paths = []) {
  const candidates = [...paths]
    .map((path) => String(path || "").replace(/\\/g, "/"))
    .filter((path) => isSafeArchivePath(path) && (path === "assets/escape-room.json" || path.endsWith("/assets/escape-room.json")))
    .sort((left, right) => left.length - right.length);
  return candidates[0] || "";
}

export function resolveArchiveAssetPath(manifestPath = "", assetPath = "") {
  const raw = String(assetPath || "").trim().replace(/\\/g, "/");
  if (!raw || /^data:/i.test(raw) || /^https?:\/\//i.test(raw)) return "";
  const cleaned = raw.replace(/^\.\//, "");
  if (!isSafeArchivePath(cleaned)) return "";
  const marker = "/assets/escape-room.json";
  const manifest = String(manifestPath || "").replace(/\\/g, "/");
  const root = manifest === "assets/escape-room.json" ? "" : manifest.slice(0, manifest.lastIndexOf(marker) + 1);
  const resolved = `${root}${cleaned}`;
  return isSafeArchivePath(resolved) ? resolved : "";
}

function bytesToDataUrl(bytes, path) {
  const extension = String(path || "").split(".").pop().toLowerCase();
  const mime = MIME_BY_EXTENSION[extension] || "application/octet-stream";
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  const base64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(value).toString("base64");
  return `data:${mime};base64,${base64}`;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isInternalAsset(value) {
  const raw = String(value || "").trim();
  return raw && !DATA_URL_PATTERN.test(raw) && !/^https?:\/\//i.test(raw);
}

/**
 * Restores packaged local resources to data URLs. getBinary receives a safe archive path
 * and must resolve to Uint8Array/ArrayBuffer or null when the entry is absent.
 */
export async function restorePigPenArchiveAssets(project, { manifestPath, getBinary } = {}) {
  const restored = clone(project || {});
  const restoredPaths = [];
  const missingPaths = [];

  const restore = async (holder, key) => {
    const value = String(holder?.[key] || "").trim();
    if (!isInternalAsset(value)) return;
    const archivePath = resolveArchiveAssetPath(manifestPath, value);
    if (!archivePath) {
      missingPaths.push(value);
      holder[key] = "";
      return;
    }
    const binary = await getBinary(archivePath);
    if (!binary) {
      missingPaths.push(value);
      holder[key] = "";
      return;
    }
    holder[key] = bytesToDataUrl(binary, archivePath);
    restoredPaths.push(value);
  };

  await restore(restored, "backgroundImage");
  for (const mission of Array.isArray(restored.misiones) ? restored.misiones : []) {
    await restore(mission, "imagen");
    if (mission?.media && typeof mission.media === "object") await restore(mission.media, "url");
    for (const question of Array.isArray(mission?.preguntas) ? mission.preguntas : []) {
      await restore(question, "imagen");
      if (question?.media && typeof question.media === "object") await restore(question.media, "url");
    }
  }
  return { project: restored, restoredPaths, missingPaths };
}
