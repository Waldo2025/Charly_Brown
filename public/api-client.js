import { getAuth } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

const DEFAULT_REMOTE_API_BASE = "https://us-central1-charly-brown.cloudfunctions.net/api";
const DEFAULT_EMULATOR_API_BASE = "http://127.0.0.1:5001/charly-brown/us-central1/api";

export function resolveApiBase() {
  const configured = String(window.__CHARLY_CONFIG__?.apiBaseUrl || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isStaticDev = (host === "127.0.0.1" || host === "localhost") &&
    (port === "5502" || port === "5500");
  if (isStaticDev) return DEFAULT_REMOTE_API_BASE;
  return "/api";
}

export function buildApiUrl(path = "") {
  const input = String(path || "").trim();
  if (!input) return resolveApiBase();
  if (/^https?:\/\//i.test(input)) return input;

  const base = resolveApiBase();
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
    const isEmulatorUrl = finalUrl.startsWith(DEFAULT_EMULATOR_API_BASE);
    if (isEmulatorUrl) {
      const fallbackUrl = finalUrl.replace(DEFAULT_EMULATOR_API_BASE, DEFAULT_REMOTE_API_BASE);
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
