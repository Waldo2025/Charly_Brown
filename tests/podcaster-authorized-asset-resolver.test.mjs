import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthorizedAssetResolver,
  extractAuthorizedAssetStoragePath,
  isAssetApiStoragePath,
  isConfirmedMissingAssetError,
  normalizeAssetStoragePath,
  normalizeAuthorizedAssetRecord
} from "../public/podcaster/podcaster-authorized-asset-resolver.js";

const PROXY_URL = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs-1%2Fvideo.mp4";
const STORAGE_PATH = "podcaster/sessions/s-1/video.mp4";
const GALLERY_PROXY_URL = "/api/assets/proxy-image?storagePath=images%2Fuser-1%2Fimage-creator%2Fs-1%2FEscena01.jpg";
const GALLERY_STORAGE_PATH = "images/user-1/image-creator/s-1/Escena01.jpg";
const GS_SESSION_PROXY_URL = "/api/assets/proxy-media?storagePath=gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fpodcaster%2Fsessions%2Fs-1%2Fvideo.mp4";
const GS_GALLERY_PROXY_URL = "/api/assets/proxy-media?storagePath=gs%3A%2F%2Fcharly-brown.firebasestorage.app%2Fimages%2Fuser-1%2Fimage-creator%2Fs-1%2FEscena01.jpg";

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

test("isAssetApiStoragePath mirrors the asset API prefix contract", () => {
  assert.equal(isAssetApiStoragePath(STORAGE_PATH), true);
  assert.equal(isAssetApiStoragePath("  podcaster/library/bg.png  "), true);
  assert.equal(isAssetApiStoragePath(GALLERY_STORAGE_PATH), false);
  assert.equal(isAssetApiStoragePath("gs://bucket/podcaster/sessions/s-1/video.mp4"), false);
  assert.equal(isAssetApiStoragePath(""), false);
});

test("authorizes paths the asset API cannot sign through the direct resolver", async () => {
  const apiCalls = [];
  const directCalls = [];
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async (url) => {
      apiCalls.push(url);
      return { url: "https://storage.example/unexpected", expiresAt: 1_600_000, storagePath: STORAGE_PATH };
    },
    resolveDirectRecord: async (storagePath) => {
      directCalls.push(storagePath);
      return { url: "https://storage.example/direct-1", expiresAt: 1_600_000, storagePath };
    }
  });

  assert.equal(await resolver.resolveUrl(GALLERY_PROXY_URL), "https://storage.example/direct-1");
  assert.deepEqual(apiCalls, []);
  assert.deepEqual(directCalls, [GALLERY_STORAGE_PATH]);
  assert.equal(await resolver.resolveUrl(GALLERY_PROXY_URL), "https://storage.example/direct-1");
  assert.equal(directCalls.length, 1, "la URL directa se reutiliza mientras esté vigente");
  assert.equal(resolver.getCachedRecord(GALLERY_PROXY_URL)?.storagePath, GALLERY_STORAGE_PATH);
});

test("keeps the logical URL when an unsupported path has no direct resolver", async () => {
  let apiCalls = 0;
  const resolver = createAuthorizedAssetResolver({
    authFetchJson: async () => {
      apiCalls += 1;
      return { url: "https://storage.example/should-not-be-used", expiresAt: 1_600_000 };
    }
  });

  assert.equal(await resolver.resolveUrl(GALLERY_PROXY_URL), GALLERY_PROXY_URL);
  assert.equal(apiCalls, 0, "/api/assets/ sólo firma rutas podcaster/; no se gasta la petición");
});

test("normalizeAssetStoragePath recorta esquema y bucket como el portero de la API", () => {
  assert.equal(normalizeAssetStoragePath("gs://bucket/podcaster/sessions/s-1/video.mp4"), STORAGE_PATH);
  assert.equal(normalizeAssetStoragePath(GALLERY_STORAGE_PATH), GALLERY_STORAGE_PATH);
  assert.equal(normalizeAssetStoragePath("  gs://bucket/images/user-1/a.jpg  "), "images/user-1/a.jpg");
  assert.equal(normalizeAssetStoragePath("gs://bucket/"), "");
  assert.equal(normalizeAssetStoragePath("podcaster%2Fsessions%2Fs-1%2Fvideo.mp4"), STORAGE_PATH);
  assert.equal(normalizeAssetStoragePath(""), "");
});

test("una ruta gs:// de sesión sigue firmandose en la API de assets", async () => {
  const apiCalls = [];
  const directCalls = [];
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async (url) => {
      apiCalls.push(url);
      return { url: "https://storage.example/signed-a", expiresAt: 1_600_000, storagePath: STORAGE_PATH };
    },
    resolveDirectRecord: async (storagePath) => {
      directCalls.push(storagePath);
      return { url: "https://storage.example/direct", expiresAt: 1_600_000, storagePath };
    }
  });

  const record = await resolver.resolveRecord(GS_SESSION_PROXY_URL);
  assert.deepEqual(apiCalls, [`/api/assets/signed-url?storagePath=${encodeURIComponent(STORAGE_PATH)}`]);
  assert.deepEqual(directCalls, []);
  assert.equal(record.storagePath, STORAGE_PATH);
  assert.equal(record.url, "https://storage.example/signed-a");
  // La variante gs:// comparte caché con la forma canónica: invalidar por
  // cualquiera de las dos renueva ambas lecturas.
  assert.equal(resolver.getCachedRecord(GS_SESSION_PROXY_URL)?.url, "https://storage.example/signed-a");
  assert.equal(resolver.getCachedRecord(PROXY_URL)?.url, "https://storage.example/signed-a");
  assert.equal(resolver.invalidate(PROXY_URL), true);
  assert.equal(resolver.getCachedRecord(GS_SESSION_PROXY_URL), null);
});

test("una imagen de galería gs:// se autoriza con el SDK sobre la ruta del objeto", async () => {
  const apiCalls = [];
  const directCalls = [];
  const resolver = createAuthorizedAssetResolver({
    now: () => 1_000_000,
    authFetchJson: async (url) => {
      apiCalls.push(url);
      return { url: "https://storage.example/unexpected", expiresAt: 1_600_000 };
    },
    resolveDirectRecord: async (storagePath) => {
      directCalls.push(storagePath);
      return { url: "https://storage.example/direct-1", expiresAt: 1_600_000, storagePath };
    }
  });

  assert.equal(await resolver.resolveUrl(GS_GALLERY_PROXY_URL), "https://storage.example/direct-1");
  assert.deepEqual(apiCalls, [], "la API rechazaría gs://bucket/images/... con 400 invalid_storage_path");
  assert.deepEqual(directCalls, [GALLERY_STORAGE_PATH]);
});
