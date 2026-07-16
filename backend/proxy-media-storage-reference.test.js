"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseGsStorageReference
} = require("./proxy-media-storage-reference.js");

test("preserves bucket and object path from gs storage references", () => {
  assert.deepEqual(
    parseGsStorageReference("gs://charly-brown.firebasestorage.app/podcaster/sessions/u/videos/scene-14.png"),
    {
      bucketName: "charly-brown.firebasestorage.app",
      objectPath: "podcaster/sessions/u/videos/scene-14.png"
    }
  );
});

test("accepts an encoded gs storage reference without losing its bucket", () => {
  assert.deepEqual(
    parseGsStorageReference("gs%3A%2F%2Fbucket.example%2Fpodcaster%2Faudio%2520final.mp3"),
    {
      bucketName: "bucket.example",
      objectPath: "podcaster/audio final.mp3"
    }
  );
});

test("rejects incomplete or unsafe gs storage references", () => {
  assert.equal(parseGsStorageReference("gs://bucket-only"), null);
  assert.equal(parseGsStorageReference("gs://bucket.example/"), null);
  assert.equal(parseGsStorageReference("https://example.test/file.mp3"), null);
});
