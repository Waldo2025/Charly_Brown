import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

if (serverSource.includes('functions", "node_modules"')) {
  throw new Error("backend/server.js no debe depender de functions/node_modules.");
}

if (!packageJson.dependencies || !packageJson.dependencies["firebase-admin"]) {
  throw new Error("package.json debe declarar firebase-admin para el backend local/Render.");
}

console.log("Backend dependency contract OK.");
