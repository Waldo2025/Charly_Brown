const DEFAULT_EXPIRY_SKEW_MS = 60 * 1000;

function toFiniteTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : null;
  }
  const clean = String(value || "").trim();
  if (!clean) return null;
  const numeric = Number(clean);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  const parsed = Date.parse(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveBaseUrl(explicitBaseUrl = "") {
  const clean = String(explicitBaseUrl || "").trim();
  if (clean) return clean;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost";
}

export function extractAuthorizedAssetStoragePath(value = "", options = {}) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean, resolveBaseUrl(options.baseUrl));
    return String(parsed.searchParams.get("storagePath") || "").trim();
  } catch (_) {
    return "";
  }
}

export function normalizeAuthorizedAssetRecord(value = null, fallback = {}) {
  if (typeof value === "string") {
    const url = value.trim();
    return {
      url,
      expiresAt: null,
      storagePath: String(fallback?.storagePath || "").trim()
    };
  }
  const record = value && typeof value === "object" ? value : {};
  return {
    url: String(record.url || fallback?.url || "").trim(),
    expiresAt: toFiniteTimestamp(record.expiresAt ?? fallback?.expiresAt),
    storagePath: String(record.storagePath || fallback?.storagePath || "").trim()
  };
}

export function isConfirmedMissingAssetError(error = null) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || error?.error || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return status === 404
    || code === "asset_not_found"
    || message.includes("asset_not_found")
    || /(?:^|\s)404(?:\s|$)/.test(message);
}

export function createAuthorizedAssetResolver(options = {}) {
  const fetchJson = options.authFetchJson;
  if (typeof fetchJson !== "function") {
    throw new TypeError("authFetchJson_required");
  }

  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const expirySkewMs = Math.max(0, Number(options.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS) || 0);
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const cache = new Map();
  const pending = new Map();
  const generations = new Map();

  const keyFor = (proxyUrl = "", explicitStoragePath = "") => {
    const cleanStoragePath = String(
      explicitStoragePath || extractAuthorizedAssetStoragePath(proxyUrl, { baseUrl }) || ""
    ).trim();
    if (cleanStoragePath) return `storage:${cleanStoragePath}`;
    return `url:${String(proxyUrl || "").trim()}`;
  };

  const generationFor = (key) => Number(generations.get(key) || 0);
  const bumpGeneration = (key) => {
    const next = generationFor(key) + 1;
    generations.set(key, next);
    return next;
  };

  const isFresh = (record) => {
    const expiresAt = toFiniteTimestamp(record?.expiresAt);
    return Boolean(record?.url && expiresAt && (expiresAt - expirySkewMs) > now());
  };

  const resolveRecord = async (proxyUrl = "", resolveOptions = {}) => {
    const clean = String(proxyUrl || "").trim();
    if (!clean) return { url: "", expiresAt: null, storagePath: "" };

    const storagePath = String(
      resolveOptions.storagePath
      || extractAuthorizedAssetStoragePath(clean, { baseUrl })
      || ""
    ).trim();
    if (!storagePath) {
      return { url: clean, expiresAt: null, storagePath: "" };
    }

    const key = keyFor(clean, storagePath);
    if (resolveOptions.forceRefresh === true) {
      cache.delete(key);
      if (pending.has(key)) return pending.get(key);
      bumpGeneration(key);
    } else {
      const cached = cache.get(key);
      if (isFresh(cached)) return { ...cached };
      if (pending.has(key)) return pending.get(key);
    }

    const requestGeneration = generationFor(key);
    const request = (async () => {
      const data = await fetchJson(`/api/assets/signed-url?storagePath=${encodeURIComponent(storagePath)}`);
      const record = normalizeAuthorizedAssetRecord(data, { storagePath });
      if (!record.url) throw new Error("signed_asset_url_missing");
      if (generationFor(key) === requestGeneration) {
        // Missing/invalid expiry metadata is deliberately not cached. This keeps
        // compatibility with older endpoints without retaining a signed URL forever.
        if (record.expiresAt) cache.set(key, record);
        else cache.delete(key);
      }
      return { ...record };
    })().finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });

    pending.set(key, request);
    return request;
  };

  const resolveUrl = async (proxyUrl = "", resolveOptions = {}) => {
    const record = await resolveRecord(proxyUrl, resolveOptions);
    return String(record?.url || "").trim();
  };

  const invalidate = (value = "", invalidateOptions = {}) => {
    const clean = String(value || "").trim();
    if (!clean && !invalidateOptions.storagePath) return false;
    const storagePath = String(
      invalidateOptions.storagePath
      || extractAuthorizedAssetStoragePath(clean, { baseUrl })
      || ""
    ).trim();
    const key = keyFor(clean, storagePath);
    const existed = cache.delete(key);
    const hadPending = pending.delete(key);
    bumpGeneration(key);
    // An in-flight request cannot be aborted safely here. Its generation guard
    // prevents it from repopulating cache after invalidation.
    return existed || hadPending;
  };

  const clear = () => {
    const keys = new Set([...cache.keys(), ...pending.keys(), ...generations.keys()]);
    keys.forEach((key) => bumpGeneration(key));
    cache.clear();
    pending.clear();
  };

  const resolveWithRetry = async (proxyUrl = "", consumer, retryOptions = {}) => {
    if (typeof consumer !== "function") throw new TypeError("asset_consumer_required");
    const first = await resolveRecord(proxyUrl, retryOptions);
    try {
      return await consumer(first.url, first, { attempt: 1 });
    } catch (error) {
      const shouldRetry = typeof retryOptions.shouldRetry === "function"
        ? retryOptions.shouldRetry(error, first)
        : !isConfirmedMissingAssetError(error);
      if (!shouldRetry) throw error;
      invalidate(proxyUrl, { storagePath: first.storagePath });
      const refreshed = await resolveRecord(proxyUrl, {
        ...retryOptions,
        storagePath: first.storagePath,
        forceRefresh: true
      });
      return consumer(refreshed.url, refreshed, { attempt: 2, previousError: error });
    }
  };

  const getCachedRecord = (value = "", getOptions = {}) => {
    const storagePath = String(
      getOptions.storagePath
      || extractAuthorizedAssetStoragePath(value, { baseUrl })
      || ""
    ).trim();
    const record = cache.get(keyFor(value, storagePath));
    return isFresh(record) ? { ...record } : null;
  };

  return Object.freeze({
    expirySkewMs,
    resolveRecord,
    resolveUrl,
    resolveWithRetry,
    invalidate,
    clear,
    getCachedRecord,
    isFresh
  });
}

export const AUTHORIZED_ASSET_EXPIRY_SKEW_MS = DEFAULT_EXPIRY_SKEW_MS;
