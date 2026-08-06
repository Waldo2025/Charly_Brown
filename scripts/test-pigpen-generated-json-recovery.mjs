import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `No se encontró ${name}.`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}.`);
}

const context = vm.createContext({ JSON, Error, String });
vm.runInContext(`${extractFunction("extractGeneratedJson")};`, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.extractGeneratedJson('```json\n{"ok":true}\n```'))),
  { ok: true },
  "El parser debe seguir aceptando JSON válido delimitado por markdown."
);

assert.throws(
  () => context.extractGeneratedJson('{"respuestas":["uno" "dos"]}'),
  /No se pudo interpretar el JSON devuelto por la IA:.*Expected/i,
  "El JSON sin coma debe producir un error controlado que active la reparación."
);

assert.match(
  source,
  /function buildEscapeRoomResponseSchema\([\s\S]*minItems: safeMissionCount[\s\S]*maxItems: safeQuestionCount/,
  "La generación principal debe restringirse mediante un esquema estructurado."
);
assert.match(
  source,
  /generationConfig:\s*\{[\s\S]*responseJsonSchema: buildEscapeRoomResponseSchema\(formData\.misiones, formData\.preguntasPorSala\)[\s\S]*maxOutputTokens: 16384/,
  "La solicitud debe enviar el esquema y un presupuesto suficiente para el JSON."
);
assert.match(
  source,
  /generatedProject = extractGeneratedJson\(rawText\);[\s\S]*catch \(parseError\)[\s\S]*repairGeneratedEscapeRoomJson\(rawText, formData\)/,
  "Una respuesta sintácticamente inválida debe activar exactamente el flujo de reparación estructurada."
);
assert.match(
  source,
  /function repairGeneratedEscapeRoomJson|async function repairGeneratedEscapeRoomJson[\s\S]*temperature: 0[\s\S]*return extractGeneratedJson\(repairedText\)/,
  "La reparación debe ser determinista y volver a validar la sintaxis antes de continuar."
);

console.log("PigPen generated JSON recovery OK.");
