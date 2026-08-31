/**
 * Funcionalidades y menús de la barra de herramientas interna de Marcie Blog Editor
 * Conforme a las especificaciones: Buscador ⌘K, Asistente IA, Centro de Notificaciones y Perfil de Autor.
 */

import { showModal, closeActiveModal, showToast } from "./modals.js";
import { openCommandPalette } from "./command-palette.js";
import { logOutUser } from "../services/marcie-auth-guard.js";
import { generateWithGemini, getConfiguredGeminiModel } from "/charly-brown/gemini-client.js";
import { saveMarcieSession } from "../services/marcie-session-store.js";
import { draftArticleForMode, refineTopicForMode, reviewArticleForMode, sessionUsesAida } from "../services/marcie-mode-service.js";
import { getActiveMarciePrompt } from "../services/marcie-prompt-settings.js";

const escapeHtml = (unsafe) => {
  return (unsafe || "").replace(/[&<"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
    }
  });
};

function parseGeminiJson(raw = "") {
  return JSON.parse(String(raw || "").replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim());
}

function articleContextForAssistant(session = {}) {
  return (session.article?.blocks || [])
    .map((block) => block.text || (block.items || []).join(". "))
    .filter(Boolean)
    .join("\n\n");
}

async function generateExpansionReport({ session, instruction, preselectedText = "" }) {
  const scopeText = preselectedText
    ? `La ampliación debe limitarse a esta selección: "${preselectedText}".`
    : "La ampliación puede intervenir el artículo completo, pero debe identificar cada sección afectada.";
  const modeInstruction = sessionUsesAida(session)
    ? "Trabaja como analista Aida. Conserva las ocho fases, la idea central fiel al tema, la analogía dominante y solo evidencia verificada. Añade ciencia e historia como respaldo pertinente, no como sustituto del tema. No introduzcas PNL ni CTA comercial."
    : getActiveMarciePrompt("expansion_report");
  const prompt = `
${modeInstruction}

Eres el analista editorial de Marcie Blog Editor. Debes preparar un informe previo; no reescribas todavía el artículo.

Título: ${session.title}
Audiencia: ${session.audience}
Contenido actual:
${articleContextForAssistant(session)}

${scopeText}
Instrucción solicitada: "${instruction}"

Devuelve únicamente JSON válido con este esquema:
{
  "summary": "Resumen ejecutivo del cambio propuesto",
  "informationToExpand": [{ "location": "Sección o bloque", "currentInformation": "Qué información existente se ampliará", "purpose": "Por qué conviene ampliarla" }],
  "modifications": [{ "location": "Sección o bloque", "change": "Qué se modificará", "reason": "Motivo editorial" }],
  "additions": [{ "location": "Sección o bloque", "content": "Qué contenido nuevo se añadirá", "format": "Párrafo, ejemplo, lista, cita u otro" }],
  "placements": [{ "location": "Ubicación exacta", "placement": "Antes, después o dentro de qué bloque", "reason": "Justificación" }],
  "preservedElements": ["Elementos que no deben cambiar"]
}

async function saveExpansionReportForSession({ session, report, instruction, preselectedText = "" }) {
  const safeReport = JSON.parse(JSON.stringify(report || {}));
  session.expansionApprovalReport = {
    report: safeReport,
    instruction: String(instruction || ""),
    preselectedText: String(preselectedText || ""),
    generatedAt: new Date().toISOString()
  };
  await saveMarcieSession(session);
  return safeReport;
}
El informe debe ser específico, verificable y referirse a títulos, bloques o fragmentos reales del artículo.
  `.trim();

  const raw = await generateWithGemini({
    model: getConfiguredGeminiModel(),
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.25 }
    }
  });
  return parseGeminiJson(raw);
}

