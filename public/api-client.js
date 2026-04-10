import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8787/api";
const DEFAULT_REMOTE_API_BASE_SAFE = "/api";

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

function getConfiguredApiBase() {
  return String(window.__CHARLY_CONFIG__?.apiBaseUrl || "").trim();
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

  let response = null;
  try {
    response = await fetch(finalUrl, requestInit);
  } catch (err) {
    const fallbackUrl = getAlternateLocalApiUrl(finalUrl);
    if (fallbackUrl) {
      response = await fetch(fallbackUrl, requestInit);
    } else {
      throw err;
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
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("AUTH_FORBIDDEN");
  }
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw buildHttpError(response, data);
  }
  return data;
}
