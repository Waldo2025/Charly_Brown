const { GenerateVideosOperation } = require('@google/genai');
const { scheduleOperationPoll } = require('./veo-operation-tasks.js');
const mediaState = require("./podcaster-media-state.js");
const crypto = require("node:crypto");
const { GoogleAuth } = require("google-auth-library");
const {
  PROJECT_ID,
  REGION,
  getAdminServices,
  resolveAuthContext,
  asyncRoute,
  hasAdminRoleWithProfile
} = require("./common.js");
const { createVertexClient, normalizeModel, normalizeVeoModel, DEFAULT_IMAGE_MODEL, DEFAULT_VEO_MODEL } = require("./vertex.js");
const { enqueueHttpTask, QUEUES } = require("./tasks.js");
const { sessionAccess } = require("./podcaster-data.js");
const { buildDialogueVideoPrompt } = require("./video-prompt.js");

const AI_JOB_COLLECTION = "podcaster_ai_jobs";
const AI_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const TASK_INVOKER = `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`;
const VEO_DISPATCH_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchVeoTask`;
const NON_RETRYABLE_VERTEX_CODES = new Set([3, 5, 7, 9, 12, 16]);
const VERTEX_VIDEO_OPERATION_DEADLINE_MS = 26 * 60 * 1000;
const GEMINI_TTS_VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia",
  "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix",
  "Sadachbia", "Sadaltager", "Sulafat"
]);
const GEMINI_TTS_LANGUAGE_CODES = new Set([
  "ar", "fil", "bn", "fi", "nl", "gl", "en", "ka", "fr", "el", "de", "gu", "hi", "ht", "id", "he",
  "it", "hu", "ja", "is", "ko", "jv", "mr", "kn", "pl", "kok", "pt", "lo", "ro", "la", "ru", "lv",
  "es", "lt", "ta", "lb", "te", "mk", "th", "mai", "tr", "mg", "uk", "ms", "vi", "ml", "af", "mn",
  "sq", "ne", "am", "nb", "hy", "nn", "az", "or", "eu", "ps", "be", "fa", "bg", "pa", "my", "sr",
  "ca", "sd", "ceb", "si", "cmn", "sk", "hr", "sl", "cs", "sw", "da", "sv", "et", "ur"
]);
const GEMINI_TTS_VOICE_CATALOG_CACHE = new Map();

function registerGeminiTtsVoiceCatalogRoute(app) {
  app.get("/api/podcaster/tts/voices", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const languageCode = String(req.query?.language_code || "").trim().slice(0, 24);
    const gender = String(req.query?.gender || "").trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(languageCode)) {
      throw Object.assign(new Error("Falta un código de idioma BCP-47 válido."), { status: 400 });
    }
    if (gender && !["female", "male", "neutral"].includes(gender)) {
      throw Object.assign(new Error("Género de voz no válido."), { status: 400 });
    }
    const apiKey = String(process.env.GEMINI_FREE_TIER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) throw Object.assign(new Error("Catálogo de voces Gemini no disponible."), { status: 503 });

    const locale = languageCode.toLowerCase();
    const language = locale.split("-")[0];
    const regionByLocale = { "es-mx": "MX", "es-es": "ES", "es-419": "419", es: "MX" };
    const accentByLocale = { "es-mx": "Mexican", "es-es": "Castilian", "es-419": "Latin American", es: "Mexican" };
    const regionCode = regionByLocale[locale] || "";
    const accent = accentByLocale[locale] || "";
    const cacheKey = `${locale}:${gender}`;
    const cached = GEMINI_TTS_VOICE_CATALOG_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.status(200).json({ voices: cached.voices });

    const queryCatalog = async ({ exactLocale = false, includeAccent = true } = {}) => {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/voices");
      url.searchParams.set("language_code", exactLocale ? languageCode : language);
      if (regionCode) url.searchParams.set("region_code", regionCode);
      if (includeAccent && accent) url.searchParams.set("accent", accent);
      url.searchParams.set("page_size", "1000");
      url.searchParams.set("type", "prebuilt");
      if (gender) url.searchParams.set("gender", gender);
      const upstream = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
      return { upstream, data: await upstream.json().catch(() => ({})) };
    };

    let result = await queryCatalog();
    if (result.upstream.ok && !(Array.isArray(result.data?.voices) && result.data.voices.length)) {
      result = await queryCatalog({ includeAccent: false });
    }
    if (result.upstream.ok && !(Array.isArray(result.data?.voices) && result.data.voices.length) && locale !== language) {
      result = await queryCatalog({ exactLocale: true, includeAccent: false });
    }
    if (!result.upstream.ok) {
      throw Object.assign(new Error("No se pudo cargar el catálogo de voces Gemini."), { status: 502 });
    }

    const voices = (Array.isArray(result.data?.voices) ? result.data.voices : []).map((voice) => ({
      id: String(voice?.id || "").trim().slice(0, 120),
      displayName: String(voice?.display_name || voice?.displayName || voice?.id || "").trim().slice(0, 100),
      languageCode: String(voice?.language_code || voice?.languageCode || "").trim().slice(0, 24),
      regionCode: String(voice?.region_code || voice?.regionCode || "").trim().slice(0, 12),
      accent: String(voice?.accent || "").trim().slice(0, 80),
      gender: String(voice?.gender || "").trim().slice(0, 24),
      description: String(voice?.description || "").trim().slice(0, 280),
      type: String(voice?.type || "prebuilt").trim().slice(0, 24)
    })).filter((voice) => voice.id && (GEMINI_TTS_VOICES.has(voice.id) || /^voice_[A-Za-z0-9_-]+$/.test(voice.id)));
    GEMINI_TTS_VOICE_CATALOG_CACHE.set(cacheKey, { voices, expiresAt: Date.now() + 30 * 60 * 1000 });
    return res.status(200).json({ voices });
  }));
}

function resolveTtsSpeechLocale(value = "") {
  const requested = String(value || "").trim() || "es-MX";
  if (requested === "es" || requested === "es-MX") {
    return {
      speechLocale: "es-MX",
      languageCode: "es",
      instruction: "Speak only in natural Mexican Spanish. Do not use Peninsular Spanish pronunciation and do not switch languages."
    };
  }
  if (requested === "es-ES") {
    return {
      speechLocale: "es-ES",
      languageCode: "es",
      instruction: "Speak only in natural Peninsular Spanish. Do not use Latin American pronunciation and do not switch languages."
    };
  }
  if (requested === "es-419" || requested === "es-US") {
    return {
      speechLocale: "es-419",
      languageCode: "es",
      instruction: "Speak only in neutral Latin American Spanish. Avoid strongly regional vocabulary and do not switch languages."
    };
  }
  const languageCode = requested.toLowerCase().split("-")[0];
  if (!GEMINI_TTS_LANGUAGE_CODES.has(languageCode)) {
    throw Object.assign(new Error("unsupported_speech_locale"), { status: 400, code: "unsupported_speech_locale" });
  }
  return {
    speechLocale: languageCode,
    languageCode,
    instruction: `Speak only in the language identified by BCP-47 code ${languageCode}. Do not switch languages.`
  };
}

function normalizeTtsVoiceName(value = "") {
  const voiceName = String(value || "").trim();
  if (voiceName === "replicated") return "replicated";
  if (!GEMINI_TTS_VOICES.has(voiceName) && !/^voice_[A-Za-z0-9_-]+$/.test(voiceName)) {
    throw Object.assign(new Error("unsupported_tts_voice"), { status: 400, code: "unsupported_tts_voice" });
  }
  return voiceName;
}

function normalizeVertexModelName(model = "") {
  return String(model || "")
    .trim()
    .replace(/^.*\/models\//i, "")
    .replace(/:generateContent$/i, "");
}

function createVertexVideoOperationError(detail = {}) {
  const providerCode = Number(detail?.code);
  const providerMessage = String(detail?.message || "Vertex AI no pudo generar el video.").trim();
  const policyBlocked = providerCode === 3 && /sensitive words|responsible ai|violate/i.test(providerMessage);
  const error = new Error(policyBlocked
    ? "Google bloqueó el prompt por sus políticas de IA responsable. Reformula el contenido e inténtalo de nuevo."
    : providerMessage);
  error.code = policyBlocked ? "vertex_video_prompt_blocked" : "vertex_video_operation_failed";
  error.providerCode = Number.isFinite(providerCode) ? providerCode : null;
  error.retryable = !NON_RETRYABLE_VERTEX_CODES.has(providerCode);
  return error;
}

function normalizeVertexRaiReasons(value = null) {
  const source = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return source
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      return String(item.message || item.reason || item.code || "").trim();
    })
    .map((item) => String(item || "").replace(/\s+/g, " ").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 5);
}

function extractVertexVideoOutcome(operation = {}) {
  const response = operation?.response && typeof operation.response === "object"
    ? operation.response
    : (operation?.result && typeof operation.result === "object" ? operation.result : {});
  const generatedVideos = [
    response?.generatedVideos,
    response?.generated_videos,
    response?.videos,
    response?.generatedSamples,
    response?.generated_samples
  ].find(Array.isArray) || [];
  const first = generatedVideos[0] && typeof generatedVideos[0] === "object"
    ? generatedVideos[0]
    : null;
  const video = first?.video && typeof first.video === "object" ? first.video : first;
  const filteredReasons = normalizeVertexRaiReasons(
    response?.raiMediaFilteredReasons ?? response?.rai_media_filtered_reasons
  );
  const filteredCount = Math.max(0, Number(
    response?.raiMediaFilteredCount ?? response?.rai_media_filtered_count ?? 0
  ) || 0);
  return { response, video, filteredCount, filteredReasons };
}

function createVertexVideoEmptyError(operation = {}) {
  const outcome = extractVertexVideoOutcome(operation);
  if (outcome.filteredCount > 0 || outcome.filteredReasons.length > 0) {
    const error = new Error(
      "Google filtró la imagen de referencia o el video generado por sus políticas de IA responsable. Prueba con otra imagen de referencia o elimina la referencia y vuelve a generar."
    );
    error.code = "vertex_video_content_filtered";
    error.retryable = false;
    error.providerReasons = outcome.filteredReasons;
    error.filteredCount = outcome.filteredCount;
    return error;
  }
  const error = new Error("Vertex AI terminó la generación sin devolver un archivo de video. Inténtalo nuevamente.");
  error.code = "vertex_video_empty";
  // The provider operation already reached a terminal successful state. Retrying
  // the Cloud Task would submit a brand-new paid generation and turn one empty
  // result into a burst of 5xx responses. A user can still retry explicitly.
  error.retryable = false;
  return error;
}

function normalizeVertexVideoError(error) {
  if (Number.isFinite(Number(error?.providerCode))) return error;
  const directCode = Number(error?.code);
  if (Number.isFinite(directCode)) {
    return createVertexVideoOperationError({ code: directCode, message: error?.message });
  }
  const rawMessage = String(error?.message || error || "").trim();
  const marker = "vertex_video_error:";
  const markerIndex = rawMessage.toLowerCase().indexOf(marker);
  if (markerIndex < 0) return error;
  const encodedDetail = rawMessage.slice(markerIndex + marker.length).trim();
  try {
    const detail = JSON.parse(encodedDetail);
    return Number.isFinite(Number(detail?.code))
      ? createVertexVideoOperationError(detail)
      : error;
  } catch (_) {
    return error;
  }
}

function isRetryableAiJobError(error) {
  if (typeof error?.retryable === "boolean") return error.retryable;
  const providerCode = Number(error?.providerCode ?? error?.code);
  if (NON_RETRYABLE_VERTEX_CODES.has(providerCode)) return false;
  const status = Number(error?.status || error?.statusCode || 0);
  if (status >= 400 && status < 500 && ![408, 409, 429].includes(status)) return false;
  return true;
}

function tokenDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function cleanId(value = "") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 180 || !/^[A-Za-z0-9._-]+$/.test(clean)) throw Object.assign(new Error("invalid_identifier"), { status: 400 });
  return clean;
}

function storageSegment(value = "", fallback = "item") {
  return String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || fallback;
}

function compactInput(value, depth = 0) {
  if (depth > 12) return undefined;
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return /^data:/i.test(value.trim()) ? undefined : value.slice(0, 16000);
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => compactInput(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== "object") return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/dataUrl|base64|inlineData/i.test(key)) continue;
    const next = compactInput(item, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function publicAiJob(job = {}) {
  let publicStage = String(job.stage || "queued");
  let publicHint = String(job.hint || "");
  let publicError = job.error;
  let publicRetryable = typeof job.retryable === "boolean" ? job.retryable : undefined;
  if (job.type === "dialogue_video" && job.error) {
    const storedError = new Error(String(job.error?.message || job.error?.code || job.error));
    if (job.error?.providerCode != null) storedError.providerCode = job.error.providerCode;
    const normalizedError = normalizeVertexVideoError(storedError);
    if (normalizedError?.code === "vertex_video_prompt_blocked") {
      publicStage = "blocked";
      publicHint = "Google bloqueó el prompt. Reformúlalo e intenta de nuevo.";
      publicRetryable = false;
      publicError = {
        code: normalizedError.code,
        message: normalizedError.message,
        providerCode: normalizedError.providerCode
      };
    }
  }
  const payload = {
    ok: true,
    jobId: String(job.jobId || ""),
    type: String(job.type || ""),
    status: String(job.status || "queued"),
    stage: publicStage,
    progress: Math.max(0, Math.min(1, Number(job.progress || 0) || 0)),
    hint: publicHint,
    updatedAt: String(job.updatedAt || new Date().toISOString()),
    statusUrl: `/api/podcaster/jobs/${encodeURIComponent(String(job.jobId || ""))}`
  };
  if (typeof publicRetryable === "boolean") payload.retryable = publicRetryable;
  if (job.model) payload.model = String(job.model);
  if (publicError) payload.error = publicError;
  if (job.result && typeof job.result === "object") {
    payload.result = job.result;
    for (const key of ["portrait", "image", "dialogueVideo", "dialogueAudio", "track"]) {
      if (job.result[key]) payload[key] = job.result[key];
    }
  }
  return payload;
}

function buildImagePrompt(type, input) {
  if (type === "speaker_portrait") {
    return [
      "Create one polished cinematic podcast speaker portrait without text or logos.",
      `Speaker: ${String(input.speakerName || input.speakerLabel || "Host")}.`,
      `Expression: ${String(input.expression || "natural and attentive")}.`,
      `Setting: ${String(input.scenarioPrompt || "modern editorial podcast studio")}.`,
      "Consistent facial features, professional lighting, medium close-up, safe for educational media."
    ].join(" ");
  }
  return [
    "Create one cinematic environment image without text, captions, watermarks or logos.",
    `Scene subject (a visual topic only — never draw, write, render or imply any words, letters, signage, captions or titles): ${String(input.title || "Podcast scene")}.`,
    `Art direction: ${String(input.prompt || "modern editorial podcast environment")}.`,
    "Professional composition, coherent lighting, suitable as a video background."
  ].join(" ");
}

function extractImage(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      const data = String(part?.inlineData?.data || part?.inline_data?.data || "").trim();
      if (data) return { data, mimeType: String(part?.inlineData?.mimeType || part?.inline_data?.mime_type || "image/png") };
    }
  }
  return null;
}

async function createAiJob(req, type) {
  const authContext = await resolveAuthContext(req);
  const input = compactInput(req.body || {});
  if (["dialogue_audio", "speech"].includes(type)) {
    const speech = resolveTtsSpeechLocale(input?.speechLocale || input?.languageCode || "es-MX");
    input.voiceName = input?.voiceSampleAudio ? "replicated" : normalizeTtsVoiceName(input?.voiceName || "Aoede");
    input.speechLocale = speech.speechLocale;
    input.languageCode = speech.languageCode;
  }
  const sessionId = cleanId(input?.sessionId || "");
  const { db, admin } = getAdminServices();
  if (["dialogue_audio", "speech"].includes(type) && /^voice_[A-Za-z0-9_-]+$/.test(input.voiceName)) {
    const voiceSnapshot = await db.collection("schroeder_voice_profiles").doc(input.voiceName).get();
    if (!voiceSnapshot.exists || String(voiceSnapshot.data()?.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("custom_voice_forbidden"), { status: 403, code: "custom_voice_forbidden" });
    }
  }
  const isSoundLab = String(input?.workspaceType || "").trim() === "schroeder-sound-lab";
  let sessionSnapshot = null;
  if (!isSoundLab) {
    const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
    sessionSnapshot = await sessionRef.get();
    if (!sessionSnapshot.exists && sessionId) {
      await require("./savings-policy.js").guardPodcasterSession(db, authContext.uid, {
        id: sessionId,
        script: { videoContentType: type === "dialogue_video" ? "video" : null },
        podcastStudioUiState: { composerGenerationMode: type === "dialogue_video" ? "video" : "script" }
      });
      const nowIso = new Date().toISOString();
      await sessionRef.set({
        id: sessionId,
        ownerId: authContext.uid,
        title: String(input?.title || "Sesión de Podcaster").trim(),
        script: { rows: [] },
        createdAt: nowIso,
        updatedAt: nowIso,
        autoCreatedByAiJob: true
      }, { merge: true });
      sessionSnapshot = await sessionRef.get();
    }
    if (!sessionSnapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
    if (!sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    if (type === "dialogue_video") {
      const existing = sessionSnapshot.data()?.session || sessionSnapshot.data() || {};
      await require("./savings-policy.js").guardPodcasterSession(db, authContext.uid, {
        ...existing,
        id: sessionId,
        podcastStudioUiState: { ...(existing.podcastStudioUiState || {}), composerGenerationMode: "video" }
      }, existing);
    }
  }
  const requestIdentity = input.selectionContext?.requestId || input.requestId || req.headers?.['idempotency-key'];
  const jobId = type === 'dialogue_video'
    ? 'video-' + crypto.createHash('sha256').update(JSON.stringify([authContext.uid, sessionId, input.rowId, requestIdentity || input])).digest('hex').slice(0, 48)
    : crypto.randomUUID();
  if (type === 'dialogue_video') {
    const previous = await db.collection(AI_JOB_COLLECTION).doc(jobId).get();
    if (previous.exists) {
      const existing = previous.data();
      if (existing.stage === 'queue_unavailable' && !existing.videoSubmissionStartedAt) {
        const queued = await enqueueHttpTask({ queue: QUEUES.veo, kind: type, jobId, targetUrl: VEO_DISPATCH_URL, serviceAccountEmail: TASK_INVOKER, dispatchDeadlineSeconds: 1800 });
        return db.runTransaction(async tx => {
          const latest=(await tx.get(previous.ref)).data();
          if(latest?.stage!=='queue_unavailable'||latest.videoSubmissionStartedAt||latest.status==='cancelled')return latest;
          const patch={status:'queued',stage:'queued',taskName:queued.name,updatedAt:admin.firestore.FieldValue.serverTimestamp()};
          tx.set(previous.ref,patch,{merge:true});return {...latest,...patch};
        });
      }
      return existing;
    }
  }
  if (type === "dialogue_video") {
    const { getPolicy, claimDaily, claimVeo } = require("./savings-policy.js");
    const policy = await getPolicy(db);
    if (policy.limits.veoMinutes) {
      const rows = sessionSnapshot.data()?.session?.script?.rows || sessionSnapshot.data()?.script?.rows || [];
      const sceneNumber = rows.findIndex((row) => String(row?.id || "") === String(input.rowId || "")) + 1;
      if (!sceneNumber) throw Object.assign(new Error("savings_scene_not_saved"), { status: 409 });
      await claimDaily(db, authContext.uid, "videoSessions", sessionId, policy.limits.videoSessions);
      await claimVeo(db, authContext.uid, jobId, policy.limits.veoMinutes, sceneNumber, { blocked: policy.level === "ultra" });
    }
  }
  if (["dialogue_video", "dialogue_audio"].includes(type)) {
    const origin = { ...sessionSnapshot.data()?.session, id: sessionId };
    const kind = type === "dialogue_audio" ? "audio" : "video";
    input.selectionContext = {
      ...(input.selectionContext || mediaState.captureMediaSelection(origin, input.rowId, kind, jobId)),
      sessionId, rowId: String(input.rowId || ""), kind,
      requestId: String(input.selectionContext?.requestId || jobId)
    };
  }
  const now = new Date();
  const isVideo = type === "dialogue_video";
  const requestedModel = String(input.model || "");
  const model = isVideo
    ? normalizeVeoModel(requestedModel, DEFAULT_VEO_MODEL)
    : ["dialogue_audio", "speech"].includes(type)
      ? normalizeModel(requestedModel, type === "speech" ? "gemini-3.8-flash-tts" : "gemini-3.1-flash-tts-preview")
      : type === "music"
        ? normalizeModel(requestedModel, "lyria-3-clip-preview")
        : normalizeModel(requestedModel, DEFAULT_IMAGE_MODEL);
  const job = {
    jobId,
    type,
    sessionId,
    ownerId: authContext.uid,
    input,
    model,
    status: "queued",
    stage: "queued",
    progress: 0,
    hint: isVideo ? "Video en cola." : type === "music" ? "Canción en cola." : ["dialogue_audio", "speech"].includes(type) ? "Audio en cola." : "Imagen en cola.",
    attempt: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AI_JOB_TTL_MS).toISOString()
  };
  const ref = db.collection(AI_JOB_COLLECTION).doc(jobId);
  if (type === 'dialogue_video' && typeof ref.create === 'function') {
    try { await ref.create(job); }
    catch (error) { if (Number(error.code) === 6 || error.code === 'ALREADY_EXISTS') return (await ref.get()).data(); throw error; }
  } else await ref.set(job);
  try {
    const queued = await enqueueHttpTask({ queue: QUEUES.veo, kind: type, jobId, targetUrl: VEO_DISPATCH_URL, serviceAccountEmail: TASK_INVOKER, dispatchDeadlineSeconds: 1800 });
    await ref.set({ taskName: queued.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await ref.set({ status: "error", stage: "queue_unavailable", error: { code: "ai_task_enqueue_failed", message: String(error?.message || error).slice(0, 500) }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    throw Object.assign(new Error("ai_task_enqueue_failed"), { status: 503, cause: error });
  }
  return job;
}

async function processImageJob(job, ref) {
  const { bucket, admin } = getAdminServices();
  const client = createVertexClient({ location: "global" });
  const response = await client.models.generateContent({
    model: normalizeModel(job.model, DEFAULT_IMAGE_MODEL),
    contents: buildImagePrompt(job.type, job.input || {}),
    config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: job.type === "speaker_portrait" ? "3:4" : "16:9" } }
  });
  const image = extractImage(response);
  if (!image?.data) throw new Error("vertex_image_empty");
  const ext = image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.includes("webp") ? "webp" : "png";
  const label = job.type === "speaker_portrait" ? String(job.input?.speakerLabel || "speaker") : String(job.input?.scenarioId || "scenario");
  const storagePath = `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/generated/${job.type}/${label}-${job.jobId}.${ext}`;
  const downloadToken = crypto.randomUUID();
  await bucket.file(storagePath).save(Buffer.from(image.data, "base64"), { resumable: false, metadata: { contentType: image.mimeType, metadata: { jobId: job.jobId, ownerId: job.ownerId, type: job.type, firebaseStorageDownloadTokens: downloadToken } } });
  if (String((await ref.get()).data()?.status || "") === "cancelled") {
    await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {});
    throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
  }
  const media = {
    downloadUrl: tokenDownloadUrl(bucket.name, storagePath, downloadToken),
    storagePath,
    mimeType: image.mimeType,
    updatedAt: new Date().toISOString(),
    model: normalizeModel(job.model, DEFAULT_IMAGE_MODEL)
  };
  if (job.type === "speaker_portrait") Object.assign(media, { voiceName: String(job.input?.voiceName || ""), genderGroup: String(job.input?.genderGroup || ""), expression: String(job.input?.expression || ""), scenarioId: String(job.input?.scenarioId || ""), scenarioImageUrl: String(job.input?.scenarioImageUrl || ""), scenarioImageStoragePath: String(job.input?.scenarioImageStoragePath || ""), promptVersion: "podcaster_vertex_v1" });
  const result = job.type === "speaker_portrait" ? { portrait: media } : { image: media };
  await ref.set({ status: "ready", stage: "ready", progress: 1, hint: "Imagen lista.", result, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

function gsPath(uri = "") {
  const match = String(uri || "").match(/^gs:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : "";
}

function buildCanonicalDialogueVideoStoragePath(job = {}, input = {}, mimeType = "video/mp4") {
  const rowId = cleanId(input?.rowId || "row_unknown");
  const extension = String(mimeType || "").toLowerCase().includes("webm") ? "webm" : "mp4";
  return `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/videos/${rowId}/${job.jobId}.${extension}`;
}

function normalizeOwnedReferencePath(value = "", job = {}) {
  let path = String(value || "").trim();
  if (!path) return "";
  if (path.startsWith("gs://")) path = gsPath(path);
  if (!path || path.includes("..") || path.startsWith("/")) return "";
  const sessionPrefix = `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/`;
  if (path.startsWith(sessionPrefix) || path.startsWith("podcaster/library/")) return path;
  return "";
}

async function loadVertexReferenceImage(bucket, value = null, job = {}) {
  const record = value && typeof value === "object" ? value : {};
  const storagePath = normalizeOwnedReferencePath(record.storagePath || record.path || "", job);
  if (!storagePath) return null;
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata().catch(() => [null]);
  const mimeType = String(metadata?.contentType || record.mimeType || "").trim().toLowerCase();
  const size = Math.max(0, Number(metadata?.size || 0) || 0);
  if (!mimeType.startsWith("image/") || size > 12 * 1024 * 1024) return null;
  return {
    gcsUri: `gs://${bucket.name}/${storagePath}`,
    mimeType,
    storagePath
  };
}

