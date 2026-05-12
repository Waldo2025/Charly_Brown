import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8787/api";
const DEFAULT_REMOTE_API_BASE_SAFE = "/api";
const DEFAULT_RENDER_API_BASE = "https://charly-brown-gemini-backend.onrender.com/api";

function getAlternateLocalApiUrl(url = "") {
  const finalUrl = String(url || "").trim();
  if (finalUrl.startsWith("http://127.0.0.1:8787")) {
    return finalUrl.replace("http://127.0.0.1:8787", "http://localhost:8787");
  }
  if (finalUrl.startsWith("http://localhost:8787")) {
    return finalUrl.replace("http://localhost:8787", "http://127.0.0.1:8787");
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
  return String(window.__CHARLY_CONFIG__?.remoteApiBaseUrl || DEFAULT_RENDER_API_BASE).trim().replace(/\/+$/, "");
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

export function hasAvailableApiBase() {
  return Boolean(getConfiguredApiBase()) || canUseSameOriginApi();
}

export function resolveApiBase() {
  const configured = getConfiguredApiBase();
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isLocalHost = isLocalHostRuntime();
  if (isLocalHost) {
    if (configured) {
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

  const base = resolveApiBase();
  if (!base) return "";
  if (input.startsWith("/api/")) {
    return base.endsWith("/api") ? `${base}${input.slice(4)}` : `${base}${input}`;
  }
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input.replace(/^\/+/, "")}`;
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
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  const token = await user.getIdToken();
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

export async function authFetchJson(url, options = {}) {
  if (!hasAvailableApiBase()) {
    const error = new Error("Backend de producción no configurado.");
    error.code = "API_UNAVAILABLE";
    throw error;
  }
  const headers = await getAuthHeaders({ "Content-Type": "application/json" });
  const finalUrl = buildApiUrl(url);
  const requestInit = {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  };
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
    const detail = data?.error?.message || data?.error || `HTTP ${response.status}`;
    const error = new Error(String(detail));
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
  if (response.status === 401) {
    throw buildAuthForbiddenError(response, data);
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
    if (!isMontageQueueUnavailable) {
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
