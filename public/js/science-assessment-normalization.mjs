function asList(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function cleanStepText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return /^\[object Object\]$/i.test(text) ? "" : text;
}

export function procedureStepText(value) {
  if (value == null) return "";
  if (typeof value !== "object") return cleanStepText(value);
  if (Array.isArray(value)) return value.map(procedureStepText).filter(Boolean).join(" ");

  const preferredKeys = ["text", "label", "title", "instruction", "action", "description", "content", "name", "value", "step"];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (candidate == null || typeof candidate === "boolean") continue;
    if ((key === "value" || key === "step") && typeof candidate === "number") continue;
    const text = procedureStepText(candidate);
    if (text) return text;
  }

  return Object.entries(value)
    .filter(([key, candidate]) => !["id", "key", "index", "order", "position", "type", "correct"].includes(key)
      && (typeof candidate === "string" || typeof candidate === "number"))
    .map(([, candidate]) => cleanStepText(candidate))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] || "";
}

export function normalizeProcedureSequence(steps, correctOrder) {
  const records = asList(steps).map((raw, index) => ({
    id: raw && typeof raw === "object" ? cleanStepText(raw.id ?? raw.key ?? raw.value ?? "") : "",
    text: procedureStepText(raw),
    index
  })).filter(({ text }) => Boolean(text));
  const byId = new Map(records.filter(({ id }) => id).map(({ id, text }) => [id, text]));
  const normalizedSteps = records.map(({ text }) => text);
  const requestedOrder = asList(correctOrder).map((raw) => {
    if (raw && typeof raw === "object") {
      const id = cleanStepText(raw.id ?? raw.key ?? raw.value ?? "");
      return byId.get(id) || procedureStepText(raw);
    }
    const text = cleanStepText(raw);
    return byId.get(text) || text;
  }).filter(Boolean);
  return {
    steps: normalizedSteps,
    correctOrder: requestedOrder.length ? requestedOrder : [...normalizedSteps]
  };
}
