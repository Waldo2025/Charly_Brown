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
  throw firstError || new SyntaxError("Gemini devolvió una respuesta JSON vacía.");
}
