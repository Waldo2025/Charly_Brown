export function normalizedSessionMode(value) {
  return value === "lab" || value === "simulator" ? "simulator" : "game";
}

export const SCIENCE_TRIMESTERS = Object.freeze(["Trimestre 1", "Trimestre 2", "Trimestre 3"]);

export function normalizeScienceTrimester(value, fallback = "") {
  const compact = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
  const match = compact.match(/^(?:trim|trimestre)?([123])$/);
  return match ? `Trimestre ${match[1]}` : fallback;
}

export function sessionIdentityKeys(session = {}) {
  return [...new Set([
    session.id,
    session.localId,
    session.firebaseDocId
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

export function sessionsShareIdentity(left, right) {
  const rightKeys = new Set(sessionIdentityKeys(right));
  return sessionIdentityKeys(left).some((key) => rightKeys.has(key));
}

export function shouldKeepSessionAfterRemoteList(session, remoteSessions = [], listComplete = false) {
  if (!listComplete) return true;
  if (remoteSessions.some((remoteSession) => sessionsShareIdentity(session, remoteSession))) return true;
  return session?.syncState === "pending" || session?.syncState === "local";
}

export function sessionMetadataFromRecord(record = {}) {
  const activity = record.activity || {};
  const id = String(record.id || record.localId || record.firebaseDocId || "");
  return {
    id,
    firebaseDocId: record.firebaseDocId || null,
    savedAt: String(record.savedAt || ""),
    bodySavedAt: String(record.bodySavedAt || (record.activity ? record.savedAt : "") || ""),
    remoteSavedAt: String(record.remoteSavedAt || ""),
    remoteAvailable: record.remoteAvailable === true,
    syncState: record.syncState || "saved",
    title: String(record.title || activity.title || "Sesión sin título"),
    subject: String(record.subject || activity.subject || ""),
    topic: String(record.topic || activity.topic || ""),
    trimester: normalizeScienceTrimester(record.trimester || activity.trimester, "Trimestre 1"),
    gameMode: normalizedSessionMode(record.gameMode || activity.gameMode)
  };
}

export function sanitizeScienceSessionGroups(groups = []) {
  const claimedSessionIds = new Set();
  return (Array.isArray(groups) ? groups : []).reduce((normalized, source, index) => {
    const sessionIds = [...new Set((Array.isArray(source?.sessionIds) ? source.sessionIds : [])
      .map((value) => String(value || "").trim())
      .filter((sessionId) => sessionId && !claimedSessionIds.has(sessionId)))];
    if (!sessionIds.length) return normalized;
    sessionIds.forEach((sessionId) => claimedSessionIds.add(sessionId));
    normalized.push({
      id: String(source?.id || `session-group-${index + 1}`).trim().slice(0, 160),
      name: (String(source?.name || `Grupo ${index + 1}`).trim() || `Grupo ${index + 1}`).slice(0, 80),
      sessionIds,
      collapsed: source?.collapsed === true,
      createdAt: String(source?.createdAt || "").slice(0, 80)
    });
    return normalized;
  }, []);
}

export function orderHydrationCandidates(candidates = []) {
  return [...candidates].sort((left, right) => {
    const timestampDifference = Number(right?.timestamp || 0) - Number(left?.timestamp || 0);
    if (timestampDifference) return timestampDifference;
    if (left?.source === right?.source) return 0;
    if (left?.source === "draft") return -1;
    if (right?.source === "draft") return 1;
    return 0;
  });
}

export function isHydratableSessionActivity(activity) {
  return Boolean(
    activity
    && typeof activity === "object"
    && String(activity.title || "").trim()
  );
}

export function nextOfflineDatabaseVersion(currentVersion, minimumVersion, hasAllRequiredStores) {
  const current = Math.max(0, Number(currentVersion) || 0);
  const minimum = Math.max(1, Number(minimumVersion) || 1);
  if (hasAllRequiredStores && current >= minimum) return null;
  return Math.max(minimum, current + 1);
}
