const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveMontageExportVideoParams,
  resolveMontageIntermediateVideoParams
} = require("./montage-export-video-params.js");

test("intermediate montage params favor mezzanine quality for mp4", () => {
  const params = resolveMontageIntermediateVideoParams("mp4_h264");
  assert.equal(params.container, "mp4");
  assert.equal(params.vCodec, "libx264");
  assert.deepEqual(params.aArgs, ["-b:a", "192k"]);
  assert.match(params.vArgs.join(" "), /-crf 12/);
  assert.doesNotMatch(params.vArgs.join(" "), /-maxrate/);
  assert.doesNotMatch(params.vArgs.join(" "), /-bufsize/);
});

test("delivery montage params keep bitrate caps for final mp4 export", () => {
  const params = resolveMontageExportVideoParams("mp4_h264", "balanced", null);
  assert.equal(params.container, "mp4");
  assert.equal(params.vCodec, "libx264");
  assert.match(params.vArgs.join(" "), /-crf 20/);
  assert.match(params.vArgs.join(" "), /-maxrate 5M/);
  assert.match(params.vArgs.join(" "), /-bufsize 10M/);
});

test("delivery montage params honor custom cbr settings", () => {
  const params = resolveMontageExportVideoParams("mp4_h264", "high", {
    mode: "cbr",
    maxBitrateMbps: 14
  });
  assert.match(params.vArgs.join(" "), /-b:v 14M/);
  assert.match(params.vArgs.join(" "), /-maxrate 14M/);
  assert.match(params.vArgs.join(" "), /-bufsize 14M/);
  assert.doesNotMatch(params.vArgs.join(" "), /-crf/);
});