async function resolveVertexVideoReferences(bucket, input = {}, job = {}) {
  const sceneRecords = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 3) : [];
  if (input.referenceImage && typeof input.referenceImage === "object") sceneRecords.unshift(input.referenceImage);
  const sceneImages = [];
  for (const record of sceneRecords) {
    const image = await loadVertexReferenceImage(bucket, record, job);
    if (image && !sceneImages.some((item) => item.storagePath === image.storagePath)) sceneImages.push(image);
  }
  const portrait = await loadVertexReferenceImage(bucket, {
    storagePath: input.portraitStoragePath,
    mimeType: input.portraitMimeType || "image/png"
  }, job);
  const strictIdentity = input.strictIdentity === true && Boolean(portrait);
  if (sceneImages.length === 1 && !strictIdentity) {
    return { firstFrame: sceneImages[0], referenceImages: [], mode: "first_frame" };
  }
  const references = [
    ...(strictIdentity && portrait ? [portrait] : []),
    ...sceneImages
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.storagePath === item.storagePath) === index).slice(0, 3);
  return {
    firstFrame: null,
    referenceImages: references,
    mode: references.length ? "references" : "none"
  };
}

async function processVideoJob(job, ref) {
  const { bucket, db, admin } = getAdminServices();
  const client = createVertexClient({ location: job.videoOperation?.region || REGION, httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } } });
  const input = job.input || {};
  const references = job.videoOperation?.name
    ? { mode: job.videoOperation.referenceMode, firstFrame: null, referenceImages: [] }
    : await resolveVertexVideoReferences(bucket, input, job);
  const videoModel = normalizeVeoModel(job.model, DEFAULT_VEO_MODEL);
  const promptSpec = job.videoOperation?.promptSpec || buildDialogueVideoPrompt(input, {
    hasReferenceImage: Boolean(references.firstFrame || references.referenceImages.length),
    referenceMode: references.mode
  });
  const outputPrefix = `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/generated/dialogue-video/${job.jobId}/`;
  const config = {
    numberOfVideos: 1,
    durationSeconds: promptSpec.durationSeconds,
    aspectRatio: promptSpec.aspectRatio,
    resolution: "720p",
    generateAudio: promptSpec.generateAudio,
    outputGcsUri: `gs://${bucket.name}/${outputPrefix}`
  };
  if (/^veo-2\.0-/.test(videoModel)) {
    delete config.resolution;
    delete config.generateAudio;
  }
  const supportsAssetReferences = /^veo-3\.1-(?:fast-)?generate-001$/.test(videoModel);
  if (references.referenceImages.length && supportsAssetReferences) {
    config.referenceImages = references.referenceImages.map((image) => ({
      image: { gcsUri: image.gcsUri, mimeType: image.mimeType },
      referenceType: "ASSET"
    }));
  }
  let operation;
  const saved = job.videoOperation;
  if (saved?.name) {
    if (Date.now() >= saved.deadlineAt) {
      throw Object.assign(new Error('Vertex AI excedió el tiempo máximo de generación.'),
        { code: 'vertex_video_timeout', status: 504, retryable: false });
    }
    // A successor exists before polling: a worker crash cannot abandon this operation.
    await scheduleOperationPoll(job, ref, admin, { releaseLease: false });
    const resumedOperation = new GenerateVideosOperation();
    resumedOperation.name = saved.name;
    operation = await client.operations.getVideosOperation({ operation: resumedOperation });
  } else {
    // A crash after submission may have incurred a provider charge. Never submit again blindly.
    const submission = await db.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data();
      if (current?.status === 'cancelled') throw Object.assign(Error('ai_job_cancelled'), { code: 'ai_job_cancelled' });
      if (current?.status === 'ready') return { terminal: true };
      if (current?.videoOperation?.name) return { saved: current.videoOperation };
      if (current?.videoSubmissionStartedAt) throw Object.assign(Error('El proveedor pudo aceptar la generación, pero no se guardó su operación. Requiere revisión.'), { code: 'vertex_video_submission_uncertain', retryable: false });
      transaction.set(ref, { videoSubmissionStartedAt: Date.now() }, { merge: true });
      return { reserved: true };
    });
    if (submission.terminal) return;
    if (submission.saved) return processVideoJob({ ...job, videoOperation: submission.saved }, ref);
    try {
      operation = await client.models.generateVideos({
        model: videoModel,
        source: { prompt: promptSpec.prompt, ...(references.firstFrame ? {
          image: { gcsUri: references.firstFrame.gcsUri, mimeType: references.firstFrame.mimeType }
        } : {}) }, config
      });
    } catch (error) {
      // Even a transport failure can occur after the request reached the provider.
      error.retryable = false;
      throw error;
    }
    if (!operation?.name) {
      throw Object.assign(new Error('La generación no devolvió un identificador de operación.'),
        { code: 'vertex_video_submission_uncertain', retryable: false });
    }
    await ref.set({ leaseUntil: admin.firestore.Timestamp.fromMillis(0), videoOperation: { name: operation.name, model: videoModel, region: REGION,
      deadlineAt: Date.now() + VERTEX_VIDEO_OPERATION_DEADLINE_MS,
      promptSpec, referenceMode: references.mode } }, { merge: true });
  }
  if (!operation.done) {
    await scheduleOperationPoll(job, ref, admin);
    return { pending: true };
  }
  if (operation.error) throw createVertexVideoOperationError(operation.error);
  const outcome = extractVertexVideoOutcome(operation);
  const video = outcome.video;
  let storagePath = gsPath(video?.uri || video?.gcsUri || video?.gcs_uri);
  const videoBytes = video?.videoBytes || video?.video_bytes || "";
  if (!storagePath && videoBytes) {
    storagePath = `${outputPrefix}video.mp4`;
    await bucket.file(storagePath).save(Buffer.from(videoBytes, "base64"), { resumable: false, metadata: { contentType: video.mimeType || video?.mime_type || "video/mp4" } });
  }
  if (!storagePath) throw createVertexVideoEmptyError(operation);
  if (String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
  const sourceStoragePath = storagePath;
  const canonicalStoragePath = buildCanonicalDialogueVideoStoragePath(job, input, video?.mimeType || "video/mp4");
  let videoFile = bucket.file(sourceStoragePath);
  if (sourceStoragePath !== canonicalStoragePath) {
    const [sourceExists] = await videoFile.exists();
    if (sourceExists) await videoFile.copy(bucket.file(canonicalStoragePath));
    else {
      const [canonicalExists] = await bucket.file(canonicalStoragePath).exists();
      if (!canonicalExists) throw Object.assign(new Error("video_output_missing"), { retryable: false });
    }
    videoFile = bucket.file(canonicalStoragePath);
    storagePath = canonicalStoragePath;
  }
  const [videoMetadata] = await videoFile.getMetadata();
  const videoToken = String(videoMetadata?.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID());
  await videoFile.setMetadata({
    contentType: String(video?.mimeType || videoMetadata?.contentType || "video/mp4"),
    metadata: {
      ...(videoMetadata?.metadata || {}),
      firebaseStorageDownloadTokens: videoToken,
      jobId: String(job.jobId || ""),
      rowId: String(input.rowId || ""),
      sessionId: String(job.sessionId || ""),
      ownerId: String(job.ownerId || ""),
      sourceType: "generated"
    }
  });
  if (sourceStoragePath !== storagePath) {
    await bucket.file(sourceStoragePath).delete({ ignoreNotFound: true }).catch(() => {});
  }
  const dialogueVideo = {
    rowId: String(input.rowId || ""),
    downloadUrl: tokenDownloadUrl(bucket.name, storagePath, videoToken),
    storagePath,
    mimeType: String(video?.mimeType || "video/mp4"),
    durationSec: promptSpec.durationSeconds,
    model: normalizeModel(job.model, DEFAULT_VEO_MODEL),
    promptVersion: promptSpec.promptVersion,
    referenceMode: references.mode,
    updatedAt: new Date().toISOString()
  };
  const application = await commitGeneratedSceneMedia(job, dialogueVideo, ref);
  if (application.reason === "cancelled") return;
  await ref.set({ status: "ready", stage: "ready", progress: 1, hint: application.status === "applied" ? "Escena reemplazada." : "Video creado. Disponible para aplicar en la biblioteca.", result: { dialogueVideo: application.clip || dialogueVideo, application: { status: application.status, reason: application.reason || "" } }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function commitGeneratedSceneMedia(job, clip, jobRef) {
  const { db, admin } = getAdminServices();
  const context = job.input?.selectionContext;
  // Old queued jobs without a captured revision must never overwrite a newer selection.
  if (!context) return { status: "superseded", reason: "missing-selection-context", clip };
  const sessionRef = db.collection("podcaster_sessions").doc(job.sessionId);
  try {
    return await db.runTransaction(async transaction => {
      const [snapshot, jobSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(jobRef)]);
      if (jobSnapshot.data()?.status === "cancelled") return { status: "superseded", reason: "cancelled", clip };
      if (!snapshot.exists) return { status: "superseded", reason: "session-removed", clip };
      const outcome = mediaState.selectSceneMedia({ ...snapshot.data().session, id: job.sessionId }, context.rowId, clip, context);
      if (outcome.status === "applied" && !outcome.unchanged) transaction.update(sessionRef, {
        session: outcome.session, sessionUpdatedAt: outcome.session.updatedAt, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { status: outcome.status, reason: outcome.reason || "", clip: outcome.status === "applied" ? outcome.clip : clip };
    });
  } catch (error) {
    // The file already exists. Persist a retriable application result, without charging for generation again.
    return { status: "error", reason: String(error.message || error), clip };
  }
}

function extractAudioParts(response) {
  const parts = [];
  for (const candidate of Array.isArray(response?.candidates) ? response.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      const data = String(part?.inlineData?.data || part?.inline_data?.data || "").trim();
      const mimeType = String(part?.inlineData?.mimeType || part?.inline_data?.mime_type || "").trim();
      if (data && mimeType.toLowerCase().startsWith("audio/")) parts.push({ data, mimeType });
    }
  }
  return parts;
}

function extractInteractionAudio(value, parts = []) {
  if (Array.isArray(value)) {
    for (const item of value) extractInteractionAudio(item, parts);
    return parts;
  }
  if (!value || typeof value !== "object") return parts;
  const data = String(value.data || "").trim();
  const mimeType = String(value.mime_type || value.mimeType || "").trim();
  if (data && (String(value.type || "").toLowerCase() === "audio" || mimeType.toLowerCase().startsWith("audio/"))) {
    parts.push({ data, mimeType: mimeType || "audio/mpeg" });
    return parts;
  }
  for (const child of Object.values(value)) extractInteractionAudio(child, parts);
  return parts;
}

function buildLyriaInteractionRequest({ model, prompt }) {
  return {
    url: `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/global/interactions`,
    method: "POST",
    data: {
      model: String(model || "lyria-3-clip-preview"),
      input: [{ type: "text", text: String(prompt || "") }]
    }
  };
}

function isMusicPolicyBlock(error) {
  const status = Number(error?.status || error?.response?.status || error?.code || 0);
  const details = [error?.message, error?.response?.data?.error?.message, error?.response?.data?.error?.status]
    .filter(Boolean).join(" ").toLowerCase();
  return status === 400 && /blocked|policy|prohibited|sensitive|safety|modify your input/.test(details);
}

function buildPolicySafeMusicPrompt(prompt = "") {
  const source = String(prompt || "").replace(/\r/g, "");
  const structural = source.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:create (?:a |an )?|genre and blend:|\d{2,3}\s*bpm\b|key:|instrumental only|song with vocals in)/i.test(line))
    .slice(0, 8);
  const instruments = ["trumpet", "piano", "guitar", "bass", "drums", "violin", "cello", "saxophone", "flute", "synthesizer", "marimba", "percussion"]
    .filter((name) => new RegExp(`\\b${name}\\b`, "i").test(source));
  return [
    "Create an original polished musical piece from a nonverbal melodic idea. Use a clear recurring melodic contour and rhythmic motif. Do not include copyrighted melodies or imitate a real performer.",
    instruments.length ? `Featured instruments: ${instruments.join(", ")}.` : "Use an original balanced instrumental arrangement.",
    ...structural
  ].join("\n").slice(0, 5000);
}

async function generateLyriaMusic({ model, prompt }) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  try {
    const response = await client.request(buildLyriaInteractionRequest({ model, prompt }));
    return extractInteractionAudio(response?.data);
  } catch (error) {
    if (!isMusicPolicyBlock(error)) throw error;
    try {
      const retry = await client.request(buildLyriaInteractionRequest({ model, prompt: buildPolicySafeMusicPrompt(prompt) }));
      return extractInteractionAudio(retry?.data);
    } catch (retryError) {
      if (!isMusicPolicyBlock(retryError)) throw retryError;
      retryError.code = "music_prompt_blocked";
      retryError.message = "No se pudo generar esta versión. La grabación y el brief siguen disponibles para intentarlo de nuevo.";
      throw retryError;
    }
  }
}

