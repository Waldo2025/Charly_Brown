import test from "node:test";
import assert from "node:assert/strict";
import proxyMediaLifecycle from "./proxy-media-lifecycle.js";

const { shouldDestroyProxyMediaUpstream } = proxyMediaLifecycle;

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
