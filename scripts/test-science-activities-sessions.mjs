import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isHydratableSessionActivity, nextOfflineDatabaseVersion, normalizedSessionMode, orderHydrationCandidates, sessionMetadataFromRecord, sessionsShareIdentity, shouldKeepSessionAfterRemoteList } from "../public/js/science-session-records.mjs";

test("session metadata is lightweight and preserves simulator mode", () => {
  const metadata = sessionMetadataFromRecord({
    id: "sim-1",
    savedAt: "2026-08-11T12:00:00.000Z",
    activity: {
      title: "Caída libre",
      subject: "physics",
      topic: "Caída libre",
      gameMode: "simulator",
      assessments: Array.from({ length: 20 }, () => ({ type: "multiple" }))
    }
  });

  assert.equal(metadata.gameMode, "simulator");
  assert.equal(metadata.title, "Caída libre");
  assert.equal(Object.hasOwn(metadata, "activity"), false);
  assert.equal(normalizedSessionMode("lab"), "simulator");
});

test("hydration chooses the newest exact-session payload instead of the most complete game", () => {
  const staleGame = {
    source: "body",
    timestamp: Date.parse("2026-08-10T10:00:00.000Z"),
    activity: { gameMode: "game", assessments: Array.from({ length: 50 }, () => ({})) }
  };
  const currentSimulator = {
    source: "draft",
    timestamp: Date.parse("2026-08-11T10:00:00.000Z"),
    activity: { gameMode: "simulator", simulator: { modelId: "gravity" } }
  };

  assert.equal(orderHydrationCandidates([staleGame, currentSimulator])[0].activity.gameMode, "simulator");
});

test("a per-session draft wins a timestamp tie", () => {
  const timestamp = Date.parse("2026-08-11T10:00:00.000Z");
  const ordered = orderHydrationCandidates([
    { source: "body", timestamp, activity: { title: "Guardado" } },
    { source: "draft", timestamp, activity: { title: "Borrador" } }
  ]);
  assert.equal(ordered[0].activity.title, "Borrador");
});

test("legacy saved activities remain hydratable without the new generation marker", () => {
  assert.equal(isHydratableSessionActivity({ title: "Fuerzas y movimiento", assessments: [{}] }), true);
  assert.equal(isHydratableSessionActivity({ title: "   " }), false);
  assert.equal(isHydratableSessionActivity(null), false);
});

test("hydration ignores invalid local payloads and can recover from the remote body", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const hydration = source.slice(
    source.indexOf("async function resolveHydratedSessionActivity"),
    source.indexOf("async function loadSessions")
  );

  assert.match(hydration, /isHydratableSessionActivity\(body\?\.activity\)/);
  assert.match(hydration, /isHydratableSessionActivity\(draft\?\.activity\)/);
  assert.match(hydration, /session\?\.syncState === "pending" && candidates\.length > 0/);
  assert.match(hydration, /SCIENCE_SESSION_ACTIVITY_MISSING/);
});

test("a database already at v2 repairs a missing session index at v3", () => {
  assert.equal(nextOfflineDatabaseVersion(2, 2, false), 3);
  assert.equal(nextOfflineDatabaseVersion(1, 2, false), 2);
  assert.equal(nextOfflineDatabaseVersion(2, 2, true), null);
});

test("remote and local metadata reconcile through the stable local session id", () => {
  assert.equal(sessionsShareIdentity(
    { id: "local-1", firebaseDocId: "stale-document-id" },
    { id: "local-1", firebaseDocId: "actual-document-id" }
  ), true);
  assert.equal(sessionsShareIdentity(
    { id: "local-1", firebaseDocId: "stale-document-id" },
    { id: "local-2", firebaseDocId: "actual-document-id" }
  ), false);
});

test("a complete remote list removes only synchronized orphan metadata", () => {
  const remoteSessions = [{ id: "remote-local-id", firebaseDocId: "real-document" }];
  assert.equal(shouldKeepSessionAfterRemoteList(
    { id: "orphan", firebaseDocId: "missing-document", syncState: "saved" },
    remoteSessions,
    true
  ), false);
  assert.equal(shouldKeepSessionAfterRemoteList(
    { id: "offline-edit", syncState: "pending" },
    remoteSessions,
    true
  ), true);
  assert.equal(shouldKeepSessionAfterRemoteList(
    { id: "older-page", syncState: "saved" },
    remoteSessions,
    false
  ), true);
});

test("mounting a simulator clears the game briefing state that hides the runtime", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const mountSimulator = source.slice(
    source.indexOf("async function mountSimulatorFlow"),
    source.indexOf("function mountAssessmentFlow")
  );

  assert.match(mountSimulator, /classList\.remove\("is-level-briefing"\)/);
  assert.ok(
    mountSimulator.indexOf('classList.remove("is-level-briefing")')
      < mountSimulator.indexOf("createScienceSimulator"),
    "the stale briefing class must be cleared before the simulator is created"
  );
});