function pcm16ToWav(buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(buffer.length, 40);
  return Buffer.concat([header, buffer]);
}

function parseMusicalFingerprint(raw = "") {
  try {
    const clean = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(clean);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) { return null; }
}

const HUMMING_ANALYSIS_PROMPT = "Analyze this audio as a musical reference. It may contain humming, whistling, beatboxing, clicks, buzzing, breath sounds or another mouth-made sound rather than speech. Preserve its pitch contour, repeated motifs, rhythm, articulation, timbre envelope, estimated tempo, key or mode and phrase structure. Translate those traits into a concise English prompt for an original song or instrumental performance. When a target instrument is requested, make that instrument perform the recorded gesture recognizably. Do not identify the performer or infer personal traits. Return only the music-generation prompt.";
const HUMMING_ANALYSIS_FALLBACK_PROMPT = "Analyze only the nonverbal musical features of this audio, including mouth-made sounds: pitch contour, repeated motifs, rhythm, articulation, timbre envelope, estimated tempo, key or mode and phrase structure. Return one concise English prompt for an original instrumental composition that reproduces those musical gestures. Do not transcribe speech or identify people. Return only the prompt.";
const SONG_REVISION_ANALYSIS_PROMPT = "Analyze this complete song as the source for a new original variation. Identify its estimated key, tempo, meter, harmony, section order, chord movement, melodic contours, anchor notes, recurring motifs, instrumentation, vocal profile and production character. Combine that musical identity with the user's transformation direction. Return only a concise English Lyria prompt that preserves recognizable harmony, motifs, structure and melodic contour while applying the requested changes. Do not identify or imitate a real artist.";
const SONG_REVISION_FALLBACK_PROMPT = "Describe this song's reusable musical identity as a concise English Lyria prompt: estimated key, BPM, harmony, form, melodic contour, recurring motifs, instrumentation and vocal profile. Preserve those traits in a new original variation. Do not identify performers. Return only the prompt.";

