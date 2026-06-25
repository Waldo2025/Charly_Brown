import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);

function readWorkspaceFile(relativePath) {
  const absolutePath = resolve(rootDir, relativePath);
  assert.equal(existsSync(absolutePath), true, `Falta el archivo ${relativePath}.`);
  return readFileSync(absolutePath, "utf8");
}

test("charly brown page uses approved-auth guard before booting", () => {
  const html = readWorkspaceFile("public/charly-brown.html");
  const main = readWorkspaceFile("public/charly-brown/main.js");
  const guard = readWorkspaceFile("public/charly-brown/auth-guard.js");
  const sessions = readWorkspaceFile("public/charly-brown/sessions-store.js");

  assert.match(html, /data-page="charly-brown\.html"/);
  assert.match(main, /ensureApprovedUserAccess\(/, "main.js debe validar usuario autenticado/aprobado antes de iniciar.");
  assert.match(guard, /redirectTo\s*=\s*"index\.html"/, "El guard debe usar index.html como destino por defecto.");
  assert.match(guard, /window\.location\.href\s*=\s*path/, "El guard debe redirigir si no hay acceso.");
  assert.match(guard, /approvalStatus|estadoAprobacion|approved|aprobado/, "El guard debe entender estado aprobado.");
  assert.match(sessions, /getAuth\(app\)/, "sessions-store debe usar la misma app Firebase que el guard.");
  assert.match(sessions, /onAuthStateChanged/, "sessions-store debe esperar Auth antes de guardar/listar.");
  assert.match(sessions, /throw new Error\("No hay usuario autenticado para guardar la sesión\."\)/, "saveSession no debe fingir guardado sin usuario.");
});

test("firestore rules protect charlyBrownUnitSessions by approved owner", () => {
  const rules = readWorkspaceFile("firestore.rules");

  assert.match(rules, /function isApprovedUser\(\)/, "Debe existir helper de usuario aprobado.");
  assert.match(rules, /data\.ownerId == request\.auth\.uid/, "isDocOwner debe reconocer ownerId porque las lecturas lo usan.");
  assert.match(rules, /match \/charlyBrownUnitSessions\/\{sessionId\}/, "Debe existir regla explícita para charlyBrownUnitSessions.");
  assert.match(rules, /allow read: if isApprovedUser\(\)[\s\S]*ownerUid == request\.auth\.uid/, "Lectura debe requerir usuario aprobado y ownerUid.");
  assert.match(rules, /allow create: if isApprovedUser\(\)[\s\S]*request\.resource\.data\.ownerUid == request\.auth\.uid/, "Creación debe requerir usuario aprobado y ownerUid.");
  assert.match(rules, /request\.resource\.data\.ownerUid == resource\.data\.ownerUid/, "Update debe impedir cambiar ownerUid.");
});

test("firestore rules let approved owners create lecturasNuevas", () => {
  const rules = readWorkspaceFile("firestore.rules");

  assert.match(rules, /match \/lecturasNuevas\/\{docId\}/, "Debe existir regla explícita para lecturasNuevas.");
  assert.match(rules, /allow create: if isEditor\(\) \|\| \(isApprovedUser\(\) && isDocOwner\(request\.resource\.data\)\)/, "Usuarios aprobados deben crear lecturas propias.");
  assert.match(rules, /allow update, delete: if isEditor\(\) \|\| \(isApprovedUser\(\) && isDocOwner\(resource\.data\)\)/, "Usuarios aprobados deben poder mantener sus lecturas propias.");
});