test("real user changes schedule a debounced Firebase autosave", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const scheduler = source.slice(
    source.indexOf("function scheduleLocalDraftSave"),
    source.indexOf("function flushLocalDraftSave")
  );
  assert.match(scheduler, /autosaveProject\("user-change"\)/);
});

test("regenerating an active session preserves its current title", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const generation = source.slice(
    source.indexOf("async function generateWithGemini"),
    source.indexOf("async function setGenerating")
  );

  assert.match(generation, /const preserveActiveSessionTitle = !initialSetup && Boolean\(state\.activeSessionId\)/);
  assert.match(generation, /const preservedSessionTitle = preserveActiveSessionTitle/);
  assert.match(generation, /simulatorActivity\.title = preservedSessionTitle \|\|/);
  assert.match(generation, /if \(preservedSessionTitle\) generatedActivity\.title = preservedSessionTitle/);
  assert.match(generation, /if \(preservedSessionTitle\) state\.activity\.title = preservedSessionTitle/);
  assert.match(generation, /Título de sesión protegido/);
});

test("the session rail supports command multi-selection and persistent groups", async () => {
  const [source, html, styles] = await Promise.all([
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(html, /id="sessionSelectionToolbar"/);
  assert.doesNotMatch(html, /id="groupSelectedSessionsBtn"/);
  assert.match(source, /SESSION_GROUPS_STORAGE_KEY/);
  assert.match(source, /selectedSessionIds: new Set\(\)/);
  assert.match(source, /function createSessionGroupFromSelection\(\)/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /String\(event\.key\)\.toLowerCase\(\) === "g"/);
  assert.match(source, /data-session-group-action="rename"/);
  assert.match(source, /data-session-group-action="ungroup"/);
  assert.match(source, /loadSessionGroups\(\)/);
  assert.doesNotMatch(source, /sa-session-selection-mark/);
  assert.match(styles, /\.sa-session-item\.is-selected/);
  assert.doesNotMatch(styles, /\.sa-session-selection-mark/);
  assert.match(styles, /\.sa-session-group-heading/);
  assert.doesNotMatch(styles, /\.sa-session-selection-toolbar/);
});

test("deleting a question keeps generated counts consistent and opens the following question", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const reindex = source.slice(
    source.indexOf("function reindexActivityAssessments"),
    source.indexOf("function renderContentEditor")
  );
  const deletion = source.slice(
    source.indexOf('const deleteAssessment = event.target.closest("[data-delete-assessment]")'),
    source.indexOf('const timelineAction = event.target.closest("[data-timeline-action]")')
  );

  assert.match(reindex, /totalQuestions:\s*assessments\.length/);
  assert.match(reindex, /generation\s*=\s*\{/);
  assert.match(deletion, /contentQuestionIndex\s*=\s*Math\.min\(deletedIndex/);
  assert.match(deletion, /assessmentController\?\.openQuestion\?\.\(state\.contentQuestionIndex\)/);
  assert.match(deletion, /deleteAssessment\.disabled = true/);
});

test("a persisted edited total repairs stale per-level counters without inventing questions", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const ensure = source.slice(
    source.indexOf("function ensureActivityAssessments"),
    source.indexOf("function structuredEditorList")
  );

  assert.match(ensure, /generatedTotal === existing\.length/);
  assert.match(ensure, /activity\.questionsPerLevel = questionsPerLevel/);
  assert.match(ensure, /else \{\s*throw new Error\(`La actividad está incompleta/);
});

test("the content selector starts with the title screen and also navigates to the introduction", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const editor = source.slice(
    source.indexOf("function renderContentEditor"),
    source.indexOf("function renderSimulatorContentEditor")
  );
  const navigator = source.slice(
    source.indexOf("const navigateFromEditor = (event) =>"),
    source.indexOf("const assessmentController =")
  );

  assert.match(editor, /<option value="start"[^>]*>Pantalla de inicio<\/option><option value="introduction"[^>]*>Introducción de la actividad<\/option>/);
  assert.match(editor, /detail:\s*\{ phase: "start" \}/);
  assert.match(editor, /detail:\s*\{ phase: "introduction" \}/);
  assert.match(navigator, /event\.detail\?\.phase === "start"/);
  assert.match(navigator, /renderPreviewStartScreen\(activity\)/);
  assert.match(navigator, /event\.detail\?\.phase === "introduction"/);
  assert.match(navigator, /renderLevelBriefing\(\)/);
});
