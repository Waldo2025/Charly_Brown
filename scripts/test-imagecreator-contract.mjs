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

test("image creator expone la nueva página y su bootstrap modular", () => {
  const html = readWorkspaceFile("public/imageCreator.html");
  assert.match(html, /<script type="module" src="imagecreator\/app\.js"><\/script>/, "La página debe cargar imagecreator/app.js como módulo principal.");
  assert.match(html, /imagecreator\/imageCreator\.css/, "La página debe cargar el stylesheet propio de imagecreator.");
  assert.match(html, /id="imageCreatorApp"/, "La página debe exponer el shell principal de la aplicación.");
});

test("chrome layout integra image creator en el sidebar principal", () => {
  const source = readWorkspaceFile("public/js/chromeLayout.js");
  assert.match(source, /imageCreator\.html/, "chromeLayout debe incluir la nueva ruta imageCreator.html.");
  assert.match(source, /Image Creator/, "chromeLayout debe mostrar la etiqueta Image Creator.");
});

test("firestore rules protege la colección image_creator_sessions por owner", () => {
  const rules = readWorkspaceFile("firestore.rules");
  assert.match(rules, /match \/image_creator_sessions\/\{sessionId\}/, "Debe existir una regla explícita para image_creator_sessions.");
  assert.match(rules, /allow read: if .*ownerId.*request\.auth\.uid/s, "La lectura debe estar restringida al owner autenticado.");
  assert.match(rules, /allow create: if .*isImageCreatorSessionShape/s, "La creación debe validar la forma del documento.");
});
