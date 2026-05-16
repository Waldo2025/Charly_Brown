export const LECTURAS_GAME_BUILD_ID = "20260325j";

export function withGameVersion(path = "") {
    const base = String(path || "").trim();
    if (!base) return base;
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}v=${encodeURIComponent(LECTURAS_GAME_BUILD_ID)}`;
}

if (typeof window !== "undefined") {
    window.__LECTURAS_GAME_BUILD_ID__ = LECTURAS_GAME_BUILD_ID;
}
