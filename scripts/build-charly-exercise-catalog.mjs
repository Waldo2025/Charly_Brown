import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../public/charly-brown/exercise-dynamics-catalog.js', import.meta.url);
const destination = new URL('../functions/src/charly-exercise-dynamics-catalog.mjs', import.meta.url);
const expected = await readFile(source);
const current = await readFile(destination).catch(() => null);

if (process.argv.includes('--check')) {
  if (!current?.equals(expected)) throw new Error('La copia del catálogo en functions/ está desactualizada. Ejecuta node scripts/build-charly-exercise-catalog.mjs');
} else if (!current?.equals(expected)) {
  await writeFile(destination, expected);
}
