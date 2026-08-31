const {
  WordPressClient,
  buildWordPressPostPayload,
  normalizeAudience,
  readWordPressConfig
} = require("./marcie-wordpress-core.js");
const crypto = require("node:crypto");

const MARCIE_COLLECTION = "MarcieBlogEditor";
const PUBLICATIONS_COLLECTION = "marcie_publications";
const RESERVATION_TTL_MS = 2 * 60 * 1000;
const MAX_COVER_BYTES = 12 * 1024 * 1024;

function clampText(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

const AIDA_REQUIRED_PHASES = ["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"];

function isAidaArticleCompatible(article = {}) {
  if (String(article.editorialMode || "").toLowerCase() !== "aida") return false;
  const phases = Array.isArray(article.aida?.phases) ? article.aida.phases.map(String) : [];
  const orderedBlockPhases = (Array.isArray(article.blocks) ? article.blocks : []).map((block) => String(block?.phase || "")).filter((phase) => AIDA_REQUIRED_PHASES.includes(phase));
  const blockPhases = new Set(orderedBlockPhases);
  let previousIndex = -1;
  const ordered = AIDA_REQUIRED_PHASES.filter((phase) => phase !== "headline").every((phase) => {
    const index = orderedBlockPhases.indexOf(phase);
    if (index <= previousIndex) return false;
    previousIndex = index;
    return true;
  });
  return AIDA_REQUIRED_PHASES.every((phase) => phases.includes(phase))
    && AIDA_REQUIRED_PHASES.filter((phase) => phase !== "headline").every((phase) => blockPhases.has(phase))
    && ordered;
}

function evidenceBlockers(article = {}, context = {}) {
  const claims = Array.isArray(article.articleClaims) ? article.articleClaims : [];
  const sources = Array.isArray(article.researchSources || article.sources) ? (article.researchSources || article.sources) : [];
  const verification = article.verification || {};
  const blockers = [];
  const expectedMode = String(context.editorialMode || article.editorialMode || "marcie").toLowerCase();
  if (expectedMode === "aida") {
    if (!isAidaArticleCompatible(article) || article.modeCompatibility === "legacy_incompatible") blockers.push("aida_structure_incompatible");
    const institutions = new Set(sources.map((source) => String(source?.publisher || source?.domain || "").trim().toLowerCase()).filter(Boolean));
    if (sources.filter((source) => source?.verificationStatus === "verified").length < 3) blockers.push("aida_insufficient_verified_sources");
    if (institutions.size < 3) blockers.push("aida_insufficient_institutions");
    if (article.aidaCompliance?.status !== "verified") blockers.push("aida_review_incomplete");
    const closingText = String([...((Array.isArray(article.blocks) ? article.blocks : []))].reverse().find((block) => block?.phase === "close")?.text || "").trim();
    const brandLine = String(article.aida?.brandLine || "").trim();
    if (brandLine && !closingText.endsWith(brandLine)) blockers.push("aida_brand_line_missing");
    if (/\b(?:compra|contrata|suscr[ií]bete|inscr[ií]bete|agenda (?:una )?(?:llamada|asesor[ií]a)|cont[aá]ctanos|adquiere)\b/i.test(closingText)) blockers.push("aida_commercial_cta");
  }
  if (!sources.length || sources.some((source) => source?.verificationStatus !== "verified")) blockers.push("unverified_sources");
  if (!claims.length) blockers.push("no_claims_verified");
  if (claims.some((claim) => claim.status !== "supported")) blockers.push("unsupported_claims");
  if (Array.isArray(verification.contradictions) && verification.contradictions.length) blockers.push("contradictions_pending");
  if (Number(verification.coverage || 0) < 100 || !["verified", "complete"].includes(String(verification.status || "").toLowerCase())) blockers.push("verification_incomplete");
  return [...new Set(blockers)];
}

function articleContentHash(article = {}) {
  const material = JSON.stringify({ title: article.title, subtitle: article.subtitle, blocks: article.blocks, sources: article.researchSources || article.sources, seo: article.seo });
  return crypto.createHash("sha256").update(material).digest("hex");
}

function normalizeToken(value = "") {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
}

function isApprovedProfile(data = {}) {
  const role = normalizeToken(data.role || data.rol || data.userRole || data.requestedRole);
  const status = normalizeToken(data.approvalStatus || data.status || data.estadoAprobacion || data.estado || "");
  if (["pending", "pendiente", "rejected", "rechazado", "blocked", "bloqueado"].includes(status)) return false;
  if (["approved", "aprobado", "active", "activo"].includes(status)) return true;
  if (data.approved === true || data.isApproved === true || data.aprobado === true) return true;
  return Boolean(role && !["pending", "pendiente"].includes(role));
}

function isEditorialPublisherProfile(data = {}) {
  const role = normalizeToken(data.role || data.rol || data.userRole || data.requestedRole);
  return ["admin", "administrator", "administrador", "superadmin", "owner", "editor", "editorial", "author", "autor", "developer", "desarrollo", "dev"].includes(role);
}

async function assertApprovedUser(authContext, db) {
  if (isApprovedProfile(authContext?.token || {})) return;
  const profile = await db.collection("users").doc(authContext.uid).get();
  if (profile.exists && isApprovedProfile(profile.data() || {})) return;
  throw Object.assign(new Error("marcie_user_not_approved"), { status: 403, code: "marcie_user_not_approved" });
}

async function assertEditorialPublisher(authContext, db) {
  if (isEditorialPublisherProfile(authContext?.token || {})) return;
  const profile = await db.collection("users").doc(authContext.uid).get();
  if (profile.exists && isEditorialPublisherProfile(profile.data() || {})) return;
  throw Object.assign(new Error("marcie_editor_role_required"), { status: 403, code: "marcie_editor_role_required" });
}

async function loadOwnedApprovedSession({ db, uid, sessionId, audience, allowPublished = false }) {
  const cleanSessionId = clampText(sessionId, 160);
  if (!cleanSessionId) throw Object.assign(new Error("marcie_session_id_required"), { status: 400, code: "marcie_session_id_required" });
  const normalizedAudience = normalizeAudience(audience || "educators");
  const ref = db.collection(MARCIE_COLLECTION).doc(cleanSessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("marcie_session_not_found"), { status: 404, code: "marcie_session_not_found" });
  const session = snapshot.data() || {};
  const ownerId = clampText(session.ownerId || session.ownerUid, 160);
  if (!ownerId || ownerId !== uid) {
    throw Object.assign(new Error("marcie_session_forbidden"), { status: 403, code: "marcie_session_forbidden" });
  }
  const allowedStatuses = allowPublished ? ["approved", "published"] : ["approved"];
  if (!allowedStatuses.includes(String(session.status || "").trim().toLowerCase())) {
    throw Object.assign(new Error("marcie_article_not_approved"), { status: 409, code: "marcie_article_not_approved" });
  }
  const approvedAudiences = Array.isArray(session.approvedAudiences) ? session.approvedAudiences.map(String) : [];
  if (!approvedAudiences.includes(normalizedAudience) && !(allowPublished && session.status === "published")) {
    throw Object.assign(new Error("marcie_article_not_approved"), { status: 409, code: "marcie_article_not_approved" });
  }
  const article = session.articlesByAudience?.[normalizedAudience]
    || (session.audience === normalizedAudience ? session.article : null);
  if (!article || !clampText(article.title, 500) || !Array.isArray(article.blocks) || !article.blocks.length) {
    throw Object.assign(new Error("marcie_article_missing"), { status: 422, code: "marcie_article_missing" });
  }
  const blockers = evidenceBlockers(article, { editorialMode: session.editorialMode });
  const currentContentHash = articleContentHash(article);
  if (!article.approval?.contentHash || article.approval.contentHash !== currentContentHash) blockers.push("approval_content_hash_mismatch");
  if (blockers.length) {
    throw Object.assign(new Error("marcie_article_not_verified"), { status: 409, code: "marcie_article_not_verified", blockers });
  }
  return { ref, session, article, audience: normalizedAudience, sessionId: cleanSessionId };
}

function getPublicationId(sessionId, audience) {
  return `${clampText(sessionId, 160)}_${normalizeAudience(audience)}`.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 300);
}

