import test from "node:test";
import assert from "node:assert/strict";

import { createAnalizarPdfSaveCoordinator } from "../public/analizarPDF/analizar-pdf-save-coordinator.js";

test("save coordinator serializes concurrent saves for the same session", async () => {
  const starts = [];
  const finishes = [];
  const releases = [];
  const coordinator = createAnalizarPdfSaveCoordinator({
    saveImpl: (session) => new Promise((resolve) => {
      starts.push(session.revisionToken);
      releases.push(() => {
        finishes.push(session.revisionToken);
        resolve({ ...session, saved: true });
      });
    })
  });

  const first = coordinator.save({ id: "session_1", revisionToken: "a" });
  const second = coordinator.save({ id: "session_1", revisionToken: "b" });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(starts, ["a"]);

  releases.shift()();
  assert.equal((await first).saved, true);

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(starts, ["a", "b"]);

  releases.shift()();
  assert.equal((await second).saved, true);
  assert.deepEqual(finishes, ["a", "b"]);
});

test("save coordinator retries aborted contention errors before failing", async () => {
  let attempts = 0;
  const coordinator = createAnalizarPdfSaveCoordinator({
    saveImpl: async (session) => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("10 ABORTED: Aborted due to cross-transaction contention.");
      }
      return { ...session, saved: true, attempts };
    }
  });

  const result = await coordinator.save({ id: "session_2", revisionToken: "retry" });
  assert.equal(result.saved, true);
  assert.equal(result.attempts, 3);
});
