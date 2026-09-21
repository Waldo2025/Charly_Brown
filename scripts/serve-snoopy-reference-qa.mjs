// Isolated UI fixture. No real generation, uploads, or user sessions.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(root, "public");
const fixture = path.join(root, "tests/fixtures/snoopy-reference-editor.html");
const port = Number(process.env.SNOOPY_REFERENCE_QA_PORT || 5011);
http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const target = pathname === "/qa" ? fixture : path.resolve(publicRoot, `.${pathname}`);
  if (target !== fixture && !target.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403).end(); return;
  }
  try {
    const body = await readFile(target);
    const type = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".html": "text/html" }[path.extname(target)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(body);
  } catch (_) { response.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`Snoopy reference QA: http://127.0.0.1:${port}/qa`));
