export function getPodcasterSessionRows(documentData = null) {
  const nestedRows = documentData?.session?.script?.rows;
  if (Array.isArray(nestedRows) && nestedRows.length) return nestedRows;
  const rootRows = documentData?.script?.rows;
  return Array.isArray(rootRows) ? rootRows : [];
}

export function planPodcasterReferenceTransfer(sceneCount, documentData = null) {
  const count = Number(sceneCount);
  const rows = getPodcasterSessionRows(documentData);
  if (!Number.isSafeInteger(count) || count < 1) {
    return { ok: false, error: "Lucy Studio no tiene escenas para transferir." };
  }
  const offset = rows.length === count ? 0 : rows.length === count + 2 ? 1 : -1;
  if (offset < 0) {
    return {
      ok: false,
      error: `Lucy Studio tiene ${count} escenas y Podcaster tiene ${rows.length}. Solo se admite el mismo número o dos escenas adicionales para intro y outro.`
    };
  }
  const rowIds = rows.map((row) => String(row?.id || "").trim());
  if (rowIds.some((id) => !id) || new Set(rowIds).size !== rowIds.length) {
    return { ok: false, error: "La sesión de Podcaster tiene escenas sin ID válido o con ID duplicado." };
  }
  return {
    ok: true,
    offset,
    rowIds,
    assignments: Array.from({ length: count }, (_, sceneIndex) => ({
      sceneIndex,
      sceneNumber: sceneIndex + 1,
      rowId: rowIds[sceneIndex + offset],
      podcasterSceneNumber: sceneIndex + offset + 1
    }))
  };
}

export function validateApprovedSceneImages(images = [], sceneCount = 0) {
  for (let index = 0; index < sceneCount; index += 1) {
    const image = images[index];
    if (image?.approved !== true) {
      throw new Error(`La imagen de la escena ${index + 1} aún no está aprobada.`);
    }
    if (!/^https:\/\//i.test(String(image.downloadUrl || "")) || !String(image.storagePath || "").trim()) {
      throw new Error(`La imagen de la escena ${index + 1} no terminó de subirse a Storage.`);
    }
  }
}

export function buildPodcasterReferenceMaps(session = {}, assignments = [], images = []) {
  const imageMap = { ...(session.rowReferenceImageMap || {}) };
  const listMap = { ...(session.rowReferenceImageListMap || {}) };
  const videoMap = { ...(session.rowReferenceVideoMap || {}) };
  const modeMap = { ...(session.rowReferenceModeByRowId || {}) };
  const updatedAt = new Date().toISOString();
  for (const assignment of assignments) {
    const image = images[assignment.sceneIndex];
    const rowId = assignment.rowId;
    const record = {
      name: `Escena${assignment.sceneNumber}.png`,
      dataUrl: "",
      downloadUrl: String(image.downloadUrl).trim(),
      storagePath: String(image.storagePath).trim(),
      mimeType: String(image.mimeType || "image/png").trim().toLowerCase(),
      type: "image",
      updatedAt
    };
    imageMap[rowId] = record;
    listMap[rowId] = [record];
    delete videoMap[rowId];
    modeMap[rowId] = "image";
  }
  return {
    rowReferenceImageMap: imageMap,
    rowReferenceImageListMap: listMap,
    rowReferenceVideoMap: videoMap,
    rowReferenceModeByRowId: modeMap
  };
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildNewPodcasterVideoSession({ scenes = [], images = [], title = "Video de Lucy Studio", now = new Date().toISOString() } = {}) {
  const sourceScenes = Array.isArray(scenes) ? scenes : [];
  if (!sourceScenes.length) throw new Error("Lucy Studio no tiene escenas para crear la sesión.");
  validateApprovedSceneImages(images, sourceScenes.length);
  const cleanTitle = String(title || "Video de Lucy Studio").trim() || "Video de Lucy Studio";
  const rows = sourceScenes.map((scene, index) => {
    const voiceOverText = String(scene?.guion || "").trim();
    const sceneDescription = String(scene?.descripcion_escena || "").trim();
    const visualNotes = String(scene?.elemento_visual || "").trim();
    const missing = [
      !voiceOverText && "Guion",
      !sceneDescription && "Descripción de escena",
      !visualNotes && "Elemento visual"
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(`La escena ${index + 1} no tiene ${missing.join(", ")}, campos necesarios para el timeline de Podcaster.`);
    }
    const inSceneText = String(scene?.texto_pantalla || "").trim();
    return {
      id: `scene-${index + 1}`,
      speaker: "Narrador",
      text: voiceOverText,
      dialogue: voiceOverText,
      voiceOverText,
      voiceOverOriginalText: voiceOverText,
      sceneDescription,
      scenePrompt: sceneDescription,
      visualNotes,
      videoDirective: visualNotes,
      inSceneText,
      screenText: inSceneText,
      durationSec: 8,
      time: String(scene?.tiempo || "8 segundos").trim(),
      transition: String(scene?.transicion || "Corte").trim()
    };
  });
  const script = {
    episodeTitle: cleanTitle,
    summary: "Guion de video importado desde Lucy Studio",
    hosts: ["Narrador"],
    videoContentType: "creative",
    videoMode: true,
    rows
  };
  const plan = planPodcasterReferenceTransfer(rows.length, { script });
  const referenceMaps = buildPodcasterReferenceMaps({}, plan.assignments, images);
  const headings = ["Tiempo", "Guion", "Descripción de escena", "Texto en pantalla", "Transición", "Elemento visual"];
  const chatHtml = `<p><strong>${escapeHtml(cleanTitle)}</strong> · Guion importado desde Lucy Studio</p><table><thead><tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${[
    row.time,
    row.voiceOverText,
    row.sceneDescription,
    row.inSceneText,
    row.transition,
    row.visualNotes
  ].map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const timelineClipsByRowId = Object.fromEntries(rows.map((row, index) => [row.id, {
    rowId: row.id,
    speakerKey: "Narrador",
    trackId: "speaker:narrador",
    startMs: index * 8000,
    sourceDurationMs: 8000,
    mediaDurationMs: 0,
    durationMode: "auto",
    trimInMs: 0,
    trimOutMs: 8000,
    zIndex: index + 1
  }]));
  return {
    title: cleanTitle,
    script,
    chat: [{
      id: `lucy-request-${Date.now()}`,
      role: "user",
      text: `Importar guion de video de Lucy Studio: ${cleanTitle}.`
    }, {
      id: `lucy-script-${Date.now()}`,
      role: "assistant",
      text: `Guion de video importado desde Lucy Studio: ${cleanTitle}. ${rows.length} escenas.`,
      html: chatHtml
    }],
    podcastStudioUiState: { composerGenerationMode: "video" },
    videoContentType: "creative",
    podcastVideoConfig: {
      enabled: true,
      editorEnabled: true,
      timelineTracks: [{ id: "speaker:narrador", label: "Narrador", order: 0 }],
      timelineClipsByRowId
    },
    ...referenceMaps,
    updatedAt: now
  };
}
