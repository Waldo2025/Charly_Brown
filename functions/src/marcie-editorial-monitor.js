const { getAdminServices } = require("./common.js");
const { WordPressClient, readWordPressConfig } = require("./marcie-wordpress-core.js");
const { articleContentHash, evidenceBlockers } = require("./marcie-wordpress.js");

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function notifyBlocked(db, item, reasons, nowIso) {
  const id = `calendar_${item.id}_${Buffer.from(reasons.join("|")).toString("base64url").slice(0, 40)}`;
  await db.collection("MarcieNotifications").doc(id).set({ type: "publication_blocked", calendarItemId: item.id, sessionId: item.sessionId || "", audience: item.audience || "", reasons, readBy: [], createdAt: nowIso, updatedAt: nowIso }, { merge: true });
}

async function monitorMarcieEditorialCalendar(now = Date.now()) {
  const { db } = getAdminServices();
  const nowIso = new Date(now).toISOString();
  const snapshot = await db.collection("MarcieEditorialCalendar").where("status", "in", ["idea", "planned", "researching", "drafting", "review", "approved", "scheduled"]).limit(100).get();
  let published = 0;
  let blocked = 0;
  let checked = 0;
  let client = null;
  for (const document of snapshot.docs) {
    const item = { id: document.id, ...(document.data() || {}) };
    const due = millis(item.publishAtUtc) > 0 && millis(item.publishAtUtc) <= now;
    if (!due && item.status !== "scheduled") continue;
    checked += 1;
    const sessionSnapshot = item.sessionId ? await db.collection("MarcieBlogEditor").doc(item.sessionId).get() : null;
    const session = sessionSnapshot?.exists ? sessionSnapshot.data() || {} : {};
    const article = session.articlesByAudience?.[item.audience] || (session.audience === item.audience ? session.article : null);
    const reasons = [];
    if (!article) reasons.push("article_missing");
    if (!Array.isArray(session.approvedAudiences) || !session.approvedAudiences.includes(item.audience)) reasons.push("approval_missing");
    if (article) reasons.push(...evidenceBlockers(article, { editorialMode: item.editorialMode || session.editorialMode }));
    const currentHash = article ? articleContentHash(article) : "";
    if (item.lastScheduledContentHash && currentHash && item.lastScheduledContentHash !== currentHash) reasons.push("content_changed_after_schedule");
    const publicationSnapshot = item.wordpressPublicationId ? await db.collection("marcie_publications").doc(item.wordpressPublicationId).get() : null;
    const publication = publicationSnapshot?.exists ? publicationSnapshot.data() || {} : {};
    if (!Number(publication.remoteId || item.wordpressPostId || 0)) reasons.push("wordpress_not_synced");
    if (reasons.length) {
      if (publication.remoteId && publication.status === "future") {
        client ||= new WordPressClient({ config: readWordPressConfig() });
        await client.cancelScheduledPost(publication.remoteId).catch(() => null);
        await publicationSnapshot.ref.set({ status: "draft", errorCode: reasons[0], updatedAt: nowIso }, { merge: true });
      }
      await document.ref.set({ status: "blocked", blockedReasons: [...new Set(reasons)], updatedAt: nowIso }, { merge: true });
      await notifyBlocked(db, item, [...new Set(reasons)], nowIso);
      blocked += 1;
      continue;
    }
    if (publication.remoteId && item.status === "scheduled") {
      client ||= new WordPressClient({ config: readWordPressConfig() });
      const remote = await client.getPost(publication.remoteId);
      if (remote.status === "publish") {
        await document.ref.set({ status: "published", publishedAt: nowIso, blockedReasons: [], updatedAt: nowIso }, { merge: true });
        await publicationSnapshot.ref.set({ status: "publish", remoteUrl: remote.link || publication.remoteUrl || "", publishedAt: nowIso, updatedAt: nowIso }, { merge: true });
        published += 1;
      }
    }
  }
  return { checked, blocked, published };
}

module.exports = { millis, monitorMarcieEditorialCalendar };