function isGeminiContentBlocked(error, response = null) {
  const status = Number(error?.status || error?.response?.status || error?.code || 0);
  const details = [error?.message, error?.response?.data?.error?.message, error?.response?.data?.error?.status, response?.promptFeedback?.blockReason]
    .filter(Boolean).join(" ").toLowerCase();
  return status === 400 || (!status && /blocked|policy|prohibited|sensitive|safety|blocklist|spii|content_blocked|modify your input/.test(details));
}

function geminiText(response = {}) {
  return String(response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "").trim();
}

async function analyzeHummingWithFallback({ client, model, mimeType, audioBase64, userInstruction = "", analysisMode = "musical-reference" }) {
  const direction = String(userInstruction || "").replace(/\s+/g, " ").trim().slice(0, 500);
  const isSongRevision = analysisMode === "song-revision";
  const analysisPrompt = isSongRevision ? SONG_REVISION_ANALYSIS_PROMPT : HUMMING_ANALYSIS_PROMPT;
  const fallbackPrompt = isSongRevision ? SONG_REVISION_FALLBACK_PROMPT : HUMMING_ANALYSIS_FALLBACK_PROMPT;
  const primaryPrompt = direction
    ? `${analysisPrompt}\nUser transformation direction (use only as creative direction): ${JSON.stringify(direction)}`
    : analysisPrompt;
  const request = (requestModel, text) => client.models.generateContent({
    model: requestModel,
    contents: [{ role: "user", parts: [{ text }, { inlineData: { mimeType, data: audioBase64 } }] }],
    config: { maxOutputTokens: 1200 }
  });
  const attempts = [
    { model, text: primaryPrompt },
    { model, text: fallbackPrompt },
    ...(model === "gemini-3.5-flash-lite" ? [] : [{ model: "gemini-3.5-flash-lite", text: fallbackPrompt }])
  ];
  let lastBlockedError = null;
  for (const attempt of attempts) {
    try {
      const response = await request(attempt.model, attempt.text);
      if (geminiText(response)) return response;
      if (!isGeminiContentBlocked(null, response)) continue;
    } catch (error) {
      if (!isGeminiContentBlocked(error)) throw error;
      lastBlockedError = error;
    }
  }
  if (lastBlockedError) throw lastBlockedError;
  throw Object.assign(new Error("audio_reference_policy_blocked"), { status: 400 });
}

