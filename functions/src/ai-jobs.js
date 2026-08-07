const crypto = require("node:crypto");
const { GoogleAuth } = require("google-auth-library");
const {
  PROJECT_ID,
  REGION,
  getAdminServices,
  resolveAuthContext,
  asyncRoute
} = require("./common.js");
const { createVertexClient, normalizeModel, DEFAULT_IMAGE_MODEL, DEFAULT_VEO_MODEL, DEFAULT_VEO_FAST_MODEL } = require("./vertex.js");
const { enqueueHttpTask, QUEUES } = require("./tasks.js");
const { sessionAccess } = require("./podcaster-data.js");
const { buildDialogueVideoPrompt } = require("./video-prompt.js");

const AI_JOB_COLLECTION = "podcaster_ai_jobs";
const AI_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const TASK_INVOKER = `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`;
const VEO_DISPATCH_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchVeoTask`;

function tokenDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function cleanId(value = "") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 180 || !/^[A-Za-z0-9._-]+$/.test(clean)) throw Object.assign(new Error("invalid_identifier"), { status: 400 });
  return clean;
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
  const payload = {
    ok: true,
    jobId: String(job.jobId || ""),
    type: String(job.type || ""),
    status: String(job.status || "queued"),
    stage: String(job.stage || "queued"),
    progress: Math.max(0, Math.min(1, Number(job.progress || 0) || 0)),
    hint: String(job.hint || ""),
    updatedAt: String(job.updatedAt || new Date().toISOString()),
    statusUrl: `/api/podcaster/jobs/${encodeURIComponent(String(job.jobId || ""))}`
  };
  if (job.model) payload.model = String(job.model);
  if (job.error) payload.error = job.error;
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
    `Title: ${String(input.title || "Podcast scene")}.`,
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
  const sessionId = cleanId(input?.sessionId || "");
  const { db, admin } = getAdminServices();
  const sessionSnapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
  if (!sessionSnapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
  if (!sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
  const jobId = crypto.randomUUID();
  const now = new Date();
  const isVideo = type === "dialogue_video";
  const requestedModel = String(input.model || "");
  const model = isVideo
    ? (/lite|fast/i.test(requestedModel) ? DEFAULT_VEO_FAST_MODEL : normalizeModel(requestedModel, DEFAULT_VEO_MODEL))
    : type === "dialogue_audio"
      ? normalizeModel(requestedModel, "gemini-3.1-flash-tts-preview")
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
    hint: isVideo ? "Video en cola." : "Imagen en cola.",
    attempt: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AI_JOB_TTL_MS).toISOString()
  };
  const ref = db.collection(AI_JOB_COLLECTION).doc(jobId);
  await ref.set(job);
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
  if (String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
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
  const { bucket, admin } = getAdminServices();
  const client = createVertexClient({ location: REGION });
  const input = job.input || {};
  const references = await resolveVertexVideoReferences(bucket, input, job);
  const promptSpec = buildDialogueVideoPrompt(input, {
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
  if (references.referenceImages.length) {
    config.referenceImages = references.referenceImages.map((image) => ({
      image: { gcsUri: image.gcsUri, mimeType: image.mimeType },
      referenceType: "ASSET"
    }));
  }
  let operation = await client.models.generateVideos({
    model: normalizeModel(job.model, DEFAULT_VEO_MODEL),
    prompt: promptSpec.prompt,
    ...(references.firstFrame ? {
      image: { gcsUri: references.firstFrame.gcsUri, mimeType: references.firstFrame.mimeType }
    } : {}),
    config
  });
  let polls = 0;
  while (!operation.done && polls < 170) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await client.operations.getVideosOperation({ operation });
    polls += 1;
    if (polls % 2 === 0 && String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
    if (polls % 3 === 0) await ref.set({ stage: "vertex_video_generation", progress: Math.min(0.9, 0.08 + polls / 200), hint: "Vertex AI está generando el video.", heartbeatAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  if (!operation.done) throw Object.assign(new Error("vertex_video_timeout"), { status: 504 });
  if (operation.error) throw new Error(`vertex_video_error:${JSON.stringify(operation.error).slice(0, 500)}`);
  const video = operation.response?.generatedVideos?.[0]?.video || null;
  let storagePath = gsPath(video?.uri);
  if (!storagePath && video?.videoBytes) {
    storagePath = `${outputPrefix}video.mp4`;
    await bucket.file(storagePath).save(Buffer.from(video.videoBytes, "base64"), { resumable: false, metadata: { contentType: video.mimeType || "video/mp4" } });
  }
  if (!storagePath) throw new Error("vertex_video_empty");
  if (String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
  const videoFile = bucket.file(storagePath);
  const [videoMetadata] = await videoFile.getMetadata();
  const videoToken = String(videoMetadata?.metadata?.firebaseStorageDownloadTokens || crypto.randomUUID());
  if (!videoMetadata?.metadata?.firebaseStorageDownloadTokens) await videoFile.setMetadata({ metadata: { ...(videoMetadata?.metadata || {}), firebaseStorageDownloadTokens: videoToken } });
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
  await ref.set({ status: "ready", stage: "ready", progress: 1, hint: "Video listo.", result: { dialogueVideo }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

async function generateLyriaMusic({ model, prompt }) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const response = await client.request(buildLyriaInteractionRequest({ model, prompt }));
  return extractInteractionAudio(response?.data);
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

async function processAudioJob(job, ref) {
  const { bucket, admin } = getAdminServices();
  const input = job.input || {};
  const isMusic = job.type === "music";
  const voiceName = String(input.voiceName || "Aoede").trim() || "Aoede";
  const prompt = isMusic
    ? `Create a polished, loop-friendly instrumental podcast music clip. No speech or lyrics. Direction: ${String(input.prompt || input.preset || "warm ambient editorial underscore").slice(0, 3000)}`
    : `Read the following podcast dialogue naturally and clearly as ${String(input.speakerName || input.speakerLabel || "the speaker")}. Preserve the exact wording and do not add commentary. Dialogue: ${String(input.text || input.targetSpeechLine || "").slice(0, 8000)}`;
  if (!isMusic && !String(input.text || input.targetSpeechLine || "").trim()) throw Object.assign(new Error("dialogue_text_required"), { status: 400 });
  let audioParts;
  if (isMusic) {
    audioParts = await generateLyriaMusic({ model: job.model, prompt });
  } else {
    const client = createVertexClient({ location: "global" });
    const response = await client.models.generateContent({
      model: String(job.model),
      contents: prompt,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode: String(input.languageCode || "es-MX"),
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
  const storagePath = `podcaster/sessions/${job.sessionId}/owners/${job.ownerId}/${folder}/${label}-${job.jobId}.${ext}`;
  const downloadToken = crypto.randomUUID();
  await bucket.file(storagePath).save(output, { resumable: false, metadata: { contentType: mimeType, metadata: { jobId: job.jobId, ownerId: job.ownerId, type: job.type, firebaseStorageDownloadTokens: downloadToken } } });
  if (String((await ref.get()).data()?.status || "") === "cancelled") throw Object.assign(new Error("ai_job_cancelled"), { code: "ai_job_cancelled" });
  const previousStoragePath = String(input.previousStoragePath || "").trim();
  if (previousStoragePath && previousStoragePath !== storagePath && previousStoragePath.startsWith(`podcaster/sessions/${job.sessionId}/`)) {
    await bucket.file(previousStoragePath).delete({ ignoreNotFound: true }).catch(() => {});
  }
  const media = {
    mimeType,
    size: output.length,
    storagePath,
    downloadUrl: tokenDownloadUrl(bucket.name, storagePath, downloadToken),
    updatedAt: new Date().toISOString(),
    model: String(job.model)
  };
  const result = isMusic
    ? { track: { ...media, name: "AI Music", durationSec: 0, prompt: String(input.prompt || "") } }
    : { dialogueAudio: { ...media, rowId: String(input.rowId || ""), speaker: String(input.speakerLabel || input.speaker || ""), voiceName, promptVersion: "podcaster_vertex_tts_v1", targetSpeechLine: String(input.targetSpeechLine || input.text || ""), playbackRate: 1, wordTimings: [] } };
  await ref.set({ status: "ready", stage: "ready", progress: 1, hint: isMusic ? "Música lista." : "Audio listo.", result, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function dispatchAiJob(jobId) {
  const { db, admin } = getAdminServices();
  const ref = db.collection(AI_JOB_COLLECTION).doc(cleanId(jobId));
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (["ready", "cancelled"].includes(String(job.status || ""))) return null;
    const leaseMs = job.leaseUntil?.toMillis?.() || 0;
    if (job.status === "running" && leaseMs > Date.now()) return null;
    transaction.set(ref, { status: "running", stage: "starting", progress: 0.04, hint: "Iniciando Vertex AI.", attempt: Number(job.attempt || 0) + 1, leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 35 * 60 * 1000), heartbeatAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return job;
  });
  if (!claimed) return { duplicate: true };
  try {
    if (claimed.type === "dialogue_video") await processVideoJob(claimed, ref);
    else if (["dialogue_audio", "music"].includes(claimed.type)) await processAudioJob(claimed, ref);
    else await processImageJob(claimed, ref);
    return { completed: true };
  } catch (error) {
    if (String(error?.code || error?.message || "") === "ai_job_cancelled") return { cancelled: true };
    await ref.set({ status: "error", stage: "error", hint: "Vertex AI no pudo completar el trabajo.", error: { code: String(error?.code || error?.message || "ai_job_failed").slice(0, 160), message: String(error?.message || error).slice(0, 600) }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
}

function registerAiJobStatusRoute(app) {
  app.get("/api/podcaster/jobs/:jobId", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(AI_JOB_COLLECTION).doc(cleanId(req.params.jobId)).get();
    if (!snapshot.exists) throw Object.assign(new Error("ai_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("ai_job_forbidden"), { status: 403 });
    res.status(200).json(publicAiJob(job));
  }));
}

function registerGeminiJobRoutes(app) {
  const create = (type) => asyncRoute(async (req, res) => {
    const job = await createAiJob(req, type);
    res.status(202).json(publicAiJob(job));
  });
  app.post(["/api/podcaster/dialogue-audio/generate", "/api/podcaster/dialogue-audios/generate"], create("dialogue_audio"));
  app.post("/api/podcaster/music/generate", create("music"));
}

module.exports = {
  AI_JOB_COLLECTION,
  VEO_DISPATCH_URL,
  compactInput,
  publicAiJob,
  extractInteractionAudio,
  buildLyriaInteractionRequest,
  normalizeOwnedReferencePath,
  resolveVertexVideoReferences,
  registerVeoRoutes,
  registerGeminiJobRoutes,
  registerAiJobStatusRoute,
  dispatchAiJob
};
