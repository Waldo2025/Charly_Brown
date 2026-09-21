import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { transformSync } from 'esbuild';
export function sourceFunctions(url, names) {
  const source = transformSync(readFileSync(url, 'utf8'), { target: 'es2020' }).code;
  const ast = parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  return names.map(name => {
    const node = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
    if (!node) throw new Error(`Missing function ${name}`);
    return source.slice(node.start, node.end);
  }).join('\n');
}
