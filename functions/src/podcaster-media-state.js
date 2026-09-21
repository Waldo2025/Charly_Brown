// Pure media state shared by Functions and the generated browser module.
function mediaDateMs(value) {
  if (value == null || value === "") return NaN;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6;
  if (Number.isFinite(Number(value?._seconds))) return Number(value._seconds) * 1000 + Number(value._nanoseconds || 0) / 1e6;
  if (typeof value === "number") return value;
  return Date.parse(String(value));
}

function mediaDateIso(value, fallback = "") {
  const ms = mediaDateMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

function mediaResourceIdentity(clip = {}) {
  const path = String(clip.storagePath || "").trim();
  if (path.startsWith("gs://")) return path;
  try {
    const url = new URL(String(clip.downloadUrl || ""));
    let bucket = "", objectPath = "";
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/);
      if (match) { bucket = match[1]; objectPath = decodeURIComponent(match[2]); }
    } else if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.slice(1).split("/"); bucket = parts.shift(); objectPath = decodeURIComponent(parts.join("/"));
    }
    if (bucket && objectPath) return `gs://${bucket}/${(path || objectPath).replace(/^\/+/, "")}`;
  } catch (_) { }
  return path || String(clip.downloadUrl || clip.localMediaCacheKey || clip.dataUrl || "");
}

function mediaRevision(clip) {
  if (!clip || typeof clip !== "object") return "";
  if (clip.selectionRevision) return String(clip.selectionRevision);
  return JSON.stringify([
    mediaResourceIdentity(clip),
    mediaDateIso(clip.updatedAt),
    String(clip.selectionOperationId || "")
  ]);
}

function mediaMetadata(clip = {}) {
  return {
    localMediaCacheKey: String(clip.localMediaCacheKey || ""),
    mediaDurationMs: Math.max(0, Number(clip.mediaDurationMs || clip.physicalDurationMs || 0) || 0),
    sourceType: String(clip.sourceType || clip.replacementSource || ""),
    manuallyReplaced: clip.manuallyReplaced === true,
    selectionRevision: String(clip.selectionRevision || ""),
    selectionOperationId: String(clip.selectionOperationId || ""),
    updatedAt: mediaDateIso(clip.updatedAt),
    createdAt: mediaDateIso(clip.createdAt)
  };
}

function mergeMediaMapByEntryUpdatedAt(current = {}, incoming = {}) {
  const next = { ...current };
  for (const [key, clip] of Object.entries(incoming || {})) {
    if (!clip || typeof clip !== "object") continue;
    const previous = next[key];
    const oldMs = mediaDateMs(previous?.updatedAt);
    const newMs = mediaDateMs(clip.updatedAt);
    if (!previous || !Number.isFinite(oldMs) || (Number.isFinite(newMs) && newMs > oldMs)) next[key] = clip;
  }
  return next;
}

const VERSION_MEDIA_FIELDS = ["dialogueVideoMap", "dialogueAudioMap", "dialogueVideoDeletedAtMap", "dialogueAudioDeletedAtMap", "podcastVideoConfig", "visualEffectsMap"];

function mediaTarget(session, threadId = "") {
  if (!session) return null;
  if (!threadId || threadId === String(session.activeThreadId || "")) return session;
  // Legacy cloud documents contain only the root version. The UI creates its
  // first version locally; its generated ID is not a different cloud version.
  if (!session.activeThreadId && !(session.threads || []).length) return session;
  const thread = (session.threads || []).find(item => String(item.id) === threadId);
  if (!thread) return null;
  const target = { ...session, ...thread, id: session.id, activeThreadId: threadId };
  for (const field of VERSION_MEDIA_FIELDS) target[field] = thread[field] || {};
  return target;
}

function captureMediaSelection(session, rowId, kind = "video", requestId = "") {
  const field = kind === "audio" ? "dialogueAudioMap" : "dialogueVideoMap";
  const deletedField = kind === "audio" ? "dialogueAudioDeletedAtMap" : "dialogueVideoDeletedAtMap";
  return {
    sessionId: String(session?.id || ""),
    threadId: String(session?.activeThreadId || ""),
    rowId: String(rowId || ""),
    kind,
    requestId: String(requestId || ""),
    baseRevision: mediaRevision(session?.[field]?.[rowId]),
    baseDeletedAt: mediaDateIso(session?.[deletedField]?.[rowId])
  };
}

