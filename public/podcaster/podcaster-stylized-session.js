export function setStylizedTextForScene(session, rowId, serializedText = null) {
  const key = String(rowId || "").trim();
  if (!session || typeof session !== "object" || !key) return null;
  const stylizedTextMap = { ...(session.stylizedTextMap || {}) };
  if (typeof serializedText === "string" && serializedText.trim()) stylizedTextMap[key] = serializedText;
  else delete stylizedTextMap[key];
  return { ...session, stylizedTextMap };
}
