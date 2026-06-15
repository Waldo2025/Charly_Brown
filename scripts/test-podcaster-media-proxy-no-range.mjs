import assert from "node:assert/strict";
import fs from "node:fs";

const frontendRuntime = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-runtime.js",
  "utf8"
);
const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const backendSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  frontendRuntime,
  /const noRange = options\.noRange === true;[\s\S]*proxyPath\}\?storagePath=\$\{encodeURIComponent\(cleanStoragePath\)\}\$\{noRange \? "&noRange=1" : ""\}/,
  "Los proxies de media deben dejar Range habilitado por defecto y solo desactivarlo bajo pedido."
);

assert.match(
  podcasterSource,
  /\/api\/assets\/proxy-image\?url=\$\{encodeURIComponent\(clean\)\}&noRange=1/,
  "Las URLs de proxy-image deben incluir noRange=1 en el frontend."
);

assert.match(
  podcasterSource,
  /\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(clean\)\}(?!&noRange=1)/,
  "Las URLs de proxy-media del podcaster deben dejar Range habilitado por defecto."
);

assert.match(
  backendSource,
  /const ignoreRange = String\(req\.query\?\.noRange \|\| ""\)\.trim\(\) === "1" \|\| String\(req\.query\?\.noRange \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "true";[\s\S]*const rangeHeader = ignoreRange \? "" : String\(req\.headers\.range \|\| ""\)\.trim\(\);/m,
  "El backend debe ignorar Range cuando noRange=1 esté presente."
);

console.log("Podcaster media proxy no-range OK.");
