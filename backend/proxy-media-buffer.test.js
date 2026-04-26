const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBufferedMediaPayload
} = require("./proxy-media-buffer.js");

test("returns 206 chunk for valid byte range", () => {
  const source = Buffer.from("abcdefghij", "utf8");
  const payload = buildBufferedMediaPayload(source, {
    mimeType: "video/mp4",
    rangeHeader: "bytes=2-5"
  });

  assert.equal(payload.status, 206);
  assert.equal(payload.headers["Content-Type"], "video/mp4");
  assert.equal(payload.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(payload.headers["Content-Length"], "4");
  assert.equal(payload.body.toString("utf8"), "cdef");
});

test("returns full buffer for missing range header", () => {
  const source = Buffer.from("abcdefghij", "utf8");
  const payload = buildBufferedMediaPayload(source, {
    mimeType: "video/mp4",
    rangeHeader: ""
  });

  assert.equal(payload.status, 200);
  assert.equal(payload.headers["Content-Length"], "10");
  assert.equal(payload.body.toString("utf8"), "abcdefghij");
});