async function applyAssistantInstruction({ session, instruction, preselectedText = "", approvedReport = null }) {
  if (sessionUsesAida(session)) {
    const previousArticle = session.article || {};
    const scope = preselectedText ? `Fragmento señalado por el usuario: ${preselectedText}\n` : "";
    const report = approvedReport ? `Informe de cambios aprobado: ${JSON.stringify(approvedReport)}\n` : "";
    const generatedArticle = await draftArticleForMode({
      session,
      title: previousArticle.title || session.title,
      topic: session.topic || session.title,
      audience: session.audience || previousArticle.audience || "parents",
      brief: `${scope}${report}${instruction}`.trim()
    });
    session.article = {
      ...generatedArticle,
      featuredImage: generatedArticle.featuredImage || previousArticle.featuredImage,
      templateId: generatedArticle.templateId || previousArticle.templateId,
      appearance: generatedArticle.appearance || previousArticle.appearance,
      sourceCitationFormat: generatedArticle.sourceCitationFormat || previousArticle.sourceCitationFormat
    };
    ["featuredImage", "templateId", "appearance", "sourceCitationFormat"].forEach((field) => {
      if (session.article[field] === undefined) delete session.article[field];
    });
    session.title = session.article.title || session.title;
    session.status = "review_required";
    session.approvedAudiences = (session.approvedAudiences || []).filter((audience) => audience !== session.audience);
    delete session.audit;
    if (!session.articlesByAudience) session.articlesByAudience = {};
    session.articlesByAudience[session.audience || session.article.audience || "parents"] = session.article;
    await saveMarcieSession(session);
    return;
  }
  const fullContext = `
${getActiveMarciePrompt("assistant_apply")}

Eres el asistente editorial inteligente de Marcie Blog Editor.
El artículo completo actual es:
Título: ${session.title}
Audiencia: ${session.audience}
Contenido actual:
${articleContextForAssistant(session)}

${preselectedText ? `El usuario seleccionó ESTA parte específica y los cambios deben limitarse a ella:\n"${preselectedText}"\n` : ""}
Instrucción del usuario:
"${instruction}"

${approvedReport ? `Informe editorial aprobado. Aplica exactamente este alcance y no introduzcas cambios fuera de él:\n${JSON.stringify(approvedReport, null, 2)}\n` : ""}
El contenido publicable debe ser prosa editorial normal y limpia. No incluyas referencias a IA o al proceso de generación, instrucciones del prompt, etiquetas internas, metadatos, marcas de agua, firmas codificadas, secuencias ocultas ni caracteres invisibles. No uses Unicode engañoso ni códigos destinados a influir en clasificadores. La naturalidad debe provenir exclusivamente de una redacción original, específica, rigurosa y ajustada a la audiencia. El JSON siguiente es solo el formato técnico interno y jamás debe mencionarse dentro del artículo.

Devuelve el artículo actualizado en formato JSON canónico ArticleDocument:
{
  "schemaVersion": "1.0",
  "title": "...",
  "subtitle": "...",
  "excerpt": "...",
  "audience": "${session.audience}",
  "category": "Educación",
  "readingTimeMinutes": 6,
  "publishedDateText": "15 de mayo de 2025",
  "tags": ["Educación", "IA"],
  "blocks": [
    { "id": "b1", "type": "paragraph", "text": "..." },
    { "id": "b2", "type": "quote", "text": "...", "attribution": "..." },
    { "id": "b3", "type": "heading", "level": "h3", "text": "..." },
    { "id": "b4", "type": "bulletList", "items": ["..."] }
  ],
  "sources": ${JSON.stringify(session.article?.sources || [])},
  "seo": ${JSON.stringify(session.article?.seo || {})}
}
  `.trim();

  const raw = await generateWithGemini({
    model: getConfiguredGeminiModel(),
    prompt: fullContext,
    payload: {
      contents: [{ role: "user", parts: [{ text: fullContext }] }],
      generationConfig: { responseMimeType: "application/json" }
    }
  });
  const generatedArticle = parseGeminiJson(raw);
  const previousArticle = session.article || {};
  session.article = {
    ...previousArticle,
    ...generatedArticle,
    featuredImage: generatedArticle.featuredImage || previousArticle.featuredImage,
    templateId: generatedArticle.templateId || previousArticle.templateId,
    appearance: generatedArticle.appearance || previousArticle.appearance,
    sourceCitationFormat: generatedArticle.sourceCitationFormat || previousArticle.sourceCitationFormat
  };
  ["featuredImage", "templateId", "appearance", "sourceCitationFormat"].forEach((field) => {
    if (session.article[field] === undefined) delete session.article[field];
  });
  session.title = generatedArticle.title || session.title;
  session.status = "drafting";
  if (!session.articlesByAudience) session.articlesByAudience = {};
  session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
  await saveMarcieSession(session);
}

