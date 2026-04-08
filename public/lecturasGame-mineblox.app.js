import { withGameVersion, LECTURAS_GAME_BUILD_ID } from "./lecturasGame-build.js";

window.__LECTURAS_GAME_NO_AUTO_BOOT__ = true;

const ASCRAFT_VERSION = `${LECTURAS_GAME_BUILD_ID}-ascraft-voxel-sphere`;
console.log(`[ASCraft Engine] Booting independent standalone version ${ASCRAFT_VERSION}...`);

async function bootStandaloneEngine() {
    // 1. Remove 2D core game shell completely
    document.body.innerHTML = '';
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#87CEEB";

    // 2. Create independent 3D Container
    const container = document.createElement("div");
    container.id = "lecturasGameCanvasContainer";
    container.className = "ascraft-container mineblox-container";
    container.style.width = "100vw";
    container.style.height = "100vh";
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    document.body.appendChild(container);

    // 3. Launch Engine
    const { initASCraft } = await import(withGameVersion("./lecturasGame-mineblox.js"));
    await initASCraft();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootStandaloneEngine);
} else {
    bootStandaloneEngine();
}