function selectSceneMedia(session, rowId, incoming, context = {}) {
  const key = String(rowId || "").trim();
  const target = mediaTarget(session, String(context.threadId || ""));
  const field = context.kind === "audio" ? "dialogueAudioMap" : "dialogueVideoMap";
  const deletedField = context.kind === "audio" ? "dialogueAudioDeletedAtMap" : "dialogueVideoDeletedAtMap";
  const current = target?.[field]?.[key] || null;
  const conflict = reason => ({ status: "superseded", reason, session, clip: current });
  if (!target || (context.sessionId && String(session?.id) !== String(context.sessionId))) return conflict("session-changed");
  const rows = Array.isArray(target.script?.rows) ? target.script.rows : Object.values(target.script?.rows || {});
  if (!rows.some(row => String(row?.id) === key)) return conflict("scene-removed");
  if (context.requestId && current?.selectionOperationId === context.requestId) {
    return { status: "applied", session, clip: current, unchanged: true };
  }
  if (Object.prototype.hasOwnProperty.call(context, "baseRevision") && mediaRevision(current) !== context.baseRevision) return conflict("selection-changed");
  if (Object.prototype.hasOwnProperty.call(context, "baseDeletedAt") && mediaDateIso(target[deletedField]?.[key]) !== context.baseDeletedAt) return conflict("scene-removed");
  if (!incoming || !(incoming.storagePath || incoming.downloadUrl || incoming.localMediaCacheKey || incoming.dataUrl)) throw new Error("media_source_missing");
  const updatedAt = mediaDateIso(incoming.updatedAt, new Date().toISOString());
  const kind = context.kind === "audio" ? "audio" : (String(incoming.mimeType || "").startsWith("image/") || incoming.type === "image" ? "image" : "video");
  const clip = {
    ...incoming,
    rowId: key,
    type: kind,
    ...(context.kind === "audio" ? { playbackRate: current?.playbackRate || incoming.playbackRate || 1 } : {}),
    updatedAt,
    selectionOperationId: String(context.requestId || incoming.selectionOperationId || ""),
    selectionRevision: String(context.requestId || incoming.selectionRevision || `${updatedAt}:${incoming.storagePath || incoming.downloadUrl || incoming.localMediaCacheKey}`)
  };
  const next = { ...target, [field]: { ...(target[field] || {}), [key]: clip }, updatedAt };
  if (context.kind !== "audio") {
    const config = target.podcastVideoConfig || {};
    const oldTimelineClip = config.timelineClipsByRowId?.[key] || {};
    next.podcastVideoConfig = {
      ...config,
      timelineClipsByRowId: {
        ...(config.timelineClipsByRowId || {}),
        [key]: { ...oldTimelineClip, type: kind, backgroundColor: "", mediaDurationMs: Number(clip.mediaDurationMs || clip.durationSec * 1000 || 0) }
      }
    };
    next.script = { ...target.script, rows: rows.map(row => String(row.id) === key ? { ...row, videoSrc: clip.downloadUrl || "", mediaType: kind } : row) };
    if (kind === "image" && clip.manuallyReplaced) Object.assign(next.podcastVideoConfig.timelineClipsByRowId[key], { mediaScale: 1, mediaOffsetXPct: 0, mediaOffsetYPct: 0, mediaMotionPreset: "none", visualLayoutMode: "default" });
    next.visualEffectsMap = { ...(target.visualEffectsMap || {}), [key]: kind === "image" ? (context.effects ?? target.visualEffectsMap?.[key] ?? null) : null };
  }
  if (context.kind === "audio") {
    const config = target.podcastVideoConfig || {};
    const track = config.geminiDialogueTrack || {};
    const prior = track.segments || [];
    const replaceSegment = segment => ({ ...segment, audioSrc: clip.downloadUrl || "", downloadUrl: clip.downloadUrl || "", storagePath: clip.storagePath || "", localMediaCacheKey: clip.localMediaCacheKey || "" });
    const segments = prior.map(segment => String(segment.rowId) === key ? replaceSegment(segment) : segment);
    if (!segments.some(segment => String(segment.rowId) === key)) {
      const index = rows.findIndex(row => String(row.id) === key);
      const startMs = Number(config.timelineClipsByRowId?.[key]?.startMs ?? rows.slice(0, index).reduce((ms, row) => ms + Number(row.durationSec || 0) * 1000, 0));
      const sourceMs = Number(clip.durationSec || rows[index]?.durationSec || 8) * 1000;
      const durationMs = Math.round(sourceMs / Number(clip.playbackRate || 1));
      segments.push(replaceSegment({ rowId: key, sceneIndex: index + 1, startMs, anchorStartMs: startMs, durationMs, endMs: startMs + durationMs, trimInMs: 0, trimOutMs: sourceMs }));
    }
    next.podcastVideoConfig = { ...config, geminiDialogueTrack: { ...track,
      enabled: prior.length ? track.enabled !== false : true,
      updatedAt,
      excludedRowIds: (track.excludedRowIds || []).filter(id => String(id) !== key),
      segments
    } };
  }
  if (target !== session) {
    return {
      status: "applied", clip,
      session: { ...session, updatedAt, threads: session.threads.map(thread => {
        if (String(thread.id) !== context.threadId) return thread;
        const updated = { ...thread, script: next.script, updatedAt };
        for (const name of VERSION_MEDIA_FIELDS) updated[name] = next[name] || {};
        return updated;
      }) }
    };
  }
  return { status: "applied", session: next, clip };
}

