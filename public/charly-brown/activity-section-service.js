import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildApiUrlPreferRemote } from "../js/api-client.js";

const ENDPOINT = "/api/charly-brown/activity-sections";

export async function listActivitySections(meta = {}) {
  const params = new URLSearchParams();
  if (meta.level) params.set("level", meta.level);
  if (meta.grade) params.set("grade", meta.grade);
  return request(`${ENDPOINT}${params.size ? `?${params}` : ""}`);
}

export async function createActivitySection({ section = {}, scope = "personal", meta = {} } = {}) {
  return request(ENDPOINT, { method: "POST", body: { section, scope, meta } });
}

export async function updateActivitySection({ targetId = "", section = {}, scope = "personal", meta = {} } = {}) {
  return request(ENDPOINT, { method: "PUT", body: { targetId, section, scope, meta } });
}

export async function restoreActivitySection({ targetId = "", scope = "personal", meta = {} } = {}) {
  return request(`${ENDPOINT}/restore`, { method: "POST", body: { targetId, scope, meta } });
}

async function request(path, { method = "GET", body = null } = {}) {
  const url = buildApiUrlPreferRemote(path);
  if (!url) throw new Error("Backend de secciones no configurado.");
  const user = getAuth().currentUser;
  if (!user?.getIdToken) throw new Error("Inicia sesión para administrar secciones.");
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.message || data.error || `Secciones HTTP ${response.status}`));
  return {
    ...data,
    sections: Array.isArray(data.sections) ? data.sections.map(normalizeSection).filter((section) => section.id && section.name) : []
  };
}

function normalizeSection(value = {}) {
  return {
    ...value,
    id: String(value.id || "").trim(),
    name: String(value.name || "").trim(),
    description: String(value.description || "").trim(),
    objective: String(value.objective || "").trim(),
    agentInstructions: String(value.agentInstructions || "").trim(),
    levels: Array.isArray(value.levels) ? value.levels.map(String) : [],
    grades: Array.isArray(value.grades) ? value.grades.map(String) : [],
    original: value.original && typeof value.original === "object" ? value.original : null,
    scope: String(value.scope || "base"),
    sourceKind: String(value.sourceKind || "base"),
    customized: value.customized === true
  };
}
