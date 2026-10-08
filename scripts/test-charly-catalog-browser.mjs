import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const path of [
    '../public/charly-brown/exercise-dynamics-catalog.js',
    '../public/charly-brown/exercise-style-conversion.js',
    '../public/charly-brown/safe-markdown-html.js'
  ]) {
    const code = (await readFile(new URL(path, import.meta.url), 'utf8'))
      .replace(/^import .*;\s*$/gm, '')
      .replace(/^export /gm, '');
    await page.addScriptTag({ content: code });
  }
  const result = await page.evaluate(() => {
    const conversion = convertExerciseStyles('<div class="activity"><div class="word-bank"><span>Sol</span></div></div>');
    return {
      conversion,
      preserved: convertExerciseStyles('<div class="activity"><p>Texto original</p></div>').html,
      unsafe: sanitizeMarkdownHtml('<p>Texto</p><img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)">Abrir</a><script>alert(1)</script>'),
      safe: sanitizeMarkdownHtml('<table><tr><td>Dato</td></tr></table><a href="https://example.com">Fuente</a>')
    };
  });
  assert.match(result.conversion.html, /cb-activity-bank/);
  assert.deepEqual(result.conversion.exerciseDynamics.detected, ['banco_palabras']);
  assert.equal(result.preserved, '<div class="activity"><p>Texto original</p></div>');
  assert.doesNotMatch(result.unsafe, /onerror|onclick|javascript:|<script|<img/);
  assert.match(result.safe, /<table>/);
  assert.match(result.safe, /href="https:\/\/example.com"/);
  console.log('Charly catalog browser tests passed.');
} finally {
  await browser.close();
}
