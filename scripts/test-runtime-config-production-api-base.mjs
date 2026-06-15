import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/js/runtime-config.js", import.meta.url),
  "utf8"
);

if (!/if \(__charlyIsLocalRuntime\) \{\s*window\.__CHARLY_CONFIG__\.apiBaseUrl = "http:\/\/127\.0\.0\.1:8787\/api";\s*\} else \{\s*window\.__CHARLY_CONFIG__\.apiBaseUrl = "\/api";\s*\}/s.test(source)) {
  throw new Error("runtime-config debe forzar apiBaseUrl a /api en producción.");
}

console.log("Runtime config production api base OK.");
