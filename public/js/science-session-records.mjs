export function normalizedSessionMode(value) {
  return value === "lab" || value === "simulator" ? "simulator" : "game";
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
    gameMode: normalizedSessionMode(record.gameMode || activity.gameMode)
  };
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
