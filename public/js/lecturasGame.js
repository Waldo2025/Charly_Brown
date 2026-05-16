import { resolveForcedGameId } from "./lecturasGame.services.js";
import { withGameVersion } from "./lecturasGame-build.js";

const GAME_MODULES = Object.freeze({
  synonyms: withGameVersion("./lecturasGame-synonyms.app.js"),
  order: withGameVersion("./lecturasGame-order.app.js"),
  trace: withGameVersion("./lecturasGame-trace.app.js"),
  caps: withGameVersion("./lecturasGame-caps.app.js"),
  mineblox: withGameVersion("./lecturasGame-mineblox.app.js")
});

function readRequestedGame() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const forced = resolveForcedGameId(params.get("game") || "");
    return forced || "synonyms";
  } catch (_) {
    return "synonyms";
  }
}

async function boot() {
  const gameId = readRequestedGame();
  const target = GAME_MODULES[gameId] || GAME_MODULES.synonyms;
  await import(target);
}

boot().catch((err) => {
  try {
    console.error("[LecturasGame] bootstrap failed", err);
  } catch (_) {
    // no-op
  }
});