function publicConfig(config) {
  if (!config?.configured) return { configured: false, siteUrl: "", siteHost: "" };
  const parsed = new URL(config.baseUrl);
  return { configured: true, siteUrl: config.baseUrl, siteHost: parsed.host };
}

function publicPublication(data = {}) {
  if (!data || typeof data !== "object") return null;
  return {
    id: clampText(data.id, 320),
    sessionId: clampText(data.sessionId, 160),
    audience: clampText(data.audience, 40),
    status: clampText(data.status, 40),
    remoteId: Number(data.remoteId || 0),
    remoteUrl: clampText(data.remoteUrl, 2000),
    editUrl: clampText(data.editUrl, 2000),
    remoteSlug: clampText(data.remoteSlug, 220),
    updatedAt: clampText(data.updatedAt, 80),
    publishedAt: clampText(data.publishedAt, 80),
    scheduledAt: clampText(data.scheduledAt, 80),
    publishAtUtc: clampText(data.publishAtUtc, 80),
    calendarItemId: clampText(data.calendarItemId, 200),
    contentHash: clampText(data.contentHash, 128),
    errorCode: clampText(data.errorCode, 160)
  };
}

async function writePublicationAudit(db, entry = {}) {
  await db.collection("MarciePublicationAudit").add({ ...entry, at: new Date().toISOString() });
}

