const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");

const {
  writeMontageExportCacheArtifact,
  tryStreamMontageExportCacheDownload,
  getMontageExportCacheMetaPath,
  getMontageExportCacheFilePath
} = require("../server.js");

class FakeResponse extends Writable {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 200;
    this.jsonBody = null;
    this.bodyChunks = [];
  }

  setHeader(name, value) {
    this.headers[String(name || "").toLowerCase()] = value;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(payload) {
    this.jsonBody = payload;
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.bodyChunks.push(Buffer.from(chunk));
    callback();
  }
}

test("montage export cache artifact can be streamed after upload", async () => {
  const exportId = `job-${Date.now()}`;
  const token = `token-${Date.now()}`;
  const sourcePath = path.join(os.tmpdir(), `${exportId}.mp4`);
  fs.writeFileSync(sourcePath, "montage-bytes");

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const artifact = await writeMontageExportCacheArtifact({
    exportId,
    sourcePath,
    token,
    filename: "montage.mp4",
    mimeType: "video/mp4",
    expiresAt,
    outExt: "mp4"
  });

  assert.equal(artifact.exportId, exportId);
  assert.equal(artifact.token, token);
  assert.equal(artifact.filename, "montage.mp4");
  assert.equal(artifact.mimeType, "video/mp4");
  assert.equal(artifact.expiresAt, expiresAt);
  assert.equal(artifact.filePath, getMontageExportCacheFilePath(exportId, "mp4"));
  assert.equal(fs.existsSync(getMontageExportCacheMetaPath(exportId)), true);
  assert.equal(fs.existsSync(artifact.filePath), true);

  const req = { headers: {} };
  const res = new FakeResponse();
  const streamed = await tryStreamMontageExportCacheDownload(req, res, {
    exportId,
    token
  });
  await new Promise((resolve) => res.once("finish", resolve));

  assert.equal(streamed, true);
  assert.equal(res.statusCode, 200);
  assert.equal(Buffer.concat(res.bodyChunks).toString("utf8"), "montage-bytes");
  assert.equal(res.headers["content-type"], "video/mp4");
  assert.match(String(res.headers["content-disposition"] || ""), /attachment; filename="montage\.mp4"/);

  await fs.promises.rm(getMontageExportCacheMetaPath(exportId), { force: true });
  await fs.promises.rm(artifact.filePath, { force: true });
  await fs.promises.rm(sourcePath, { force: true });
});
