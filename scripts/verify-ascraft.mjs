import fs from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5502/lecturasGame.html?game=mineblox";
const outDir = process.argv[3] || "output/web-game/ascraft-weather-fix";

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => {
  errors.push(String(err));
});

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.evaluate(async () => {
  if (typeof window.advanceTime === "function") {
    await window.advanceTime(250);
  }
});
await page.screenshot({ path: `${outDir}/shot-0.png`, fullPage: true });

const state = await page.evaluate(() => ({
  text: typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null,
  sky: typeof window.__ASCraftSkyDebug === "function" ? window.__ASCraftSkyDebug() : null,
  movement: typeof window.__ASCraftMovementDebug === "function" ? window.__ASCraftMovementDebug() : null,
  terrain: typeof window.__ASCraftTerrainDebug === "function"
    ? window.__ASCraftTerrainDebug([
      { id: "north", x: 0, z: -72 },
      { id: "south", x: 0, z: 78 },
      { id: "east", x: 68, z: 0 },
      { id: "west", x: -68, z: 0 },
      { id: "south_center", x: 0, z: 46 },
      { id: "south_mid", x: 0, z: 78 }
    ])
    : null,
}));

fs.writeFileSync(`${outDir}/state.json`, JSON.stringify(state, null, 2));
fs.writeFileSync(`${outDir}/errors.json`, JSON.stringify(errors, null, 2));

await browser.close();

console.log(JSON.stringify({
  url,
  outDir,
  errorsCount: errors.length,
  hasState: !!state,
  terrainContinuity: state?.terrain?.continuity || null,
}, null, 2));
