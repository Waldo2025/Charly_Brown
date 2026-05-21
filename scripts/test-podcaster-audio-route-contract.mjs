import { readFileSync } from "node:fs";

const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!frontendSource.includes('"/api/podcaster/dialogue-audio/generate"')) {
  throw new Error("El frontend debe usar /api/podcaster/dialogue-audio/generate.");
}

const requiredBackendRoutes = [
  "/api/podcaster/dialogue-audio/generate",
  "/api/podcaster/dialogue-audios/generate",
];

const missingBackendRoutes = requiredBackendRoutes.filter((route) => !backendSource.includes(`"${route}"`));

if (missingBackendRoutes.length) {
  throw new Error(`backend/server.js debe exponer: ${missingBackendRoutes.join(", ")}`);
}

console.log("Podcaster audio route contract OK.");
