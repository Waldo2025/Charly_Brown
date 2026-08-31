import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthorizedAssetResolver,
  extractAuthorizedAssetStoragePath,
  isConfirmedMissingAssetError,
  normalizeAuthorizedAssetRecord
} from "../public/podcaster/podcaster-authorized-asset-resolver.js";

const PROXY_URL = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs-1%2Fvideo.mp4";
const STORAGE_PATH = "podcaster/sessions/s-1/video.mp4";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("extracts the stable storage identity from a relative proxy URL", () => {
  assert.equal(extractAuthorizedAssetStoragePath(PROXY_URL), STORAGE_PATH);
  assert.equal(extractAuthorizedAssetStoragePath("https://cdn.example/video.mp4"), "");
});

test("normalizes metadata records and legacy string results", () => {
  assert.deepEqual(normalizeAuthorizedAssetRecord(" https://cdn.example/legacy.mp4 ", {
    storagePath: STORAGE_PATH
  }), {
    url: "https://cdn.example/legacy.mp4",
    expiresAt: null,
    storagePath: STORAGE_PATH
  });
  assert.deepEqual(normalizeAuthorizedAssetRecord({
    url: "https://cdn.example/current.mp4",
    expiresAt: "2030-01-01T00:00:00.000Z",
    storagePath: STORAGE_PATH
  }), {
    url: "https://cdn.example/current.mp4",
    expiresAt: Date.parse("2030-01-01T00:00:00.000Z"),
    storagePath: STORAGE_PATH
  });
});

test("returns metadata while preserving the string-only wrapper", async () => {
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async (url) => {
      calls += 1;
      assert.equal(url, `/api/assets/signed-url?storagePath=${encodeURIComponent(STORAGE_PATH)}`);
      return {
        url: "https://storage.example/signed-a",
        expiresAt: 1_600_000,
        storagePath: STORAGE_PATH
      };
    }
  });

  assert.deepEqual(await resolver.resolveRecord(PROXY_URL), {
    url: "https://storage.example/signed-a",
    expiresAt: 1_600_000,
    storagePath: STORAGE_PATH
  });
  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/signed-a");
  assert.equal(calls, 1);
});

test("deduplicates concurrent signed-url requests", async () => {
  const request = deferred();
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: () => {
      calls += 1;
      return request.promise;
    }
  });

  const first = resolver.resolveRecord(PROXY_URL);
  const second = resolver.resolveRecord(PROXY_URL);
  assert.equal(calls, 1);
  request.resolve({
    url: "https://storage.example/shared",
    expiresAt: 1_600_000,
    storagePath: STORAGE_PATH
  });
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
});

test("refreshes a signed URL inside the 60 second safety window", async () => {
  let clock = 1_000_000;
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => clock,
    authFetchJson: async () => {
      calls += 1;
      return {
        url: `https://storage.example/signed-${calls}`,
        expiresAt: clock + 120_000,
        storagePath: STORAGE_PATH
      };
    }
  });

  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/signed-1");
  clock += 59_000;
  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/signed-1");
  clock += 2_000;
  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/signed-2");
  assert.equal(calls, 2);
});

test("invalidation prevents a superseded request from repopulating cache", async () => {
  const oldRequest = deferred();
  const newRequest = deferred();
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: () => {
      calls += 1;
      return calls === 1 ? oldRequest.promise : newRequest.promise;
    }
  });

  const oldResult = resolver.resolveRecord(PROXY_URL);
  assert.equal(resolver.invalidate(PROXY_URL), true);
  const newResult = resolver.resolveRecord(PROXY_URL, { forceRefresh: true });
  newRequest.resolve({
    url: "https://storage.example/new",
    expiresAt: 1_600_000,
    storagePath: STORAGE_PATH
  });
  assert.equal((await newResult).url, "https://storage.example/new");

  oldRequest.resolve({
    url: "https://storage.example/old",
    expiresAt: 1_600_000,
    storagePath: STORAGE_PATH
  });
  assert.equal((await oldResult).url, "https://storage.example/old");
  assert.equal(resolver.getCachedRecord(PROXY_URL)?.url, "https://storage.example/new");
});

test("clear detaches pending work from a previous auth scope", async () => {
  const oldRequest = deferred();
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async () => {
      calls += 1;
      if (calls === 1) return oldRequest.promise;
      return {
        url: "https://storage.example/new-user",
        expiresAt: 1_600_000,
        storagePath: STORAGE_PATH
      };
    }
  });

  const oldResult = resolver.resolveRecord(PROXY_URL);
  resolver.clear();
  assert.equal((await resolver.resolveRecord(PROXY_URL)).url, "https://storage.example/new-user");
  oldRequest.resolve({
    url: "https://storage.example/old-user",
    expiresAt: 1_600_000,
    storagePath: STORAGE_PATH
  });
  await oldResult;
  assert.equal(resolver.getCachedRecord(PROXY_URL)?.url, "https://storage.example/new-user");
});

test("retries once with a refreshed URL for a transient load failure", async () => {
  let calls = 0;
  const attempts = [];
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async () => {
      calls += 1;
      return {
        url: `https://storage.example/signed-${calls}`,
        expiresAt: 1_600_000,
        storagePath: STORAGE_PATH
      };
    }
  });

  const result = await resolver.resolveWithRetry(PROXY_URL, async (url, _record, context) => {
    attempts.push({ url, attempt: context.attempt });
    if (context.attempt === 1) throw Object.assign(new Error("signed request forbidden"), { status: 403 });
    return "loaded";
  });

  assert.equal(result, "loaded");
  assert.equal(calls, 2);
  assert.deepEqual(attempts, [
    { url: "https://storage.example/signed-1", attempt: 1 },
    { url: "https://storage.example/signed-2", attempt: 2 }
  ]);
});

test("does not refresh a confirmed missing asset", async () => {
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async () => ({
      url: `https://storage.example/signed-${++calls}`,
      expiresAt: 1_600_000,
      storagePath: STORAGE_PATH
    })
  });

  await assert.rejects(
    resolver.resolveWithRetry(PROXY_URL, async () => {
      throw Object.assign(new Error("asset_not_found"), { status: 404 });
    }),
    /asset_not_found/
  );
  assert.equal(calls, 1);
  assert.equal(isConfirmedMissingAssetError({ status: 404 }), true);
  assert.equal(isConfirmedMissingAssetError({ status: 403 }), false);
});

test("does not cache old endpoint responses that omit expiresAt", async () => {
  let calls = 0;
  const resolver = createAuthorizedAssetResolver({
    authFetchJson: async () => ({ url: `https://storage.example/legacy-${++calls}` })
  });
  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/legacy-1");
  assert.equal(await resolver.resolveUrl(PROXY_URL), "https://storage.example/legacy-2");
});
