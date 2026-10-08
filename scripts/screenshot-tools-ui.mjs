import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const PORT = 8089;
const PUBLIC_DIR = path.resolve('public');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/charlyMCPEditor.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end(`Server Error: ${err.code}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

async function captureScreenshots() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Local static server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const artifactDir = '/Users/waldolopez/.gemini/antigravity/brain/acafd2e8-d409-4dc3-9365-31d84a8686a4';

  try {
    await page.addInitScript(() => {
      window.__CHARLY_TEST_USER__ = {
        uid: "test-user-123",
        email: "docente@charlybrown.edu",
        displayName: "Profesor Charly",
        approved: true,
        role: "admin",
        getIdToken: async () => "mock-token",
        getIdTokenResult: async () => ({ claims: { approved: true, role: "admin" } })
      };
    });

    await page.goto(`http://localhost:${PORT}/charlyMCPEditor.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Dismiss initial modal if open
    const saveBtn = page.locator('button:has-text("Guardar datos"), button:has-text("Cancelar creación")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(600);
    }

    // 1. Initial State Screenshot
    const shot1Path = path.join(artifactDir, 'charly_editor_main.png');
    await page.screenshot({ path: shot1Path, fullPage: false });
    console.log(`Screenshot 1 saved: ${shot1Path}`);

    // 2. Open Tools Menu Screenshot
    const toolsBtn = page.locator('#cbComposerToolsBtn');
    await toolsBtn.waitFor({ state: 'visible', timeout: 5000 });
    await toolsBtn.click();
    await page.waitForTimeout(600);
    const shot2Path = path.join(artifactDir, 'charly_tools_menu_open.png');
    await page.screenshot({ path: shot2Path, fullPage: false });
    console.log(`Screenshot 2 saved: ${shot2Path}`);

    // 3. Toggle specific tools (Activity, Cutout, Web Search)
    const activityOption = page.locator('.cb-composer-tool-option[data-composer-tool-id="design_activity"]');
    if (await activityOption.isVisible()) {
      await activityOption.click();
    }
    const cutoutOption = page.locator('.cb-composer-tool-option[data-composer-tool-id="design_cutout"]');
    if (await cutoutOption.isVisible()) {
      await cutoutOption.click();
    }
    const webSearchOption = page.locator('.cb-composer-tool-option[data-composer-tool-id="web_search"]');
    if (await webSearchOption.isVisible()) {
      await webSearchOption.click();
    }

    await page.waitForTimeout(600);
    const shot3MenuSelected = path.join(artifactDir, 'charly_tools_menu_selected.png');
    await page.screenshot({ path: shot3MenuSelected, fullPage: false });
    console.log(`Screenshot 3 (Menu with selections) saved: ${shot3MenuSelected}`);

    // 4. Close menu and show composer with active chips
    await page.click('#cbComposerInput');
    await page.waitForTimeout(500);

    const composerInput = page.locator('#cbComposerInput');
    await composerInput.fill('Diseña la actividad del subtema de Fotosíntesis e incluye un recortable manipulativo');

    const shot4Path = path.join(artifactDir, 'charly_tools_selected_input.png');
    await page.screenshot({ path: shot4Path, fullPage: false });
    console.log(`Screenshot 4 (Composer with chips & prompt) saved: ${shot4Path}`);
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    server.close();
  }
}

captureScreenshots();