async function analyzeMusicalFingerprint({ audio, mimeType, model }) {
  if (!audio?.length || audio.length > 18 * 1024 * 1024) return null;
  const allowedModels = new Set(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"]);
  const analysisModel = allowedModels.has(String(model || "")) ? String(model) : "gemini-3.8-flash";
  const client = createVertexClient({ location: "global" });
  const response = await client.models.generateContent({
    model: analysisModel,
    contents: [{ role: "user", parts: [
      { text: "Analyze this generated song as a reusable musical identity. Return JSON only with: key, bpm, timeSignature, overallHarmony, sections (array with name, timeRange, chordProgression, scaleMode, melodicContour, anchorNotes, rhythm), instrumentation, vocalProfile, recurringMotifs, productionFingerprint, reusePrompt. Estimate anchor notes and chords conservatively; use empty strings when uncertain. The reusePrompt must instruct a music model to preserve harmony, recurring motifs, section structure, tempo, key and melodic contour while allowing a different genre and arrangement." },
      { inlineData: { mimeType, data: audio.toString("base64") } }
    ] }],
    config: { maxOutputTokens: 3000, responseMimeType: "application/json" }
  });
  return parseMusicalFingerprint(response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
}

function buildDialogueTtsDeliveryInstruction(input = {}) {
  const direction = input.ttsDirection || input.ttsDirectionConfig || {};
  return [
    direction.stylePrompt && `Delivery style: ${String(direction.stylePrompt).slice(0, 260)}.`,
    direction.pacingPrompt && `Pace and pauses: ${String(direction.pacingPrompt).slice(0, 180)}.`,
    direction.accentPrompt && `Accent and pronunciation: ${String(direction.accentPrompt).slice(0, 180)}.`
  ].filter(Boolean).join(" ");
}

function registerGeminiTtsPreviewRoute(app) {
  app.post("/api/podcaster/tts/preview", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const voiceName = normalizeTtsVoiceName(input.voiceName || "Kore");
    const speech = resolveTtsSpeechLocale(input.speechLocale || "es-MX");
    const expression = String(input.expression || "Natural").trim().slice(0, 80) || "Natural";
    const direction = input.ttsDirection && typeof input.ttsDirection === "object" ? input.ttsDirection : {};
    const style = [
      speech.instruction,
      String(input.localeInstruction || "").trim().slice(0, 220),
      `Expresión: ${expression}.`,
      String(direction.stylePrompt || "").trim().slice(0, 260),
      String(direction.pacingPrompt || "").trim().slice(0, 180),
      String(direction.accentPrompt || "").trim().slice(0, 180)
    ].filter(Boolean).join(" ").slice(0, 900);
    const sampleText = "Hola, esta es una breve muestra de la voz seleccionada.";
    let audioParts = [];

    if (/^voice_[A-Za-z0-9_-]+$/.test(voiceName)) {
      const { db } = getAdminServices();
      const voiceSnapshot = await db.collection("schroeder_voice_profiles").doc(voiceName).get();
      if (!voiceSnapshot.exists || String(voiceSnapshot.data()?.ownerId || "") !== authContext.uid) {
        throw Object.assign(new Error("La voz personalizada no pertenece a esta cuenta."), { status: 403 });
      }
      const apiKey = String(process.env.GEMINI_FREE_TIER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
      if (!apiKey) throw Object.assign(new Error("La vista previa de voces personalizadas no está disponible."), { status: 503 });
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: "gemini-3.8-flash-tts",
          input: [{ type: "user_input", content: [{
            type: "text",
            text: sampleText,
            annotations: [{ type: "speech_metadata", style }]
          }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: voiceName }] }
        })
      });
      const response = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        throw Object.assign(new Error(String(response?.error?.message || "Gemini no pudo generar la muestra.")), { status: Number(upstream.status || 502) });
      }
      audioParts = extractInteractionAudio(response);
    } else {
      const client = createVertexClient({ location: "global" });
      const response = await client.models.generateContent({
        model: "gemini-3.8-flash-tts",
        contents: [{
          role: "user",
          parts: [{ text: sampleText, speechMetadata: { speaker: "Narrador", style } }]
        }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            languageCode: speech.languageCode,
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
          }
        }
      });
      audioParts = extractAudioParts(response);
    }

    const audio = audioParts[0];
    if (!audio?.data) throw Object.assign(new Error("Gemini no devolvió audio de muestra."), { status: 502 });
    const mimeType = String(audio.mimeType || "audio/wav");
    const audioData = Buffer.from(audio.data, "base64");
    const isPcm = /audio\/(?:l16|pcm)/i.test(mimeType);
    const outputData = isPcm
      ? pcm16ToWav(audioData, Number(mimeType.match(/rate=(\d+)/i)?.[1] || 24000)).toString("base64")
      : audio.data;
    return res.status(200).json({
      audio: { data: outputData, mimeType: isPcm ? "audio/wav" : mimeType.split(";")[0] },
      voiceName,
      speechLocale: speech.speechLocale
    });
  }));
}

