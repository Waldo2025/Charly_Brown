import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/moodlecourse-geminiOperations.js", import.meta.url), "utf8");

const structuredMode = source.match(/function reforzarPerfilQuizzConModoEstructurado[\s\S]*?\n}\n\nfunction detectarPreferenciasQuizz/)?.[0] || "";
assert.ok(structuredMode, "Debe existir la normalización del modo estructurado");
assert.doesNotMatch(structuredMode, /pidioPreguntasAbiertas:\s*preguntasOriginales\.length\s*>\s*0/, "Las preguntas enumeradas no deben marcarse automáticamente como abiertas");
assert.match(structuredMode, /prohibirOpciones:\s*base\.prohibirOpciones\s*===\s*true/, "Debe conservar la intención real del autor sobre opciones");

for (const tipo of ["opción múltiple", "emparejamiento", "verdadero/falso", "completar"]) {
    assert.ok(source.includes(`agregar("${tipo}"`), `Debe detectar explícitamente el tipo ${tipo}`);
}

assert.match(source, /nunca conviertas por defecto una actividad cerrada en pregunta abierta/, "El prompt debe prohibir el fallback silencioso a pregunta abierta");

console.log("OK: los quiz conservan los tipos cerrados en modo transcribir/estructurar");
