const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAssetAccess } = require("../src/assets.js");

function missingSessionDb() {
  return {
    collection(name) {
      assert.equal(name, "podcaster_sessions");
      return { doc(id) { return { get: async () => ({ exists: false, id }) }; } };
    }
  };
}

test("asset access permits a missing session only inside the authenticated owner's storage namespace", async () => {
  const authContext = { uid: "owner-123" };
  const result = await assertAssetAccess({
    req: {},
    storagePath: "podcaster/sessions/local-session/owners/owner-123/audio/voice.mp3",
    db: missingSessionDb(),
    authContext
  });
  assert.equal(result, authContext);
});

test("asset access still rejects a missing session when its owner namespace differs", async () => {
  await assert.rejects(
    assertAssetAccess({
      req: {},
      storagePath: "podcaster/sessions/local-session/owners/other-user/audio/voice.mp3",
      db: missingSessionDb(),
      authContext: { uid: "owner-123" }
    }),
    (error) => error.status === 404 && error.message === "podcaster_session_not_found"
  );
});
