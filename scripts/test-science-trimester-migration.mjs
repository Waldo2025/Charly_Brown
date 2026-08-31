import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScienceTrimester, planScienceTrimesterMigration } from "./backfill-science-activities-trimester-1.mjs";

test("normalizes supported trimester labels", () => {
  assert.equal(normalizeScienceTrimester("Trim1"), "Trimestre 1");
  assert.equal(normalizeScienceTrimester("trimestre_2"), "Trimestre 2");
  assert.equal(normalizeScienceTrimester("3"), "Trimestre 3");
  assert.equal(normalizeScienceTrimester("cuarto"), "");
});

test("assigns trimester 1 only when both copies are missing", () => {
  const plan = planScienceTrimesterMigration("science-1", { activity: { title: "Fricción" } });
  assert.equal(plan.action, "assigned_trimester_1");
  assert.equal(plan.trimester, "Trimestre 1");
  assert.deepEqual(plan.writes, { rootNeedsSync: true, activityNeedsSync: true });
});

test("preserves an existing trimester and synchronizes the missing copy", () => {
  const plan = planScienceTrimesterMigration("science-2", { trimester: "Trim2", activity: {} });
  assert.equal(plan.action, "synchronized");
  assert.equal(plan.trimester, "Trimestre 2");
  assert.deepEqual(plan.writes, { rootNeedsSync: true, activityNeedsSync: true });
});

test("does not overwrite conflicting existing trimesters", () => {
  const plan = planScienceTrimesterMigration("science-3", {
    trimester: "Trimestre 2",
    activity: { trimester: "Trimestre 3" }
  });
  assert.equal(plan.action, "conflict_skipped");
  assert.equal(plan.writes, null);
});
