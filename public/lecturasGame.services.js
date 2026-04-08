const GAME_IDS = Object.freeze({
  SYNONYMS: "synonyms",
  ORDER: "order",
  TRACE: "trace",
  CAPS: "caps",
  MINEBLOX: "mineblox"
});

function normalizeGameId(gameId = "") {
  const key = String(gameId || "").trim().toLowerCase();
  if (key === GAME_IDS.ORDER || key === "ordena") return GAME_IDS.ORDER;
  if (key === GAME_IDS.TRACE || key === "trazos") return GAME_IDS.TRACE;
  if (key === GAME_IDS.CAPS || key === "mayusculas" || key === "caza-mayusculas") return GAME_IDS.CAPS;
  if (key === GAME_IDS.MINEBLOX || key === "minecraft" || key === "roblox") return GAME_IDS.MINEBLOX;
  return GAME_IDS.SYNONYMS;
}

export function resolveForcedGameId(source = "") {
  if (!source) return "";
  const key = String(source || "").trim().toLowerCase();
  if (!key) return "";
  if (["synonyms", "sinonimos", "sinonimo", "protege"].includes(key)) return GAME_IDS.SYNONYMS;
  if (["order", "atrapa", "atrapa-sinonimo", "atrapa-sinonimos"].includes(key)) return GAME_IDS.ORDER;
  if (["trace", "trazos", "trazo", "letras"].includes(key)) return GAME_IDS.TRACE;
  if (["caps", "mayusculas", "caza-mayusculas", "caza-mayuscula"].includes(key)) return GAME_IDS.CAPS;
  if (["mineblox", "minecraft", "roblox", "salon"].includes(key)) return GAME_IDS.MINEBLOX;
  return "";
}

export function createLecturasGameServiceRegistry(deps = {}) {
  const buildSynonymsRound = deps.buildSynonymsRound;
  const buildOrderRound = deps.buildOrderRound;
  const buildTraceRound = deps.buildTraceRound;
  const buildCapsRound = deps.buildCapsRound;
  const applyOrderStageWords = deps.applyOrderStageWords;
  return {
    [GAME_IDS.SYNONYMS]: {
      id: GAME_IDS.SYNONYMS,
      title: "PROTEGE AL SINÓNIMO",
      buildRound(lectura, runtime) {
        return typeof buildSynonymsRound === "function"
          ? buildSynonymsRound(lectura, runtime)
          : null;
      }
    },
    [GAME_IDS.ORDER]: {
      id: GAME_IDS.ORDER,
      title: "ATRAPA EL SINÓNIMO",
      buildRound(lectura, runtime) {
        const round = typeof buildOrderRound === "function"
          ? buildOrderRound(lectura, runtime)
          : null;
        if (round && typeof applyOrderStageWords === "function") {
          applyOrderStageWords(runtime);
        }
        return round;
      }
    },
    [GAME_IDS.TRACE]: {
      id: GAME_IDS.TRACE,
      title: "TRAZOS DE LETRAS",
      buildRound(lectura, runtime) {
        return typeof buildTraceRound === "function"
          ? buildTraceRound(lectura, runtime)
          : null;
      }
    },
    [GAME_IDS.CAPS]: {
      id: GAME_IDS.CAPS,
      title: "CAZA MAYÚSCULAS",
      buildRound(lectura, runtime) {
        return typeof buildCapsRound === "function"
          ? buildCapsRound(lectura, runtime)
          : null;
      }
    },
    [GAME_IDS.MINEBLOX]: {
      id: GAME_IDS.MINEBLOX,
      title: "MINEBLOX (BETA)",
      buildRound() { return null; }
    }
  };
}

export function resolveLecturasGameService(gameId = "", registry = {}) {
  const id = normalizeGameId(gameId);
  return registry[id] || registry[GAME_IDS.SYNONYMS] || null;
}
