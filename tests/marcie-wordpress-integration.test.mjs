import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("Marcie exposes WordPress draft and publish actions without collecting credentials in the browser", async () => {
  const [html, editor, service] = await Promise.all([
    readFile(new URL("public/MarcieBlogEditor/MarcieBlogEditor.html", root), "utf8"),
    readFile(new URL("public/MarcieBlogEditor/js/editor-app.js", root), "utf8"),
    readFile(new URL("public/MarcieBlogEditor/js/services/marcie-wordpress-service.js", root), "utf8")
  ]);
  assert.match(html, /id="btn-publish-wordpress-header"/);
  assert.match(html, /id="opt-publish-wordpress"/);
  assert.match(editor, /createWordPressDraft/);
  assert.match(editor, /publishWordPressArticle/);
  assert.match(editor, /MARCIE_WORDPRESS_CONFIG_JSON/);
  assert.doesNotMatch(service, /applicationPassword\s*:/i);
  assert.match(service, /sameOrigin:\s*true/);
});

test("editorial approval no longer pretends that the article was already published", async () => {
  const pipeline = await readFile(new URL("public/MarcieBlogEditor/js/components/pipeline-stepper.js", root), "utf8");
  assert.match(pipeline, /session\.status\s*=\s*"approved"/);
  assert.match(pipeline, /session\.approvedAudiences/);
  assert.doesNotMatch(pipeline, /Artículo aprobado y publicado exitosamente/);
  assert.match(pipeline, /Artículo aprobado\. Ya puede enviarse a WordPress/);
});

test("Firebase backend registers authenticated WordPress routes and binds the secret", async () => {
  const [index, routes] = await Promise.all([
    readFile(new URL("functions/src/index.js", root), "utf8"),
    readFile(new URL("functions/src/marcie-wordpress.js", root), "utf8")
  ]);
  assert.match(index, /defineSecret\("MARCIE_WORDPRESS_CONFIG_JSON"\)/);
  assert.match(index, /registerMarcieWordPressRoutes\(geminiApp\)/);
  assert.match(routes, /resolveAuthContext\(req\)/);
  assert.match(routes, /marcie_article_not_approved/);
  assert.match(routes, /\/api\/marcie\/wordpress\/draft/);
  assert.match(routes, /\/api\/marcie\/wordpress\/publish/);
});
