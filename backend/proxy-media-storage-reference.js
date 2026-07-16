"use strict";

function decodeStorageReference(value = "") {
  let decoded = String(value || "").trim();
  for (let attempt = 0; attempt < 2 && /%[0-9a-f]{2}/i.test(decoded); attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }
  return decoded;
}

function parseGsStorageReference(value = "") {
  const decoded = decodeStorageReference(value);
  const match = decoded.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  const bucketName = String(match[1] || "").trim().toLowerCase();
  const objectPath = String(match[2] || "").split("?", 1)[0].replace(/^\/+/, "").trim();
  if (!bucketName || !objectPath || !/^[a-z0-9._-]+$/.test(bucketName)) return null;
  return { bucketName, objectPath };
}

module.exports = {
  decodeStorageReference,
  parseGsStorageReference
};
