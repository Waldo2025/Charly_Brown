import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const match = source.match(/app\.post\("\/api\/podcaster\/dialogue-videos\/generate", async \(req, res\) => \{([\s\S]*?)\n\}\);/);

if (!match) {
  throw new Error("No se encontró el endpoint de generación VEO.");
}

const endpointBody = match[1];

if (/getActiveHeavyWorkJobIds\("montage_export"\)/.test(endpointBody)
  || /buildDirectFallbackBusyDetail\("dialogue_video"/.test(endpointBody)
  || /pausó temporalmente VEO/.test(endpointBody)) {
  throw new Error("La generación VEO no debe bloquearse por exportaciones de montaje activas.");
}

if (!/getActiveHeavyWorkJobId\("dialogue_video"\)/.test(endpointBody)) {
  throw new Error("La generación VEO debe conservar su propio control de concurrencia dialogue_video.");
}

console.log("Podcaster VEO/export backend isolation OK.");
