import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

const seekMatch = source.match(/async seek\(targetMs, options = \{\}\) \{[\s\S]*?await this\.tick\(ms, \{ lightweight: useLightweightSeek \}\);[\s\S]*?this\.emit\('seek', \{ currentMs: ms \}\);[\s\S]*?\}/m);

if (!seekMatch) {
  throw new Error("No se encontró el flujo seek del controlador vivo.");
}

const seekBlock = seekMatch[0];

if (!seekBlock.includes("await this.tick(ms, { lightweight: useLightweightSeek });")) {
  throw new Error("El seek del controlador debe delegar la resincronización a tick().");
}

if (!/await Promise\.all\(\[[\s\S]*this\.syncAudio\(ms, speed\),[\s\S]*this\.syncVideo\(ms\),/m.test(source)) {
  throw new Error("tick() debe resincronizar audio Gemini y video en conjunto después de mover el playhead.");
}

console.log("Playback controller seek resyncs Gemini audio OK.");
