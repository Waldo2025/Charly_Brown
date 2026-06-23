import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url);
const { runAnalizarPdfJobInWorker } = require("../backend/analizar-pdf-worker-client.js");

test("analizar pdf worker client aborts hung jobs after timeout", async () => {
  class FakeChild extends EventEmitter {
    constructor() {
      super();
      this.stdout = new EventEmitter();
      this.stderr = new EventEmitter();
      this.killedWith = null;
      this.sentMessages = [];
    }

    send(message) {
      this.sentMessages.push(message);
    }

    kill(signal) {
      this.killedWith = signal;
      this.emit("exit", null, signal);
      return true;
    }
  }

  const child = new FakeChild();

  await assert.rejects(
    () => runAnalizarPdfJobInWorker(
      { jobId: "job_timeout" },
      {
        timeoutMs: 25,
        forkProcess: () => child
      }
    ),
    /timed_out/i
  );

  assert.equal(child.killedWith, "SIGKILL");
  assert.deepEqual(child.sentMessages, [{
    type: "run",
    job: { jobId: "job_timeout" }
  }]);
});
