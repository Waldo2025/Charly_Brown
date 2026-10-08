// Cliente del motor de video local (podcaster-local-video daemon, GPU del equipo).
// El sitio desplegado (https) puede llamar a http://127.0.0.1 porque Chrome lo
// trata como origen potencialmente confiable; precedente: js/sally-remote.js.

const LOCAL_VIDEO_ENGINE_BASE = "http://127.0.0.1:8792";
const TOKEN_STORAGE_KEY = "podcasterLocalVideoToken";

export function localVideoEngineUrl(pathname = "") {
  return LOCAL_VIDEO_ENGINE_BASE + pathname;
}

export function getLocalVideoToken() {
  try {
    return String(window.localStorage.getItem(TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setLocalVideoToken(token = "") {
  try {
    const clean = String(token || "").trim();
    if (clean) window.localStorage.setItem(TOKEN_STORAGE_KEY, clean);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch { /* almacenamiento no disponible */ }
}

export async function probeLocalVideoEngine({ timeoutMs = 3000 } = {}) {
  try {
    const response = await fetch(localVideoEngineUrl("/health"), {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      mode: "cors",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok === true ? data : null;
  } catch {
    return null;
  }
}

// Emparejamiento estilo Chromecast: el sitio pide un código de 6 números, el
// usuario lo teclea en la consola de Servidor Snoopy, y el daemon devuelve la
// clave por /pair/status. Nada viaja por el portapapeles.
export async function requestLocalVideoPairing({ timeoutMs = 4000 } = {}) {
  const response = await fetch(localVideoEngineUrl("/pair/request"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(timeoutMs),
    mode: "cors",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(String(data?.error || `El motor local respondió HTTP ${response.status}.`)), { status: response.status });
  }
  return {
    pairId: String(data?.pairId || "").trim(),
    code: String(data?.code || "").trim(),
    expiresIn: Number(data?.expiresIn || 300),
  };
}

export async function getLocalVideoPairStatus(pairId = "") {
  try {
    const response = await fetch(localVideoEngineUrl("/pair/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairId: String(pairId || "").trim() }),
      signal: AbortSignal.timeout(5000),
      mode: "cors",
    });
    const data = await response.json().catch(() => ({}));
    return { status: String(data?.status || (response.ok ? "pending" : "unknown")), token: String(data?.token || "") };
  } catch {
    return { status: "unknown", token: "" };
  }
}

/**
 * Enlace de un clic desde la consola de Servidor Snoopy: la URL llega con
 * ?snoopy=<invitación>, se canjea una sola vez y deja el token guardado.
 * devuelve "paired" | "unknown" | "expired" | "skipped"
 */
export async function redeemLocalVideoInviteFromUrl() {
  let invite = "";
  try {
    invite = String(new URLSearchParams(window.location.search).get("snoopy") || "").trim();
  } catch {
    return "skipped";
  }
  if (!/^[0-9a-f]{16,64}$/.test(invite)) return "skipped";
  // El enlace es de un solo uso: quitándolo de la barra evita que un refresco lo
  // gaste y que quede en el historial del navegador.
  try {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("snoopy");
    window.history.replaceState({}, "", cleanUrl.toString());
  } catch { /* la página sigue usable */ }
  try {
    const response = await fetch(localVideoEngineUrl("/pair/redeem"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite }),
      signal: AbortSignal.timeout(6000),
      mode: "cors",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token) {
      return response.status === 404 ? "expired" : "unknown";
    }
    setLocalVideoToken(data.token);
    return "paired";
  } catch {
    return "unknown";
  }
}

async function localVideoRequest(pathname, { method = "GET", body, headers = {}, timeoutMs = 15000 } = {}) {
  const token = getLocalVideoToken();
  const response = await fetch(localVideoEngineUrl(pathname), {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Local-Video-Token": token,
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) {
    throw Object.assign(new Error("El motor local no está conectado con este sitio todavía. Pulsa “Conectar con Snoopy” (o pega la clave manual) en el panel de Proveedor / Modelo de video."), { status: 401 });
  }
  if (response.status === 403) {
    throw Object.assign(new Error("Desconectaste este editor desde la consola de Servidor Snoopy. Pulsa “Conectar con Snoopy” para volver a usar tu GPU."), { status: 403 });
  }
  return response;
}

export async function createLocalVideoJob(spec = {}) {
  const response = await localVideoRequest("/jobs", { method: "POST", body: spec, timeoutMs: 60000 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(String(data?.error || `El motor local respondió HTTP ${response.status}.`)), { status: response.status });
  }
  // El plan lo decide el motor local (conoce su RAM): sin él no podríamos decir
  // cuánto va a tardar la escena.
  return { jobId: String(data?.jobId || "").trim(), plan: data?.plan || null };
}

export async function getLocalVideoJob(jobId = "") {
  const response = await localVideoRequest(`/jobs/${encodeURIComponent(String(jobId || "").trim())}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(String(data?.error || `El motor local respondió HTTP ${response.status}.`)), { status: response.status });
  }
  return data;
}

export async function fetchLocalVideoBlob(jobId = "") {
  const response = await localVideoRequest(`/jobs/${encodeURIComponent(String(jobId || "").trim())}/video`, { timeoutMs: 120000 });
  if (!response.ok) throw Object.assign(new Error(`El motor local no entregó el video (HTTP ${response.status}).`), { status: response.status });
  return response.blob();
}

export async function cancelLocalVideoJob(jobId = "") {
  try {
    await localVideoRequest(`/jobs/${encodeURIComponent(String(jobId || "").trim())}/cancel`, { method: "POST" });
  } catch { /* el trabajo ya terminó o se perdió */ }
}

/**
 * Avisa a Snoopy de la escena que ya subió a la nube, para que su lista de videos
 * diga a cuál pertenece cada clip. Es un extra: si el motor está apagado la escena
 * igual quedó guardada en tu biblioteca.
 */
export async function linkLocalVideoClip(jobId = "", link = {}) {
  try {
    await localVideoRequest(`/jobs/${encodeURIComponent(String(jobId || "").trim())}`, {
      method: "PATCH",
      body: {
        title: String(link.title || "").slice(0, 120),
        storageUrl: String(link.storageUrl || "").slice(0, 500)
      },
      timeoutMs: 10000
    });
  } catch { /* Snoopy apagado o sin biblioteca: nada que arreglar aquí */ }
}