function normalizeDialogueSegment(raw = {}, index = 0, options = {}) {
  const rowId = String(raw?.rowId || "").trim();
  const ref = options.resolveReference?.(String(raw.audioSrc || raw.url || raw.downloadUrl || ""), String(raw.storagePath || "")) || raw;
  const downloadUrl = String(ref.downloadUrl || raw.audioSrc || "");
  const storagePath = String(ref.storagePath || "");
  const localMediaCacheKey = String(raw.localMediaCacheKey || "");
  const audioSrc = String(options.resolveAudioUrl?.(downloadUrl, storagePath) || downloadUrl || (localMediaCacheKey ? `podcaster-local-media:${localMediaCacheKey}` : ""));
  if (!rowId || (!audioSrc && !storagePath)) return null;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const minimum = 1;
  const startMs = Math.round(finite(raw.startMs ?? (raw.start == null ? 0 : raw.start * 1000), 0));
  const anchorStartMs = Math.max(0, Math.round(finite(raw.anchorStartMs ?? (raw.anchorStart == null ? startMs : raw.anchorStart * 1000), startMs)));
  const trimInMs = Math.max(0, Math.round(finite(raw.trimInMs ?? (raw.trimIn || 0) * 1000, 0)));
  const declaredDurationMs = finite(raw.durationMs ?? (raw.durationSec != null ? raw.durationSec * 1000 : raw.duration != null ? raw.duration * 1000 : Number(raw.endMs) - startMs), options.minDurationMs || 500);
  const trimOutMs = Math.max(trimInMs + 1, Math.round(finite(raw.trimOutMs ?? (raw.trimOut == null ? trimInMs + declaredDurationMs : raw.trimOut * 1000), trimInMs + declaredDurationMs)));
  const durationMs = Math.max(minimum, Math.round(finite(raw.durationMs ?? (raw.durationSec != null ? raw.durationSec * 1000 : raw.duration != null ? raw.duration * 1000 : raw.end != null && raw.start != null ? (raw.end - raw.start) * 1000 : trimOutMs - trimInMs), trimOutMs - trimInMs)));
  // An imported source window without Snoopy's scene anchor is an authored trim.
  // Record that fact before normalization supplies an anchor for compatibility.
  const importedTrim = raw.durationMode == null && raw.anchorStartMs == null && raw.anchorStart == null
    && (raw.trimOutMs != null || raw.trimOut != null);
  return {
    ...raw,
    ...(importedTrim ? { durationMode: "trim" } : {}),
    rowId, sceneIndex: Math.max(1, Math.round(finite(raw.sceneIndex, index + 1))),
    speakerName: String(raw.speakerName || "").replace(/\s+/g, " ").trim(),
    audioSrc, downloadUrl, storagePath, localMediaCacheKey, startMs, anchorStartMs,
    manualStartMs: raw.manualStartMs === true || raw.manualPosition === true,
    endMs: Math.max(startMs + minimum, Math.round(finite(raw.endMs ?? (raw.end == null ? startMs + durationMs : raw.end * 1000), startMs + durationMs))),
    trimInMs, trimOutMs, durationMs
  };
}

module.exports = { mediaDateMs, mediaDateIso, mediaResourceIdentity, mediaRevision, mediaMetadata, mergeMediaMapByEntryUpdatedAt, VERSION_MEDIA_FIELDS, mediaTarget, captureMediaSelection, selectSceneMedia, normalizeDialogueSegment };

// Reconcile selections and their derived visual type together; version maps never leak into another version.
function reconcileSessionMedia(current = {}, incoming = {}) {
  const reconcileTarget = (old, next) => {
    if (!old) return next;
    const merged = { ...next };
    for (const kind of ["Video", "Audio"]) {
      const field = `dialogue${kind}Map`;
      const deletedField = `dialogue${kind}DeletedAtMap`;
      const deleted = { ...(old[deletedField] || {}) };
      for (const [key, date] of Object.entries(next[deletedField] || {})) {
        if (!Number.isFinite(mediaDateMs(deleted[key])) || mediaDateMs(date) > mediaDateMs(deleted[key])) deleted[key] = date;
      }
      merged[field] = mergeMediaMapByEntryUpdatedAt(old[field], next[field]);
      merged[deletedField] = deleted;
      for (const [key, date] of Object.entries(deleted)) {
        if (mediaDateMs(date) >= (mediaDateMs(merged[field][key]?.updatedAt) || 0)) delete merged[field][key];
      }
    }
    const clips = { ...(next.podcastVideoConfig?.timelineClipsByRowId || {}) };
    for (const [key, clip] of Object.entries(merged.dialogueVideoMap)) {
      if (!clips[key]) continue;
      clips[key] = { ...clips[key], type: clip.type || (String(clip.mimeType).startsWith("image/") ? "image" : "video"), mediaDurationMs: Number(clip.mediaDurationMs || clip.durationSec * 1000 || clips[key].mediaDurationMs || 0) };
    }
    merged.podcastVideoConfig = { ...(next.podcastVideoConfig || {}), timelineClipsByRowId: clips };
    return merged;
  };
  const merged = reconcileTarget(mediaTarget(current, String(incoming.activeThreadId || "")), incoming);
  if (Array.isArray(incoming.threads)) merged.threads = incoming.threads.map(thread => {
    const old = String(current.activeThreadId || "") === String(thread.id) ? current : current.threads?.find(item => item.id === thread.id);
    return reconcileTarget(old, thread);
  });
  return merged;
}
module.exports.reconcileSessionMedia = reconcileSessionMedia;