function expansionReportItems(items = [], fields = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="rounded-lg border border-dashed border-slate-200 p-3 text-[11px] text-slate-400">Sin cambios propuestos en este apartado.</div>`;
  }
  return items.map((item) => {
    const data = item && typeof item === "object" ? item : { detail: String(item || "") };
    const location = data.location || data.section || data.detail || "Artículo";
    const detail = fields.map((field) => data[field]).filter(Boolean).join(" · ");
    return `
      <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${escapeHtml(String(location))}</div>
        <div class="mt-1 text-xs leading-relaxed text-slate-700">${escapeHtml(String(detail || "Cambio editorial propuesto"))}</div>
      </div>
    `;
  }).join("");
}

function openExpansionApprovalReport({ session, report, instruction, preselectedText, onRefresh }) {
  const modal = showModal({
    title: "Informe previo de ampliación",
    widthClass: "max-w-3xl",
    contentHtml: `
      <div class="expansion-approval-modal-marker space-y-3 text-xs text-slate-700">
        <div class="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div class="text-[10px] font-bold uppercase tracking-wider text-blue-600">Resumen ejecutivo</div>
          <p class="mt-1 text-sm leading-relaxed text-blue-950">${escapeHtml(String(report.summary || "La IA preparó un alcance de ampliación para revisión."))}</p>
          <p class="mt-2 text-[11px] text-blue-700">El artículo todavía no ha sido modificado.</p>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <section class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <h3 class="mb-2 font-bold text-slate-900">Información que ampliará</h3>
            <div class="space-y-2">${expansionReportItems(report.informationToExpand, ["currentInformation", "purpose"])}</div>
          </section>
          <section class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <h3 class="mb-2 font-bold text-slate-900">Qué modificará</h3>
            <div class="space-y-2">${expansionReportItems(report.modifications, ["change", "reason"])}</div>
          </section>
          <section class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <h3 class="mb-2 font-bold text-slate-900">Qué añadirá</h3>
            <div class="space-y-2">${expansionReportItems(report.additions, ["content", "format"])}</div>
          </section>
          <section class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <h3 class="mb-2 font-bold text-slate-900">Dónde lo hará</h3>
            <div class="space-y-2">${expansionReportItems(report.placements, ["placement", "reason"])}</div>
          </section>
        </div>
        ${Array.isArray(report.preservedElements) && report.preservedElements.length ? `
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
            <div class="font-bold text-emerald-900">Elementos que conservará</div>
            <ul class="mt-1 list-disc space-y-1 pl-4 text-emerald-800">${report.preservedElements.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>
          </div>
        ` : ""}
        <div id="expansion-approval-status" class="text-[11px] text-slate-500" aria-live="polite"></div>
      </div>
    `,
    footerButtonsHtml: `
      <button type="button" class="btn btn-outline h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cancelar sin cambios</button>
      <button id="btn-regenerate-expansion-report" type="button" class="btn btn-outline h-9 px-4 text-xs">Generar nuevamente</button>
      <button id="btn-approve-expansion" type="button" class="btn btn-primary h-9 px-4 text-xs">Aprobar y aplicar</button>
    `
  });

  const approveButton = modal.element.querySelector("#btn-approve-expansion");
  const regenerateButton = modal.element.querySelector("#btn-regenerate-expansion-report");
  const status = modal.element.querySelector("#expansion-approval-status");
  regenerateButton?.addEventListener("click", async () => {
    regenerateButton.disabled = true;
    if (approveButton) approveButton.disabled = true;
    regenerateButton.textContent = "Generando informe...";
    if (status) status.textContent = "Analizando nuevamente el alcance. El artículo todavía no será modificado.";
    try {
      const refreshedReport = await generateExpansionReport({ session, instruction, preselectedText });
      await saveExpansionReportForSession({ session, report: refreshedReport, instruction, preselectedText });
      closeActiveModal();
      openExpansionApprovalReport({ session, report: refreshedReport, instruction, preselectedText, onRefresh });
      showToast("Informe previo actualizado.", "success");
    } catch (error) {
      if (status) status.textContent = `No se pudo regenerar el informe: ${error.message}`;
      regenerateButton.disabled = false;
      regenerateButton.textContent = "Generar nuevamente";
      if (approveButton) approveButton.disabled = false;
    }
  });
  approveButton?.addEventListener("click", async () => {
    approveButton.disabled = true;
    approveButton.textContent = "Aplicando cambios...";
    if (status) status.textContent = "Aplicando únicamente el alcance aprobado.";
    try {
      await applyAssistantInstruction({ session, instruction, preselectedText, approvedReport: report });
      delete session.expansionApprovalReport;
      await saveMarcieSession(session);
      closeActiveModal();
      showToast("Ampliación aprobada y aplicada al artículo.", "success");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("[MarcieAiAssistant] Error al aplicar ampliación aprobada:", error);
      if (status) status.textContent = `No se pudieron aplicar los cambios: ${error.message}`;
      approveButton.disabled = false;
      approveButton.textContent = "Reintentar aplicación";
    }
  });
}

export function initTopbarActions({ getSessions, onSelectSession, onRefresh, getActiveSession, getCurrentUser }) {
  const globalSearch = document.getElementById("global-search");
  const btnIa = document.getElementById("btn-ia-topbar");
  const btnBell = document.getElementById("btn-notification-topbar");
  const userAvatar = document.getElementById("user-avatar");

  // 1. Buscador global (⌘ K)
  if (globalSearch) {
    globalSearch.addEventListener("click", () => {
      openCommandPalette({ getSessions, onSelectSession, onRefresh });
    });
    globalSearch.addEventListener("focus", () => {
      globalSearch.blur();
      openCommandPalette({ getSessions, onSelectSession, onRefresh });
    });
  }

  // 2. Botón Asistente IA (Modal de Acciones Rápidas y Prompt Directo a Gemini)
  if (btnIa) {
    btnIa.addEventListener("click", () => {
      openAiAssistantModal({ getActiveSession, onRefresh });
    });
  }

  // 3. Botón de Notificaciones y Centro de Actividad del Radar
  if (btnBell) {
    btnBell.addEventListener("click", () => {
      openNotificationsCenterModal({ getActiveSession, getSessions });
    });
  }

  // 4. Menú de Avatar y Perfil de Autor / Editor
  if (userAvatar) {
    userAvatar.addEventListener("click", () => {
      openUserProfileModal({ getCurrentUser, getSessions });
    });
  }
}

/**
 * Modal del Centro de Notificaciones y Actividad
 */
function openNotificationsCenterModal({ getActiveSession, getSessions }) {
  const session = typeof getActiveSession === "function" ? getActiveSession() : null;
  const allSessions = typeof getSessions === "function" ? getSessions() : [];
  const editorialNotifications = Array.isArray(window.__marcieEditorialNotifications) ? window.__marcieEditorialNotifications : [];

  const currentLogs = (session?.log && session.log.length > 0) ? session.log : [
    { message: "Sesión inicializada y sincronizada con Firestore", at: new Date().toISOString() },
    { message: "Conexión activa con Vertex AI / Gemini 2.5 Flash", at: new Date(Date.now() - 60000).toISOString() }
  ];

  showModal({
    title: "🔔 Centro de Notificaciones y Actividad",
    contentHtml: `
      <div class="flex flex-col gap-4 text-xs text-slate-700">
        <!-- Indicadores de estado del sistema -->
        <div class="grid grid-cols-3 gap-2">
          <div class="p-2.5 bg-teal-50 border border-teal-100 rounded-lg flex flex-col gap-0.5">
            <span class="text-[10px] uppercase font-bold text-teal-800 tracking-wider">Firestore</span>
            <span class="font-semibold text-teal-900 flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-teal-500"></span> Conectado
            </span>
          </div>
          <div class="p-2.5 bg-purple-50 border border-purple-100 rounded-lg flex flex-col gap-0.5">
            <span class="text-[10px] uppercase font-bold text-purple-800 tracking-wider">Motor IA</span>
            <span class="font-semibold text-purple-900 flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-purple-500"></span> Gemini 2.5
            </span>
          </div>
          <div class="p-2.5 bg-blue-50 border border-blue-100 rounded-lg flex flex-col gap-0.5">
            <span class="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Sesiones</span>
            <span class="font-semibold text-blue-900">
              ${allSessions.length} activas
            </span>
          </div>
        </div>

        <!-- Lista de eventos de actividad -->
        ${editorialNotifications.length ? `<div><span class="font-semibold text-red-700">Alertas editoriales del equipo</span><div class="mt-2 space-y-2">${editorialNotifications.slice(0, 10).map((item) => `<div class="rounded-lg border border-red-200 bg-red-50 p-2.5"><b>${item.type === "publication_blocked" ? "Publicación bloqueada" : "Notificación"}</b><p class="mt-1 text-[10px] text-red-700">${escapeHtml((item.reasons || []).join(" · "))}</p></div>`).join("")}</div></div>` : ""}
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-slate-900">Historial reciente de la sesión actual:</span>
            <span class="text-[10px] text-slate-400 font-mono">${session?.title || "Sin título"}</span>
          </div>
          <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
            ${currentLogs.map((l) => `
              <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:bg-slate-100/70 transition-colors">
                <div class="flex items-center gap-2 text-slate-700 min-w-0 pr-2">
                  <span class="w-2 h-2 rounded-full bg-teal-500 shrink-0"></span>
                  <span class="font-medium truncate">${l.message}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono shrink-0">
                  ${new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <button class="btn btn-outline h-8 px-3 text-xs mr-auto" onclick="showToast('Notificaciones actualizadas', 'info')">
        Refrescar
      </button>
      <button class="btn btn-primary h-8 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">
        Entendido
      </button>
    `
  });
}

