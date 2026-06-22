const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");

const {
  uploadFileToBucketNonResumable
} = require("./storage-upload.js");

test("uploadFileToBucketNonResumable uses createWriteStream with resumable false", async () => {
  const tempFile = path.join(os.tmpdir(), `cb-storage-upload-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, "hola");
  let observedOptions = null;
  let received = "";
  const bucket = {
    file(destination) {
      assert.equal(destination, "podcaster/exports/file.mp4");
      return {
        createWriteStream(options = {}) {
          observedOptions = options;
          return new Writable({
            write(chunk, _encoding, callback) {
              received += String(chunk);
              callback();
            }
          });
        }
      };
    }
  };

  try {
    await uploadFileToBucketNonResumable({
      bucket,
      destination: "podcaster/exports/file.mp4",
      filePath: tempFile,
      contentType: "video/mp4"
    });
  } finally {
    fs.unlinkSync(tempFile);
  }

  assert.equal(received, "hola");
  assert.equal(observedOptions.resumable, false);
  assert.equal(observedOptions.contentType, "video/mp4");
});

test("uploadFileToBucketNonResumable prefers signed url PUT before sdk stream fallback", async () => {
  const tempFile = path.join(os.tmpdir(), `cb-storage-upload-signed-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, "hola");
  let fetchCall = null;
  let createWriteStreamCalled = false;
  const bucket = {
    file(destination) {
      assert.equal(destination, "podcaster/exports/file.mp4");
      return {
        async getSignedUrl() {
          return ["https://signed.example/upload"];
        },
        createWriteStream() {
          createWriteStreamCalled = true;
          return new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            }
          });
        }
      };
    }
  };

  try {
    await uploadFileToBucketNonResumable({
      bucket,
      destination: "podcaster/exports/file.mp4",
      filePath: tempFile,
      contentType: "video/mp4",
      fetchImpl: async (url, options = {}) => {
        if (options?.body && typeof options.body.on === "function") {
          await new Promise((resolve, reject) => {
            options.body.on("data", () => {});
            options.body.on("end", resolve);
            options.body.on("error", reject);
          });
        }
        fetchCall = { url, options };
        return { ok: true, status: 200 };
      }
    });
  } finally {
    fs.unlinkSync(tempFile);
  }

  assert.equal(createWriteStreamCalled, false);
  assert.equal(fetchCall.url, "https://signed.example/upload");
  assert.equal(fetchCall.options.method, "PUT");
  assert.equal(fetchCall.options.headers["content-type"], "video/mp4");
});

test("uploadFileToBucketNonResumable signs custom metadata headers used by the PUT request", async () => {
  const tempFile = path.join(os.tmpdir(), `cb-storage-upload-meta-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, "hola");
  let signedUrlOptions = null;
  const bucket = {
    file(destination) {
      assert.equal(destination, "podcaster/uploads/file.png");
      return {
        async getSignedUrl(options = {}) {
          signedUrlOptions = options;
          return ["https://signed.example/upload-meta"];
        },
        createWriteStream() {
          return new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            }
          });
        }
      };
    }
  };

  try {
    await uploadFileToBucketNonResumable({
      bucket,
      destination: "podcaster/uploads/file.png",
      filePath: tempFile,
      contentType: "image/png",
      cacheControl: "public,max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: "token-123",
        source: "dialogue-video"
      },
      fetchImpl: async (_url, options = {}) => {
        if (options?.body && typeof options.body.on === "function") {
          await new Promise((resolve, reject) => {
            options.body.on("data", () => {});
            options.body.on("end", resolve);
            options.body.on("error", reject);
          });
        }
        return { ok: true, status: 200 };
      }
    });
  } finally {
    fs.unlinkSync(tempFile);
  }

  assert.ok(signedUrlOptions, "Debe solicitar signed URL.");
  assert.equal(signedUrlOptions.contentType, "image/png");
  assert.deepEqual(signedUrlOptions.extensionHeaders, {
    "cache-control": "public,max-age=86400",
    "x-goog-meta-firebaseStorageDownloadTokens": "token-123",
    "x-goog-meta-source": "dialogue-video"
  });
});