async function withTransientRetry(operation, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (!/wordpress_(?:timeout|http_(?:429|500|502|503|504))/.test(String(error?.code || error?.message || "")) || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}

async function reservePublication({ db, publicationRef, uid, sessionId, audience }) {
  let existing = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(publicationRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    if (Number(data.remoteId || 0) > 0) {
      existing = data;
      return;
    }
    const startedAtMs = Date.parse(String(data.startedAt || ""));
    if (data.status === "creating" && Number.isFinite(startedAtMs) && Date.now() - startedAtMs < RESERVATION_TTL_MS) {
      throw Object.assign(new Error("marcie_publication_in_progress"), { status: 409, code: "marcie_publication_in_progress" });
    }
    const now = new Date().toISOString();
    transaction.set(publicationRef, {
      id: publicationRef.id,
      ownerId: uid,
      sessionId,
      audience,
      provider: "wordpress",
      status: "creating",
      startedAt: now,
      updatedAt: now,
      errorCode: ""
    }, { merge: true });
  });
  return existing;
}

async function loadCoverAsset(bucket, article = {}) {
  const cover = article.featuredImage && typeof article.featuredImage === "object" ? article.featuredImage : {};
  const storagePath = clampText(cover.storagePath || cover.path, 900);
  if (!storagePath) return null;
  if (!storagePath.includes("/marcie-blog-editor/")) {
    throw Object.assign(new Error("marcie_cover_storage_path_invalid"), { status: 422, code: "marcie_cover_storage_path_invalid" });
  }
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const size = Number(metadata?.size || 0);
  if (size <= 0 || size > MAX_COVER_BYTES) {
    throw Object.assign(new Error("marcie_cover_too_large"), { status: 413, code: "marcie_cover_too_large" });
  }
  const [buffer] = await bucket.file(storagePath).download();
  return {
    buffer,
    mimeType: clampText(cover.mimeType || metadata?.contentType || "image/jpeg", 120),
    filename: `marcie-${clampText(article.audience || "articulo", 80)}-portada`,
    altText: clampText(article.title, 500)
  };
}