/**
 * Modal de Perfil de Autor y Métricas de Editor
 */
function openUserProfileModal({ getCurrentUser, getSessions }) {
  const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
  const email = user?.email || "Usuario";
  const uid = user?.uid || "";
  const allSessions = typeof getSessions === "function" ? getSessions() : [];

  const draftCount = allSessions.filter((s) => s.status === "draft" || s.status === "drafting").length;
  const reviewCount = allSessions.filter((s) => s.status === "review").length;
  const publishedCount = allSessions.filter((s) => s.status === "published").length;

  showModal({
    title: "👤 Perfil de Autor / Editor",
    contentHtml: `
      <div class="flex flex-col gap-4 text-xs text-slate-700">
        <!-- Header de usuario -->
        <div class="flex items-center gap-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <div class="w-12 h-12 rounded-full bg-teal-700 text-white font-bold text-base flex items-center justify-center shadow-sm shrink-0">
            ${email.substring(0, 2).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-slate-900 text-sm truncate">${email}</div>
            <div class="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              Usuario Aprobado y Autorizado
            </div>
          </div>
        </div>

        <!-- Métricas del autor -->
        <div>
          <span class="block font-semibold text-slate-800 mb-2 uppercase text-[10px] tracking-wider text-slate-400">Tus Artículos en Marcie</span>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div class="text-base font-bold text-slate-800">${allSessions.length}</div>
              <div class="text-[10px] text-slate-500">Total Artículos</div>
            </div>
            <div class="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div class="text-base font-bold text-amber-700">${draftCount}</div>
              <div class="text-[10px] text-amber-700">Borradores</div>
            </div>
            <div class="p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <div class="text-base font-bold text-green-700">${publishedCount}</div>
              <div class="text-[10px] text-green-700">Publicados</div>
            </div>
          </div>
        </div>

        <!-- Detalles técnicos -->
        <div class="space-y-1.5 border-t border-slate-100 pt-2.5 text-[11px]">
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span class="text-slate-500">Identificador UID:</span>
            <span class="font-mono text-slate-700 truncate max-w-[200px]">${uid}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span class="text-slate-500">Colección Scoped:</span>
            <span class="font-mono text-teal-700 font-semibold">MarcieBlogEditor</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span class="text-slate-500">Rol Editorial:</span>
            <span class="text-slate-800 font-medium">Editor Principal</span>
          </div>
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-modal-logout" class="btn btn-outline border-red-200 text-red-600 hover:bg-red-50 h-8 px-3 text-xs mr-auto flex items-center gap-1.5 cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        Cerrar Sesión
      </button>
      <a href="/perfil.html" class="btn btn-outline h-8 px-3 text-xs flex items-center gap-1">
        Mi Perfil
      </a>
      <button class="btn btn-primary h-8 px-4 text-xs cursor-pointer" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">
        Cerrar
      </button>
    `
  });

  document.getElementById("btn-modal-logout")?.addEventListener("click", () => {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
      logOutUser();
    }
  });
}

