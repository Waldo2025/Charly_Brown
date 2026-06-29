const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePersistedMediaReference
} = require("./media-reference.js");

test("prefers storagePath and clears persisted downloadUrl when object path is known", () => {
  const normalized = normalizePersistedMediaReference({
    downloadUrl: "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_1%2Fowners%2Fuid%2Fvideos%2Frow_1%2Fclip.mp4?alt=media&token=abc",
    storagePath: ""
  });

  assert.equal(normalized.storagePath, "podcaster/sessions/session_1/owners/uid/videos/row_1/clip.mp4");
  assert.equal(normalized.downloadUrl, "");
});

test("keeps downloadUrl only for legacy records without derivable storagePath", () => {
  const normalized = normalizePersistedMediaReference({
    downloadUrl: "https://example.com/file.mp4",
    storagePath: ""
  });

  assert.equal(normalized.storagePath, "");
  assert.equal(normalized.downloadUrl, "https://example.com/file.mp4");
});

test("derives storagePath from proxy image URLs with storagePath query", () => {
  const normalized = normalizePersistedMediaReference({
    downloadUrl: "https://charly-brown.web.app/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fsession_1%2Fowners%2Fuid%2Freferences%2FEscena%25202.png",
    storagePath: ""
  });

  assert.equal(normalized.storagePath, "podcaster/sessions/session_1/owners/uid/references/Escena 2.png");
  assert.equal(normalized.downloadUrl, "");
});

test("derives storagePath from proxy image URLs with nested Firebase URL", () => {
  const nested = encodeURIComponent(
    "https://firebasestorage.googleapis.com/v0/b/charly-brown.firebasestorage.app/o/podcaster%2Fsessions%2Fsession_1%2Fowners%2Fuid%2Freferences%2FEscena%25202.png?alt=media&token=abc"
  );
  const normalized = normalizePersistedMediaReference({
    downloadUrl: `https://charly-brown.web.app/api/assets/proxy-image?url=${nested}`,
    storagePath: ""
  });

  assert.equal(normalized.storagePath, "podcaster/sessions/session_1/owners/uid/references/Escena 2.png");
  assert.equal(normalized.downloadUrl, "");
});
