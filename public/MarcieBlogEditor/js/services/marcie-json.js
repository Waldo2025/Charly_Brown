export function removeJsonTrailingCommas(value = "") {
  const input = String(value || "");
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ",") {
      let nextIndex = index + 1;
      while (nextIndex < input.length && /\s/.test(input[nextIndex])) nextIndex += 1;
      if (input[nextIndex] === "}" || input[nextIndex] === "]") continue;
    }
    output += character;
  }

  return output;
}

export function repairTruncatedJson(str) {
  let s = String(str || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!s) return null;
  const objectStart = s.indexOf("{");
  if (objectStart < 0) return null;
  s = s.slice(objectStart);

  for (let endTrim = 0; endTrim < 250; endTrim += 1) {
    let candidate = s.slice(0, Math.max(1, s.length - endTrim)).trim();
    let inString = false;
    let escapes = 0;
    for (let i = 0; i < candidate.length; i += 1) {
      if (candidate[i] === "\\" && inString) { escapes += 1; }
      else if (candidate[i] === '"' && escapes % 2 === 0) { inString = !inString; escapes = 0; }
      else { escapes = 0; }
    }
    if (inString) candidate += '"';

    candidate = removeJsonTrailingCommas(candidate);

    const stack = [];
    let strMode = false;
    let esc = 0;
    for (let i = 0; i < candidate.length; i += 1) {
      const c = candidate[i];
      if (c === "\\" && strMode) { esc += 1; }
      else if (c === '"' && esc % 2 === 0) { strMode = !strMode; esc = 0; }
      else if (!strMode) {
        if (c === "{" || c === "[") stack.push(c);
        else if (c === "}" && stack[stack.length - 1] === "{") stack.pop();
        else if (c === "]" && stack[stack.length - 1] === "[") stack.pop();
      } else { esc = 0; }
    }

    let closing = "";
    while (stack.length) {
      const top = stack.pop();
      closing += (top === "{" ? "}" : "]");
    }

    try {
      const parsed = JSON.parse(candidate + closing);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {}
  }
  return null;
}

export function parseMarcieJson(value = "") {
  const clean = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");
  const candidates = [clean];
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(clean.slice(objectStart, objectEnd + 1));

  let firstError = null;
  for (const candidate of [...new Set(candidates)]) {
    for (const variant of [...new Set([candidate, removeJsonTrailingCommas(candidate)])]) {
      try {
        return JSON.parse(variant);
      } catch (error) {
        firstError ||= error;
      }
    }
  }

  try {
    const repaired = repairTruncatedJson(clean);
    if (repaired && typeof repaired === "object") {
      console.warn("[MarcieJson] JSON truncado reparado con éxito:", repaired);
      return repaired;
    }
  } catch (_) {}

  throw firstError || new SyntaxError("Marcie devolvió una respuesta JSON vacía.");
}
