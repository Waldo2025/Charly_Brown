import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8787/api";
const DEFAULT_REMOTE_API_BASE_SAFE = "/api";

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
  if (configured) {
    const sanitized = configured.replace(/\/+$/, "");
    // En localhost nunca usar Cloud Functions remoto para evitar CORS en preflight.
    if (isLocalHost && /cloudfunctions\.net/i.test(sanitized)) {
      return DEFAULT_LOCAL_API_BASE;
    }
    return sanitized;
  }

  if (isLocalHost) {
    if (port === "8787") return "/api";
    if (port === "5000") return "/api";
    return DEFAULT_LOCAL_API_BASE;
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

  let response = null;
  try {
    response = await fetch(finalUrl, requestInit);
  } catch (err) {
    const isLocalUrl = finalUrl.startsWith(DEFAULT_LOCAL_API_BASE);
    if (isLocalUrl) {
      const fallbackUrl = finalUrl.replace("http://127.0.0.1:8787", "http://localhost:8787");
      response = await fetch(fallbackUrl, requestInit);
    } else {
      throw err;
    }
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("AUTH_FORBIDDEN");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }
  return data;
}
