"use strict";

const fs = require("fs");
const { pipeline } = require("node:stream/promises");

async function uploadFileToBucketNonResumable({
  bucket,
  destination = "",
  filePath = "",
  contentType = "",
  cacheControl = "",
  metadata = {}
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
