import { startLecturasGameBoot } from "./lecturasGame.core.js";

window.__LECTURAS_GAME_NO_AUTO_BOOT__ = true;

const ORDER_VERSION = "20260317-order-v3";
console.log(`[Order] Booting version ${ORDER_VERSION}`);

// Ensure we are in 'order' mode
startLecturasGameBoot({ forcedGameId: "order" });
