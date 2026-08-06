const TIMELINE_ROW_HEIGHTS_STORAGE_KEY = "cb_podcast_timeline_row_heights_v1";

function getSessionStorageId(session = null) {
  return String(session?.id || session?.sessionId || session?.uid || "default").trim() || "default";
}

function readStoredRows() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIMELINE_ROW_HEIGHTS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredRows(rowsBySession = {}) {
  try {
    window.localStorage.setItem(TIMELINE_ROW_HEIGHTS_STORAGE_KEY, JSON.stringify(rowsBySession));
  } catch {
    // The timeline remains usable when storage is unavailable.
  }
}

export function getStoredTimelineRowHeights(session = null) {
  const rows = readStoredRows()[getSessionStorageId(session)];
  return rows && typeof rows === "object" && !Array.isArray(rows) ? { ...rows } : {};
}

export function setStoredTimelineRowHeight(session = null, trackId = "", heightPx = 0) {
  const safeTrackId = String(trackId || "").trim();
  const safeHeight = Math.round(Math.max(56, Math.min(520, Number(heightPx || 0))));
  if (!safeTrackId || !Number.isFinite(safeHeight)) return;

  const sessionId = getSessionStorageId(session);
  const rowsBySession = readStoredRows();
  rowsBySession[sessionId] = {
    ...(rowsBySession[sessionId] || {}),
    [safeTrackId]: safeHeight
  };
  writeStoredRows(rowsBySession);
}

export function removeStoredTimelineRowHeight(session = null, trackId = "") {
  const safeTrackId = String(trackId || "").trim();
  if (!safeTrackId) return;

  const sessionId = getSessionStorageId(session);
  const rowsBySession = readStoredRows();
  const sessionRows = { ...(rowsBySession[sessionId] || {}) };
  delete sessionRows[safeTrackId];

  if (Object.keys(sessionRows).length) rowsBySession[sessionId] = sessionRows;
  else delete rowsBySession[sessionId];
  writeStoredRows(rowsBySession);
}