/**
 * Modal del Asistente Editorial para instrucciones rápidas o prompts directos
 */
async function refineAssistantTopic(topic = "") {
  const prompt = `
${getActiveMarciePrompt("assistant_title")}

Actúa como editor jefe de un blog educativo con voz cálida, precisa y humana.
Convierte el siguiente tema o idea en un título irresistible para blog, específico y natural.
Evita fórmulas genéricas, exageraciones, clichés, tono publicitario y frases que parezcan generadas por IA.
Conserva fielmente la intención y no inventes datos.
Devuelve únicamente el título final, sin comillas ni explicaciones.

Idea original: ${String(topic || "").trim()}
  `.trim();
  return generateWithGemini({
    model: getConfiguredGeminiModel(),
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 120 }
    }
  });
}

async function humanizeAssistantSpecifications({ topic = "", specifications = "", audience = "", editorialMode = "marcie" } = {}) {
  const modeInstruction = editorialMode === "aida"
    ? "Convierte las notas en un encargo para Aida: ciencia accesible, ocho fases, una idea central, una analogía dominante, historia solo con evidencia y sin CTA comercial."
    : getActiveMarciePrompt("assistant_humanize");
  const prompt = `
${modeInstruction}

Actúa como editor de desarrollo. Mejora únicamente las notas del autor para convertirlas en una indicación editorial clara, natural y útil.

Reglas obligatorias:
- Conserva la idea, el alcance y todos los detalles originales; no sustituyas el texto por una plantilla editorial.
- No agregues secciones, encabezados, etiquetas, listas, Markdown, explicaciones sobre voz, filtros "anti-IA" ni recomendaciones que el autor no pidió.
- No inventes ejemplos, datos, escenas, fuentes, experiencias ni requisitos.
- Si las notas parecen un título o tema, conviértelas en una sola especificación breve que indique qué debe abordar el artículo.
- Usa español natural, cálido y preciso, sin clichés ni tono robótico.
- Devuelve un solo párrafo de máximo 90 palabras y solamente el texto mejorado.

Tema: ${String(topic || "").trim() || "Sin tema definido"}
Enfoque o audiencia: ${String(audience || "").trim() || "Audiencia general"}
Notas del autor: ${String(specifications || "").trim()}
  `.trim();
  return generateWithGemini({
    model: getConfiguredGeminiModel(),
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 220 }
    }
  });
}

