const crypto = require("node:crypto");
const {
  getAdminServices,
  resolveAuthContext,
  asyncRoute
} = require("./common.js");

const SESSION_COLLECTION = "analizarPDF";
const STYLE_MAPPING_COLLECTION = "analizarPDFStyleMappings";
const REVISION_COLLECTION = "revisions";
const RESULT_COLLECTION = "analysisResults";
const CHUNK_COLLECTION = "chunks";
const RESULT_CHUNK_CHARS = 600000;
const MAX_SESSION_BYTES = 18 * 1024 * 1024;
const ALLOWED_STYLE_KINDS = new Set(["paragraph", "character", "swatch"]);

function text(value, max = 240, fallback = "") {
  const clean = String(value ?? fallback).trim();
  return clean.slice(0, max) || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function cloneJson(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}

function identifier(value, name = "id") {
  const clean = text(value, 120);
  if (!clean || !/^[A-Za-z0-9_.-]+$/.test(clean)) {
    throw Object.assign(new Error(`invalid_${name}`), { status: 400 });
  }
  return clean;
}

function revisionDocId(revision = {}, index = 0) {
  const raw = text(revision?.id || `revision_${index + 1}`, 120);
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 220) || `revision_${index + 1}`;
}

function resultDocId(revisionId = "", fileId = "") {
  return `${text(revisionId, 120)}__${text(fileId, 120)}`
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .slice(0, 260);
}

function normalizePageList(value = "", { zeroMeansEmpty = false, fallbackZero = false } = {}) {
  const seen = new Set();
  const values = text(value, 240)
    .split(",")
    .map((item) => Number.parseInt(String(item).trim(), 10))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
    .filter((item) => !(zeroMeansEmpty && item === 0))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  return values.length ? values.join(", ") : (fallbackZero ? "0" : "");
}

function buildMappingScopeKey(source = {}) {
  return [source.bookType, source.nivel, source.grado, source.unidad]
    .map((item) => text(item, 80).toLowerCase())
    .filter(Boolean)
    .join("|");
}

function sanitizeStyleMappingEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const styleKind = text(source.styleKind, 24).toLowerCase();
  return {
    id: text(source.id || `mapping_entry_${index + 1}`, 120, `mapping_entry_${index + 1}`),
    alias: text(source.alias, 120),
    styleKind: ALLOWED_STYLE_KINDS.has(styleKind) ? styleKind : "paragraph",
    styleName: text(source.styleName, 240),
    pageScope: ["even", "odd"].includes(text(source.pageScope, 16).toLowerCase())
      ? text(source.pageScope, 16).toLowerCase()
      : "both",
    targetPage: normalizePageList(source.targetPage, { zeroMeansEmpty: true }),
    excludeTargetPage: normalizePageList(source.excludeTargetPage, { zeroMeansEmpty: true, fallbackZero: true }),
    enabled: source.enabled !== false,
    notes: text(source.notes, 240)
  };
}

function sanitizeStyleMapping(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bookType = text(source.bookType, 32);
  const nivel = text(source.nivel, 80);
  const grado = text(source.grado, 80);
  const unidad = text(source.unidad, 80);
  const id = text(source.id || options.id, 120);
  return {
    id,
    ownerId: "",
    title: text(source.title, 240, "Mapeo sin título"),
    mappingSlug: text(source.mappingSlug || id, 160),
    scopeKey: text(source.scopeKey || buildMappingScopeKey({ bookType, nivel, grado, unidad }), 240),
    bookType,
    nivel,
    grado,
    unidad,
    groupId: text(source.groupId, 160),
    groupTitle: text(source.groupTitle, 240),
    isActive: source.isActive === true,
    createdAt: text(source.createdAt || options.createdAt, 80, nowIso()),
    updatedAt: text(source.updatedAt, 80, nowIso()),
    entries: Array.isArray(source.entries)
      ? source.entries.slice(0, 2000).map((entry, index) => sanitizeStyleMappingEntry(entry, index))
      : []
  };
}

function splitResultPayload(value = {}) {
  const base64 = Buffer.from(JSON.stringify(value || {}), "utf8").toString("base64");
  const chunks = [];
  for (let index = 0; index < base64.length; index += RESULT_CHUNK_CHARS) {
    chunks.push(base64.slice(index, index + RESULT_CHUNK_CHARS));
  }
  return chunks.length ? chunks : [""];
}

