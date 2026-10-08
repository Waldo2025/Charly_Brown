import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../public/charly-brown/main.js', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../public/js/cache-version-loader.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/charlyMCPeditor.html', import.meta.url), 'utf8');
const version = JSON.parse(readFileSync(new URL('../public/version.json', import.meta.url), 'utf8'));

test('the cache loader uses one current build instead of concatenating it twice', () => {
  assert.match(loader, /const currentVersion = build;/);
  assert.doesNotMatch(loader, /`\$\{fallbackVersion\}-\$\{build\}`/);
  assert.equal(version.build, version.cache_version);
  assert.match(html, new RegExp(`cache-version-loader\\.js\\?v=${version.build.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('paused and attention-required productions are restored with their retry UI', () => {
  assert.match(main, /\["running", "paused", "needs_attention", "completed"\]\.includes\(status\.status\)/);
  assert.match(main, /\["running", "paused", "needs_attention"\]\.includes\(run\?\.status\)/);
  assert.match(main, /Producción requiere atención", JSON\.stringify\(summary, null, 2\)/);
});
