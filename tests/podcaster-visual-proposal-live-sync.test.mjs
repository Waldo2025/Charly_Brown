import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { sourceFunctions } from "./helpers/snoopy-source.mjs";

const app = new URL("../public/podcaster/podcaster.js", import.meta.url);

const proposalFunctions = sourceFunctions(app, [
  "extractRemoteVisualProposalRows",
  "applyRemoteVisualProposalSnapshot",
  "resolveVisualProposalTimelineState",
  "syncTimelineVisualProposalState"
]);

function makeContext() {
  const context = vm.createContext({
    normalizeVisualProposalState: (value) => Array.from(new Set(
      (Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)
    ))
  });
  vm.runInContext(proposalFunctions, context);
  return context;
}

test("remote proposal snapshot updates only the matching row", () => {
  const context = makeContext();
  const videoMap = { row1: { downloadUrl: "video-1.mp4" } };
  const audioMap = { row1: { downloadUrl: "audio-1.ogg" } };
  const timeline = { row1: { startMs: 1200, durationMs: 8000 } };
  const session = {
    id: "session-1",
    dialogueVideoMap: videoMap,
    dialogueAudioMap: audioMap,
    timelineClipMap: timeline,
    script: {
      rows: [
        { id: "row1", text: "local text", visualNotesProposal: "" },
        { id: "row2", text: "keep me" }
      ]
    }
  };
  const snapshot = {
    session: {
      script: {
        rows: [
          {
            id: "row1",
            text: "stale remote text",
            visualNotesProposal: "Cambiar encuadre",
            visualNotesProposals: ["Cambiar encuadre"],
            visualNotesResolvedProposals: [],
            visualNotesProposalReferences: [{ proposalText: "Cambiar encuadre", dataUrl: "ref.jpg" }]
          },
          { id: "unknown", visualNotesProposal: "Do not append" }
        ]
      }
    }
  };

  const result = context.applyRemoteVisualProposalSnapshot(session, snapshot);
  assert.equal(result.changed, true);
  assert.deepEqual([...result.rowIds], ["row1"]);
  assert.equal(session.script.rows[0].visualNotesProposal, "Cambiar encuadre");
  assert.deepEqual([...session.script.rows[0].visualNotesProposals], ["Cambiar encuadre"]);
  assert.equal(session.script.rows[0].visualNotesProposalReferences[0].dataUrl, "ref.jpg");
  assert.equal(session.script.rows[0].text, "local text");
  assert.equal(session.script.rows[1].text, "keep me");
  assert.equal(session.dialogueVideoMap, videoMap);
  assert.equal(session.dialogueAudioMap, audioMap);
  assert.equal(session.timelineClipMap, timeline);
});

test("resolved and removed proposals produce the expected timeline state", () => {
  const context = makeContext();
  const row = { id: "row1", visualNotesProposal: "Cambio", visualNotesProposals: ["Cambio"], visualNotesResolvedProposals: [] };
  const session = { id: "session-1", script: { rows: [row] } };

  assert.equal(context.resolveVisualProposalTimelineState(row), "pending");
  context.applyRemoteVisualProposalSnapshot(session, { session: { script: { rows: [{
    id: "row1",
    visualNotesProposal: "",
    visualNotesProposals: ["Cambio"],
    visualNotesResolvedProposals: ["Cambio"]
  }] } } });
  assert.equal(context.resolveVisualProposalTimelineState(row), "resolved");

  context.applyRemoteVisualProposalSnapshot(session, { session: { script: { rows: [{
    id: "row1",
    visualNotesProposal: "",
    visualNotesProposals: [],
    visualNotesResolvedProposals: []
  }] } } });
  assert.equal(context.resolveVisualProposalTimelineState(row), "none");
});

test("identical, malformed and unrelated snapshots do not trigger UI work", () => {
  const context = makeContext();
  const session = { id: "session-1", script: { rows: [{
    id: "row1",
    visualNotesProposal: "Cambio",
    visualNotesProposals: ["Cambio"],
    visualNotesResolvedProposals: []
  }] } };
  const same = { session: { script: { rows: [{
    id: "row1",
    visualNotesProposal: "Cambio",
    visualNotesProposals: ["Cambio"],
    visualNotesResolvedProposals: []
  }] } } };

  assert.equal(context.applyRemoteVisualProposalSnapshot(session, same).changed, false);
  assert.equal(context.applyRemoteVisualProposalSnapshot(session, {}).changed, false);
  assert.equal(context.applyRemoteVisualProposalSnapshot(session, { session: { script: { rows: [{ id: "other", visualNotesProposal: "X" }] } } }).changed, false);
});

