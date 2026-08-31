import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { resolveSessionAcademicMetadata } = require("../functions/src/podcaster-data.js");

test("session API resolves academic metadata with root values taking precedence", () => {
  assert.deepEqual(resolveSessionAcademicMetadata({
    trimestre: "1",
    academicMetadata: { trimestre: "", nivel: "Primaria" },
    session: { trimestre: "2", academicMetadata: { trimestre: "3", grado: "Segundo" } }
  }), {
    nivel: "Primaria",
    grado: "Segundo",
    trimestre: "1",
    unidad: "",
    materia: "",
    unitLabel: "Unidad"
  });
});

test("deployed and local list routes expose academic metadata in their stubs", () => {
  const functionsSource = readFileSync(new URL("../functions/src/podcaster-data.js", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
  assert.match(functionsSource, /const academicMetadata = resolveSessionAcademicMetadata\(data\);[\s\S]*?\.\.\.academicMetadata,[\s\S]*?academicMetadata,/);
  assert.match(backendSource, /const academicMetadata = resolvePodcasterAcademicMetadataFromDocData\(data\);[\s\S]*?\.\.\.academicMetadata,[\s\S]*?academicMetadata,/);
});
