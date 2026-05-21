export function normalizeSimpleText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeCreativeFieldText(...values) {
  for (const value of values) {
    const text = normalizeSimpleText(value);
    if (text) return text;
  }
  return "";
}
