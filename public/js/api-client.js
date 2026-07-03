import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8787/api";
const DEFAULT_REMOTE_API_BASE_SAFE = "/api";
const DEFAULT_GEMINI_API_BASE = "https://charly-brown-gemini-backend.onrender.com/api";
const DEFAULT_VEO_API_BASE = "https://gemini-veo.onrender.com/api";
const DEFAULT_EXPORT_API_BASE = "https://snoopy-export.onrender.com/api";

function getAlternateLocalApiUrl(url = "") {
  const finalUrl = String(url || "").trim();
  const isLocalRuntime = isLocalHostRuntime();
  
  if (finalUrl.startsWith("http://127.0.0.1:8787")) {
    return finalUrl.replace("http://127.0.0.1:8787", "http://localhost:8787");
  }
  if (finalUrl.startsWith("http://localhost:8787")) {
    return finalUrl.replace("http://localhost:8787", "http://127.0.0.1:8787");
  }
  
  // Si estamos en localhost y la URL es remota (Render), intentamos el fallback local
  if (isLocalRuntime && finalUrl.includes(".onrender.com/api")) {
    try {
      const parsed = new URL(finalUrl);
      return `${DEFAULT_LOCAL_API_BASE}${parsed.pathname.replace(/^\/api/, "")}${parsed.search}`;
    } catch (_) {
      return "";
    }
  }
  
  return "";
}

function getRemoteFallbackUrl(url = "") {
  const finalUrl = String(url || "").trim();
  if (!isLoopbackApiBase(finalUrl)) return "";
  const remoteBase = getRemoteApiBase();
  if (!remoteBase) return "";
  try {
    const parsed = new URL(finalUrl);
    const pathWithQuery = `${parsed.pathname || ""}${parsed.search || ""}`;
    return buildApiUrlFromBase(remoteBase, pathWithQuery);
  } catch (_) {
    return "";
  }
}

function getConfiguredApiBase() {
  return String(window.__CHARLY_CONFIG__?.apiBaseUrl || "").trim();
}

export function getRemoteApiBase() {
  return String(
    window.__CHARLY_CONFIG__?.geminiApiBaseUrl
    || window.__CHARLY_CONFIG__?.remoteApiBaseUrl
    || DEFAULT_GEMINI_API_BASE
  ).trim().replace(/\/+$/, "");
}

export function getVeoApiBase() {
  return String(window.__CHARLY_CONFIG__?.veoApiBaseUrl || DEFAULT_VEO_API_BASE).trim().replace(/\/+$/, "");
}

export function getExportApiBase() {
  return String(window.__CHARLY_CONFIG__?.exportApiBaseUrl || DEFAULT_EXPORT_API_BASE).trim().replace(/\/+$/, "");
}

export function isLoopbackApiBase(url = "") {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(String(url || "").trim());
}