async function deleteSnapshot(db, snapshot) {
  if (!snapshot || snapshot.empty) return;
  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function loadRevisions(sessionRef, rootData = {}) {
  const snapshot = await sessionRef.collection(REVISION_COLLECTION).get();
  if (snapshot.empty) return Array.isArray(rootData.revisions) ? rootData.revisions : [];
  return snapshot.docs
    .map((doc, fallbackIndex) => ({
      revision: { ...cloneJson(doc.data()), id: text(doc.data()?.id || doc.id, 120, doc.id) },
      index: Number.isFinite(Number(doc.data()?.index)) ? Number(doc.data().index) : fallbackIndex
    }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.revision);
}

async function loadResults(sessionRef) {
  const snapshot = await sessionRef.collection(RESULT_COLLECTION).get();
  const results = [];
  for (const resultDoc of snapshot.docs) {
    const meta = resultDoc.data() || {};
    const chunks = await resultDoc.ref.collection(CHUNK_COLLECTION).orderBy("index", "asc").get();
    const base64 = chunks.docs.map((doc) => text(doc.data()?.data, RESULT_CHUNK_CHARS + 100)).join("");
    if (!base64) continue;
    try {
      const parsed = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
      results.push({
        ...parsed,
        revisionId: text(parsed.revisionId || meta.revisionId, 120),
        fileId: text(parsed.fileId || meta.fileId, 120)
      });
    } catch (error) {
      console.warn(JSON.stringify({
        severity: "WARNING",
        event: "analizar_pdf_result_decode_failed",
        sessionId: sessionRef.id,
        resultId: resultDoc.id,
        message: String(error?.message || error)
      }));
    }
  }
  return results;
}

function mergeResults(session = {}, results = []) {
  const next = cloneJson(session);
  const revisions = Array.isArray(next.revisions) ? next.revisions : [];
  for (const result of results) {
    const revision = revisions.find((item) => text(item?.id, 120) === text(result?.revisionId, 120));
    const file = (Array.isArray(revision?.files) ? revision.files : [])
      .find((item) => text(item?.id, 120) === text(result?.fileId, 120));
    if (!file) continue;
    file.analysisStatus = result.analysisStatus || file.analysisStatus || "completed";
    file.resultSummary = result.resultSummary || file.resultSummary;
    file.result = result.result || file.result;
    file.quickAnalysis = result.quickAnalysis || file.quickAnalysis || null;
    file.updatedAt = result.updatedAt || file.updatedAt || "";
  }
  return next;
}

async function loadOwnedSession(db, uid, sessionId) {
  const ref = db.collection(SESSION_COLLECTION).doc(identifier(sessionId, "session_id"));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("analizar_pdf_session_not_found"), { status: 404 });
  const data = snapshot.data() || {};
  if (text(data.ownerId, 180) !== uid) {
    throw Object.assign(new Error("analizar_pdf_session_forbidden"), { status: 403 });
  }
  return { ref, data };
}

async function hydrateSession(ref, data) {
  const session = { ...cloneJson(data), id: ref.id, revisions: await loadRevisions(ref, data) };
  return mergeResults(session, await loadResults(ref));
}

async function persistRevisions(db, sessionRef, uid, sessionId, revisions = []) {
  const existing = await sessionRef.collection(REVISION_COLLECTION).get();
  const desired = new Set(revisions.map((revision, index) => revisionDocId(revision, index)));
  await deleteSnapshot(db, {
    empty: existing.docs.every((doc) => desired.has(doc.id)),
    docs: existing.docs.filter((doc) => !desired.has(doc.id))
  });
  for (let index = 0; index < revisions.length; index += 400) {
    const batch = db.batch();
    revisions.slice(index, index + 400).forEach((revision, relativeIndex) => {
      const absoluteIndex = index + relativeIndex;
      const clean = cloneJson(revision);
      batch.set(sessionRef.collection(REVISION_COLLECTION).doc(revisionDocId(clean, absoluteIndex)), {
        ...clean,
        id: text(clean.id, 120, `revision_${absoluteIndex + 1}`),
        index: absoluteIndex,
        ownerId: uid,
        sessionId,
        updatedAt: text(clean.updatedAt, 80, nowIso())
      }, { merge: true });
    });
    await batch.commit();
  }
}

async function persistResults(db, sessionRef, uid, sessionId, rawResults = []) {
  for (const raw of Array.isArray(rawResults) ? rawResults : []) {
    const payload = cloneJson(raw);
    const revisionId = identifier(payload.revisionId, "revision_id");
    const fileId = identifier(payload.fileId, "file_id");
    const docId = resultDocId(revisionId, fileId);
    const ref = sessionRef.collection(RESULT_COLLECTION).doc(docId);
    const oldChunks = await ref.collection(CHUNK_COLLECTION).get();
    await deleteSnapshot(db, oldChunks);
    const chunks = splitResultPayload({ ...payload, revisionId, fileId });
    await ref.set({
      ownerId: uid,
      sessionId,
      revisionId,
      fileId,
      documentName: text(payload.documentName, 240),
      sourceType: text(payload.sourceType, 20, "pdf") === "idml" ? "idml" : "pdf",
      analysisStatus: text(payload.analysisStatus, 32, "completed"),
      resultSummary: cloneJson(payload.resultSummary),
      updatedAt: text(payload.updatedAt, 80, nowIso()),
      chunkCount: chunks.length,
      encoding: "base64-json-v1"
    }, { merge: true });
    for (let index = 0; index < chunks.length; index += 400) {
      const batch = db.batch();
      chunks.slice(index, index + 400).forEach((chunk, relativeIndex) => {
        const absoluteIndex = index + relativeIndex;
        batch.set(ref.collection(CHUNK_COLLECTION).doc(String(absoluteIndex).padStart(4, "0")), {
          index: absoluteIndex,
          data: chunk
        });
      });
      await batch.commit();
    }
  }
}

async function deleteSessionTree(db, ref) {
  await deleteSnapshot(db, await ref.collection(REVISION_COLLECTION).get());
  const results = await ref.collection(RESULT_COLLECTION).get();
  for (const result of results.docs) {
    await deleteSnapshot(db, await result.ref.collection(CHUNK_COLLECTION).get());
  }
  await deleteSnapshot(db, results);
  await ref.delete();
}

function registerSessionRoutes(app) {
  app.get("/api/analizar-pdf/sessions/list", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(SESSION_COLLECTION).where("ownerId", "==", authContext.uid).limit(80).get();
    const sessions = await Promise.all(snapshot.docs.map((doc) => hydrateSession(doc.ref, doc.data() || {})));
    sessions.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    res.status(200).json({ ok: true, sessions });
  }));

  app.post("/api/analizar-pdf/sessions/save", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const source = req.body?.session && typeof req.body.session === "object" ? cloneJson(req.body.session) : null;
    if (!source) throw Object.assign(new Error("analizar_pdf_session_payload_required"), { status: 400 });
    if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > MAX_SESSION_BYTES) {
      throw Object.assign(new Error("analizar_pdf_session_payload_too_large"), { status: 413 });
    }
    const { db } = getAdminServices();
    const sessionId = source.id ? identifier(source.id, "session_id") : `analizar_pdf_${crypto.randomUUID().slice(0, 12)}`;
    const ref = db.collection(SESSION_COLLECTION).doc(sessionId);
    const existing = await ref.get();
    if (existing.exists && text(existing.data()?.ownerId, 180) !== authContext.uid) {
      throw Object.assign(new Error("analizar_pdf_session_forbidden"), { status: 403 });
    }
    const revisions = Array.isArray(source.revisions) ? source.revisions.slice(0, 300) : [];
    const createdAt = text(existing.data()?.createdAt || source.createdAt, 80, nowIso());
    const updatedAt = nowIso();
    const root = {
      ...source,
      id: sessionId,
      ownerId: authContext.uid,
      createdAt,
      updatedAt,
      revisions: [],
      revisionOrder: revisions.map((revision, index) => text(revision?.id, 120, `revision_${index + 1}`)),
      revisionCount: revisions.length
    };
    await ref.set(root, { merge: true });
    await persistRevisions(db, ref, authContext.uid, sessionId, revisions);
    await persistResults(db, ref, authContext.uid, sessionId, req.body?.analysisResults);
    const session = await hydrateSession(ref, (await ref.get()).data() || root);
    res.status(200).json({ ok: true, session });
  }));

  app.post("/api/analizar-pdf/sessions/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const { ref } = await loadOwnedSession(db, authContext.uid, req.body?.sessionId);
    await deleteSessionTree(db, ref);
    res.status(200).json({ ok: true, sessionId: ref.id });
  }));
}

