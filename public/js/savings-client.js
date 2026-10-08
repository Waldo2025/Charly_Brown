import { authFetchJson } from "./api-client.js";
import { openSavingsDialog, SAVINGS_LEVEL_LABELS } from "./savings-modal.js";

const API = "/api/savings";
let current = null;
let headerRefreshTimer = null;
let headerUser = null;

export async function readSavingsPolicy() {
  current = await authFetchJson(`${API}/policy`, { preferRemote: true });
  window.dispatchEvent(new CustomEvent("charly:savings-policy", { detail: current }));
  return current;
}

export function getSavingsPolicy() { return current; }

export async function claimSavings(category, objectId) {
  return authFetchJson(`${API}/claim`, { method: "POST", body: { category, objectId }, preferRemote: true });
}

export async function claimManySavings(category, objectIds) {
  return authFetchJson(`${API}/claim-many`, { method: "POST", body: { category, objectIds }, preferRemote: true });
}

export async function completeSavings(category, objectId) {
  return authFetchJson(`${API}/complete`, { method: "POST", body: { category, objectId }, preferRemote: true });
}

export async function releaseSavings(category, objectId) {
  return authFetchJson(`${API}/release`, { method: "POST", body: { category, objectId }, preferRemote: true });
}

export async function changeSavingsLevel(level) {
  const response = await authFetchJson(`${API}/policy`, { method: "PUT", body: { level }, preferRemote: true });
  await readSavingsPolicy();
  return response;
}

export function savingsMessage(error) {
  const code = String(error?.code || error?.detail?.error || error?.message || "");
  if (code.includes("savings_daily_limit")) return "Alcanzaste el cupo de hoy. Podrás iniciar otro mañana (hora de Cancún).";
  if (code.includes("savings_veo_cooldown")) return "Espera a que termine la pausa de Veo antes de generar otra escena.";
  if (code.includes("savings_image_scene_required")) return "Esta escena usa su imagen de referencia con movimiento en modo ahorro.";
  if (code.includes("savings_script_limit")) return "Hoy puedes generar referencias para un solo guion de video.";
  return error?.message || "No se pudo consultar el modo de ahorro.";
}

export async function mountSavingsHeader(user) {
  const header = document.getElementById("cbHeaderActions") || document.querySelector(".main-header .header-content, .main-header");
  if (!header || !user?.uid) return;
  headerUser = user;
  if (!headerRefreshTimer) {
    headerRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && headerUser?.uid) void mountSavingsHeader(headerUser).catch(() => {});
    }, 5 * 60_000);
  }
  let root = document.getElementById("cbSavingsHeader");
  if (!root) {
    root = document.createElement("div");
    root.id = "cbSavingsHeader";
    root.className = "cb-savings-header";
    header.appendChild(root);
  }
  let policy;
  try {
    policy = await readSavingsPolicy();
  } catch (error) {
    root.replaceChildren();
    console.warn("[savings] No se pudo consultar el modo de ahorro:", error);
    return;
  }
  root.replaceChildren();
  if (policy.isAdmin) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cb-savings-trigger";
    button.setAttribute("aria-label", "Configurar modo de ahorro de IA");
    button.setAttribute("aria-haspopup", "dialog");
    button.title = `Ahorro IA: ${policy.mode === "auto"
      ? `Automático · ${SAVINGS_LEVEL_LABELS[policy.level] || SAVINGS_LEVEL_LABELS.medium}`
      : (SAVINGS_LEVEL_LABELS[policy.level] || SAVINGS_LEVEL_LABELS.off)}`;
    const icon = document.createElement("i");
    icon.className = "fas fa-piggy-bank";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
    button.addEventListener("click", () => {
      openSavingsDialog({
        policy: current || policy,
        returnFocus: button,
        errorMessage: savingsMessage,
        onSave: async (selection) => {
          await changeSavingsLevel(selection);
          await mountSavingsHeader(user);
        }
      });
    });
    root.appendChild(button);
  }
}
