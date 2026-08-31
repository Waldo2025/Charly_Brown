import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveApprovedUserProfile } from "../public/js/user-approval.js";
import {
  createPodcasterAcademicMetadataApi,
  resolveAcademicMetadata
} from "../public/podcaster/podcaster-academic-metadata.js";

test("reconoce las variantes de aprobación usadas por perfiles existentes", () => {
  const approvedProfiles = [
    { approvalStatus: "approved" },
    { status: "aprobado" },
    { estado: "activo" },
    { estadoAprobacion: "Aprobado" },
    { approved: true },
    { isApproved: true },
    { aprobado: true },
    { role: "developer" },
    { rol: "docente" }
  ];

  for (const profile of approvedProfiles) {
    assert.equal(resolveApprovedUserProfile(profile).approved, true, JSON.stringify(profile));
  }
});

test("mantiene bloqueados los perfiles pendientes, rechazados o vacíos", () => {
  const blockedProfiles = [
    {},
    { approvalStatus: "pending", role: "usuario" },
    { estadoAprobacion: "rechazado", role: "usuario" },
    { role: "pendiente" }
  ];

  for (const profile of blockedProfiles) {
    assert.equal(resolveApprovedUserProfile(profile).approved, false, JSON.stringify(profile));
  }
});

test("el reproductor no exige ownership para guardar metadata académica", () => {
  const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
  const rulesSource = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

  assert.match(homeSource, /profileAccess\.approved \|\| tokenAccess\.approved/);
  assert.match(homeSource, /await academicMetadataApi\.saveAcademicMetadata\(sessionId, nextMetadata/);
  assert.doesNotMatch(homeSource, /function canWriteAcademicMetadata\(\)[\s\S]{0,250}(ownerId|isOwner)/);
  assert.match(rulesSource, /isApprovedUser\(\)\s*&&\s*isAcademicMetadataSessionPatch/);
  assert.match(rulesSource, /match \/podcaster_academic_metadata\/\{sessionId\}[\s\S]*?allow create, update: if isApprovedUser\(\)/);
});

test("los bloqueos de guardado dejan diagnóstico en consola", () => {
  const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
  assert.match(homeSource, /Guardado académico bloqueado por el estado de acceso del usuario/);
  assert.match(homeSource, /No se guardaron los datos académicos: falta el sessionId/);
});

test("un snapshot legacy anidado vacío no borra la metadata académica raíz", () => {
  const resolved = resolveAcademicMetadata(
    {
      nivel: "Primaria",
      grado: "Primero",
      trimestre: "1",
      unidad: "1",
      materia: ""
    },
    {
      nivel: "",
      grado: "",
      trimestre: "",
      unidad: "",
      materia: ""
    }
  );

  assert.deepEqual(resolved, {
    nivel: "Primaria",
    grado: "Primero",
    trimestre: "1",
    unidad: "1",
    materia: "",
    unitLabel: "Unidad"
  });

  const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
  assert.match(homeSource, /const academicMetadata = academicMetadataApi\.resolveAcademicMetadata\([\s\S]*?topLevel\.academicMetadata[\s\S]*?nested\.academicMetadata[\s\S]*?fallback\.academicMetadata/);
  assert.match(homeSource, /Object\.assign\(session, academicMetadataApi\.buildAcademicMetadataSnapshot/);
});

test("el submit registra el inicio y el éxito de la escritura", () => {
  const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
  assert.match(homeSource, /\[Dashboard\]\[AcademicMetadata\] Iniciando guardado del video/);
  assert.match(homeSource, /\[Dashboard\]\[AcademicMetadata\] Datos académicos guardados/);
});

test("video-player fuerza la descarga del controlador que contiene el fix", () => {
  const loaderSource = readFileSync(new URL("../public/js/cache-version-loader.js", import.meta.url), "utf8");
  const playerSource = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");
  assert.match(loaderSource, /fallbackVersion = "2026-1\.0\.10\.835"/);
  assert.match(playerSource, /cache-version-loader\.js\?v=2026-1\.0\.10\.833/);
});

test("persiste la metadata dedicada y el snapshot de una sesión ajena sin comprobar owner", async () => {
  const writes = [];
  const api = createPodcasterAcademicMetadataApi({
    db: {},
    doc: (_db, collectionName, docId) => ({ collectionName, docId }),
    getDoc: async () => null,
    setDoc: async (ref, payload, options) => writes.push({ method: "setDoc", ref, payload, options }),
    updateDoc: async (ref, patch) => writes.push({ method: "updateDoc", ref, patch }),
    serverTimestamp: () => "server-timestamp",
    nowIso: () => "2026-08-18T12:00:00.000Z",
    getCurrentUserUid: () => "approved-non-owner",
    getCurrentUserName: () => "Usuario aprobado"
  });

  await api.saveAcademicMetadata("session-owned-by-another-user", {
    nivel: "Secundaria",
    grado: "Segundo",
    trimestre: "2",
    unidad: "4",
    materia: "Física"
  }, {
    entityType: "session",
    snapshotTargets: [{ ref: { collectionName: "podcaster_sessions", docId: "session-owned-by-another-user" } }]
  });

  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].ref, {
    collectionName: "podcaster_academic_metadata",
    docId: "session-owned-by-another-user"
  });
  assert.equal(writes[0].payload.updatedByUid, "approved-non-owner");
  assert.equal(writes[0].payload.academicMetadata.materia, "Física");
  assert.equal(writes[1].method, "updateDoc");
  assert.deepEqual(writes[1].ref, {
    collectionName: "podcaster_sessions",
    docId: "session-owned-by-another-user"
  });
  assert.equal(writes[1].patch.academicMetadata.unidad, "4");
});
