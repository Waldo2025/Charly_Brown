import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES, SCIENCE_GAME_SOURCE_DEPENDENCIES, loadScienceExportSourceDependencies } from '../public/js/science-export-source-dependencies.mjs';

const source = name => readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
for (const [entry, files] of [ ['science-simulator-runtime.mjs', SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES], ['science-game-runtime.mjs', SCIENCE_GAME_SOURCE_DEPENDENCIES] ]) {
  test(`${entry} offline manifest includes all transitive static ESM dependencies`, async () => {
    const packaged = new Set([entry, ...files]);
    for (const name of packaged) {
      const contents = await source(name);
      const statements = parse(contents, { ecmaVersion: 'latest', sourceType: 'module' }).body;
      for (const statement of statements.filter(item => item.source?.value?.startsWith('./'))) {
        const dependency = statement.source.value.slice(2).split('?')[0];
        assert.ok(packaged.has(dependency), `${name} needs missing offline asset ${dependency}`);
      }
    }
  });
}

test('offline dependency fetch fails explicitly instead of packaging a broken runtime', async () => {
  await assert.rejects(loadScienceExportSourceDependencies(SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES, async () => ({ ok: false })), /dependencia offline/);
  const files = await loadScienceExportSourceDependencies(SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES, async url => ({ ok: true, text: async () => url.pathname }));
  assert.deepEqual(files.map(([name]) => name), SCIENCE_SIMULATOR_SOURCE_DEPENDENCIES);
});
