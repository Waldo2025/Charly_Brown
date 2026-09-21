import test from "node:test";
import assert from "node:assert/strict";
import { createPodcasterAdminSessionBrowser } from "../public/podcaster/podcaster-admin-session-browser.js";
import {
  listAdminVideoSessions,
  loadSingleSessionFromCloud
} from "../public/podcaster/podcaster-session-store.js";

function createController(isAdmin) {
  const els = {
    openAdminUserVideosBtn: { hidden: true },
    adminUserVideosModal: { hidden: true }
  };
  const controller = createPodcasterAdminSessionBrowser({
    els,
    state: { sessions: [] },
    sessionStore: {},
    escapeHtml: (value) => String(value),
    isCurrentUserAdmin: () => isAdmin
  });
  return { controller, els };
}

test("admin session browser icon is visible only to administrators", () => {
  const regular = createController(false);
  regular.controller.syncVisibility();
  assert.equal(regular.els.openAdminUserVideosBtn.hidden, true);
  assert.equal(regular.els.openAdminUserVideosBtn.disabled, true);

  const admin = createController(true);
  admin.controller.syncVisibility();
  assert.equal(admin.els.openAdminUserVideosBtn.hidden, false);
  assert.equal(admin.els.openAdminUserVideosBtn.disabled, false);
});

function createAdminListDeps(apiResponse, directDocs = [], options = {}) {
  let directReads = 0;
  return {
    deps: {
      resolveCurrentUid: () => "admin-1",
      getCurrentUserIsAdmin: () => true,
      preferDirectFirestoreReads: () => options.preferDirectFirestoreReads === true,
      hasAvailableApiBase: () => true,
      authFetchJson: async () => apiResponse,
      firestoreDb: {},
      collection: () => ({ kind: "collection" }),
      where: (...args) => ({ kind: "where", args }),
      limit: (value) => ({ kind: "limit", value }),
      query: (...parts) => parts,
      getDocs: async () => {
        directReads += 1;
        return { docs: directDocs };
      }
    },
    getDirectReads: () => directReads
  };
}

function videoSession(id, ownerId) {
  return {
    id,
    title: id,
    archived: false,
    podcastStudioUiState: { composerGenerationMode: "video" },
    script: { rows: [] },
    cloudMeta: { ownerId }
  };
}

test("admin session listing rejects an API response scoped to another owner", async () => {
  const directDoc = {
    id: "selected-owner-video",
    data: () => ({
      ownerId: "user-2",
      title: "Video correcto",
      session: {
        podcastStudioUiState: { composerGenerationMode: "video" },
        script: { rows: [] }
      }
    })
  };
  const fixture = createAdminListDeps({
    sessions: [videoSession("admin-video", "admin-1")]
  }, [directDoc]);

  const sessions = await listAdminVideoSessions("user-2", fixture.deps);

  assert.equal(fixture.getDirectReads(), 1);
  assert.deepEqual(sessions.map((session) => session.id), ["selected-owner-video"]);
  assert.equal(sessions[0].cloudMeta.ownerId, "user-2");
});

test("admin session listing accepts an explicitly scoped API response", async () => {
  const fixture = createAdminListDeps({
    scope: { ownerId: "user-2", type: "video", archived: "all" },
    sessions: [videoSession("user-video", "user-2")]
  });

  const sessions = await listAdminVideoSessions("user-2", fixture.deps);

  assert.equal(fixture.getDirectReads(), 0);
  assert.deepEqual(sessions.map((session) => session.id), ["user-video"]);
});

test("local admin session listing reads Firestore without calling the deployed API", async () => {
  const directDoc = {
    id: "local-user-video",
    data: () => ({
      ownerId: "user-2",
      session: {
        podcastStudioUiState: { composerGenerationMode: "video" },
        script: { rows: [] }
      }
    })
  };
  const fixture = createAdminListDeps(null, [directDoc], { preferDirectFirestoreReads: true });
  fixture.deps.authFetchJson = async () => {
    throw new Error("The deployed API must not be called from local admin browsing.");
  };

  const sessions = await listAdminVideoSessions("user-2", fixture.deps);

  assert.equal(fixture.getDirectReads(), 1);
  assert.deepEqual(sessions.map((session) => session.id), ["local-user-video"]);
});

test("local session loading bypasses a stale deployed sessions/get endpoint", async () => {
  let apiCalls = 0;
  const session = await loadSingleSessionFromCloud("session-user-2", "admin-1", {
    preferDirectFirestoreReads: () => true,
    hasAvailableApiBase: () => true,
    authFetchJson: async () => {
      apiCalls += 1;
      throw Object.assign(new Error("forbidden"), { status: 403 });
    },
    firestoreDb: {},
    doc: () => ({ kind: "document" }),
    getDoc: async () => ({
      exists: () => true,
      data: () => ({
        ownerId: "user-2",
        archived: true,
        session: { id: "session-user-2", title: "Sesión local" }
      })
    })
  });

  assert.equal(apiCalls, 0);
  assert.equal(session.id, "session-user-2");
  assert.equal(session.ownerId, "user-2");
  assert.equal(session.archived, true);
});