async function processAudioJob(job, ref) {
  const { bucket, admin } = getAdminServices();
  const input = job.input || {};
  const isMusic = job.type === "music";
  const voiceSampleAudio = String(input.voiceSampleAudio || input.replicatedVoiceConfig?.voiceSampleAudio || "").replace(/\s+/g, "");
  const isReplicatedVoice = !isMusic && Boolean(voiceSampleAudio);
  const voiceName = isMusic ? "" : (isReplicatedVoice ? "replicated" : normalizeTtsVoiceName(input.voiceName || "Aoede"));
  const speech = isMusic ? null : resolveTtsSpeechLocale(input.speechLocale || input.languageCode || "es-MX");
  const customVoice = !isMusic && /^voice_[A-Za-z0-9_-]+$/.test(voiceName);
  const isSoundLab = String(input.workspaceType || "").trim() === "schroeder-sound-lab";
  const prompt = isMusic
    ? (isSoundLab
      ? String(input.prompt || "Create an original song.").slice(0, 12000)
      : `Create a polished, loop-friendly instrumental podcast music clip. No speech or lyrics. Direction: ${String(input.prompt || input.preset || "warm ambient editorial underscore").slice(0, 3000)}`)
    : String(input.text || input.targetSpeechLine || "").slice(0, 8000);
  if (!isMusic && !String(input.text || input.targetSpeechLine || "").trim()) throw Object.assign(new Error("dialogue_text_required"), { status: 400 });
  let audioParts;
  if (isMusic) {
    audioParts = await generateLyriaMusic({ model: job.model, prompt });
  } else if (isReplicatedVoice) {
    const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) throw Object.assign(new Error("gemini_service_unavailable"), { status: 503 });
    const ttsModel = String(job.model || "gemini-3.8-flash-tts");
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              replicatedVoiceConfig: {
                voiceSampleAudio
              }
            }
          }
        }
      })
    });
    const response = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      throw Object.assign(new Error(String(response?.error?.message || "replicated_voice_generation_failed")), { status: Number(upstream.status || 502) });
    }
    audioParts = extractAudioParts(response);
  } else if (customVoice) {
    const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) throw Object.assign(new Error("custom_voice_service_unavailable"), { status: 503 });
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model: String(job.model),
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text: prompt,
            annotations: [{ type: "speech_metadata", style: String(input.style || "natural and clear").slice(0, 240) }]
          }]
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: voiceName }] }
      })
    });
    const response = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      throw Object.assign(new Error(String(response?.error?.message || "custom_voice_generation_failed")), { status: Number(upstream.status || 502) });
    }
    audioParts = extractInteractionAudio(response);
  } else {
    const client = createVertexClient({ location: "global" });
    const delivery = buildDialogueTtsDeliveryInstruction(input);
    const response = await client.models.generateContent({
      model: String(job.model),
      contents: job.type === "speech"
        ? [{
          role: "user",
          parts: [{
            text: prompt,
            speechMetadata: {
              speaker: String(input.speakerName || input.speakerLabel || "Voz").slice(0, 80),
              style: String(input.style || "natural and clear").slice(0, 240)
            }
          }]
        }]
        : `${speech.instruction} ${delivery} Read the following transcript naturally and clearly as ${String(input.speakerName || input.speakerLabel || "the speaker")}. Read only the transcript, preserve its exact wording and do not add commentary. Transcript: ${prompt}`,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode: speech.languageCode,
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    });
    audioParts = extractAudioParts(response);
  }
  if (!audioParts.length) throw new Error("vertex_audio_empty");
  const firstMime = audioParts[0].mimeType || "audio/L16;rate=24000";
  const raw = Buffer.concat(audioParts.map((part) => Buffer.from(part.data, "base64")));
  const pcm = /audio\/(?:l16|pcm)/i.test(firstMime);
  const sampleRate = Number(firstMime.match(/rate=(\d+)/i)?.[1] || 24000);
  const output = pcm ? pcm16ToWav(raw, sampleRate) : raw;
  const mimeType = pcm ? "audio/wav" : firstMime.split(";")[0];
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "mp3";
  const label = isMusic ? "music" : `${String(input.rowId || "row")}-${String(input.speakerLabel || "speaker")}`;
  const folder = isMusic ? "music" : "audio";
  const storagePath = isSoundLab
    ? `schroeder-sound-lab/previews/${storageSegment(job.ownerId, "user")}/${storageSegment(job.sessionId, "session")}/${folder}/${storageSegment(label)}-${job.jobId}.${ext}`
    : `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/${folder}/${label}-${job.jobId}.${ext}`;
  const downloadToken = crypto.randomUUID();
  await bucket.file(storagePath).save(output, {
    resumable: false,
    metadata: {
      contentType: mimeType,
      metadata: {
        jobId: job.jobId,
        ownerId: job.ownerId,
        sessionId: job.sessionId,
        type: job.type,
        kind: isMusic ? "music" : "voice",
        format: isMusic ? "song" : String(input.format || "phrase"),
        model: String(job.model || ""),
        createdAt: String(job.createdAt || new Date().toISOString()),
        firebaseStorageDownloadTokens: downloadToken,
        approvalState: isSoundLab ? "preview" : "",
        expiresAt: ""
      }
    }
  });
  if (String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
  const media = {
    mimeType,
    size: output.length,
    durationSec: pcm ? raw.length / (sampleRate * 2) : 0,
    sourceType: "generated",
    storagePath,
    downloadUrl: tokenDownloadUrl(bucket.name, storagePath, downloadToken),
    updatedAt: new Date().toISOString(),
    model: String(job.model)
  };
  const musicalFingerprint = isMusic
    ? await analyzeMusicalFingerprint({ audio: output, mimeType, model: input.agentModel }).catch(() => null)
    : null;
  const result = isMusic
    ? { track: { ...media, name: "AI Music", durationSec: 0, prompt: String(input.prompt || ""), musicalFingerprint } }
    : { dialogueAudio: { ...media, rowId: String(input.rowId || ""), speaker: String(input.speakerLabel || input.speaker || ""), voiceName, speechLocale: speech.speechLocale, languageCode: speech.languageCode, promptVersion: "podcaster_vertex_tts_v2", targetSpeechLine: String(input.targetSpeechLine || input.text || ""), playbackRate: 1, wordTimings: [] } };
  if (job.type === "dialogue_audio") {
    const application = await commitGeneratedSceneMedia(job, result.dialogueAudio, ref);
    result.dialogueAudio = application.clip || result.dialogueAudio;
    if (application.reason === "cancelled") return;
    result.application = { status: application.status, reason: application.reason || "" };
  }
  await ref.set({ status: "ready", stage: "ready", progress: 1, hint: isMusic ? "Música lista." : "Audio listo.", result, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function dispatchAiJob(jobId, pollSequence = null) {
  const { db, admin } = getAdminServices();
  const ref = db.collection(AI_JOB_COLLECTION).doc(cleanId(jobId));
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (pollSequence !== null && job.videoPoll?.sequence !== pollSequence) return null;
    if (["ready", "cancelled"].includes(String(job.status || ""))) return null;
    if (job.status === "error" && job.retryable === false) return null;
    const leaseMs = job.leaseUntil?.toMillis?.() || 0;
    if (job.status === "running" && leaseMs > Date.now()) {
      if (job.type === 'dialogue_video') throw Object.assign(new Error('video_worker_lease_active'), { status: 409 });
      return null;
    }
    if (pollSequence !== null) transaction.update(ref, { "videoPoll.dueAt": 0, "videoPoll.enqueued": false });
    transaction.set(ref, { status: "running", stage: "starting", progress: 0.04, hint: job.type === "music" ? "Componiendo en segundo plano." : ["dialogue_audio", "speech"].includes(job.type) ? "Creando audio en segundo plano." : "Iniciando generación.", attempt: Number(job.attempt || 0) + 1, leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + (job.type === "dialogue_video" ? 2 : 35) * 60 * 1000), heartbeatAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return job;
  });
  if (!claimed) return { duplicate: true };
  try {
    if (claimed.type === "dialogue_video") {
      const outcome = await processVideoJob(claimed, ref);
      if (outcome?.pending) return outcome;
    }
    else if (["dialogue_audio", "speech", "music"].includes(claimed.type)) await processAudioJob(claimed, ref);
    else await processImageJob(claimed, ref);
    return { completed: true };
  } catch (error) {
    if (String(error?.code || error?.message || "") === "ai_job_cancelled") return { cancelled: true };
    const jobError = claimed.type === "dialogue_video"
      ? normalizeVertexVideoError(error)
      : error;
    const retryable = isRetryableAiJobError(jobError);
    if (claimed.type === "dialogue_video" && retryable) await ref.set({ leaseUntil: admin.firestore.Timestamp.fromMillis(0) }, { merge: true });
    const promptBlocked = ["vertex_video_prompt_blocked", "vertex_video_content_filtered", "music_prompt_blocked"].includes(jobError?.code);
    await ref.set({
      status: "error",
      stage: promptBlocked ? "blocked" : "error",
      retryable,
      hint: jobError?.code === "vertex_video_content_filtered"
        ? "Google filtró la referencia o el resultado. Prueba otra imagen o genera sin referencia."
        : (promptBlocked ? "El contenido fue bloqueado. Reformúlalo e intenta de nuevo." : "No se pudo completar el trabajo."),
      error: {
        code: String(jobError?.code || jobError?.message || "ai_job_failed").slice(0, 160),
        message: String(jobError?.message || jobError).slice(0, 600),
        ...(Number.isFinite(jobError?.providerCode) ? { providerCode: jobError.providerCode } : {}),
        ...(Array.isArray(jobError?.providerReasons) && jobError.providerReasons.length
          ? { providerReasons: jobError.providerReasons.slice(0, 5) }
          : {}),
        ...(Number.isFinite(jobError?.filteredCount) ? { filteredCount: jobError.filteredCount } : {})
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if (!retryable) return { failed: true, retryable: false };
    throw error;
  }
}

function registerVeoRoutes(app) {
  const create = (type) => asyncRoute(async (req, res) => {
    const job = await createAiJob(req, type);
    res.status(202).json(publicAiJob(job));
  });
  app.post("/api/podcaster/speaker-portraits/generate", create("speaker_portrait"));
  app.post("/api/podcaster/scenario-images/generate", create("scenario_image"));
  app.post("/api/podcaster/dialogue-videos/generate", create("dialogue_video"));
  app.post("/api/podcaster/dialogue-videos/generate-sync", create("dialogue_video"));
  app.get("/api/podcaster/dialogue-videos/generate-status", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(AI_JOB_COLLECTION).doc(cleanId(req.query?.jobId || "")).get();
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("ai_job_forbidden"), { status: 403 });
    res.status(200).json(publicAiJob(job));
  }));
  app.post("/api/podcaster/dialogue-videos/cancel", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db, admin } = getAdminServices();
    const ref = db.collection(AI_JOB_COLLECTION).doc(cleanId(req.body?.jobId || ""));
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("ai_job_forbidden"), { status: 403 });
    if (!['ready', 'error'].includes(String(job.status || ''))) await ref.set({ status: "cancelled", stage: "cancelled", hint: "Generación cancelada.", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).json(publicAiJob((await ref.get()).data() || {}));
  }));

  // El video generado en la GPU local del equipo no consume cuota remota; este endpoint
  // solo registra el ahorro diario (videoSessions) y nunca reclama minutos de Veo.
  app.post("/api/podcaster/local-video/accounting", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const sessionId = String(req.body?.sessionId || "").trim().slice(0, 140);
    if (!sessionId) throw Object.assign(new Error("Falta sessionId."), { status: 400 });
    const snapshot = await db.collection("podcaster_sessions").doc(cleanId(sessionId)).get();
    if (!snapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
    if (String(snapshot.data()?.ownerId || "") !== authContext.uid) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    const savings = require("./savings-policy.js");
    const policy = await savings.getPolicy(db);
    let recorded = true;
    try {
      await savings.claimDaily(db, authContext.uid, "videoSessions", sessionId, policy.limits.videoSessions);
    } catch (error) {
      if (Number(error?.status) === 429) recorded = false;
      else throw error;
    }
    res.status(200).json({ ok: true, recorded, generator: "local" });
  }));
}

function registerAiJobStatusRoute(app) {
  app.get(["/api/podcaster/jobs/:jobId", "/api/schroeder/jobs/:jobId"], asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(AI_JOB_COLLECTION).doc(cleanId(req.params.jobId)).get();
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("ai_job_forbidden"), { status: 403 });
    res.status(200).json(publicAiJob(job));
  }));
  app.post("/api/schroeder/jobs/:jobId/cancel", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db, admin, bucket } = getAdminServices();
    const ref = db.collection(AI_JOB_COLLECTION).doc(cleanId(req.params.jobId));
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("ai_job_forbidden"), { status: 403 });
    const paths = [job.result?.track?.storagePath, job.result?.dialogueAudio?.storagePath]
      .map((value) => String(value || "").trim())
      .filter((value) => value.startsWith(`schroeder-sound-lab/previews/${storageSegment(authContext.uid, "user")}/`));
    await Promise.all(paths.map((storagePath) => bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {})));
    await ref.set({ status: "cancelled", stage: "cancelled", progress: 0, hint: "Generación cancelada.", result: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).json(publicAiJob((await ref.get()).data() || {}));
  }));
}

function soundLabTrack(bucket, file, metadata = {}) {
  const custom = metadata.metadata || {};
  const token = String(custom.firebaseStorageDownloadTokens || "").trim();
  return {
    id: String(custom.audioId || file.name.split("/").pop()?.replace(/\.[^.]+$/, "") || "audio"),
    title: String(custom.title || "Audio aprobado"),
    kind: String(custom.kind || "music"),
    format: String(custom.format || "song"),
    mimeType: String(metadata.contentType || "audio/mpeg"),
    size: Number(metadata.size || 0),
    model: String(custom.model || ""),
    sessionId: String(custom.sessionId || ""),
    createdAt: String(custom.createdAt || metadata.timeCreated || ""),
    approvedAt: String(custom.approvedAt || metadata.updated || metadata.timeCreated || ""),
    durationSec: Math.max(0, Number(custom.durationSec || 0) || 0),
    prompt: String(custom.prompt || ""),
    genre: String(custom.genre || ""),
    bpm: Number(custom.bpm || 0) || 0,
    key: String(custom.key || ""),
    podcasterLibraryId: String(custom.podcasterLibraryId || ""),
    storagePath: file.name,
    downloadUrl: tokenDownloadUrl(bucket.name, file.name, token)
  };
}

async function assertSoundLabAdmin(authContext, db) {
  if (authContext?.token?.admin === true || String(authContext?.role || "").toLowerCase() === "admin") return;
  if (await hasAdminRoleWithProfile(authContext, db)) return;
  throw Object.assign(new Error("schroeder_admin_required"), { status: 403 });
}

async function cleanupExpiredSoundLabPreviews(bucket, ownerId) {
  const prefix = `schroeder-sound-lab/previews/${storageSegment(ownerId, "user")}/`;
  const [files] = await bucket.getFiles({ prefix, maxResults: 250 }).catch(() => [[]]);
  await Promise.all(files.map(async (file) => {
    const [metadata] = await file.getMetadata().catch(() => [{}]);
    const expiresAt = Date.parse(String(metadata?.metadata?.expiresAt || ""));
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) await file.delete({ ignoreNotFound: true }).catch(() => {});
  }));
}

