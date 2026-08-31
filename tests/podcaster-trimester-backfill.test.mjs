import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  normalizeLegacyTrimester,
  planSessionTrimesterMigration
} from "../scripts/backfill-podcaster-active-trimester-1.mjs";

test("normalizes supported legacy trimester labels", () => {
  assert.equal(normalizeLegacyTrimester("1"), "1");
  assert.equal(normalizeLegacyTrimester("Trim2"), "2");
  assert.equal(normalizeLegacyTrimester("Trimestre 3"), "3");
  assert.equal(normalizeLegacyTrimester("cuarto"), "");
});

test("assigns trimester 1 only to active sessions without a trimester", () => {
  const plan = planSessionTrimesterMigration("active-1", {
    archived: false,
    academicMetadata: { nivel: "Primaria", grado: "Tercero", trimestre: "", unidad: "4", materia: "" }
  }, null);
  assert.equal(plan.action, "assigned_trimester_1");
  assert.equal(plan.metadata.trimestre, "1");
  assert.equal(plan.metadata.nivel, "Primaria");
  assert.equal(plan.metadata.grado, "Tercero");
  assert.equal(plan.metadata.unidad, "4");
});

test("never writes archived sessions, with or without existing metadata", () => {
  for (const trimestre of ["", "2"]) {
    const plan = planSessionTrimesterMigration(`archived-${trimestre || "empty"}`, {
      archived: true,
      trimestre,
      academicMetadata: { trimestre }
    }, trimestre ? { entityId: "legacy", entityType: "session", trimestre } : null);
    assert.equal(plan.action, "archived_skipped");
    assert.equal(plan.writes, null);
  }
});

test("preserves an existing trimester and synchronizes incomplete snapshots", () => {
  const plan = planSessionTrimesterMigration("active-2", {
    archived: false,
    session: { academicMetadata: { nivel: "Secundaria", grado: "Segundo", trimestre: "Trim2", unidad: "5", materia: "Física" } }
  }, null);
  assert.equal(plan.action, "synchronized");
  assert.equal(plan.metadata.trimestre, "2");
  assert.equal(plan.metadata.materia, "Física");
});

test("is idempotent once root and dedicated snapshots are synchronized", () => {
  const academicMetadata = { nivel: "Primaria", grado: "Primero", trimestre: "1", unidad: "2", materia: "", unitLabel: "Unidad" };
  const root = { archived: false, ...academicMetadata, academicMetadata };
  const dedicated = { entityId: "active-3", entityType: "session", ...academicMetadata, academicMetadata };
  const plan = planSessionTrimesterMigration("active-3", root, dedicated);
  assert.equal(plan.action, "unchanged");
  assert.equal(plan.writes, null);
});

test("migration defaults to dry-run and does not alter session ordering fields", () => {
  const source = readFileSync(new URL("../scripts/backfill-podcaster-active-trimester-1.mjs", import.meta.url), "utf8");
  assert.match(source, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(source, /if \(apply\) \{/);
  assert.doesNotMatch(source, /sessionUpdatedAt\s*:/);
});
