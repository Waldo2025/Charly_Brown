import mediaState from "./podcaster-media-state.js?v=2026-09-10.snoopy-media-22";
// Pure selection rules shared by the local check and the Firestore transaction.
export const REFERENCE_FIELDS = ["rowReferenceImageMap", "rowReferenceImageListMap", "rowReferenceVideoMap", "rowReferenceModeByRowId"];

export function referenceIdentity(record = {}) {
  return String(record.localMediaCacheKey || mediaState.mediaResourceIdentity(record) || "");
}

function referenceAliases(record) {
  return [...new Set([referenceIdentity(record), record.storagePath, mediaState.mediaResourceIdentity(record)].filter(Boolean))];
}

function legacyRoot(session, threadId) {
  return Boolean(threadId && !session?.activeThreadId && !session?.threads?.length);
}

export function referenceList(scope, rowId) {
  const list = scope?.rowReferenceImageListMap?.[rowId];
  return Array.isArray(list) && list.length ? list : scope?.rowReferenceImageMap?.[rowId] ? [scope.rowReferenceImageMap[rowId]] : [];
}

export function referenceScope(session, threadId) {
  if (!session) return null;
  if (String(session.activeThreadId || "") === String(threadId || "")) return session;
  if (legacyRoot(session, threadId)) return session;
  const thread = session.threads?.find(item => String(item.id) === String(threadId));
  if (!thread) return null;
  // Legacy versions did not snapshot references. Only inherit references for their own rows.
  const ids = new Set((thread.script?.rows || []).map(row => String(row.id)));
  return { ...thread, ...Object.fromEntries(REFERENCE_FIELDS.map(key => [key,
    thread[key] ?? Object.fromEntries(Object.entries(session[key] || {}).filter(([id]) => ids.has(id))) ])) };
}

export function captureReferenceEdit(session, rowId, index, requestId) {
  const record = referenceList(session, rowId)[index];
  if (!record || !(session?.script?.rows || []).some(row => String(row.id) === String(rowId))) throw new Error("La referencia ya no está disponible.");
  return { sessionId: String(session.id), threadId: String(session.activeThreadId || ""), rowId: String(rowId),
    identity: referenceIdentity(record), aliases: referenceAliases(record),
    resourceIdentity: record.storagePath ? mediaState.mediaResourceIdentity(record) : "",
    modifiedAt: mediaState.mediaDateIso(record.updatedAt), revision: String(record.referenceRevision || ""), requestId };
}

export function compactReference(record = {}) {
  const keys = ["name", "storagePath", "downloadUrl", "mimeType", "localMediaCacheKey", "updatedAt", "createdAt", "width", "height", "referenceRevision", "referenceEditId"];
  return Object.fromEntries(keys.filter(key => record[key] != null).map(key => [key, record[key]]));
}

export function selectEditedReference(session, context, resource, original = null) {
  const conflict = { status: "conflict", message: "La referencia cambió o se eliminó. El resultado sigue disponible para descargar." };
  if (!session || String(session.id) !== context.sessionId) return conflict;
  const scope = referenceScope(session, context.threadId);
  if (!scope || !(scope.script?.rows || []).some(row => String(row.id) === context.rowId)) return conflict;
  const list = referenceList(scope, context.rowId);
  const already = list.find(item => item.referenceEditId === context.requestId);
  if (already) return { status: "applied", unchanged: true, session, record: already };
  const expected = new Set([context.identity, ...(context.aliases || [])]);
  const index = list.findIndex(item => {
    const resource = item.storagePath ? mediaState.mediaResourceIdentity(item) : "";
    if (context.resourceIdentity && resource && context.resourceIdentity !== resource) return false;
    const modifiedAt = mediaState.mediaDateIso(item.updatedAt);
    if (context.modifiedAt && modifiedAt && context.modifiedAt !== modifiedAt) return false;
    return referenceAliases(item).some(key => expected.has(key)) && String(item.referenceRevision || "") === context.revision;
  });
  if (index < 0 || scope.rowReferenceModeByRowId?.[context.rowId] === "video") return conflict;
  if (!resource?.storagePath || !resource?.downloadUrl) throw new Error("La imagen todavía no se ha guardado.");
  const previous = list[index];
  const entries = [...(previous.referenceEditHistory || []), compactReference(original || previous)];
  const history = entries.length > 20 ? [entries[0], ...entries.slice(-19)] : entries;
  const record = { ...compactReference(resource), referenceRevision: context.requestId, referenceEditId: context.requestId,
    referenceEditHistory: history };
  const nextList = list.map((item, i) => i === index ? record : item);
  const patch = {
    rowReferenceImageMap: { ...scope.rowReferenceImageMap, [context.rowId]: nextList[0] },
    rowReferenceImageListMap: { ...scope.rowReferenceImageListMap, [context.rowId]: nextList },
    rowReferenceVideoMap: { ...scope.rowReferenceVideoMap },
    rowReferenceModeByRowId: { ...scope.rowReferenceModeByRowId, [context.rowId]: "image" }
  };
  delete patch.rowReferenceVideoMap[context.rowId];
  const migrated = legacyRoot(session, context.threadId);
  const active = String(session.activeThreadId || "") === context.threadId || migrated;
  const threads = migrated ? [{ id: context.threadId, name: "Versión 1", script: session.script, chat: session.chat || [], prompt: session.prompt || "",
    ...Object.fromEntries([...REFERENCE_FIELDS, "dialogueVideoMap", "dialogueAudioMap", "dialogueVideoDeletedAtMap", "dialogueAudioDeletedAtMap", "podcastVideoConfig", "visualEffectsMap"].map(key => [key, session[key] || {}])) }] : session.threads || [];
  const next = { ...session, ...(active ? patch : {}), updatedAt: resource.updatedAt || new Date().toISOString(),
    ...(migrated ? { activeThreadId: context.threadId } : {}),
    threads: threads.map(thread => String(thread.id) === context.threadId ? { ...thread, ...patch } : thread) };
  return { status: "applied", session: next, record };
}
