import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/js/runtime-config-loader.js", import.meta.url),
  "utf8"
);

if (!/const localCandidates = \[\s*"js\/config\.local\.js",\s*"\.\/config\.local\.js",\s*"\/config\.local\.js"\s*\];/m.test(source)) {
  throw new Error("runtime-config-loader debe probar candidatos razonables para config.local.js.");
}

if (!/const probe = await fetch\(src, \{ method: "GET", cache: "no-store" \}\);/.test(source)) {
  throw new Error("runtime-config-loader debe sondear config.local.js antes de inyectar el script.");
}

if (!/if \(!probe\.ok\) continue;/.test(source)) {
  throw new Error("runtime-config-loader debe ignorar config.local.js ausente sin disparar carga de script.");
}

console.log("Runtime config loader optional local config OK.");
