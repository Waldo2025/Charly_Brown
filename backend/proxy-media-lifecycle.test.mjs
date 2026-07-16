import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import proxyMediaLifecycle from "./proxy-media-lifecycle.js";

const {
  bindProxyMediaStreamLifecycle,
  fetchProxyMediaWithTimeout,
  isTransientProxyMediaError,
  shouldDestroyProxyMediaUpstream
} = proxyMediaLifecycle;

test("does not destroy upstream on normal request close after completion", () => {
  assert.equal(shouldDestroyProxyMediaUpstream({
    requestAborted: false,
    responseFinished: true,
    responseClosed: false
  }), false);
});

test("destroys upstream when response closes before finishing", () => {
  assert.equal(shouldDestroyProxyMediaUpstream({
    requestAborted: false,
    responseFinished: false,
    responseClosed: true
  }), true);
});

function createLifecycleFixture() {
  const request = new EventEmitter();
  request.aborted = false;
  const response = new EventEmitter();
  response.writableFinished = false;
  const stream = {
    destroyed: false,
    destroyCalls: 0,
    destroy() {
      this.destroyed = true;
      this.destroyCalls += 1;
    }
  };
  return { request, response, stream };
}

test("ordinary request close never destroys a valid response stream", () => {
  const fixture = createLifecycleFixture();
  const lifecycle = bindProxyMediaStreamLifecycle(fixture.request, fixture.response, fixture.stream);

  fixture.request.emit("close");

  assert.equal(fixture.stream.destroyCalls, 0);
  assert.equal(lifecycle.wasClientDisconnected(), false);
  lifecycle.cleanup();
});

test("response finish followed by close does not destroy the upstream", () => {
  const fixture = createLifecycleFixture();
  const lifecycle = bindProxyMediaStreamLifecycle(fixture.request, fixture.response, fixture.stream);

  fixture.response.writableFinished = true;
  fixture.response.emit("finish");
  fixture.response.emit("close");

  assert.equal(fixture.stream.destroyCalls, 0);
  assert.equal(lifecycle.wasResponseFinished(), true);
  assert.equal(lifecycle.wasClientDisconnected(), false);
  lifecycle.cleanup();
});

test("request abort destroys the upstream exactly once", () => {
  const fixture = createLifecycleFixture();
  const lifecycle = bindProxyMediaStreamLifecycle(fixture.request, fixture.response, fixture.stream);

  fixture.request.aborted = true;
  fixture.request.emit("aborted");
  fixture.response.emit("close");

  assert.equal(fixture.stream.destroyCalls, 1);
  assert.equal(lifecycle.wasClientDisconnected(), true);
  lifecycle.cleanup();
});

test("classifies upstream premature close as transient, not missing", () => {
  const error = new Error("Premature close");
  error.code = "ERR_STREAM_PREMATURE_CLOSE";
  assert.equal(isTransientProxyMediaError(error), true);
  assert.equal(isTransientProxyMediaError(Object.assign(new Error("No such object"), { code: 404 })), false);
});

test("bounds the wait for upstream response headers", async () => {
  const hangingFetch = (_url, init = {}) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    fetchProxyMediaWithTimeout(hangingFetch, "https://storage.example/file", {}, 250),
    (error) => error?.code === "proxy_media_upstream_timeout" && error?.status === 504
  );
});
