const { randomUUID } = require("node:crypto");

function normalizeSegment(value = "", fallback = "item") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function detectSupportedRasterImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  const gifHeader = buffer.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { mimeType: "image/gif", extension: "gif" };
  }
  return null;
}

function buildOwnedSupportGraphicPath(requestedPath, uid, extension, randomId = randomUUID) {
  const prefix = "unidadesGeneradasAssets/";
  const cleanUid = String(uid || "").trim();
  const cleanExtension = String(extension || "").trim().toLowerCase();
  const cleanPath = String(requestedPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleanUid || !/^(png|jpg|webp|gif)$/.test(cleanExtension)) return "";
  if (!cleanPath.startsWith(prefix) || cleanPath.includes("..") || /[\u0000-\u001f]/.test(cleanPath)) return "";
  const rawSegments = cleanPath.slice(prefix.length).split("/").filter(Boolean);
  if (rawSegments.length < 2 || !rawSegments.includes(cleanUid)) return "";

  const safeSegments = rawSegments
    .slice(0, -1)
    .filter((segment) => segment !== cleanUid)
    .map((segment) => normalizeSegment(segment, "item"));
  const requestedName = rawSegments.at(-1) || "image";
  const baseName = normalizeSegment(requestedName.replace(/\.[^.]+$/, ""), "image").slice(0, 80);
  const randomSuffix = String(randomId()).replace(/-/g, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const safeSubpath = safeSegments.length ? `${safeSegments.join("/")}/` : "";
  return `${prefix}${cleanUid}/${safeSubpath}${baseName}-${randomSuffix}.${cleanExtension}`;
}

module.exports = { buildOwnedSupportGraphicPath, detectSupportedRasterImage };