function registerMarcieWordPressRoutes(app, dependencies = {}) {
  const common = dependencies.resolveAuthContext && dependencies.getAdminServices ? {} : require("./common.js");
  const resolveRequestAuth = dependencies.resolveAuthContext || common.resolveAuthContext;
  const getServices = dependencies.getAdminServices || common.getAdminServices;
  const wrapAsync = dependencies.asyncRoute || common.asyncRoute || ((handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next));
  app.get("/api/marcie/wordpress/status", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    const config = readWordPressConfig();
    let publication = null;
    const sessionId = clampText(req.query?.sessionId, 160);
    const audience = clampText(req.query?.audience || "educators", 40);
    if (sessionId) {
      const snapshot = await db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(sessionId, audience)).get();
      if (snapshot.exists && String(snapshot.data()?.ownerId || "") === authContext.uid) publication = publicPublication(snapshot.data());
    }
    return res.status(200).json({ ok: true, ...publicConfig(config), publication });
  }));

  app.post("/api/marcie/wordpress/test", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const config = readWordPressConfig();
    const user = await new WordPressClient({ config }).testConnection();
    return res.status(200).json({ ok: true, ...publicConfig(config), user });
  }));

  app.post("/api/marcie/wordpress/draft", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db, bucket } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const loaded = await loadOwnedApprovedSession({
      db,
      uid: authContext.uid,
      sessionId: req.body?.sessionId,
      audience: req.body?.audience
    });
    const config = readWordPressConfig();
    const client = new WordPressClient({ config });
    const publicationRef = db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(loaded.sessionId, loaded.audience));
    const existing = await reservePublication({
      db,
      publicationRef,
      uid: authContext.uid,
      sessionId: loaded.sessionId,
      audience: loaded.audience
    });
    try {
      await client.testConnection();
      let featuredMediaId = Number(existing?.featuredMediaId || 0);
      const cover = await loadCoverAsset(bucket, loaded.article);
      if (cover && !featuredMediaId) featuredMediaId = Number((await client.uploadMedia(cover)).id || 0);
      const [categoryIds, tagIds] = await Promise.all([
        client.ensureTerms("categories", loaded.article.category ? [loaded.article.category] : []),
        client.ensureTerms("tags", Array.isArray(loaded.article.tags) ? loaded.article.tags : [])
      ]);
      const postPayload = buildWordPressPostPayload({
        article: loaded.article,
        sessionId: loaded.sessionId,
        audience: loaded.audience,
        status: "draft",
        featuredMediaId,
        categoryIds,
        tagIds
      });
      const remote = existing?.remoteId ? await client.updateDraft(existing.remoteId, postPayload) : await client.createOrUpdateDraft(postPayload);
      const now = new Date().toISOString();
      const editUrl = `${config.baseUrl.replace(/\/+$/, "")}/wp-admin/post.php?post=${remote.id}&action=edit`;
      const publication = {
        id: publicationRef.id,
        ownerId: authContext.uid,
        sessionId: loaded.sessionId,
        audience: loaded.audience,
        provider: "wordpress",
        status: remote.status || "draft",
        remoteId: remote.id,
        remoteUrl: remote.link || "",
        editUrl,
        remoteSlug: remote.slug || "",
        featuredMediaId,
        updatedAt: now,
        createdAt: existing?.createdAt || now,
        errorCode: ""
      };
      await publicationRef.set(publication, { merge: true });
      await loaded.ref.update({
        [`publicationsByAudience.${loaded.audience}`]: publicPublication(publication),
        updatedAt: new Date()
      });
      await writePublicationAudit(db, { operation: existing?.remoteId ? "draft_updated" : "draft_created", uid: authContext.uid, sessionId: loaded.sessionId, audience: loaded.audience, publicationId: publicationRef.id, wordpressPostId: remote.id });
      return res.status(existing?.remoteId ? 200 : 201).json({ ok: true, reused: Boolean(existing?.remoteId), publication: publicPublication(publication) });
    } catch (error) {
      await publicationRef.set({
        status: "failed",
        errorCode: clampText(error?.code || error?.message || "wordpress_draft_failed", 160),
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
      throw error;
    }
  }));

  app.post("/api/marcie/wordpress/publish", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const loaded = await loadOwnedApprovedSession({
      db,
      uid: authContext.uid,
      sessionId: req.body?.sessionId,
      audience: req.body?.audience,
      allowPublished: true
    });
    const publicationRef = db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(loaded.sessionId, loaded.audience));
    const snapshot = await publicationRef.get();
    if (!snapshot.exists || String(snapshot.data()?.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("marcie_wordpress_draft_required"), { status: 409, code: "marcie_wordpress_draft_required" });
    }
    const current = snapshot.data() || {};
    if (!Number(current.remoteId || 0)) {
      throw Object.assign(new Error("marcie_wordpress_draft_required"), { status: 409, code: "marcie_wordpress_draft_required" });
    }
    if (current.status === "publish") {
      return res.status(200).json({ ok: true, reused: true, publication: publicPublication(current) });
    }
    const config = readWordPressConfig();
    const remote = await new WordPressClient({ config }).publishPost(current.remoteId);
    const now = new Date().toISOString();
    const publication = {
      ...current,
      status: remote.status || "publish",
      remoteUrl: remote.link || current.remoteUrl || "",
      remoteSlug: remote.slug || current.remoteSlug || "",
      updatedAt: now,
      publishedAt: now,
      publishedBy: authContext.uid,
      errorCode: ""
    };
    await publicationRef.set(publication, { merge: true });
    await loaded.ref.update({
      status: "published",
      [`publicationsByAudience.${loaded.audience}`]: publicPublication(publication),
      updatedAt: new Date()
    });
    await writePublicationAudit(db, { operation: "published_immediately", uid: authContext.uid, sessionId: loaded.sessionId, audience: loaded.audience, publicationId: publicationRef.id, wordpressPostId: current.remoteId });
    return res.status(200).json({ ok: true, publication: publicPublication(publication) });
  }));

  app.post("/api/marcie/wordpress/schedule", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const loaded = await loadOwnedApprovedSession({ db, uid: authContext.uid, sessionId: req.body?.sessionId, audience: req.body?.audience });
    const publishAtUtc = clampText(req.body?.publishAtUtc, 80);
    const publishAtLocal = clampText(req.body?.publishAtLocal, 80);
    const timezone = clampText(req.body?.timezone || "America/Cancun", 80);
    const publishMs = Date.parse(publishAtUtc);
    if (!Number.isFinite(publishMs) || publishMs <= Date.now() + 60_000 || !publishAtLocal) {
      throw Object.assign(new Error("marcie_publish_date_invalid"), { status: 422, code: "marcie_publish_date_invalid" });
    }
    const publicationRef = db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(loaded.sessionId, loaded.audience));
    const snapshot = await publicationRef.get();
    const current = snapshot.exists ? snapshot.data() || {} : {};
    if (!Number(current.remoteId || 0) || String(current.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("marcie_wordpress_draft_required"), { status: 409, code: "marcie_wordpress_draft_required" });
    }
    const contentHash = articleContentHash(loaded.article);
    const idempotencyKey = crypto.createHash("sha256").update(`${clampText(req.body?.calendarItemId, 200)}:${contentHash}:${publishAtUtc}`).digest("hex");
    if (current.idempotencyKey === idempotencyKey && current.status === "future") {
      return res.status(200).json({ ok: true, reused: true, publication: publicPublication(current) });
    }
    const payload = buildWordPressPostPayload({ article: loaded.article, sessionId: loaded.sessionId, audience: loaded.audience, status: "future", featuredMediaId: current.featuredMediaId });
    const wordpressClient = new WordPressClient({ config: readWordPressConfig() });
    const remote = await withTransientRetry(() => wordpressClient.schedulePost(current.remoteId, { payload, date: publishAtLocal, dateGmt: publishAtUtc.replace(/Z$/, "") }));
    const now = new Date().toISOString();
    const publication = { ...current, status: remote.status || "future", remoteUrl: remote.link || current.remoteUrl || "", publishAtUtc, publishAtLocal, timezone, scheduledAt: now, calendarItemId: clampText(req.body?.calendarItemId, 200), contentHash, idempotencyKey, updatedAt: now, errorCode: "" };
    await publicationRef.set(publication, { merge: true });
    if (publication.calendarItemId) await db.collection("MarcieEditorialCalendar").doc(publication.calendarItemId).set({ status: "scheduled", wordpressPublicationId: publicationRef.id, wordpressPostId: Number(current.remoteId), lastScheduledContentHash: contentHash, publishAtUtc, publishAtLocal, timezone, blockedReasons: [], updatedAt: now }, { merge: true });
    await writePublicationAudit(db, { operation: current.status === "future" ? "rescheduled" : "scheduled", uid: authContext.uid, sessionId: loaded.sessionId, audience: loaded.audience, calendarItemId: publication.calendarItemId, publicationId: publicationRef.id, wordpressPostId: current.remoteId, contentHash, publishAtUtc });
    return res.status(200).json({ ok: true, publication: publicPublication(publication) });
  }));

  app.post("/api/marcie/wordpress/cancel-schedule", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const publicationRef = db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(req.body?.sessionId, req.body?.audience || "educators"));
    const snapshot = await publicationRef.get();
    const current = snapshot.exists ? snapshot.data() || {} : {};
    if (String(current.ownerId || "") !== authContext.uid || !Number(current.remoteId || 0)) throw Object.assign(new Error("marcie_wordpress_draft_required"), { status: 409, code: "marcie_wordpress_draft_required" });
    const wordpressClient = new WordPressClient({ config: readWordPressConfig() });
    const remote = await withTransientRetry(() => wordpressClient.cancelScheduledPost(current.remoteId));
    const now = new Date().toISOString();
    await publicationRef.set({ status: remote.status || "draft", publishAtUtc: "", publishAtLocal: "", idempotencyKey: "", updatedAt: now }, { merge: true });
    if (current.calendarItemId) await db.collection("MarcieEditorialCalendar").doc(current.calendarItemId).set({ status: "blocked", blockedReasons: [clampText(req.body?.reason || "programación cancelada", 300)], updatedAt: now }, { merge: true });
    await writePublicationAudit(db, { operation: "schedule_cancelled", uid: authContext.uid, sessionId: current.sessionId, audience: current.audience, calendarItemId: current.calendarItemId, publicationId: publicationRef.id, wordpressPostId: current.remoteId, reason: clampText(req.body?.reason, 300) });
    return res.status(200).json({ ok: true, publication: publicPublication({ ...current, status: remote.status || "draft", updatedAt: now }) });
  }));

  app.post("/api/marcie/wordpress/reconcile", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req);
    const { db } = getServices();
    await assertApprovedUser(authContext, db);
    await assertEditorialPublisher(authContext, db);
    const publicationRef = db.collection(PUBLICATIONS_COLLECTION).doc(getPublicationId(req.body?.sessionId, req.body?.audience || "educators"));
    const snapshot = await publicationRef.get();
    const current = snapshot.exists ? snapshot.data() || {} : {};
    if (String(current.ownerId || "") !== authContext.uid || !Number(current.remoteId || 0)) throw Object.assign(new Error("marcie_wordpress_draft_required"), { status: 409, code: "marcie_wordpress_draft_required" });
    const wordpressClient = new WordPressClient({ config: readWordPressConfig() });
    const remote = await withTransientRetry(() => wordpressClient.getPost(current.remoteId));
    const now = new Date().toISOString();
    const publishedAt = remote.status === "publish" ? (current.publishedAt || now) : "";
    await publicationRef.set({ status: remote.status, remoteUrl: remote.link || current.remoteUrl || "", publishedAt, updatedAt: now }, { merge: true });
    if (current.calendarItemId) await db.collection("MarcieEditorialCalendar").doc(current.calendarItemId).set({ status: remote.status === "publish" ? "published" : remote.status === "future" ? "scheduled" : "blocked", publishedAt, updatedAt: now }, { merge: true });
    await writePublicationAudit(db, { operation: "status_reconciled", uid: authContext.uid, sessionId: current.sessionId, audience: current.audience, calendarItemId: current.calendarItemId, publicationId: publicationRef.id, wordpressPostId: current.remoteId, remoteStatus: remote.status });
    return res.status(200).json({ ok: true, publication: publicPublication({ ...current, ...remote, publishedAt, updatedAt: now }) });
  }));
}

module.exports = {
  PUBLICATIONS_COLLECTION,
  assertApprovedUser,
  assertEditorialPublisher,
  getPublicationId,
  isApprovedProfile,
  evidenceBlockers,
  isAidaArticleCompatible,
  articleContentHash,
  withTransientRetry,
  loadOwnedApprovedSession,
  publicPublication,
  registerMarcieWordPressRoutes
};
