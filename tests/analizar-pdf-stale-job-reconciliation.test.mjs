import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { reconcileStaleAnalizarPdfSessionJobs } = require("../backend/analizar-pdf.js");

test("stale queued or processing analysis jobs are cleared after backend restart", () => {
  const session = {
    id: "session_1",
    analysisStatus: "queued",
    analysisJobId: "missing_session_job",
    revisions: [
      {
        id: "revision_1",
        files: [
          {
            id: "file_1",
            analysisStatus: "processing",
            analysisJobId: "missing_file_job"
          },
          {
            id: "file_2",
            analysisStatus: "completed",
            analysisJobId: "done_job"
          }
        ]
      }
    ]
  };

  const reconciled = reconcileStaleAnalizarPdfSessionJobs(session, {
    get() {
      return null;
    }
  });

  assert.equal(reconciled.analysisStatus, "failed");
  assert.equal(reconciled.analysisJobId, "");
  assert.equal(reconciled.revisions[0].files[0].analysisStatus, "failed");
  assert.equal(reconciled.revisions[0].files[0].analysisJobId, "");
  assert.equal(reconciled.revisions[0].files[1].analysisStatus, "completed");
  assert.equal(reconciled.revisions[0].files[1].analysisJobId, "done_job");
});

test("busy analysis statuses are reconciled to finished job statuses from the in-memory store", () => {
  const session = {
    id: "session_2",
    analysisStatus: "processing",
    analysisJobId: "done_session_job",
    revisions: [
      {
        id: "revision_2",
        files: [
          {
            id: "file_1",
            analysisStatus: "queued",
            analysisJobId: "failed_file_job"
          },
          {
            id: "file_2",
            analysisStatus: "processing",
            analysisJobId: "cancelled_file_job"
          }
        ]
      }
    ]
  };

  const jobs = new Map([
    ["done_session_job", { status: "completed" }],
    ["failed_file_job", { status: "failed" }],
    ["cancelled_file_job", { status: "cancelled" }]
  ]);

  const reconciled = reconcileStaleAnalizarPdfSessionJobs(session, {
    get(jobId) {
      return jobs.get(jobId) || null;
    }
  });

  assert.equal(reconciled.analysisStatus, "completed");
  assert.equal(reconciled.analysisJobId, "");
  assert.equal(reconciled.revisions[0].files[0].analysisStatus, "failed");
  assert.equal(reconciled.revisions[0].files[0].analysisJobId, "");
  assert.equal(reconciled.revisions[0].files[1].analysisStatus, "cancelled");
  assert.equal(reconciled.revisions[0].files[1].analysisJobId, "");
});
