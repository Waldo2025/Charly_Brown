import { startLecturasGameBoot } from "./lecturasGame.core.js";

window.__LECTURAS_GAME_NO_AUTO_BOOT__ = true;

const SYNC_VERSION = "20260317-synonyms-v2";
console.log(`[Synonyms] Booting version ${SYNC_VERSION}`);

// Ensure we are in 'synonyms' mode
startLecturasGameBoot({ forcedGameId: "synonyms" });
