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
