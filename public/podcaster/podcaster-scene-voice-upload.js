import { uploadPodcasterAsset } from "./podcaster-resumable-upload.js";

const MAX_SCENE_VOICE_BYTES = 24 * 1024 * 1024;
const MIME_BY_EXTENSION = Object.freeze({
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  ogg: "audio/ogg", webm: "audio/webm"
});

function resolveVoiceFile(file) {
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType || !file?.size || file.size > MAX_SCENE_VOICE_BYTES) {
    throw new Error("Selecciona un MP3, WAV, M4A, OGG o WebM de hasta 24 MB.");
  }
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}

function measureVoiceDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const timer = setTimeout(() => finish(new Error("No se pudo medir la duración del audio.")), 15000);
    let settled = false;
    function finish(error = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(audioDuration);
    }
    let audioDuration = 0;
    audio.addEventListener("loadedmetadata", () => {
      audioDuration = Number(audio.duration || 0);
      finish(audioDuration > 0 && Number.isFinite(audioDuration) ? null : new Error("El audio no tiene una duración válida."));
    }, { once: true });
    audio.addEventListener("error", () => finish(new Error("No se pudo leer el archivo de audio.")), { once: true });
    audio.preload = "metadata";
    audio.src = url;
  });
}

export function initSceneVoiceUpload() {
  const button = document.getElementById("uploadSceneVoiceBtn");
  const input = document.getElementById("uploadSceneVoiceInput");
  if (!button || !input) return;
  button.addEventListener("click", () => {
    if (button.disabled || window.podcastVideoState?.busy) return;
    const session = window.getActiveSession?.();
    const rowId = window.resolveTargetVideoRowId?.(session);
    if (!session || !rowId) {
      window.setGenerationStatus?.("Selecciona una escena para cargar la voz.", "is-error");
      return;
    }
    input.value = "";
    input.click();
  });
  input.addEventListener("change", async () => {
    const selected = input.files?.[0];
    if (!selected) return;
    const session = window.getActiveSession?.();
    const rowId = window.resolveTargetVideoRowId?.(session);
    const sessionId = String(session?.id || "").trim();
    if (!sessionId || !rowId) return;
    const context = window.PodcasterSceneMedia.capture(session, rowId, "audio");
    button.disabled = true;
    button.classList.add("is-uploading");
    try {
      const file = resolveVoiceFile(selected);
      const durationSec = await measureVoiceDuration(file);
      await window.saveSessionToCloud?.(sessionId, { render: false, silent: true });
      const result = await uploadPodcasterAsset(file, {
        kind: "scene-audio", sessionId, rowId,
        onProgress: (loaded, total) => {
          const percent = Math.min(100, Math.round(100 * loaded / Math.max(1, total)));
          window.setGenerationStatus?.(`Cargando voz de escena… ${percent}%`, "is-busy");
        }
      });
      if (!result?.media?.storagePath) throw new Error("La carga no devolvió una referencia de Storage.");
      const row = window.getSessionRows?.(session)?.find((item) => String(item?.id || "") === rowId);
      const clip = {
        ...result.media,
        rowId,
        speaker: String(row?.speaker || ""),
        model: "uploaded",
        promptVersion: "imported_scene_voice_v1",
        durationSec,
        targetSpeechLine: "",
        wordTimings: [],
        playbackRate: 1
      };
      const application = await window.PodcasterSceneMedia.apply(context, clip);
      if (application.status !== "applied") throw new Error("La escena cambió durante la carga; selecciona la escena y vuelve a intentarlo.");
      if (window.podcastVideoState?.montageAudioActualDurationsMs) {
        window.podcastVideoState.montageAudioActualDurationsMs[rowId] = Math.round(durationSec * 1000);
      }
      window.syncGeminiDialogueTrackWithRuntime?.({ render: false, preserveStartMs: true });
      const updated = window.getActiveSession?.();
      const config = window.getPodcastVideoConfig?.(updated);
      [window.playbackController, window.exportPreviewController]
        .filter((controller) => typeof controller?.sync === "function")
        .forEach((controller) => controller.sync(updated, config));
      window.renderPodcastVideoTimeline?.(updated, { force: true, reason: "scene-voice-uploaded" });
      window.syncPodcastStudioInspector?.(updated);
      window.scheduleSessionLocalPersist?.("scene-voice-uploaded");
      window.setGenerationStatus?.("Voz cargada y guardada en la escena.", "is-live");
    } catch (error) {
      console.error("[podcaster][scene-voice-upload]", error);
      window.setGenerationStatus?.(String(error?.message || "No se pudo cargar la voz."), "is-error");
    } finally {
      button.disabled = false;
      button.classList.remove("is-uploading");
      input.value = "";
    }
  });
}
