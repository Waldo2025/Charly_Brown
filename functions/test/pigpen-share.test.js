const assert = require("node:assert/strict");
const test = require("node:test");
const {
  cleanIdentifier,
  cleanToken,
  loadPublicSession,
  publicTopic,
  tokenMatches
} = require("../src/pigpen-share.js");

function snapshot(id, value) {
  return { id, data: () => value };
}

test("PigPen share tokens use URL-safe validation and constant-time matching", () => {
  const token = "Abcdefghijklmnopqrstuvwxyz_123456";
  assert.equal(cleanToken(token), token);
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token, `${token}x`), false);
  assert.throws(() => cleanToken("short"), /pigpen_share_token_invalid/);
  assert.throws(() => cleanIdentifier("owner/session"), /pigpen_session_id_invalid/);
});

test("publicTopic exposes the playable project without owner metadata", () => {
  const topic = publicTopic(snapshot("topic-2", {
    ownerId: "private-owner",
    academicNumber: 2,
    title: "Fracciones",
    project: { titulo: "Reto de fracciones", misiones: [] }
  }));
  assert.deepEqual(topic.project, { titulo: "Reto de fracciones", misiones: [] });
  assert.equal(topic.academicNumber, 2);
  assert.equal(Object.hasOwn(topic, "ownerId"), false);
});

test("public share loads and sorts every playable topic in a session", async () => {
  const token = "0123456789abcdefghijklmnopqrstuv";
  const parent = {
    exists: true,
    data: () => ({
      title: "Sesión de ciencias",
      shareEnabled: true,
      shareToken: token,
      activeTopicId: "topic-2",
      ownerId: "private-owner",
      formState: { objetivo: "private-editor-state" }
    })
  };
  const topicDocuments = [
    snapshot("topic-2", { academicNumber: 2, title: "Energía", project: { titulo: "Energía", misiones: [] } }),
    snapshot("topic-1", { academicNumber: 1, title: "Materia", project: { titulo: "Materia", misiones: [] } }),
    snapshot("empty", { academicNumber: 3, title: "Vacío", project: null })
  ];
  const db = {
    collection() {
      return {
        doc() {
          return {
            get: async () => parent,
            collection() {
              return { get: async () => ({ docs: topicDocuments }) };
            }
          };
        }
      };
    }
  };

  const result = await loadPublicSession({ db, sessionId: "session-1", token });
  assert.deepEqual(result.topics.map((topic) => topic.id), ["topic-1", "topic-2"]);
  assert.equal(result.activeTopicId, "topic-2");
  assert.equal(Object.hasOwn(result, "ownerId"), false);
  assert.equal(Object.hasOwn(result, "formState"), false);
});

test("public share does not reveal whether a token belongs to an existing session", async () => {
  const db = {
    collection() {
      return {
        doc() {
          return {
            get: async () => ({
              exists: true,
              data: () => ({ shareEnabled: true, shareToken: "0123456789abcdefghijklmnopqrstuv" })
            })
          };
        }
      };
    }
  };
  await assert.rejects(
    loadPublicSession({ db, sessionId: "session-1", token: "wrongwrongwrongwrongwrongwrong" }),
    (error) => error.status === 404 && error.code === "pigpen_share_not_found"
  );
});