function isLocalHostRuntime() {
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export function canUseSameOriginApi() {
  return isLocalHostRuntime() || window.__CHARLY_CONFIG__?.allowSameOriginApi === true;
}

function shouldForceSameOriginApiPath(path = "") {
  if (isLocalHostRuntime()) return false;
  const clean = String(path || "").trim();
  return clean === "/api/podcaster" || clean.startsWith("/api/podcaster/");
}

function shouldForceRemotePodcasterAudioApiPath(path = "") {
  if (isLocalHostRuntime()) return false;
  const clean = String(path || "").trim();
  return clean === "/api/podcaster/dialogue-audio/generate" || clean === "/api/podcaster/dialogue-audios/generate";
}

function shouldUseExportApiPath(path = "") {
  if (isLocalHostRuntime()) return false;
  const clean = String(path || "").trim();
  if (clean === "/api/assets/proxy-media" || clean.startsWith("/api/assets/proxy-media?")) return true;
  if (clean === "/api/assets/proxy-image" || clean.startsWith("/api/assets/proxy-image?")) return true;
  if (clean === "/api/assets/montage-download" || clean.startsWith("/api/assets/montage-download?")) return true;
  if (clean === "/api/podcaster/sessions/list" || clean.startsWith("/api/podcaster/sessions/list?")) return true;
  if (clean === "/api/podcaster/sessions/get" || clean.startsWith("/api/podcaster/sessions/get?")) return true;
  if (clean.startsWith("/api/podcaster/montage/")) return true;
  return false;
}

export function hasAvailableApiBase() {
  return Boolean(getConfiguredApiBase()) || canUseSameOriginApi();
}

export function resolveApiBase() {
  const configured = getConfiguredApiBase();
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isLocalHost = isLocalHostRuntime();
  
  if (isLocalHost) {
    // Si estamos en localhost, priorizamos el backend local (8787)
    // a menos que la URL configurada sea explícitamente local (evita usar Render por error)
    if (configured && isLoopbackApiBase(configured)) {
      return configured.replace(/\/+$/, "");
    }
    if (port === "8787") return "/api";
    return DEFAULT_LOCAL_API_BASE;
  }
  
  if (configured) {
    const sanitized = configured.replace(/\/+$/, "");
    return sanitized;
  }
  if (window.__CHARLY_CONFIG__?.allowSameOriginApi === true) {
    return DEFAULT_REMOTE_API_BASE_SAFE;
  }
  return "";
}

export function buildApiUrl(path = "") {
  const input = String(path || "").trim();
  if (!input) return resolveApiBase();
  if (/^https?:\/\//i.test(input)) return input;

  const base = shouldUseExportApiPath(input)
    ? getExportApiBase()
    : (shouldForceSameOriginApiPath(input) ? DEFAULT_REMOTE_API_BASE_SAFE : resolveApiBase());
  if (!base) return "";
  if (input.startsWith("/api/")) {
    return base.endsWith("/api") ? `${base}${input.slice(4)}` : `${base}${input}`;
  }
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input.replace(/^\/+/, "")}`;
}

export function buildSameOriginApiUrl(path = "") {
  const input = String(path || "").trim();
  if (!input) return isLocalHostRuntime() ? DEFAULT_LOCAL_API_BASE : DEFAULT_REMOTE_API_BASE_SAFE;
  if (/^https?:\/\//i.test(input)) return input;
  const base = isLocalHostRuntime() ? DEFAULT_LOCAL_API_BASE : DEFAULT_REMOTE_API_BASE_SAFE;
  if (input.startsWith("/api/")) {
    return base.endsWith("/api") ? `${base}${input.slice(4)}` : `${base}${input}`;
  }
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input.replace(/^\/+/, "")}`;
}

export function buildApiUrlPreferRemote(path = "") {
  const input = String(path || "").trim();
  if (!input) return getRemoteApiBase();
  if (/^https?:\/\//i.test(input)) return input;
  if (shouldUseExportApiPath(input)) return buildApiUrl(input);
  if (shouldForceRemotePodcasterAudioApiPath(input)) {
    return buildApiUrlFromBase(getRemoteApiBase(), input);
  }
  if (shouldForceSameOriginApiPath(input)) return buildApiUrl(input);
  const resolvedBase = resolveApiBase();
  const remoteBase = getRemoteApiBase();
  if (resolvedBase === "/api" && remoteBase && !isLocalHostRuntime()) {
    return buildApiUrlFromBase(remoteBase, input);
  }
  return buildApiUrl(input);
}

export function buildVeoApiUrl(path = "") {
  const input = String(path || "").trim();
  if (!input) return getVeoApiBase();
  if (/^https?:\/\//i.test(input)) return input;
  return buildApiUrlFromBase(getVeoApiBase(), input);
}

export function buildVeoApiUrlPreferRemote(path = "") {
  return buildVeoApiUrl(path);
}

export function buildExportApiUrl(path = "") {
  const input = String(path || "").trim();
  if (!input) return getExportApiBase();
  if (/^https?:\/\//i.test(input)) return input;
  return buildApiUrlFromBase(getExportApiBase(), input);
}

export function buildApiUrlFromBase(base, path = "") {
  const root = String(base || "").trim().replace(/\/+$/, "");
  const input = String(path || "").trim();
  if (!root) return "";
  if (!input) return root;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("/api/")) {
    return root.endsWith("/api") ? `${root}${input.slice(4)}` : `${root}${input}`;
  }
  if (input.startsWith("/")) return `${root}${input}`;
  return `${root}/${input.replace(/^\/+/, "")}`;
}

export async function getAuthHeaders(extra = {}) {
  return getAuthHeadersWithRefresh(extra, false);
}

async function getAuthHeadersWithRefresh(extra = {}, forceRefresh = false) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  const token = await user.getIdToken(forceRefresh);
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

function extractErrorText(value, fallback = "", seen = new Set()) {
  if (value == null) return String(fallback || "").trim();
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (typeof value !== "object") {
    const text = String(value || "").trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (seen.has(value)) return String(fallback || "").trim();
  seen.add(value);
  for (const candidate of [value?.error, value?.message, value?.detail, value?.reason, value?.code]) {
    const text = extractErrorText(candidate, "", seen);
    if (text) return text;
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : String(fallback || "").trim();
  } catch (_) {
    return String(fallback || "").trim();
  }
}

function isBackendAuthError(response, data) {
  return response.status === 401 || (response.status === 403 && /^AUTH_/i.test(String(data?.error || data?.code || "").trim()));
}

async function parseResponseDetailSafe(response) {
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return response.clone().json().catch(() => ({}));
  }
  const text = await response.clone().text().catch(() => "");
  return text ? { error: text } : {};
}

export async function authFetch(url, options = {}) {
  if (!hasAvailableApiBase()) {
    const error = new Error("Backend de producción no configurado.");
    error.code = "API_UNAVAILABLE";
    throw error;
  }
  const { auth = true, preferRemote = false, sameOrigin = false, ...requestOptions } = options || {};
  const finalUrl = sameOrigin ? buildSameOriginApiUrl(url) : (auth ? (preferRemote ? buildApiUrlPreferRemote(url) : buildApiUrl(url)) : buildApiUrl(url));
  const baseHeaders = { ...(requestOptions.headers || {}) };
  const buildRequestInit = async (forceRefresh = false) => {
    const headers = auth ? await getAuthHeadersWithRefresh(baseHeaders, forceRefresh) : baseHeaders;
    return {
      ...requestOptions,
      headers
    };
  };
  let requestInit = await buildRequestInit(false);
  let response = await fetch(finalUrl, requestInit);
  if (auth) {
    const detail = await parseResponseDetailSafe(response);
    if (isBackendAuthError(response, detail)) {
      requestInit = await buildRequestInit(true);
      response = await fetch(finalUrl, requestInit);
    }
  }
  return response;
}

export async function authFetchJson(url, options = {}) {
  if (!hasAvailableApiBase()) {
    const error = new Error("Backend de producción no configurado.");
    error.code = "API_UNAVAILABLE";
    throw error;
  }
  const { auth = true, preferRemote = false, sameOrigin = false, ...requestOptions } = options || {};
  const finalUrl = sameOrigin ? buildSameOriginApiUrl(url) : (auth ? (preferRemote ? buildApiUrlPreferRemote(url) : buildApiUrl(url)) : buildApiUrl(url));
  const requestHasBody = Object.prototype.hasOwnProperty.call(requestOptions, "body") && requestOptions.body != null;
  const baseHeaders = requestHasBody ? { "Content-Type": "application/json" } : {};
  const buildRequestInit = async (forceRefresh = false) => {
    const headers = auth ? await getAuthHeadersWithRefresh(baseHeaders, forceRefresh) : baseHeaders;
    const inferredMethod = requestHasBody && !requestOptions.method ? "POST" : requestOptions.method;
    return {
      ...requestOptions,
      ...(inferredMethod ? { method: inferredMethod } : {}),
      headers: {
        ...headers,
        ...(requestOptions.headers || {}),
      },
    };
  };
  let requestInit = await buildRequestInit(false);
  const contentType = String(requestInit.headers?.["Content-Type"] || requestInit.headers?.["content-type"] || "").toLowerCase();
  const body = requestInit.body;
  const shouldSerializeJson =
    body != null &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body) &&
    contentType.includes("application/json");
  if (shouldSerializeJson) {
    requestInit.body = JSON.stringify(body);
  }

  const parseJsonSafe = async (response) => response.json().catch(() => ({}));
  const buildHttpError = (response, data) => {
    const detail = extractErrorText(data, `HTTP ${response.status}`);
    const error = new Error(detail);
    error.status = Number(response.status || 0);
    error.detail = data;
    return error;
  };
  const buildAuthForbiddenError = (response, data) => {
    const error = new Error("AUTH_FORBIDDEN");
    error.status = Number(response?.status || 0);
    error.detail = data;
    return error;
  };

  let response = null;
  try {
    response = await fetch(finalUrl, requestInit);
  } catch (err) {
    const fallbackUrl = getAlternateLocalApiUrl(finalUrl);
    if (fallbackUrl) {
      response = await fetch(fallbackUrl, requestInit).catch(() => null);
    }
    if (!response) {
      const remoteFallbackUrl = getRemoteFallbackUrl(finalUrl);
      if (remoteFallbackUrl) {
        response = await fetch(remoteFallbackUrl, requestInit);
      } else {
        throw err;
      }
    }
  }
  if (!response.ok && response.status === 404) {
    const fallbackUrl = getAlternateLocalApiUrl(finalUrl);
    if (fallbackUrl) {
      const fallbackResponse = await fetch(fallbackUrl, requestInit).catch(() => null);
      if (fallbackResponse && fallbackResponse.ok) {
        response = fallbackResponse;
      } else if (fallbackResponse && fallbackResponse.status !== 404) {
        response = fallbackResponse;
      }
    }
    if ((!response || response.status === 404) && getRemoteFallbackUrl(finalUrl)) {
      const remoteFallbackUrl = getRemoteFallbackUrl(finalUrl);
      const remoteFallbackResponse = await fetch(remoteFallbackUrl, requestInit).catch(() => null);
      if (remoteFallbackResponse && remoteFallbackResponse.ok) {
        response = remoteFallbackResponse;
      } else if (remoteFallbackResponse && remoteFallbackResponse.status !== 404) {
        response = remoteFallbackResponse;
      }
    }
  }
  const data = await parseJsonSafe(response);
  const backendAuthError = isBackendAuthError(response, data);
  if (backendAuthError && auth) {
    try {
      requestInit = await buildRequestInit(true);
      const retryResponse = await fetch(finalUrl, requestInit);
      const retryData = await parseJsonSafe(retryResponse);
      if (retryResponse.ok) {
        return retryData;
      }
      if (retryResponse.status === 401 || (retryResponse.status === 403 && /^AUTH_/i.test(String(retryData?.error || retryData?.code || "").trim()))) {
        throw buildAuthForbiddenError(retryResponse, retryData);
      }
      if (!retryResponse.ok) {
        const retryIsMontageQueueUnavailable = retryResponse.status === 503 && retryData && (retryData.error === 'montage_export_queue_unavailable' || retryData.code === 'montage_export_queue_unavailable');
        const retryIsMontageBusyWithExport = retryResponse.status === 429 && retryData && (retryData.error === 'backend_busy_with_export' || retryData.code === 'backend_busy_with_export');
        if (!retryIsMontageQueueUnavailable && !retryIsMontageBusyWithExport) {
          try {
            console.error("[api-client] request failed", {
              url: finalUrl,
              method: String(requestInit?.method || "GET").toUpperCase(),
              status: Number(retryResponse.status || 0),
              error: retryData?.error || null,
              detail: retryData || null
            });
          } catch (_) {
            // no-op
          }
        }
        throw buildHttpError(retryResponse, retryData);
      }
      return retryData;
    } catch (retryError) {
      throw retryError;
    }
  }
  if (response.status === 403) {
    const backendError = String(data?.error || data?.error?.message || "").trim();
    if (/^AUTH_/i.test(backendError)) {
      throw buildAuthForbiddenError(response, data);
    }
  }
  if (!response.ok) {
    // Suppress noisy logs for known transient backend 503 error montage_export_queue_unavailable to avoid log flood
    const isMontageQueueUnavailable = response.status === 503 && data && (data.error === 'montage_export_queue_unavailable' || data.code === 'montage_export_queue_unavailable');
    const isMontageBusyWithExport = response.status === 429 && data && (data.error === 'backend_busy_with_export' || data.code === 'backend_busy_with_export');
    const isBackendBusy = response.status === 503 && data && (data.error === 'backend_busy' || data.code === 'backend_busy');
    if (!isMontageQueueUnavailable && !isMontageBusyWithExport && !isBackendBusy) {
      try {
        console.error("[api-client] request failed", {
          url: finalUrl,
          method: String(requestInit?.method || "GET").toUpperCase(),
          status: Number(response.status || 0),
          error: data?.error || null,
          detail: data || null
        });
      } catch (_) {
        // no-op
      }
    }
    throw buildHttpError(response, data);
  }
  return data;
}