function registerSoundLabStorageRoutes(app) {
  app.post("/api/schroeder/voices/replicate", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) throw Object.assign(new Error("custom_voice_service_unavailable"), { status: 503 });
    if (req.body?.adultOwnershipConfirmed !== true) {
      throw Object.assign(new Error("voice_ownership_confirmation_required"), { status: 400 });
    }
    const normalizeAudio = (input, code) => {
      const mimeType = String(input?.mimeType || "audio/wav").trim().toLowerCase().split(";")[0].slice(0, 80);
      const data = String(input?.data || "").replace(/\s+/g, "");
      const bytes = Buffer.byteLength(data, "base64");
      const allowed = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/webm"]);
      if (!allowed.has(mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || !bytes || bytes > 3 * 1024 * 1024) {
        throw Object.assign(new Error(code), { status: 400 });
      }
      return { mime_type: mimeType, data };
    };
    const displayName = String(req.body?.displayName || "Mi voz").replace(/\s+/g, " ").trim().slice(0, 80) || "Mi voz";
    const languageCode = String(req.body?.languageCode || "es-US").trim().slice(0, 16) || "es-US";
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        store: true,
        voice: {
          model: "gemini-3.8-flash-tts",
          type: "replicated",
          display_name: displayName,
          language_code: languageCode,
          replicated: {
            source_audio: normalizeAudio(req.body?.sourceAudio, "voice_source_invalid"),
            consent_audio: normalizeAudio(req.body?.consentAudio, "voice_consent_invalid")
          }
        }
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const details = Array.isArray(data?.error?.details) ? data.error.details : [];
      let cleanError = "";
      for (const item of details) {
        const detailText = String(item?.detail || "");
        const jsonMatch = detailText.match(/data:\s*"(\{.*?\})"/);
        if (jsonMatch) {
          try {
            const unescaped = jsonMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
            const parsed = JSON.parse(unescaped);
            if (parsed?.error?.message) { cleanError = parsed.error.message; break; }
          } catch (_) {}
        }
        if (detailText.includes("The recorded phrase didn't match the text on screen")) {
          cleanError = "La grabación de consentimiento no coincide con la frase requerida. Léela exactamente como se muestra en pantalla y sin ruidos de fondo.";
          break;
        }
        if (detailText.includes("Consent flow failed")) {
          cleanError = "No se pudo verificar la grabación de consentimiento. Asegúrate de hablar claro y leer la frase exacta en un lugar silencioso.";
          break;
        }
      }
      if (!cleanError) {
        const raw = String(data?.error?.message || data?.error || "").trim();
        cleanError = (raw && raw !== "Error translating server response to JSON") ? raw : "voice_replication_failed";
      }
      throw Object.assign(new Error(cleanError), { status: Number(upstream.status || 502) });
    }
    const voiceId = String(data?.id || data?.voice?.id || "").trim().slice(0, 240);
    if (!/^voice_[A-Za-z0-9_-]+$/.test(voiceId)) throw Object.assign(new Error("voice_replication_invalid_response"), { status: 502 });
    const voice = {
      id: voiceId,
      ownerId: authContext.uid,
      displayName,
      languageCode,
      type: "replicated",
      createdAt: new Date().toISOString(),
      expireTime: String(data?.expire_time || data?.expireTime || "")
    };
    await db.collection("schroeder_voice_profiles").doc(voiceId).set(voice);
    res.status(201).json({ ok: true, voice: { id: voice.id, displayName, languageCode, expireTime: voice.expireTime } });
  }));

  app.post("/api/schroeder/library/approve", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket } = getAdminServices();
    const ownerSegment = storageSegment(authContext.uid, "user");
    const previewPath = String(req.body?.previewStoragePath || "").trim().replace(/^\/+/, "");
    if (!previewPath.startsWith(`schroeder-sound-lab/previews/${ownerSegment}/`)) {
      throw Object.assign(new Error("soundlab_preview_forbidden"), { status: 403 });
    }
    const source = bucket.file(previewPath);
    const [exists] = await source.exists();
    if (!exists) throw Object.assign(new Error("soundlab_preview_not_found"), { status: 404 });
    const sessionId = storageSegment(req.body?.sessionId, "session");
    const audioId = storageSegment(req.body?.audioId || crypto.randomUUID(), "audio");
    const ext = previewPath.match(/\.([A-Za-z0-9]+)$/)?.[1] || "mp3";
    const approvedPath = `schroeder-sound-lab/approved/${ownerSegment}/${sessionId}/${audioId}.${ext}`;
    const destination = bucket.file(approvedPath);
    const [sourceMetadata] = await source.getMetadata().catch(() => [{}]);
    const approvedAt = new Date().toISOString();
    const token = crypto.randomUUID();
    await source.copy(destination);
    const durationSec = Math.max(0, Number(req.body?.durationSec || sourceMetadata?.metadata?.durationSec || 0) || 0);
    await destination.setMetadata({
      contentType: String(sourceMetadata.contentType || req.body?.mimeType || "audio/mpeg"),
      cacheControl: "private,max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ownerId: authContext.uid,
        sessionId,
        audioId,
        title: String(req.body?.title || "Audio aprobado").slice(0, 180),
        kind: String(req.body?.kind || "music").slice(0, 30),
        format: String(req.body?.format || "song").slice(0, 30),
        model: String(req.body?.model || "").slice(0, 120),
        durationSec: String(durationSec),
        prompt: String(req.body?.prompt || "").slice(0, 4000),
        genre: String(req.body?.genre || "").slice(0, 80),
        bpm: String(req.body?.bpm || ""),
        key: String(req.body?.key || "").slice(0, 40),
        createdAt: String(req.body?.createdAt || approvedAt).slice(0, 64),
        approvedAt
      }
    });
    await source.delete({ ignoreNotFound: true });
    const [metadata] = await destination.getMetadata();
    res.status(201).json({ ok: true, track: soundLabTrack(bucket, destination, metadata) });
  }));

  app.post("/api/schroeder/previews/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket } = getAdminServices();
    const storagePath = String(req.body?.storagePath || "").trim().replace(/^\/+/, "");
    const prefix = `schroeder-sound-lab/previews/${storageSegment(authContext.uid, "user")}/`;
    if (!storagePath.startsWith(prefix)) throw Object.assign(new Error("soundlab_preview_forbidden"), { status: 403 });
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    res.status(200).json({ ok: true });
  }));

  app.get("/api/schroeder/previews/list", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket, db } = getAdminServices();
    const sessionId = storageSegment(req.query?.sessionId, "session");
    const prefix = `schroeder-sound-lab/previews/${storageSegment(authContext.uid, "user")}/${sessionId}/`;
    const [files] = await bucket.getFiles({ prefix, maxResults: 250 });
    const items = await Promise.all(files.map(async (file) => {
      const [metadata] = await file.getMetadata().catch(() => [{}]);
      const custom = metadata?.metadata || {};
      const jobId = String(custom.jobId || file.name.match(/(?:ai-)?([0-9a-f-]{36})\.[^.]+$/i)?.[1] || "");
      const jobSnapshot = jobId ? await db.collection(AI_JOB_COLLECTION).doc(jobId).get().catch(() => null) : null;
      const job = jobSnapshot?.exists ? jobSnapshot.data() || {} : {};
      const kind = String(custom.kind || job.type || (file.name.includes("/voice/") ? "voice" : "music")) === "music" ? "music" : "voice";
      const prompt = String(job.input?.prompt || "");
      const track = soundLabTrack(bucket, file, metadata);
      const draft = kind === "music"
        ? { kind: "music", title: "Canción recuperada", prompt, sourcePrompt: prompt, model: String(job.model || custom.model || "lyria-3.5"), musicType: /instrumental only|sin voz/i.test(prompt) ? "instrumental" : "vocal", durationSec: Number(prompt.match(/(\d+)\s*seconds?/i)?.[1] || 120), genre: String(job.input?.preset || ""), language: "Español", bpm: Number(prompt.match(/(\d+)\s*BPM/i)?.[1] || 100), key: String(prompt.match(/Key:\s*([^\.\n]+)/i)?.[1] || ""), lyrics: "", musicalFingerprint: job.result?.track?.musicalFingerprint || null }
        : { kind: "voice", title: "Audio recuperado", prompt: String(job.input?.text || prompt), format: String(job.input?.format || custom.format || "phrase"), language: String(job.input?.speechLocale || "Español"), voiceName: String(job.input?.voiceName || "Aoede"), style: String(job.input?.style || "natural y clara"), text: String(job.input?.text || "") };
      return { ...track, id: String(track.id || `recovered_${jobId}`), title: draft.title, kind, format: kind === "music" ? "song" : draft.format, model: draft.model || String(custom.model || ""), sessionId, createdAt: String(job.createdAt || track.createdAt || metadata.timeCreated || ""), draft, musicalFingerprint: draft.musicalFingerprint || null };
    }));
    items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    res.status(200).json({ ok: true, items });
  }));

  app.get("/api/schroeder/library/list", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket, db } = getAdminServices();
    const requestedOwnerId = String(req.query?.ownerId || "").trim();
    if (requestedOwnerId && requestedOwnerId !== authContext.uid) await assertSoundLabAdmin(authContext, db);
    const ownerId = storageSegment(requestedOwnerId || authContext.uid, "user");
    const [files] = await bucket.getFiles({ prefix: `schroeder-sound-lab/approved/${ownerId}/`, maxResults: 250 });
    const items = await Promise.all(files.map(async (file) => {
      const [metadata] = await file.getMetadata().catch(() => [{}]);
      return soundLabTrack(bucket, file, metadata);
    }));
    items.sort((a, b) => String(b.approvedAt || "").localeCompare(String(a.approvedAt || "")));
    res.status(200).json({ ok: true, items });
  }));

  app.post("/api/schroeder/library/rename", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket } = getAdminServices();
    const storagePath = String(req.body?.storagePath || "").trim().replace(/^\/+/, "");
    const ownPrefix = `schroeder-sound-lab/approved/${storageSegment(authContext.uid, "user")}/`;
    if (!storagePath.startsWith(ownPrefix)) throw Object.assign(new Error("soundlab_audio_forbidden"), { status: 403 });
    const title = String(req.body?.title || "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (!title) throw Object.assign(new Error("soundlab_title_required"), { status: 400 });
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) throw Object.assign(new Error("soundlab_audio_not_found"), { status: 404 });
    const [metadata] = await file.getMetadata().catch(() => [{}]);
    await file.setMetadata({ metadata: { ...(metadata.metadata || {}), title } });
    const [updatedMetadata] = await file.getMetadata();
    res.status(200).json({ ok: true, track: soundLabTrack(bucket, file, updatedMetadata) });
  }));

  app.post("/api/schroeder/library/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket, db } = getAdminServices();
    const storagePath = String(req.body?.storagePath || "").trim().replace(/^\/+/, "");
    const ownPrefix = `schroeder-sound-lab/approved/${storageSegment(authContext.uid, "user")}/`;
    if (!storagePath.startsWith(ownPrefix)) await assertSoundLabAdmin(authContext, db);
    if (!storagePath.startsWith("schroeder-sound-lab/approved/")) throw Object.assign(new Error("soundlab_audio_forbidden"), { status: 403 });
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    res.status(200).json({ ok: true });
  }));

  app.post("/api/schroeder/library/add-to-podcaster", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket, db } = getAdminServices();
    const ownerSegment = storageSegment(authContext.uid, "user");
    const storagePath = String(req.body?.storagePath || "").trim().replace(/^\/+/, "");
    if (!storagePath.startsWith(`schroeder-sound-lab/approved/${ownerSegment}/`)) {
      throw Object.assign(new Error("soundlab_audio_forbidden"), { status: 403 });
    }
    const source = bucket.file(storagePath);
    const [exists] = await source.exists();
    if (!exists) throw Object.assign(new Error("soundlab_audio_not_found"), { status: 404 });
    const [sourceMetadata] = await source.getMetadata().catch(() => [{}]);
    const audioId = storageSegment(req.body?.audioId || sourceMetadata?.metadata?.audioId || crypto.randomUUID(), "audio");
    const libraryId = `schroeder-${ownerSegment}-${audioId}`.slice(0, 180);
    const ext = storagePath.match(/\.([A-Za-z0-9]+)$/)?.[1] || "mp3";
    const destinationPath = `podcaster/library/music/${libraryId}.${ext}`;
    const destination = bucket.file(destinationPath);
    const token = crypto.randomUUID();
    await source.copy(destination);
    const [metadata] = await destination.getMetadata();
    const size = Math.max(0, Number(metadata?.size || sourceMetadata?.size || req.body?.size || 0));
    let durationSec = Math.max(0, Number(req.body?.durationSec || sourceMetadata?.metadata?.durationSec || 0) || 0);
    if (durationSec <= 0.05 && size > 0) {
      durationSec = Math.max(15, Math.round((size * 8) / 192000));
    }
    if (durationSec <= 0.05) {
      durationSec = 120;
    }
    await destination.setMetadata({
      contentType: String(sourceMetadata.contentType || req.body?.mimeType || "audio/mpeg"),
      cacheControl: "private,max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ownerId: authContext.uid,
        sourceAudioId: audioId,
        kind: "podcaster_music_library",
        durationSec: String(durationSec),
        title: String(req.body?.title || sourceMetadata?.metadata?.title || "Canción").slice(0, 180),
        model: String(req.body?.model || sourceMetadata?.metadata?.model || "").slice(0, 120),
        prompt: String(req.body?.prompt || sourceMetadata?.metadata?.prompt || "").slice(0, 4000)
      }
    });
    await source.setMetadata({
      metadata: {
        ...(sourceMetadata?.metadata || {}),
        podcasterLibraryId: libraryId,
        durationSec: String(durationSec)
      }
    }).catch(() => {});
    const updatedAt = new Date().toISOString();
    const track = {
      libraryId,
      name: String(req.body?.title || sourceMetadata?.metadata?.title || "Canción").slice(0, 180),
      mimeType: String(metadata.contentType || req.body?.mimeType || "audio/mpeg"),
      size,
      durationSec,
      downloadUrl: tokenDownloadUrl(bucket.name, destinationPath, token),
      storagePath: destinationPath,
      updatedAt,
      ownerId: authContext.uid,
      ownerEmail: String(authContext?.token?.email || "").slice(0, 180) || "Schroeder Sound Lab",
      sourceAudioId: audioId,
      model: String(req.body?.model || sourceMetadata?.metadata?.model || "lyria-3.5").slice(0, 120),
      prompt: String(req.body?.prompt || sourceMetadata?.metadata?.prompt || "").slice(0, 4000),
      bpm: Number(req.body?.bpm || 0) || 0,
      key: String(req.body?.key || "").slice(0, 40),
      genre: String(req.body?.genre || "").slice(0, 80),
      trimInMs: 0,
      trimOutMs: Math.round(durationSec * 1000),
      durationMeasuredWith: "audio-metadata"
    };
    await db.collection("podcaster_music_library").doc(libraryId).set(track, { merge: true });
    res.status(200).json({ ok: true, track });
  }));

  app.post("/api/schroeder/audio-reference/analyze", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { bucket } = getAdminServices();
    const storagePath = String(req.body?.storagePath || "").trim().replace(/^\/+/, "");
    let mimeType = String(req.body?.mimeType || "audio/webm").trim().toLowerCase().slice(0, 80).split(";")[0].trim();
    let audioBase64 = String(req.body?.audioBase64 || "").replace(/\s+/g, "");
    if (storagePath) {
      const ownerSegment = storageSegment(authContext.uid, "user");
      const allowedPrefixes = [`schroeder-sound-lab/previews/${ownerSegment}/`, `schroeder-sound-lab/approved/${ownerSegment}/`];
      if (!allowedPrefixes.some((prefix) => storagePath.startsWith(prefix))) throw Object.assign(new Error("soundlab_audio_forbidden"), { status: 403 });
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) throw Object.assign(new Error("soundlab_audio_not_found"), { status: 404 });
      const [metadata] = await file.getMetadata().catch(() => [{}]);
      const [audio] = await file.download();
      if (!audio?.length || audio.length > 18 * 1024 * 1024) throw Object.assign(new Error("soundlab_audio_too_large"), { status: 413 });
      mimeType = String(metadata?.contentType || mimeType || "audio/mpeg").trim().toLowerCase().slice(0, 80).split(";")[0].trim();
      audioBase64 = audio.toString("base64");
    }
    const allowed = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"]);
    if (!allowed.has(mimeType)) throw Object.assign(new Error("soundlab_audio_format_unsupported"), { status: 400 });
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) throw Object.assign(new Error("soundlab_audio_invalid"), { status: 400 });
    const byteLength = Buffer.byteLength(audioBase64, "base64");
    const maxBytes = storagePath ? 18 * 1024 * 1024 : 6 * 1024 * 1024;
    if (!byteLength || byteLength > maxBytes) throw Object.assign(new Error("soundlab_audio_too_large"), { status: 413 });
    const requestedModel = normalizeModel(req.body?.model || "gemini-3.8-flash");
    const allowedModels = new Set(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"]);
    const model = allowedModels.has(requestedModel) ? requestedModel : "gemini-3.8-flash";
    const client = createVertexClient({ location: "global" });
    let response;
    try {
      response = await analyzeHummingWithFallback({ client, model, mimeType, audioBase64, userInstruction: req.body?.userInstruction, analysisMode: req.body?.analysisMode });
    } catch (error) {
      if (isGeminiContentBlocked(error)) throw Object.assign(new Error("No se pudo interpretar el sonido. Intenta grabarlo de nuevo sin ruido de fondo."), { status: 422 });
      throw error;
    }
    const prompt = geminiText(response);
    if (!prompt) throw Object.assign(new Error("No se detectó un gesto musical claro. Graba el sonido un poco más cerca del micrófono."), { status: 422 });
    res.status(200).json({ ok: true, prompt });
  }));
}

