function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

const REWARD_ONLY_FIELDS = ["primary_reward", "reward_image_signature", "reward_image_alt", "reward_image_aspect"];

function withoutRewardSelection(contract = {}) {
  const copy = structuredClone(contract || {});
  const config = copy.experience_config;
  if (config && typeof config === "object") {
    for (const field of REWARD_ONLY_FIELDS) delete config[field];
  }
  return copy;
}

function rewardSettings(contract = {}) {
  const config = contract?.experience_config || {};
  return Object.fromEntries(REWARD_ONLY_FIELDS.map((field) => [field, config[field] ?? null]));
}

/** True when an existing objective contract changes only its room reward. */
export function isRewardOnlyConfigurationChange(previousContract, nextContract) {
  if (!previousContract || !nextContract) return false;
  if (stable(withoutRewardSelection(previousContract)) !== stable(withoutRewardSelection(nextContract))) return false;
  return stable(rewardSettings(previousContract)) !== stable(rewardSettings(nextContract));
}

/** Rebuild reward metadata while retaining every existing room and question. */
export function updateExistingProjectReward(project, experienceConfig, rewardEngine) {
  if (!project || !Array.isArray(project.misiones) || !project.misiones.length) {
    throw new Error("No hay un escape room creado para actualizar su recompensa.");
  }
  if (!rewardEngine || typeof rewardEngine.buildPlan !== "function") {
    throw new Error("El motor de recompensas no está disponible.");
  }

  const updated = structuredClone(project);
  const previousRooms = Array.isArray(project.reward_plan?.rooms) ? project.reward_plan.rooms : [];
  const byId = new Map(previousRooms.map((room, index) => [String(room.room_id ?? index), room]));
  const rooms = updated.misiones.map((mission, index) => {
    const current = byId.get(String(mission.id ?? index)) || previousRooms[index] || {};
    return {
      id: String(mission.id ?? index),
      titulo: String(current.title || mission.titulo || `Sala ${index + 1}`),
      learning: String(current.learning || mission.contexto || mission.titulo || `Sala ${index + 1}`),
      fragment: String(current.fragment || "")
    };
  });

  updated.experience_config = structuredClone(experienceConfig);
  updated.reward_plan = rewardEngine.buildPlan(updated.experience_config, updated.clave_final, rooms);
  return updated;
}