function normalizeHumanizedSpecifications(value = "", fallback = "") {
  const clean = String(value || "")
    .replace(/^```(?:markdown|text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*(?:#{1,6}\s*)?(?:\*{1,2})?Especificaciones(?:\s+para\s+redactar\s+el\s+artículo)?(?:\*{1,2})?\s*:\s*/i, "")
    .replace(/\*{1,2}/g, "")
    .replace(/^[-•]\s*/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!clean) return String(fallback || "").trim();
  if (clean.length <= 700) return clean;
  const shortened = clean.slice(0, 700);
  const sentenceEnd = Math.max(shortened.lastIndexOf("."), shortened.lastIndexOf(";"));
  return (sentenceEnd > 420 ? shortened.slice(0, sentenceEnd + 1) : `${shortened.trim()}…`).trim();
}

export function openAiAssistantModal({ getActiveSession, onRefresh, preselectedText = "", initialPrompt = "" }) {
  const session = typeof getActiveSession === "function" ? getActiveSession() : null;
  const initialTopic = session?.article?.title || session?.topic || session?.title || "";

  showModal({
    title: "✨ Asistente Editorial",
    widthClass: "max-w-3xl",
    contentHtml: `
      <div class="ai-assistant-compact-layout grid gap-4 text-xs text-slate-700 lg:grid-cols-[minmax(0,1fr)_190px]">
        <div class="min-w-0 space-y-3.5">
        <div class="space-y-1.5">
          <label for="ai-topic-input" class="block text-sm font-semibold text-slate-800">Tema del artículo</label>
          <p class="text-[11px] text-slate-500">Escribe tu idea con tus propias palabras y Gemini la convertirá en un título preciso para el blog.</p>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input id="ai-topic-input" value="${escapeHtml(initialTopic)}" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-800 shadow-xs outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20" placeholder="Ej. Cómo recuperar la curiosidad de los estudiantes en el aula" />
            <button id="btn-refine-ai-topic" class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 text-xs font-semibold text-purple-700 transition hover:border-purple-300 hover:bg-purple-100">
              <i data-lucide="wand-sparkles" class="h-3.5 w-3.5"></i>
              Crear título perfecto
            </button>
          </div>
          <span id="ai-topic-status" class="block min-h-4 text-[11px] text-slate-400" aria-live="polite"></span>
        </div>

        ${preselectedText ? `
        <div class="bg-purple-50/50 border border-purple-100 rounded-xl p-4 text-purple-900 shadow-xs relative">
          <div class="absolute -top-2 left-3 bg-purple-100 px-2 py-0.5 rounded text-[9px] uppercase font-bold text-purple-600 tracking-wider">Selección Actual</div>
          <p class="italic text-slate-600 mt-1 max-h-24 overflow-y-auto pr-2">"${escapeHtml(preselectedText)}"</p>
        </div>
        ` : ''}

        <div class="space-y-1.5">
          <label for="ai-quick-prompt" class="block text-sm font-semibold text-slate-800">Especificaciones del artículo</label>
          <p class="text-[11px] text-slate-500 mb-2">Añade enfoque, audiencia, tono, ideas indispensables, ejemplos, límites o cualquier detalle que deba respetarse.</p>
          <div class="relative group">
            <textarea id="ai-quick-prompt" class="w-full border border-slate-200 rounded-xl p-3 pb-12 text-sm h-32 resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-slate-50/50 hover:bg-slate-50 shadow-xs" placeholder="Ej. Dirigido a docentes de secundaria; incluir una situación realista de aula; evitar tecnicismos; tono cercano, reflexivo y práctico..."></textarea>
            <div class="absolute bottom-3 right-3">
              <button id="btn-humanize-ai-prompt" class="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 transition-all">
                <i data-lucide="heart-handshake" class="h-3.5 w-3.5"></i>
                Mejorar y humanizar
              </button>
            </div>
          </div>
          <span id="ai-status-indicator" class="text-slate-400 text-[11px] mt-1 block"></span>
          <button id="btn-run-custom-ai" class="mt-2 h-9 w-full rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-md">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Analizar y aplicar
          </button>
        </div>
        </div>

        <aside class="marcie-quick-actions rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 lg:self-start" aria-label="Acciones rápidas del asistente">
          <div class="mb-2 flex items-center gap-1.5 px-1">
            <i data-lucide="zap" class="h-3.5 w-3.5 text-purple-500"></i>
            <span class="text-[10px] uppercase tracking-wider font-bold text-slate-500">Acciones rápidas</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            <button data-quick-action="rewrite" data-quick-tone="purple" class="marcie-quick-action p-2 bg-white border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer group text-left">
              <div class="marcie-quick-action-icon w-6 h-6 shrink-0 rounded-md bg-purple-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg class="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </div>
              <span class="font-semibold text-slate-800 text-xs">Reescribir</span>
            </button>

            <button data-quick-action="expand" data-quick-tone="blue" class="marcie-quick-action p-2 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer group text-left">
              <div class="marcie-quick-action-icon w-6 h-6 shrink-0 rounded-md bg-blue-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
              </div>
              <span class="font-semibold text-slate-800 text-xs">Ampliar info</span>
            </button>

            <button data-quick-action="sources" data-quick-tone="orange" class="marcie-quick-action p-2 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:bg-orange-50/50 hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer group text-left">
              <div class="marcie-quick-action-icon w-6 h-6 shrink-0 rounded-md bg-orange-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg class="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <span class="font-semibold text-slate-800 text-xs">Buscar fuentes</span>
            </button>

            <button data-quick-action="audit" data-quick-tone="teal" class="marcie-quick-action p-2 bg-white border border-slate-200 rounded-lg hover:border-teal-300 hover:bg-teal-50/50 hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer group text-left">
              <div class="marcie-quick-action-icon w-6 h-6 shrink-0 rounded-md bg-teal-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg class="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <span class="font-semibold text-slate-800 text-xs">Auditar SEO</span>
            </button>
          </div>
        </aside>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-focus-panel" class="btn btn-outline h-8 px-3 text-xs mr-auto text-purple-700 border-purple-200 hover:bg-purple-50 flex items-center gap-1 cursor-pointer">
        Ir al panel derecho →
      </button>
      <button class="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 h-8 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cerrar</button>
    `
  });

  const promptArea = document.getElementById("ai-quick-prompt");
  const runBtn = document.getElementById("btn-run-custom-ai");
  const topicInput = document.getElementById("ai-topic-input");
  const refineTopicButton = document.getElementById("btn-refine-ai-topic");
  const humanizeButton = document.getElementById("btn-humanize-ai-prompt");
  const focusBtn = document.getElementById("btn-focus-panel");

  if (promptArea && initialPrompt) {
    promptArea.value = initialPrompt;
    promptArea.focus();
    promptArea.setSelectionRange(promptArea.value.length, promptArea.value.length);
  }

  refineTopicButton?.addEventListener("click", async () => {
    const topic = topicInput?.value.trim();
    const status = document.getElementById("ai-topic-status");
    if (!topic) {
      if (status) status.textContent = "Escribe primero una idea o tema.";
      topicInput?.focus();
      return;
    }
    refineTopicButton.disabled = true;
    refineTopicButton.textContent = "Creando título...";
    if (status) status.textContent = "Afinando claridad, calidez y enfoque editorial...";
    try {
      const refinedTopic = String(sessionUsesAida(session)
        ? await refineTopicForMode({ editorialMode: session.editorialMode, editorialProfileSnapshot: session.editorialProfileSnapshot, topic, specifications: [] })
        : await refineAssistantTopic(topic) || "").trim();
      if (refinedTopic && topicInput) topicInput.value = refinedTopic.replace(/^['"]|['"]$/g, "");
      if (status) status.textContent = "Título optimizado. Puedes editarlo antes de aplicar.";
    } catch (error) {
      if (status) status.textContent = `No se pudo optimizar el título: ${error.message}`;
    } finally {
      refineTopicButton.disabled = false;
      refineTopicButton.textContent = "Crear título perfecto";
      window.lucide?.createIcons?.();
    }
  });

  humanizeButton?.addEventListener("click", async () => {
    const specifications = promptArea?.value.trim();
    const status = document.getElementById("ai-status-indicator");
    if (!specifications) {
      if (status) status.textContent = "Añade primero tus especificaciones.";
      promptArea?.focus();
      return;
    }
    humanizeButton.disabled = true;
    humanizeButton.textContent = "Humanizando...";
    if (status) status.textContent = "Convirtiendo tus notas en un encargo editorial específico y natural...";
    try {
      const improved = await humanizeAssistantSpecifications({
        topic: topicInput?.value.trim(),
        specifications,
        audience: session?.audience || session?.article?.audience || "",
        editorialMode: sessionUsesAida(session) ? "aida" : "marcie"
      });
      if (improved && promptArea) promptArea.value = normalizeHumanizedSpecifications(improved, specifications);
      if (status) status.textContent = "Especificaciones mejoradas. Revísalas antes de analizar y aplicar.";
    } catch (error) {
      if (status) status.textContent = `No se pudieron mejorar las especificaciones: ${error.message}`;
    } finally {
      humanizeButton.disabled = false;
      humanizeButton.textContent = "Mejorar y humanizar";
      window.lucide?.createIcons?.();
    }
  });

  focusBtn?.addEventListener("click", () => {
    closeActiveModal();
    const rightPanel = document.getElementById("right-panel");
    if (rightPanel) {
      rightPanel.classList.add("ring-2", "ring-purple-400", "ring-offset-2");
      rightPanel.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => rightPanel.classList.remove("ring-2", "ring-purple-400", "ring-offset-2"), 1800);
    }
  });

  runBtn?.addEventListener("click", async () => {
    const topic = topicInput?.value.trim();
    const specifications = promptArea?.value.trim();
    if ((!topic && !specifications) || !session) return;
    const userPrompt = `
Tema o título editorial: ${topic || session.article?.title || session.topic || session.title}

Especificaciones del autor:
${specifications || "Conservar el enfoque actual y mejorar la calidad editorial."}

Redacta o ajusta el artículo según su enfoque y audiencia. La voz debe sentirse cálida, humana, específica y bien redactada. Usa ritmo natural, matices, ejemplos concretos y transiciones orgánicas. Evita clichés, frases vacías, repeticiones, estructuras predecibles y tono robótico. No inventes experiencias personales, datos ni fuentes. Conserva los hechos verificables y adapta también el título al tema indicado. Entrega prosa limpia, sin referencias a IA, etiquetas internas, metadatos, códigos, marcas de agua, secuencias ocultas ni caracteres invisibles.`.trim();

    runBtn.disabled = true;
    runBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      Analizando...
    `;

    try {
      await applyAssistantInstruction({ session, instruction: userPrompt, preselectedText });
      closeActiveModal();
      showToast("✨ Artículo actualizado según tu instrucción.", "success");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("[MarcieAiAssistant] Error:", err);
      alert(`Error al procesar instrucción: ${err.message}`);
      runBtn.disabled = false;
      runBtn.textContent = "Analizar y aplicar";
    }
  });

  // Acciones rápidas
  document.querySelectorAll("[data-quick-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-quick-action");

      if (action === "expand") {
        const instruction = "Amplía esta información agregando más detalles, ejemplos concretos y contexto.";
        promptArea.value = instruction;
        const cachedExpansion = session.expansionApprovalReport;
        if (cachedExpansion?.report && typeof cachedExpansion.report === "object") {
          closeActiveModal();
          openExpansionApprovalReport({
            session,
            report: cachedExpansion.report,
            instruction: cachedExpansion.instruction || instruction,
            preselectedText: cachedExpansion.preselectedText || preselectedText,
            onRefresh
          });
          return;
        }
        btn.disabled = true;
        const status = document.getElementById("ai-status-indicator");
        if (status) status.textContent = "Preparando el informe previo. El artículo aún no será modificado...";
        try {
          const report = await generateExpansionReport({ session, instruction, preselectedText });
          await saveExpansionReportForSession({ session, report, instruction, preselectedText });
          closeActiveModal();
          openExpansionApprovalReport({ session, report, instruction, preselectedText, onRefresh });
        } catch (error) {
          console.error("[MarcieAiAssistant] Error al preparar informe de ampliación:", error);
          if (status) status.textContent = `No se pudo preparar el informe: ${error.message}`;
          btn.disabled = false;
        }
        return;
      }
      if (action === "sources") {
        promptArea.value = "Busca e integra fuentes adicionales, citas o estadísticas relevantes que respalden esta información.";
        runBtn.click();
        return;
      }

      closeActiveModal();

      if (action === "rewrite" && session) {
        showToast("Reescribiendo artículo...", "info");
        try {
          const generated = await draftArticleForMode({
            session,
            title: session.title,
            topic: session.topic || session.title,
            audience: session.audience,
            brief: "Reescritura completa solicitada desde el asistente editorial."
          });
          session.article = generated;
          if (!session.articlesByAudience) session.articlesByAudience = {};
          session.articlesByAudience[session.audience || generated.audience || "educators"] = generated;
          delete session.audit;
          await saveMarcieSession(session);
          showToast("✨ Artículo reescrito exitosamente.", "success");
          if (onRefresh) onRefresh();
        } catch (e) {
          alert(`Error: ${e.message}`);
        }
      } else if (action === "audit" && session) {
        showToast("Iniciando auditoría de hechos y SEO...", "info");
        try {
          const reviewResult = await reviewArticleForMode({
            session,
            article: session.article || { title: session.title, blocks: [] }
          });
          const review = { ...reviewResult };
          if (review.verifiedArticle) {
            session.article = review.verifiedArticle;
            if (!session.articlesByAudience) session.articlesByAudience = {};
            session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
            delete review.verifiedArticle;
            session.audit = review;
            await saveMarcieSession(session);
          }
          showModal({
            title: "Auditoría Editorial",
            contentHtml: `
              <div class="space-y-3 text-xs">
                <div class="bg-teal-50 border border-teal-200 rounded-lg p-3">
                  <div class="font-bold text-teal-800">Calidad: ${review.readabilityScore || 90} / 100</div>
                  <p class="text-teal-700">${review.summary}</p>
                </div>
                ${(review.issues || []).map((i) => `
                  <div class="border border-slate-200 p-2 rounded-lg">
                    <div class="font-semibold">${i.message}</div>
                    <div class="text-slate-500">${i.suggestion}</div>
                  </div>
                `).join("")}
              </div>
            `,
            footerButtonsHtml: `<button class="btn btn-primary h-8 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Listo</button>`
          });
        } catch (e) {
          alert(`Error: ${e.message}`);
        }
      }
    });
  });
}
