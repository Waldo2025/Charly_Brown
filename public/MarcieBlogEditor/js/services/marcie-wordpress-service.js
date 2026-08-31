import { authFetchJson } from "/js/api-client.js";

const WORDPRESS_ERROR_MESSAGES = Object.freeze({
  wordpress_not_configured: "WordPress todavía no está configurado en el servidor.",
  wordpress_config_invalid: "La configuración segura de WordPress no es válida.",
  wordpress_https_required: "El sitio de WordPress debe utilizar HTTPS.",
  wordpress_private_host_blocked: "El servidor rechazó el destino de WordPress por seguridad.",
  wordpress_dns_failed: "No fue posible resolver el dominio de WordPress.",
  wordpress_timeout: "WordPress tardó demasiado en responder.",
  wordpress_http_401: "WordPress rechazó el usuario o la Application Password.",
  wordpress_http_403: "El usuario de WordPress no tiene permisos suficientes.",
  wordpress_capabilities_missing: "El usuario técnico de WordPress no puede editar, subir medios, gestionar términos y publicar entradas.",
  marcie_article_not_approved: "El artículo debe aprobarse editorialmente antes de enviarlo a WordPress.",
  marcie_article_not_verified: "El artículo todavía tiene afirmaciones sin evidencia verificable.",
  marcie_publish_date_invalid: "Selecciona una fecha futura válida para la publicación.",
  marcie_wordpress_draft_required: "Primero debes crear el borrador en WordPress.",
  marcie_publication_in_progress: "Ya hay una creación de borrador en curso. Espera un momento.",
  marcie_user_not_approved: "Tu usuario no tiene autorización editorial para publicar.",
  marcie_editor_role_required: "Solo editores y administradores pueden modificar WordPress o la programación.",
  marcie_session_forbidden: "No puedes publicar una sesión de otro usuario."
});

async function wordpressRequest(path, options) {
  try {
    return await authFetchJson(path, options);
  } catch (cause) {
    const code = String(cause?.message || cause?.detail?.error || "").trim();
    if (!WORDPRESS_ERROR_MESSAGES[code]) throw cause;
    const error = new Error(WORDPRESS_ERROR_MESSAGES[code]);
    error.code = code;
    error.status = cause?.status;
    error.cause = cause;
    throw error;
  }
}

function audienceOf(session = {}) {
  return String(session.audience || session.article?.audience || "educators").trim() || "educators";
}

function sessionRequest(session = {}) {
  if (!session?.id) throw new Error("Selecciona una sesión antes de publicar.");
  return { sessionId: session.id, audience: audienceOf(session) };
}

export function getWordPressStatus(session = null) {
  const query = session?.id
    ? `?sessionId=${encodeURIComponent(session.id)}&audience=${encodeURIComponent(audienceOf(session))}`
    : "";
  return wordpressRequest(`/api/marcie/wordpress/status${query}`, { sameOrigin: true });
}

export function testWordPressConnection() {
  return wordpressRequest("/api/marcie/wordpress/test", {
    sameOrigin: true,
    method: "POST",
    body: {}
  });
}

export function createWordPressDraft(session) {
  return wordpressRequest("/api/marcie/wordpress/draft", {
    sameOrigin: true,
    method: "POST",
    body: sessionRequest(session)
  });
}

export function publishWordPressArticle(session) {
  return wordpressRequest("/api/marcie/wordpress/publish", {
    sameOrigin: true,
    method: "POST",
    body: sessionRequest(session)
  });
}

export async function schedulePublication(session, calendarItem) {
  const status = await getWordPressStatus(session);
  if (!status?.publication?.remoteId) await createWordPressDraft(session);
  return wordpressRequest("/api/marcie/wordpress/schedule", {
    sameOrigin: true,
    method: "POST",
    body: { ...sessionRequest(session), calendarItemId: calendarItem.id, publishAtUtc: calendarItem.publishAtUtc, publishAtLocal: calendarItem.publishAtLocal, timezone: calendarItem.timezone || "America/Cancun" }
  });
}

export function reschedulePublication(session, calendarItem) {
  return schedulePublication(session, calendarItem);
}

export function cancelScheduledPublication(session, reason = "programación cancelada") {
  return wordpressRequest("/api/marcie/wordpress/cancel-schedule", { sameOrigin: true, method: "POST", body: { ...sessionRequest(session), reason } });
}

export function reconcilePublicationStatus(session) {
  return wordpressRequest("/api/marcie/wordpress/reconcile", { sameOrigin: true, method: "POST", body: sessionRequest(session) });
}
