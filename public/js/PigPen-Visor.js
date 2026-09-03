import { buildSameOriginApiUrl } from "./api-client.js";
import { normalizeEscapeRoomProject } from "./escape-room-creator-model.mjs";
import { buildPreviewDocument } from "./escape-room-package-builder.mjs";

const elements = {
  sessionTitle: document.getElementById("pvSessionTitle"),
  loading: document.getElementById("pvLoading"),
  error: document.getElementById("pvError"),
  errorTitle: document.getElementById("pvErrorTitle"),
  errorMessage: document.getElementById("pvErrorMessage"),
  retryButton: document.getElementById("pvRetryButton"),
  gameShell: document.getElementById("pvGameShell"),
  gameFrame: document.getElementById("pvGameFrame"),
  topicField: document.getElementById("pvTopicField"),
  topicSelect: document.getElementById("pvTopicSelect"),
  fullscreenButton: document.getElementById("pvFullscreenButton")
};

const state = {
  session: null,
  activeTopicId: ""
};

function readShareParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: String(params.get("session") || "").trim(),
    token: String(params.get("token") || "").trim(),
    topicId: String(params.get("topic") || "").trim()
  };
}

function showView(view = "loading") {
  elements.loading.hidden = view !== "loading";
  elements.error.hidden = view !== "error";
  elements.gameShell.hidden = view !== "game";
}

function friendlyError(error) {
  const status = Number(error?.status || 0);
  if (status === 404) {
    return {
      title: "Este enlace ya no está disponible",
      message: "El escape room pudo haberse eliminado o el enlace está incompleto. Solicita un enlace nuevo a su creador."
    };
  }
  return {
    title: "No pudimos cargar el escape room",
    message: navigator.onLine
      ? "Ocurrió un problema temporal al consultar la sesión. Inténtalo nuevamente."
      : "Parece que no tienes conexión. Conéctate a internet y vuelve a intentarlo."
  };
}

function setError(error) {
  const copy = friendlyError(error);
  elements.errorTitle.textContent = copy.title;
  elements.errorMessage.textContent = copy.message;
  showView("error");
}

function topicLabel(topic, index) {
  const number = Math.max(1, Number(topic?.academicNumber || index + 1) || index + 1);
  const title = String(topic?.title || topic?.project?.titulo || "Escape Room").trim();
  return `Tema ${number} · ${title}`;
}

function renderTopicPicker() {
  const topics = state.session?.topics || [];
  elements.topicSelect.replaceChildren(...topics.map((topic, index) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = topicLabel(topic, index);
    option.selected = topic.id === state.activeTopicId;
    return option;
  }));
  elements.topicField.hidden = topics.length < 2;
}

function renderActiveTopic(topicId = "") {
  const topics = state.session?.topics || [];
  const topic = topics.find((item) => item.id === topicId) || topics[0];
  if (!topic?.project) throw new Error("pigpen_share_has_no_game");
  state.activeTopicId = topic.id;
  const project = normalizeEscapeRoomProject(topic.project);
  document.documentElement.lang = project.idioma || "es-419";
  document.title = `${project.titulo || topic.title || state.session.title} · PigPen`;
  elements.sessionTitle.textContent = state.session.title || project.titulo || "Escape Room";
  elements.gameFrame.title = project.titulo || topic.title || "Escape room";
  elements.gameFrame.srcdoc = buildPreviewDocument(project, { editorialReview: false });
  renderTopicPicker();

  const url = new URL(window.location.href);
  url.searchParams.set("topic", topic.id);
  window.history.replaceState({}, "", url);
  showView("game");
}

async function fetchSharedSession(sessionId, token) {
  const endpoint = buildSameOriginApiUrl(`/api/pigpen/share/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`);
  if (!endpoint) throw new Error("pigpen_share_api_unavailable");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || "pigpen_share_request_failed");
    error.status = response.status;
    throw error;
  }
  if (!data?.session?.topics?.length) throw new Error("pigpen_share_has_no_game");
  return data.session;
}

async function loadSharedEscapeRoom() {
  showView("loading");
  const { sessionId, token, topicId } = readShareParams();
  if (!sessionId || !token) {
    const error = new Error("pigpen_share_params_missing");
    error.status = 404;
    setError(error);
    return;
  }
  try {
    state.session = await fetchSharedSession(sessionId, token);
    const initialTopicId = topicId || state.session.activeTopicId || state.session.topics[0]?.id;
    renderActiveTopic(initialTopicId);
  } catch (error) {
    console.error("No se pudo cargar el escape room compartido:", error);
    setError(error);
  }
}

elements.topicSelect.addEventListener("change", () => {
  try {
    renderActiveTopic(elements.topicSelect.value);
  } catch (error) {
    setError(error);
  }
});

elements.retryButton.addEventListener("click", () => {
  void loadSharedEscapeRoom();
});

elements.fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await elements.gameShell.requestFullscreen();
    }
  } catch (_) {
    // El propio juego conserva su control de pantalla completa como alternativa.
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = Boolean(document.fullscreenElement);
  elements.fullscreenButton.setAttribute("aria-label", isFullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa");
  elements.fullscreenButton.title = isFullscreen ? "Salir de pantalla completa" : "Pantalla completa";
  elements.fullscreenButton.querySelector("i")?.classList.toggle("fa-expand", !isFullscreen);
  elements.fullscreenButton.querySelector("i")?.classList.toggle("fa-compress", isFullscreen);
});

void loadSharedEscapeRoom();
