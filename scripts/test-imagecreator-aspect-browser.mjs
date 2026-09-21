import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const read = (name) => readFileSync(new URL(`../public/imagecreator/${name}`, import.meta.url), 'utf8');

test('browser: selector conserva preferencia y resultados registran dimensiones naturales sin redimensionar', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ constants, panel, api }) => {
      const load = (source) => import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
      const options = await load(constants + '\n' + panel.replace(/import[\s\S]*?from "\.\/constants.js";/, ''));
      const elements = {};
      for (const name of ['modeSelect', 'aspectRatioSelect', 'modelSelect', 'imageSizeSelect', 'downloadFormatSelect', 'countSelect']) {
        elements[name] = document.createElement('select');
        document.body.append(elements[name]);
      }
      options.initializeOptionsPanel(elements, { mode: 'generate', aspectRatio: '16:9' });
      elements.modeSelect.value = 'edit';
      options.syncOptionsPresentation(elements, options.readOptionsFromPanel(elements));
      const edit = [elements.aspectRatioSelect.disabled, elements.aspectRatioSelect.selectedOptions[0].textContent];
      elements.modeSelect.value = 'generate';
      options.syncOptionsPresentation(elements, options.readOptionsFromPanel(elements));
      const generate = [elements.aspectRatioSelect.disabled, elements.aspectRatioSelect.value];
      const { extractGeminiImageResults } = await load(api.replace(/^import .*;\n/gm, '') + '\nexport { extractGeminiImageResults };');
      const results = [];
      for (const [width, height] of [[1600, 900], [900, 1600], [1379, 811]]) {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const dataUrl = canvas.toDataURL('image/png');
        const [image] = await extractGeminiImageResults({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: dataUrl.split(',')[1] } }] } }] }, { options: { aspectRatio: '1:1' } });
        results.push({ width: image.width, height: image.height, ratio: image.aspectRatio, unchanged: dataUrl === image.dataUrl });
      }
      return { edit, generate, results };
    }, { constants: read('constants.js'), panel: read('options-panel.js'), api: read('api.js') });
    assert.deepEqual(result.edit, [true, 'Conservar proporción original']);
    assert.deepEqual(result.generate, [false, '16:9']);
    assert.deepEqual(result.results, [
      { width: 1600, height: 900, ratio: '16:9', unchanged: true },
      { width: 900, height: 1600, ratio: '9:16', unchanged: true },
      { width: 1379, height: 811, ratio: '1379:811', unchanged: true }
    ]);
  } finally { await browser.close(); }
});

test('frontend real: chat, visor y canvas mantienen proporción en escritorio y móvil', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const html = readFileSync(new URL('../public/imageCreator.html', import.meta.url), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.setContent(html);
    for (const path of ['vendor/bootstrap/bootstrap.min.css', 'sidebar.css', 'header.css', 'imagecreator/imageCreator.css']) {
      await page.addStyleTag({ content: readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8') });
    }
    for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      for (const [width,height] of [[1600,900],[900,1600],[1379,811]]) {
        const measurements = await page.evaluate(async ({width,height}) => {
          const canvas = document.querySelector('#icRegionCanvas');
          canvas.width = width; canvas.height = height;
          const dataUrl = canvas.toDataURL();
          const feed = document.querySelector('#icChatFeed');
          feed.innerHTML = '<div class="ic-result-grid"><figure class="ic-result-card"><button class="ic-result-preview"><img></button></figure></div>';
          const image = feed.querySelector('img'); image.src = dataUrl; await image.decode();
          const viewer = document.querySelector('#icImageViewerImage'); viewer.src = dataUrl; await viewer.decode();
          const measure = (el) => { const r = el.getBoundingClientRect(); return {width:r.width,height:r.height}; };
          const chat = measure(image);
          document.querySelector('#icImageViewer').classList.remove('hidden');
          const expanded = measure(viewer);
          document.querySelector('#icImageViewer').classList.add('hidden');
          const region = document.querySelector('#icRegionEditor'); region.classList.remove('hidden');
          const before = measure(canvas);
          region.classList.add('has-selection');
          const after = measure(canvas);
          region.classList.remove('has-selection'); region.classList.add('hidden');
          return {chat,expanded,before,after};
        }, {width,height});
        for (const [surface, size] of Object.entries(measurements)) {
          assert.ok(size.width > 0 && size.height > 0, `${surface} visible`);
          assert.ok(Math.abs(size.width / size.height / (width / height) - 1) < 0.005, `${surface} distorted: ${JSON.stringify({viewport,width,height,size})}`);
        }
      }
    }
  } finally { await browser.close(); }
});


test('adjuntar PNG desde modo inicial cambia el panel y envía edición sin 1:1', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const app = read('app.js');
    const handler = app.slice(app.indexOf('async function handleFilesSelected('), app.indexOf('function buildUserMessage('));
    const result = await page.evaluate(async ({constants, attachments, payloads, panel, handler}) => {
      const elements = {};
      for (const name of ['modeSelect', 'aspectRatioSelect', 'modelSelect', 'imageSizeSelect', 'downloadFormatSelect', 'countSelect']) elements[name] = document.createElement('select');
      const source = constants + '\n' + attachments.replace(/import[\s\S]*?from [^;]+;/, '') + '\n' + payloads + '\n' + panel.replace(/import[\s\S]*?from [^;]+;/, '') + `
        export async function exercise(elements, file) {
          const state = { options: createDefaultImageCreatorOptions(), composerAttachments: [] };
          initializeOptionsPanel(elements, state.options);
          const setComposerError = (message) => { if (message) throw new Error(message); };
          const renderAttachmentTray = () => {};
          ${handler}
          await handleFilesSelected([file]);
          const attachment = state.composerAttachments[0];
          const payload = buildGeminiImagePayload({mode: state.options.mode, prompt: "Añade texto", options: state.options, attachments: state.composerAttachments});
          return {mode: state.options.mode, ratioLabel: elements.aspectRatioSelect.selectedOptions[0].textContent, locked: elements.aspectRatioSelect.disabled, size: [attachment.width,attachment.height], config: payload.generationConfig.imageConfig};
        }`;
      const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      return module.exercise(elements, new File([blob], 'reference.png', {type:'image/png'}));
    }, {constants:read('constants.js'), attachments:read('attachments.js'), payloads:read('payloads.js'), panel:read('options-panel.js'), handler});
    assert.equal(result.mode, 'edit');
    assert.equal(result.ratioLabel, 'Conservar proporción original');
    assert.equal(result.locked, true);
    assert.deepEqual(result.size, [1600,900]);
    assert.equal('aspectRatio' in result.config, false);
  } finally { await browser.close(); }
});
