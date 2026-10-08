import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/document-processing/dictionaries', { recursive: true });
await build({entryPoints:['tools/local-document-tools/spell-entry.js'],bundle:true,platform:'browser',format:'iife',outfile:'public/document-processing/spell-bundle.js',minify:true,legalComments:'eof'});
for(const [id,name] of [['es','dictionary-es'],['en','dictionary-en']]) {
  for(const ext of ['aff','dic']) await copyFile(`tools/local-document-tools/node_modules/${name}/index.${ext}`,`public/document-processing/dictionaries/${id}.${ext}`);
  await copyFile(`tools/local-document-tools/node_modules/${name}/license`,`public/document-processing/dictionaries/${id}.LICENSE`);
}
