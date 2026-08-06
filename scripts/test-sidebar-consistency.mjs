import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(projectRoot, "public");
const chromeLayout = fs.readFileSync(path.join(publicDir, "js/chromeLayout.js"), "utf8");
const sidebar = fs.readFileSync(path.join(publicDir, "js/sidebar.js"), "utf8");
const chat = fs.readFileSync(path.join(publicDir, "js/chat.js"), "utf8");

function listFilesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

assert.match(
  chromeLayout,
  /dispatchEvent\(new CustomEvent\(CHROME_LAYOUT_READY_EVENT/,
  "chromeLayout debe notificar cuando termina de renderizar el sidebar."
);
assert.match(
  sidebar,
  /addEventListener\(CHROME_LAYOUT_READY_EVENT, syncRenderedSidebar\)/,
  "sidebar debe sincronizar permisos y controles después del render."
);
assert.doesNotMatch(
  sidebar,
  /setTimeout\(\(\) => applySidebarRoleVisibility/,
  "La visibilidad no debe depender de una espera arbitraria."
);
assert.doesNotMatch(
  chat,
  /gestionUsuariosLink/,
  "Chat no debe sobrescribir la visibilidad centralizada de Usuarios."
);

for (const fileName of fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(publicDir, fileName), "utf8");
  if (!html.includes('id="sidebar"')) continue;

  const chromeTag = html.match(/<script[^>]+(?:src|data-cache-src)="js\/chromeLayout\.js"[^>]*>/)?.[0] || "";
  const sidebarTag = html.match(/<script[^>]+(?:src|data-cache-src)="js\/sidebar\.js"[^>]*>/)?.[0] || "";
  assert.ok(chromeTag, `${fileName} debe cargar chromeLayout.js.`);
  assert.ok(sidebarTag, `${fileName} debe cargar sidebar.js.`);
  assert.ok(
    html.indexOf(chromeTag) < html.indexOf(sidebarTag),
    `${fileName} debe cargar chromeLayout antes de sidebar.`
  );

  if (chromeTag.includes("data-cache-src")) {
    assert.match(
      sidebarTag,
      /data-cache-src="js\/sidebar\.js"/,
      `${fileName} debe usar el mismo cargador versionado para ambos módulos.`
    );
  }
}

for (const cssPath of listFilesRecursively(publicDir).filter((filePath) => filePath.endsWith(".css") && filePath !== path.join(publicDir, "sidebar.css"))) {
  const css = fs.readFileSync(cssPath, "utf8");
  const relativeCssPath = path.relative(publicDir, cssPath);
  assert.doesNotMatch(
    css,
    /#sidebar\s*\{[^}]*\bdisplay\s*:/s,
    `${relativeCssPath} no debe sobrescribir el modelo de layout de #sidebar.`
  );
}

console.log("Sidebar consistency checks passed.");