function registerStyleMappingRoutes(app) {
  app.get("/api/analizar-pdf/style-mappings/list", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(STYLE_MAPPING_COLLECTION).get();
    const mappings = snapshot.docs
      .map((doc) => sanitizeStyleMapping(doc.data() || {}, { id: doc.id }))
      .sort((a, b) => a.title.localeCompare(b.title));
    res.status(200).json({ ok: true, mappings });
  }));

  app.post("/api/analizar-pdf/style-mappings/save", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const source = req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : null;
    if (!source) throw Object.assign(new Error("analizar_pdf_mapping_payload_required"), { status: 400 });
    const { db } = getAdminServices();
    const id = source.id ? identifier(source.id, "mapping_id") : `mapping_${crypto.randomUUID().slice(0, 12)}`;
    const ref = db.collection(STYLE_MAPPING_COLLECTION).doc(id);
    const existing = await ref.get();
    const mapping = sanitizeStyleMapping({
      ...(existing.exists ? existing.data() : {}),
      ...source,
      id,
      createdAt: existing.data()?.createdAt || source.createdAt || nowIso(),
      updatedAt: nowIso()
    }, { id });
    if (mapping.isActive) {
      const all = await db.collection(STYLE_MAPPING_COLLECTION).get();
      const batch = db.batch();
      all.docs.forEach((doc) => {
        const candidate = doc.data() || {};
        if (doc.id !== id && text(candidate.scopeKey, 240) === mapping.scopeKey) {
          batch.set(doc.ref, { isActive: false, updatedAt: nowIso() }, { merge: true });
        }
      });
      batch.set(ref, mapping, { merge: true });
      await batch.commit();
    } else {
      await ref.set(mapping, { merge: true });
    }
    res.status(200).json({ ok: true, mapping: sanitizeStyleMapping((await ref.get()).data() || mapping, { id }) });
  }));

  app.post("/api/analizar-pdf/style-mappings/delete", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const { db } = getAdminServices();
    const mappingId = identifier(req.body?.mappingId, "mapping_id");
    const ref = db.collection(STYLE_MAPPING_COLLECTION).doc(mappingId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("analizar_pdf_mapping_not_found"), { status: 404 });
    await ref.delete();
    res.status(200).json({ ok: true, mappingId });
  }));

  app.post("/api/analizar-pdf/style-mappings/activate", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const { db } = getAdminServices();
    const mappingId = identifier(req.body?.mappingId, "mapping_id");
    const ref = db.collection(STYLE_MAPPING_COLLECTION).doc(mappingId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("analizar_pdf_mapping_not_found"), { status: 404 });
    const mapping = sanitizeStyleMapping({ ...snapshot.data(), id: mappingId, isActive: true, updatedAt: nowIso() }, { id: mappingId });
    const all = await db.collection(STYLE_MAPPING_COLLECTION).get();
    const batch = db.batch();
    all.docs.forEach((doc) => {
      if (doc.id !== mappingId && text(doc.data()?.scopeKey, 240) === mapping.scopeKey) {
        batch.set(doc.ref, { isActive: false, updatedAt: nowIso() }, { merge: true });
      }
    });
    batch.set(ref, mapping, { merge: true });
    await batch.commit();
    res.status(200).json({ ok: true, mapping });
  }));
}

function registerAnalizarPdfDataRoutes(app) {
  registerSessionRoutes(app);
  registerStyleMappingRoutes(app);
}

module.exports = {
  SESSION_COLLECTION,
  STYLE_MAPPING_COLLECTION,
  sanitizeStyleMappingEntry,
  sanitizeStyleMapping,
  registerAnalizarPdfDataRoutes
};
