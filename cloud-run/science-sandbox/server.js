const http = require('node:http');
const { chromium } = require('playwright');
const { buildCandidateDocument, normalizeCandidate } = require(require('node:fs').existsSync(require('node:path').join(__dirname, 'science-candidate-document.js')) ? './science-candidate-document.js' : '../../functions/src/science-candidate-document.js');
async function validateCandidate(input) {
  const candidate = normalizeCandidate(input);
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-extensions', '--no-first-run'] });
  const timer = setTimeout(() => browser.close().catch(() => {}), 15000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => route.abort());
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    await page.setContent('<iframe sandbox="allow-scripts" title="Prueba aislada"></iframe>');
    await page.locator('iframe').evaluate((frame, html) => { frame.srcdoc = html; }, buildCandidateDocument(candidate));
    const frame = page.frames().find(frame => frame !== page.mainFrame());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await frame.waitForFunction(() => window.__scienceCandidateReady || window.__scienceCandidateError, null, { timeout: 10000 });
    const bootError = await frame.evaluate(() => window.__scienceCandidateError || null);
    if (bootError) return { hash: candidate.hash, passed: false, error: bootError, tests: [] };
    const defaults = Object.fromEntries(candidate.controls.map(control => [control.id, control.value]));
    // Expected values never enter the browser. Only measured outputs cross the opaque-origin boundary.
    const tests = [];
    for (const test of candidate.tests) {
      const params = { ...defaults, ...test.params };
      const actual = await frame.evaluate(params => window.__scienceMeasure(params), params);
      tests.push({ params, actual, expected: test.expected, passed: Object.entries(test.expected).every(([key, value]) => Number.isFinite(actual?.[key]) && Math.abs(actual[key] - value) <= test.tolerance) });
    }
    for (const control of candidate.controls) for (const value of [control.min, control.max]) {
      await frame.evaluate(({ id, value }) => { const input = [...document.querySelectorAll('input')].find(node => node.getAttribute('aria-label') === id); if (input) { input.value = value; input.dispatchEvent(new Event('input')); } }, { id: control.label, value });
      const measured = await frame.evaluate(params => window.__scienceMeasure(params), { ...defaults, [control.id]: value, time: 1 });
      if (!measured || Object.values(measured).some(value => !Number.isFinite(value))) errors.push(`Invalid measurement at ${control.id}=${value}`);
    }
    await frame.locator('#run').click(); await page.waitForTimeout(300); await frame.locator('#pause').click();
    const error = await frame.locator('#error').textContent();
    return { hash: candidate.hash, tests, passed: tests.every(test => test.passed) && !error && !errors.length, error: error || errors.join('; ') || null, testedAt: new Date().toISOString(), runnerVersion: 2 };

  } finally { clearTimeout(timer); await browser.close(); }
}
if (require.main === module) http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end('ok'); return; }
  if (req.method !== 'POST' || req.url !== '/validate') { res.writeHead(404).end(); return; }
  let bytes=0; const chunks=[];
  try {
    for await (const chunk of req) { bytes+=chunk.length;if(bytes>128000)throw Error('payload_too_large');chunks.push(chunk); }
    const result=await validateCandidate(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
  } catch(error) {res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({passed:false,error:String(error.message).slice(0,300)}));}
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
module.exports={validateCandidate};
