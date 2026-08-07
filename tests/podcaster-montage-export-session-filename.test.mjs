import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  const declarationStart = source.lastIndexOf("export ", start) === start - 7 ? start - 7 : start;
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(declarationStart, index + 1).replace(/^export\s+/, "");
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION: 3,
  normalizeMontageRenderMode: (value) => String(value || "browser"),
  window: {
    getActiveSession: () => null,
    els: { montageExportElapsedTime: { hidden: true, textContent: "" } },
    montageExportJobState: { startedAtMs: 0, completedAtMs: 0, elapsedTimerId: null },
    setInterval: () => 7,
    clearInterval: () => {}
  },
  Date
};
vm.createContext(context);
vm.runInContext([
  extractFunction("normalizeMontageExportSettings"),
  extractFunction("sanitizeMontageFilenamePart"),
  extractFunction("defaultMontageExportFilename"),
  extractFunction("resolveMontageExportFilenameForSession"),
  extractFunction("formatMontageExportElapsedTime"),
  extractFunction("updateMontageExportElapsedTime"),
  extractFunction("startMontageExportElapsedTimer"),
  extractFunction("stopMontageExportElapsedTimer")
].join("\n"), context);

test("montage export filename follows the active session and preserves same-session edits", () => {
  const sessionA = { id: "session-a", title: "Sesión Alfa" };
  const sessionB = { id: "session-b", title: "Sesión Beta" };

  const initial = context.resolveMontageExportFilenameForSession({}, sessionA);
  assert.equal(initial.filename, "Sesion Alfa");
  assert.equal(initial.filenameSessionId, "session-a");

  const customized = context.resolveMontageExportFilenameForSession({
    ...initial,
    filename: "Mi corte final"
  }, sessionA);
  assert.equal(customized.filename, "Mi corte final");

  const switched = context.resolveMontageExportFilenameForSession(customized, sessionB);
  assert.equal(switched.filename, "Sesion Beta");
  assert.equal(switched.filenameSessionId, "session-b");
});

test("legacy global filename is replaced when hydrating a session", () => {
  const hydrated = context.resolveMontageExportFilenameForSession({ filename: "Nombre anterior" }, {
    id: "session-new",
    title: "Nueva sesión"
  });
  assert.equal(hydrated.filename, "Nueva sesion");
  assert.equal(hydrated.filenameSessionId, "session-new");
});

test("export elapsed timer formats total duration with hours", () => {
  assert.equal(context.formatMontageExportElapsedTime(3_661_000), "01:01:01");
});

test("export elapsed timer starts, renders and freezes the total duration", () => {
  context.startMontageExportElapsedTimer(1_000);
  assert.equal(context.window.montageExportJobState.elapsedTimerId, 7);
  assert.equal(context.window.els.montageExportElapsedTime.hidden, false);

  context.stopMontageExportElapsedTimer(61_000);
  assert.equal(context.window.montageExportJobState.elapsedTimerId, null);
  assert.equal(context.window.montageExportJobState.completedAtMs, 61_000);
  assert.equal(context.window.els.montageExportElapsedTime.textContent, "Tiempo total · 00:01:00");
});
