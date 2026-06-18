"use strict";

const fs = require("fs");
const { pipeline } = require("node:stream/promises");

async function uploadFileToBucketNonResumable({
  bucket,
  destination = "",
  filePath = "",
  contentType = "",
  cacheControl = "",
  metadata = {},
  fetchImpl = globalThis.fetch
} = {}) {
  const targetBucket = bucket || null;
  const cleanDestination = String(destination || "").trim();
  const sourcePath = String(filePath || "").trim();
  if (!targetBucket || typeof targetBucket.file !== "function") {
    const err = new Error("missing_bucket");
    err.code = "missing_bucket";
    throw err;
  }
  if (!cleanDestination) {
    const err = new Error("missing_destination");
    err.code = "missing_destination";
    throw err;
  }
  if (!sourcePath) {
    const err = new Error("missing_filePath");
    err.code = "missing_filePath";
    throw err;
  }
  const file = targetBucket.file(cleanDestination);
  const uploadViaSignedUrl = async () => {
    if (typeof file.getSignedUrl !== "function" || typeof fetchImpl !== "function") {
      const err = new Error("signed_url_upload_unavailable");
      err.code = "signed_url_upload_unavailable";
      throw err;
    }
    const stat = await fs.promises.stat(sourcePath);
    const headers = {};
    if (contentType) headers["content-type"] = contentType;
    if (stat.size > 0) headers["content-length"] = String(stat.size);
    if (cacheControl) headers["cache-control"] = cacheControl;
    Object.entries(metadata && typeof metadata === "object" ? metadata : {}).forEach(([key, value]) => {
      const cleanKey = String(key || "").trim();
      const cleanValue = String(value || "").trim();
      if (!cleanKey || !cleanValue) return;
      headers[`x-goog-meta-${cleanKey}`] = cleanValue;
    });
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 5 * 60 * 1000,
      ...(contentType ? { contentType } : {})
    });
    const response = await fetchImpl(signedUrl, {
      method: "PUT",
      headers,
      body: fs.createReadStream(sourcePath),
      duplex: "half"
    });
    if (!response?.ok) {
      const err = new Error(`signed_url_upload_failed_${Number(response?.status || 0) || "unknown"}`);
      err.code = "signed_url_upload_failed";
      err.status = Number(response?.status || 0) || 502;
      throw err;
    }
    return file;
  };
  try {
    return await uploadViaSignedUrl();
  } catch (signedUrlError) {
    const fallbackAllowed = String(signedUrlError?.code || "").trim() !== "signed_url_upload_failed"
      || Number(signedUrlError?.status || 0) >= 500
      || Number(signedUrlError?.status || 0) === 0;
    if (!fallbackAllowed) throw signedUrlError;
  }
  const writeStream = file.createWriteStream({
    resumable: false,
    ...(contentType ? { contentType } : {}),
    ...(cacheControl || (metadata && Object.keys(metadata).length)
      ? {
        metadata: {
          ...(cacheControl ? { cacheControl } : {}),
          ...(metadata && Object.keys(metadata).length ? { metadata } : {})
        }
      }
      : {})
  });
  await pipeline(fs.createReadStream(sourcePath), writeStream);
  return file;
}

module.exports = {
  uploadFileToBucketNonResumable
};