test("activity listener applies the snapshot only to the subscribed active session", () => {
  let callback = null;
  let activeSession = { id: "session-1", script: { rows: [{ id: "row1", visualNotesProposal: "" }] } };
  const rendered = [];
  const context = vm.createContext({
    activityUnsubscribe: null,
    firestoreDb: {},
    doc: (_db, collection, id) => ({ collection, id }),
    onSnapshot: (_ref, handler) => { callback = handler; return () => {}; },
    getActiveSession: () => activeSession,
    applyRemoteVisualProposalSnapshot: (session, data) => {
      const text = data.session.script.rows[0].visualNotesProposal;
      if (session.script.rows[0].visualNotesProposal === text) return { changed: false, rowIds: [] };
      session.script.rows[0].visualNotesProposal = text;
      return { changed: true, rowIds: ["row1"] };
    },
    persistSessions: () => rendered.push("persist"),
    renderRemoteVisualProposalUpdate: (_session, ids) => rendered.push(ids.join(",")),
    showActivityNotification: () => {}
  });
  vm.runInContext(sourceFunctions(app, ["setupActivityListener"]), context);
  context.setupActivityListener("session-1");
  callback({ exists: () => true, data: () => ({
    session: { script: { rows: [{ id: "row1", visualNotesProposal: "Cambio" }] } }
  }) });
  assert.equal(activeSession.script.rows[0].visualNotesProposal, "Cambio");
  assert.deepEqual(rendered, ["persist", "row1"]);

  activeSession = { id: "session-2", script: { rows: [{ id: "row1", visualNotesProposal: "local" }] } };
  callback({ exists: () => true, data: () => ({
    session: { script: { rows: [{ id: "row1", visualNotesProposal: "late" }] } }
  }) });
  assert.equal(activeSession.script.rows[0].visualNotesProposal, "local");
  assert.deepEqual(rendered, ["persist", "row1"]);
});

test("timeline proposal state toggles both the clip and its body without rendering media", () => {
  const context = makeContext();
  const classes = () => {
    const values = new Set();
    return { values, toggle(name, enabled) { enabled ? values.add(name) : values.delete(name); } };
  };
  const body = { classList: classes() };
  const clip = {
    dataset: { rowId: "row1" },
    classList: classes(),
    querySelector: () => body
  };
  context.getSessionRows = (session) => session.script.rows;
  context.document = { querySelectorAll: () => [clip] };
  context.syncTimelineVisualProposalState({ script: { rows: [{
    id: "row1",
    visualNotesProposal: "Cambio",
    visualNotesProposals: ["Cambio"],
    visualNotesResolvedProposals: []
  }] } }, ["row1"]);
  assert.equal(clip.classList.values.has("has-pending-proposals"), true);
  assert.equal(body.classList.values.has("has-pending-proposals"), true);
  assert.equal(clip.classList.values.has("has-all-proposals-realized"), false);
});

test("video-player mutation returns and installs the newly persisted session", async () => {
  const home = new URL("../public/js/home.js", import.meta.url);
  const context = vm.createContext({
    currentMultimediaSession: { id: "session-1", script: { rows: [{ id: "row1", visualNotesProposal: "" }] } },
    window: { _currentActiveRowId: "row1" },
    db: {},
    doc: () => ({}),
    getDoc: async () => ({ exists: () => true, data: () => ({ session: { id: "session-1", script: { rows: [{ id: "row1", visualNotesProposal: "" }] } } }) }),
    updateDoc: async () => {},
    buildDashboardProposalShallowRows: (rows) => rows,
    buildDashboardSessionFromPodcasterDoc: (data) => data.session,
    console
  });
  vm.runInContext(sourceFunctions(home, ["mutateDashboardProposalSession"]), context);
  const result = await context.mutateDashboardProposalSession("row1", (rows) => {
    rows[0].visualNotesProposal = "Cambio";
    rows[0].visualNotesProposals = ["Cambio"];
    return true;
  });
  assert.equal(result.ok, true);
  assert.equal(result.session.script.rows[0].visualNotesProposal, "Cambio");
  assert.equal(context.currentMultimediaSession.script.rows[0].visualNotesProposal, "Cambio");
});
