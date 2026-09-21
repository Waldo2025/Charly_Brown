import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const read = (file) => readFileSync(resolve(rootDir, file), "utf8");

test("Chat creativo puede ocultarse y devolver el espacio al lienzo", () => {
  const html = read("public/imageCreator.html");
  const css = read("public/imagecreator/imageCreator.css");
  const app = read("public/imagecreator/app.js");
  assert.match(html, /id="icToggleChatBtn"[^>]*aria-controls="icToolsPanel"/);
  assert.match(html, /id="icToolsPanel"/);
  assert.match(css, /\.ic-panels-grid\.is-chat-collapsed[^}]*grid-template-columns/);
  assert.match(css, /is-chat-collapsed :where\(#icToolsResizer,#icToolsPanel\)[^}]*display:none/);
  assert.match(app, /localStorage\.setItem\(IMAGE_CREATOR_CHAT_PANEL_KEY/);
  assert.match(app, /classList\.toggle\("is-chat-collapsed", !state\.chatPanelOpen\)/);
  assert.match(html, /id="icToggleChatBtn" class="ic-chat-fab"/);
  assert.match(css, /\.ic-chat-fab\s*\{[^}]*position:absolute;[^}]*border-radius:50%!important;/);
  assert.match(app, /function initializeMovableChatToggle\(\)/);
  assert.match(app, /setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /IMAGE_CREATOR_CHAT_FAB_POSITION_KEY = "ic-chat-fab-position-v2"/);
  assert.match(app, /bounds\.width - bounds\.buttonWidth - 14/);
  assert.doesNotMatch(app, /const atToolsEdge/);
  assert.match(html, /imagecreator\/app\.js\?v=2026-09-08\.22/);
});

test("el compositor es redimensionable y mantiene las acciones debajo del campo", () => {
  const html = read("public/imageCreator.html");
  const css = read("public/imagecreator/imageCreator.css");
  const composer = read("public/imagecreator/composer.js");
  assert.match(html, /ic-composer__field[\s\S]*ic-composer__footer[\s\S]*id="icAttachBtn"[\s\S]*id="icSendBtn"/);
  assert.match(css, /\.ic-composer textarea\s*\{[^}]*resize:vertical;[^}]*overflow:auto;/);
  assert.doesNotMatch(composer, /addEventListener\("input"[^\n]*autosizeTextarea/);
});

test("las referencias usan tarjetas visuales y las imágenes generadas no tienen margen ni radio", () => {
  const renderer = read("public/imagecreator/chat-renderer.js");
  const css = read("public/imagecreator/imageCreator.css");
  assert.match(renderer, /ic-attachment-tray__header/);
  assert.match(renderer, /Zona señalada/);
  assert.match(css, /\.ic-result-card\s*\{[^}]*border-radius:0;/);
  assert.match(css, /\.ic-result-card img\s*\{[^}]*width:100%;[^}]*margin:0;[^}]*border-radius:0;/);
  assert.match(renderer, /class="ic-result-card__tools"[\s\S]*class="ic-result-quick-action"[\s\S]*data-result-menu-toggle/);
  assert.match(css, /\.ic-result-card__tools\s*\{[^}]*display:flex;[^}]*gap:6px;/);
  assert.doesNotMatch(renderer, /ic-result-card__media/);
  assert.doesNotMatch(renderer, /ic-result-card__caption/);
  assert.doesNotMatch(renderer, /ic-message__body--results/);
  assert.doesNotMatch(renderer, /Se generaron \$\{results\.length\}/);
  assert.match(renderer, /if \(results\.length\) \{[\s\S]*class="ic-result-grid"[\s\S]*renderImageResult/);
  assert.match(css, /\.ic-chat-feed>\.ic-message,\.ic-chat-feed>\.ic-result-grid\s*\{[^}]*flex:0 0 auto;/);
  assert.match(renderer, /image\.addEventListener\("load", scrollToLatest, \{ once: true \}\)/);
});

test("cada resultado abre un visor grande con menú de edición", () => {
  const html = read("public/imageCreator.html");
  const renderer = read("public/imagecreator/chat-renderer.js");
  const app = read("public/imagecreator/app.js");
  const css = read("public/imagecreator/imageCreator.css");
  assert.match(renderer, /data-open-image-viewer/);
  assert.match(html, /id="icImageViewer"[^>]*aria-hidden="true"/);
  assert.match(html, /ic-image-viewer__gallery" role="dialog" aria-modal="true"/);
  assert.doesNotMatch(html, /ic-image-viewer__header/);
  assert.match(html, /id="icImageViewerAnnotateBtn"[^>]*aria-label="Señalar una zona/);
  for (const action of ["download-web", "download-original", "variation", "edit-text", "regenerate", "info"]) {
    assert.match(html, new RegExp(`data-viewer-result-action="${action}"`));
  }
  assert.match(app, /async function openImageViewer/);
  assert.match(app, /ensureResultAssetDataUrl\(asset\)/);
  assert.match(app, /if \(preview\) \{[\s\S]*openImageViewer/);
  assert.match(css, /\.ic-image-viewer__stage>img\s*\{[^}]*width:auto;[^}]*max-width:100%;[^}]*height:auto;[^}]*max-height:/);
  assert.match(css, /\.ic-image-viewer\s*\{[^}]*position:fixed;[^}]*inset:0;[^}]*width:100vw;[^}]*height:100dvh;/);
  assert.match(css, /\.ic-image-viewer\s*\{[^}]*padding:clamp\(/);
  assert.match(app, /document\.body\.append\(elements\.imageViewer\)/);
  assert.match(html, /id="icImageInfoModal"/);
  assert.doesNotMatch(css, /\.ic-result-card__caption/);
});