function registerGeminiJobRoutes(app) {
  registerGeminiTtsVoiceCatalogRoute(app);
  registerGeminiTtsPreviewRoute(app);
  const create = (type) => asyncRoute(async (req, res) => {
    const job = await createAiJob(req, type);
    res.status(202).json(publicAiJob(job));
  });
  app.get("/api/gemini/models", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const models = [];
    const seenModelNames = new Set();
    // A failed Vertex list must not hide the free tier. The paid catalog is exactly what is
    // unavailable during a spend cap or quota outage, and this response is the only way the
    // browser learns it can default PigPen's text onto the model that still answers.
    let catalogError = null;
    try {
      const client = createVertexClient({ location: "global" });
      const pager = await client.models.list({
        config: { queryBase: true, pageSize: 100 }
      });
      for await (const model of pager) {
        if (!model || typeof model !== "object") continue;
        const normalizedName = normalizeVertexModelName(model.name || "");
        if (normalizedName && seenModelNames.has(normalizedName)) continue;
        if (normalizedName) seenModelNames.add(normalizedName);
        models.push({ ...model, name: normalizedName || model.name });
      }
    } catch (error) {
      catalogError = String(error?.message || error).slice(0, 300);
    }
    // Required lazily because gemini-free-tier.js reads helpers out of savings-policy.js.
    // The Vertex list only publishes paid models, so the selector needs this offer to be able
    // to default PigPen's text to the model that costs nothing.
    const freeTier = require("./gemini-free-tier.js");
    const cloudflareImages = require("./cloudflare-images.js");
    res.status(200).json({
      models,
      freeTier: freeTier.describeFreeTierOffer(),
      freeImage: cloudflareImages.cloudflareImageOffer(),
      ...(catalogError ? { catalogError } : {})
    });
  }));
  app.post(["/api/podcaster/dialogue-audio/generate", "/api/podcaster/dialogue-audios/generate"], create("dialogue_audio"));
  app.post("/api/podcaster/music/generate", create("music"));
  app.post("/api/schroeder/music/generate", create("music"));
  app.post("/api/schroeder/voice/generate", create("speech"));
  registerSoundLabStorageRoutes(app);
}

module.exports = {
  AI_JOB_COLLECTION,
  VEO_DISPATCH_URL,
  buildImagePrompt,
  compactInput,
  publicAiJob,
  extractInteractionAudio,
  buildLyriaInteractionRequest,
  createVertexVideoOperationError,
  extractVertexVideoOutcome,
  createVertexVideoEmptyError,
  normalizeVertexVideoError,
  resolveTtsSpeechLocale,
  normalizeTtsVoiceName,
  buildDialogueTtsDeliveryInstruction,
  isRetryableAiJobError,
  normalizeOwnedReferencePath,
  buildCanonicalDialogueVideoStoragePath,
  resolveVertexVideoReferences,
  registerVeoRoutes,
  registerGeminiJobRoutes,
  registerAiJobStatusRoute,
  dispatchAiJob
};
