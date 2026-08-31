/**
 * Controlador de los 6 pasos del Motor Editorial IA para Marcie Blog Editor
 * Conectado con la API de Gemini / Vertex AI
 */

import { saveMarcieSession } from "../services/marcie-session-store.js";
import { showModal, closeActiveModal, showToast } from "./modals.js";
import {
  sanitizeTrustedSources
} from "../services/marcie-gemini-service.js";
import {
  draftArticleForMode,
  generateProposalsForMode,
  researchTopicForMode,
  reviewArticleForMode,
  sessionUsesAida
} from "../services/marcie-mode-service.js";
import { articleVerificationBlockers } from "../contracts/editorial-contracts.js";

function normalizeSourceText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeSourceTextValue(value = "") {
  return String(value || "").trim();
}

function isSafeSourceUrl(url = "") {
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("file://")) return false;
  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function toSafeSourceUrl(url = "") {
  const normalized = String(url || "").trim();
  return isSafeSourceUrl(normalized) ? normalized : "#";
}

function getAllExportSources(article = {}) {
  const trusted = sanitizeTrustedSources(Array.isArray(article.sources) ? article.sources : []);
  const supplementary = Array.isArray(article.supplementarySources) ? article.supplementarySources : [];
  const merged = [...trusted, ...supplementary];
  const seen = new Set();
  return merged.filter((source) => {
    const key = normalizeSourceTextValue(source?.url || source?.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSourceCitationText(source = {}, format = "default") {
  if (format === "apa") {
    const citation = normalizeSourceTextValue(source?.apaCitation);
    if (citation) return citation;

    const authors = normalizeSourceTextValue(source?.authors);
    const year = normalizeSourceTextValue(source?.year);
    const title = normalizeSourceTextValue(source?.title);
    const publisher = normalizeSourceTextValue(source?.publisher);
    return `${authors || "Fuente"} (${year || "s.f."}). ${title}${publisher ? `. ${publisher}` : ""}`;
  }

  return normalizeSourceTextValue(source?.title) || "Fuente sin título";
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAuditIssues(issues = [], fixedIssueKeys = []) {
  const fixedKeySet = new Set((fixedIssueKeys || []).map((k) => String(k)));

  if (issues.length === 0) {
    return `<div class="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">No se encontraron problemas. ¡El artículo está excelente!</div>`;
  }

  const resolveSeverity = (issue) => {
    const raw = String(issue?.severity || issue?.priority || issue?.level || "medium").trim().toLowerCase();
    if (["high", "critical", "severe", "alta", "alto", "alta_prioridad", "high_impact", "highimpact"].includes(raw)) return "high";
    if (["low", "minor", "baja", "bajo", "baja_prioridad", "menor", "leve"].includes(raw)) return "low";
    return "medium";
  };

  const severityConfig = {
    high: {
      label: "Alta",
      chip: "bg-red-50 text-red-700 border-red-200",
      border: "border-red-200/80 bg-red-50/50",
      summary: "text-red-900"
    },
    medium: {
      label: "Media",
      chip: "bg-amber-50 text-amber-700 border-amber-200",
      border: "border-amber-200/80 bg-amber-50/50",
      summary: "text-amber-900"
    },
    low: {
      label: "Baja",
      chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
      border: "border-emerald-200/80 bg-emerald-50/50",
      summary: "text-emerald-900"
    }
  };

  const getIssueKey = (issue, index) => {
    return String(
      issue?.id ||
      issue?.issueId ||
      issue?.key ||
      issue?.type ||
      issue?.message ||
      issue?.title ||
      issue?.finding ||
      issue?.suggestion ||
      `hallazgo-${index}`
    );
  };

  return issues.map((issue, index) => {
    const severity = resolveSeverity(issue);
    const config = severityConfig[severity];
    const title = escapeHtml(issue?.message || issue?.title || issue?.finding || "Hallazgo editorial");
    const recommendation = escapeHtml(issue?.suggestion || issue?.description || issue?.recommendation || issue?.detail || "Agregar una mejora sugerida para esta alerta.");
    const issueKey = getIssueKey(issue, index);
    const isFixed = fixedKeySet.has(issueKey);
    const checkmarkIcon = `
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12 4 4L19 7"></path>
      </svg>
    `;
    const actionClasses = isFixed
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-slate-900 hover:bg-slate-800";
    const actionLabel = isFixed ? "Corregido" : "Corregir";
    const actionIcon = isFixed ? checkmarkIcon : `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12 5 5L20 7"></path></svg>`;
    const actionState = isFixed ? "fixed" : "idle";
    return `
      <div class="rounded-xl border bg-white p-3 shadow-sm ${config.border}">
        <div class="flex items-start justify-between gap-2">
          <span class="font-semibold text-[12px] leading-tight text-slate-900">${title}</span>
          <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.chip}">
            ${config.label}
          </span>
        </div>
        <p class="text-[11px] ${config.summary} leading-relaxed mt-2 border-t border-black/5 pt-2">💡 ${recommendation}</p>
        <div class="pt-2.5 border-t border-slate-200/75">
          <button
            type="button"
            data-fix-audit-issue="${index}"
            data-fix-audit-key="${escapeHtml(issueKey)}"
            data-fix-status="${actionState}"
            ${isFixed ? "disabled" : ""}
            class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white px-2.5 py-1.5 rounded-md transition-colors ${actionClasses}"
          >
            ${actionIcon}
            ${actionLabel}
          </button>
        </div>
      </div>`;
  }).join("");
}

export function initPipelineStepper({
  getSession,
  onUpdateSession,
  onArticleGenerationState
}) {
  // Paso 1: Buscar tendencias
  bindStep(1, () => handleSearchTrendsStep({ getSession, onUpdateSession }));

  // Paso 2: Analizar
  bindStep(2, () => handleAnalyzeStep({ getSession, onUpdateSession }));

  // Paso 3: Crear propuesta (3 enfoques por audiencia)
  bindStep(3, () => handleProposalsStep({
    getSession,
    onUpdateSession,
    onArticleGenerationState
  }));

  // Paso 4: Reescribir / Revisar
  bindStep(4, () => handleReviewStep({ getSession, onUpdateSession }));

  // Paso 5: Exportar
  bindStep(5, () => handleExportStep({ getSession }));
}

function bindStep(stepNumber, handler) {
  // Usar data-step-id para encontrar el step correcto (selector robusto)
  const stepEl = document.querySelector(`[data-step-id="${stepNumber}"]`);
  if (stepEl) {
    const card = stepEl.querySelector(".flex-1");
    if (card) {
      card.style.cursor = "pointer";
      card.addEventListener("click", handler);
    }
  }
}

export async function runTrendSearchForSession({
  session,
  topic,
  country = "MX",
  period = "6m"
}) {
  const q = String(topic || "").trim();
  if (!session) throw new Error("No hay una sesión activa.");
  if (!q) throw new Error("Escribe un tema para iniciar la búsqueda.");

  const previousResearch = session.trends?.[0] || null;
  const result = await researchTopicForMode({ session, topic: q, country, region: country, period });
  const previousSourceCount = Number(previousResearch?.verifiedSourceCount || previousResearch?.sources?.length || 0);
  const nextSourceCount = Number(result?.verifiedSourceCount || result?.sources?.length || 0);
  const previousWasVerified = previousResearch?.verificationStatus === "verified";
  const nextIsVerified = result?.verificationStatus === "verified";

  if (previousSourceCount > 0 && nextSourceCount === 0) {
    throw new Error("La nueva revisión no recuperó fuentes verificadas. Se conservó la investigación anterior.");
  }
  if (previousWasVerified && !nextIsVerified) {
    const reason = Array.isArray(result?.blockers) && result.blockers.length
      ? ` ${result.blockers.join(" ")}`
      : "";
    throw new Error(`La nueva revisión quedó incompleta. Se conservó la investigación verificada anterior.${reason}`);
  }

  session.topic = q;
  session.title = sessionUsesAida(session) ? `Investigación Aida: ${q}` : `Tendencia: ${q}`;
  session.status = "researching";
  session.researchRegion = country;
  session.researchPeriod = period;
  session.trends = [result];
  if (!session.article) {
    session.article = { schemaVersion: "1.0", blocks: [], sources: [], editorialMode: session.editorialMode || "marcie" };
  }
  session.article.title = sessionUsesAida(session) ? q : `Radar de Tendencias: ${q}`;
  session.article.editorialMode = session.editorialMode || "marcie";
  if (!session.article.blocks?.length && sessionUsesAida(session)) session.article.modeCompatibility = "empty";
  session.article.subtitle = result.summary || `Señales y análisis educativo para ${q}`;
  if (Array.isArray(result.sources)) {
    session.article.sources = result.sources;
    session.article.researchSources = result.sources;
  }
  if (sessionUsesAida(session)) {
    session.article.researchDossier = {
      summary: result.summary || "",
      facts: result.facts || [],
      currentSignals: result.currentSignals || [],
      historicalMilestones: result.historicalMilestones || [],
      researchPeriod: result.researchPeriod || period,
      dateWindow: result.dateWindow || null,
      currentSourceCount: result.currentSourceCount || 0,
      historicalSourceCount: result.historicalSourceCount || 0,
      verifiedSourceCount: result.verifiedSourceCount || result.sources?.length || 0,
      institutionCount: result.institutionCount || 0,
      researchedAt: result.researchedAt || new Date().toISOString()
    };
  }
  session.log = [
    ...(Array.isArray(session.log) ? session.log : []),
    {
      id: `log-${Date.now()}`,
      at: new Date().toISOString(),
      message: sessionUsesAida(session) ? "Investigación integral Aida completada" : "Investigación editorial Marcie completada",
      modeUsed: result.modeUsed || session.editorialMode || "marcie",
      serviceVersion: result.serviceVersion || "",
      verifiedSourceCount: Number(result.verifiedSourceCount || result.sources?.length || 0)
    }
  ].slice(-100);

  await saveMarcieSession(session);
  return result;
}

// 1. Buscar tendencias con Gemini
function handleSearchTrendsStep({ getSession, onUpdateSession }) {
  const session = getSession();
  if (!session) return;
  const aidaMode = sessionUsesAida(session);

  showModal({
    title: aidaMode ? "1. Investigación integral Aida" : "1. Descubrimiento y búsqueda de señales",
    widthClass: "max-w-2xl",
    contentHtml: `
      <div class="flex flex-col gap-4">
        <p class="text-xs text-slate-500 leading-relaxed">${aidaMode ? "Investiga el tema completo en 8–12 páginas concretas y cuatro instituciones. Añade hechos científicos y evolución histórica solo cuando sean pertinentes y tengan respaldo." : "Ingresa un tema educativo para buscar señales, estadísticas y fuentes recientes con Gemini."}</p>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1.5">Tema o Consulta de Búsqueda</label>
            <input type="text" id="step-search-query" class="input-field w-full font-medium" value="${session.topic || session.title || 'IA como tutor personalizado'}" placeholder="Ej. alfabetización digital, evaluación formativa..." />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-slate-700 mb-1.5">Región de Análisis</label>
              <select id="step-search-country" class="input-field w-full h-9 text-xs">
                <option value="MX">México (Español)</option>
                <option value="LATAM">Latinoamérica</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1.5">Periodo</label>
              <select id="step-search-period" class="input-field w-full h-9 text-xs">
                <option value="today">Hoy (Últimas 24 horas)</option>
                <option value="1w">Esta semana (Últimos 7 días)</option>
                <option value="1m">Último mes</option>
                <option value="2m">Últimos 2 meses</option>
                <option value="3m">Últimos 3 meses</option>
                <option value="6m" selected>Últimos 6 meses</option>
                <option value="1y">Último año</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-cancel-search" class="btn btn-outline h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cancelar</button>
      <button id="btn-run-trend-search" class="btn btn-primary h-9 px-4 text-xs flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        ${aidaMode ? "Investigar con Aida" : "Buscar con Gemini"}
      </button>
    `
  });

  const queryInput = document.getElementById("step-search-query");
  const countrySelect = document.getElementById("step-search-country");
  const periodSelect = document.getElementById("step-search-period");
  const runBtn = document.getElementById("btn-run-trend-search");
  const cancelBtn = document.getElementById("btn-cancel-search");

  cancelBtn?.addEventListener("click", closeActiveModal);

  runBtn?.addEventListener("click", async () => {
    const q = queryInput.value.trim();
    if (!q) return;

    runBtn.disabled = true;
    runBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      ${aidaMode ? "Comprobando fuentes del tema..." : "Analizando con Gemini..."}
    `;

    try {
      await runTrendSearchForSession({
        session,
        topic: q,
        country: countrySelect?.value || "MX",
        period: periodSelect?.value || "6m"
      });
      closeActiveModal();
      showToast(aidaMode ? "✨ Investigación Aida completada." : "✨ Señales y fuentes descubiertas exitosamente con Gemini.", "success");
      if (onUpdateSession) onUpdateSession();
    } catch (error) {
      console.error("[MarciePipeline] Error en búsqueda de tendencias:", error);
      alert(`Error al conectar con Gemini: ${error.message}`);
      runBtn.disabled = false;
      runBtn.textContent = aidaMode ? "Investigar con Aida" : "Buscar con Gemini";
    }
  });
}

// 2. Analizar fuentes y tendencias
function handleAnalyzeStep({ getSession, onUpdateSession }) {
  const session = getSession();
  if (!session) return;
  const aidaMode = sessionUsesAida(session);

  const trend = session.trends?.[0] || {
    trendScore: null, growth: null, freshness: null, sourceDiversity: "Sin analizar",
    summary: "Ejecuta una búsqueda para obtener señales respaldadas por páginas concretas.", signals: []
  };

  showModal({
    title: aidaMode ? "2. Evidencia y contexto Aida" : "2. Análisis de tendencias y señales",
    widthClass: "max-w-2xl",
    contentHtml: `
      <div class="flex flex-col gap-4">
        <p class="text-xs text-slate-500 leading-relaxed">${aidaMode ? "Contexto y hechos pertinentes al tema, con ciencia e historia cuando aportan y están respaldadas." : "Resultados del análisis algorítmico y cualitativo extraído de las fuentes más relevantes."}</p>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row gap-5 items-start">
          <div class="flex flex-col gap-2 shrink-0 border-r border-slate-200 pr-5">
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${aidaMode ? "Fuentes verificadas" : "TrendScore Compuesto"}</div>
            <div class="text-2xl font-black text-teal-600 leading-none">${aidaMode ? trend.currentSourceCount ?? trend.verifiedSourceCount ?? trend.sources?.length ?? 0 : trend.trendScore == null ? "N/D" : trend.trendScore}</div>
            <div class="text-xs text-slate-500 font-medium">${aidaMode ? `${trend.institutionCount || 0} instituciones` : "/ 100 ptos"}</div>
          </div>

          <div class="flex flex-col gap-3 flex-1">
            <p class="text-sm font-medium text-slate-800 leading-relaxed">${trend.summary || "Señal respaldada por fuentes académicas y educativas con alto potencial de impacto."}</p>
            <div class="flex flex-wrap gap-2 mt-1">
              ${aidaMode
                ? `<span class="badge badge-secondary text-[10px]">Estado: <span class="font-bold ml-1 text-emerald-700">${trend.verificationStatus === "verified" ? "Comprobado" : "Bloqueado"}</span></span><span class="badge badge-secondary text-[10px]">Cronología: <span class="font-bold ml-1 text-amber-700">${trend.historicalMilestones?.length || 0} hitos</span></span>`
                : `<span class="badge badge-secondary text-[10px]"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>Crecimiento: <span class="font-bold ml-1 text-purple-700">${trend.growth || "No medido"}</span></span><span class="badge badge-secondary text-[10px]"><span class="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>Frescura: <span class="font-bold ml-1 text-blue-700">${trend.freshness || "No medida"}</span></span><span class="badge badge-secondary text-[10px]"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>Diversidad: <span class="font-bold ml-1 text-amber-700">${trend.sourceDiversity || "Alta"}</span></span>`}
            </div>
          </div>
        </div>

        ${Array.isArray(trend.signals) && trend.signals.length ? `
          <div class="mt-2">
            <h4 class="text-sm font-bold text-slate-800 mb-2">Señales detectadas</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[35vh] overflow-y-auto p-1 -m-1">
              ${trend.signals.map((s) => `
                <div class="bg-white border border-slate-200 rounded-lg p-2.5 flex gap-2.5 items-start shadow-xs h-full">
                  <svg class="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="m13 2.5-4 8.5h5l-2 10.5 4-8.5h-5z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                  <span class="text-xs text-slate-600 font-medium leading-snug">${s}</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `,
    footerButtonsHtml: `
      <button class="btn btn-primary h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Continuar a Propuestas</button>
    `
  });
}

// 3. Crear 3 Propuestas editoriales por audiencia con Gemini
function handleProposalsStep({ getSession, onUpdateSession, onArticleGenerationState }) {
  const session = getSession();
  if (!session) return;

  const currentTopic = session.topic || session.title || "Innovación Pedagógica";
  const requiredProposalCount = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length ? session.selectedAudiences.length : 3;
  const existingProposals = Array.isArray(session.proposals) && session.proposals.length >= requiredProposalCount ? session.proposals : null;
  const articlesByAud = session.articlesByAudience || {};

  const renderProposalsHtml = (props) => {
    return props.map((p) => {
      const art = articlesByAud[p.audience];
      const hasArticle = art && Array.isArray(art.blocks) && art.blocks.length > 0;
      const hasSupplementarySources = Array.isArray(art?.supplementarySources) && art.supplementarySources.length > 0;
      const canToggleSourceStyle = Boolean(art && (hasArticle || hasSupplementarySources || Array.isArray(art?.sources)));
      const audBadgeClass = p.audience === "educators"
        ? "badge-success"
        : p.audience === "students"
        ? "badge-secondary"
        : "badge-warning";

      return `
        <div data-proposal-card="${p.audience}" class="border border-slate-200 bg-white rounded-lg p-4 cursor-pointer hover:border-teal-500 hover:shadow-md transition-all flex flex-col gap-3 h-full">
          <div class="flex items-center justify-between gap-2">
            <span class="badge ${audBadgeClass} text-[10px] font-semibold px-2 py-0.5">${p.audienceLabel || p.audience}</span>
            ${hasArticle ? '<span class="badge badge-success text-[10px] px-2 py-0.5"><span class="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block"></span>Redactado</span>' : '<span class="badge badge-warning text-[10px] px-2 py-0.5"><span class="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5 inline-block"></span>Sin redactar</span>'}
          </div>
          <h4 class="font-bold text-slate-900 text-sm leading-snug">${escapeHtml(p.title)}</h4>
          <div class="flex-1">
            <p id="brief-${p.audience}" class="text-xs text-slate-600 leading-relaxed line-clamp-3 transition-all duration-300">${escapeHtml(p.brief)}</p>
            ${p.brief && p.brief.length > 120 ? `
              <button type="button" class="text-[10px] text-teal-600 font-semibold hover:underline mt-1 cursor-pointer focus:outline-none" onclick="event.stopPropagation(); const p = document.getElementById('brief-${p.audience}'); if(p.classList.contains('line-clamp-3')){ p.classList.remove('line-clamp-3'); this.innerText='Ver menos'; } else { p.classList.add('line-clamp-3'); this.innerText='Ver más'; }">Ver más</button>
            ` : ''}
          </div>
          <div class="pt-3 mt-auto border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            ${hasArticle ? `
              <button type="button" data-regen-audience="${p.audience}" class="text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2.5 py-1.5 rounded border border-purple-200 flex items-center gap-1.5 font-medium transition-all cursor-pointer" title="Regenerar sólo este artículo con Gemini">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Re-hacer
              </button>
            ` : '<div></div>'}
            <button type="button" data-complement-sources="${p.audience}" class="text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-200 flex items-center gap-1.5 font-medium transition-all cursor-pointer" title="Agregar bibliografía complementaria">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v18M3 12h18"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h10a5 5 0 110 10H7z"/></path></svg>
              ${hasSupplementarySources ? "Actualizar bibliografía" : "Complementar fuentes"}
            </button>
            <button type="button" data-toggle-source-format="${p.audience}" class="text-xs ${canToggleSourceStyle ? "text-purple-700 hover:text-purple-800 hover:bg-purple-50" : "text-slate-400"} border ${canToggleSourceStyle ? "border-purple-200 cursor-pointer" : "border-slate-200 cursor-not-allowed opacity-60"} px-2.5 py-1.5 rounded font-medium transition-all flex items-center gap-1.5" ${canToggleSourceStyle ? "" : "disabled"}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 21V7a2 2 0 0 1 2-2h3.6a2.6 2.6 0 0 1 2.6 2.6V9h4a2.6 2.6 0 0 1 2.6 2.6V21M2 21h20" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="M12 21V3" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>
              ${art?.sourceCitationStyle === "apa" ? "Formato estándar" : "Formato APA"}
            </button>
            <span class="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 bg-teal-50 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer">
              ${hasArticle ? 'Abrir' : 'Redactar ahora'}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </span>
          </div>
        </div>
      `;
    }).join("");
  };

  const aidaMode = sessionUsesAida(session);
  const allDefaultProposals = [
    {
      audience: "educators",
      audienceLabel: "Docentes y directivos",
      title: aidaMode ? `${currentTopic}: la escena cotidiana que la ciencia puede explicar` : `¿Cómo transformar el aula con ${currentTopic} sin sobrecargar al docente?`,
      brief: aidaMode ? "Propuesta Aida pendiente de generar: escena docente, idea central, analogía dominante y evidencia pertinente." : "Estrategias metodológicas para liderar el cambio pedagógico con empatía y resultados tangibles."
    },
    {
      audience: "students",
      audienceLabel: "Estudiantes",
      title: aidaMode ? `${currentTopic}: lo que ocurre mientras intentas aprender` : `Domina ${currentTopic}: estrategias para aprender más rápido y a tu ritmo`,
      brief: aidaMode ? "Propuesta Aida pendiente de generar: escena estudiantil y explicación científica accesible." : "Cómo resolver dudas complejas, vencer la procrastinación y adueñarte de tu propio aprendizaje."
    },
    {
      audience: "parents",
      audienceLabel: "Padres y tutores",
      title: aidaMode ? `${currentTopic}: lo que una familia observa y la ciencia ayuda a comprender` : `Acompañar a tus hijos en ${currentTopic}: guía sin estrés para la familia`,
      brief: aidaMode ? "Propuesta Aida pendiente de generar: escena familiar, evolución respaldada y transformación observable." : "Pautas claras para orientar y motivar en casa con afecto, comprensión y límites equilibrados."
    },
    {
      audience: "coordinators",
      audienceLabel: "Coordinadores académicos",
      title: aidaMode ? `${currentTopic}: de la evidencia a una decisión académica` : `${currentTopic}: una oportunidad para la coordinación académica`,
      brief: aidaMode ? "Propuesta Aida pendiente de generar: problema institucional, evidencia y cambio observable." : "Enfoque institucional para convertir el tema en decisiones pedagógicas concretas."
    }
  ];
  const requestedAudiences = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length ? session.selectedAudiences : ["educators", "students", "parents"];
  const defaultInitialProposals = allDefaultProposals.filter((proposal) => requestedAudiences.includes(proposal.audience));

  const initialCardsHtml = renderProposalsHtml(existingProposals || defaultInitialProposals);

  showModal({
    title: aidaMode ? "3. Propuestas editoriales Aida" : "3. Generación de enfoques editoriales",
    widthClass: "max-w-4xl",
    contentHtml: `
      <div class="flex flex-col gap-3">
        <p class="text-xs text-slate-500">Selecciona un enfoque para abrir su artículo o generar uno nuevo para esa audiencia:</p>

        <div id="proposals-loading" class="hidden py-6 text-center text-xs text-slate-500">
          <svg class="animate-spin mx-auto h-6 w-6 text-teal-600 mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          Diseñando propuestas personalizadas con Gemini...
        </div>

        <div id="proposals-cards" class="grid grid-cols-3 gap-4">
          ${initialCardsHtml}
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-regenerate-proposals" class="btn btn-outline h-9 px-4 text-xs flex items-center gap-1 cursor-pointer">
        <svg class="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        Regenerar propuestas y artículos
      </button>
      <button class="btn btn-outline h-9 px-4 text-xs cursor-pointer" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cerrar</button>
    `
  });

  const cardsContainer = document.getElementById("proposals-cards");
  const loadingContainer = document.getElementById("proposals-loading");
  const regenBtn = document.getElementById("btn-regenerate-proposals");

  async function generateAndOpenArticleForAudience(aud, selectedTitle, selectedBrief, isRegen = false) {
    const audLabel = aud === "educators" ? "Docentes y directivos" : aud === "students" ? "Estudiantes" : aud === "coordinators" ? "Coordinadores académicos" : "Padres y tutores";
    session.audience = aud;
    session.title = selectedTitle;
    if (!session.articlesByAudience) session.articlesByAudience = {};
    session.status = "drafting";

    const setGeneratingState = (isGenerating) => {
      const payload = { isGenerating: Boolean(isGenerating), audience: aud, session };
      if (onArticleGenerationState) {
        onArticleGenerationState(payload);
      }
      if (typeof window !== "undefined" && typeof window.__marcieSetArticleGenerationState === "function") {
        window.__marcieSetArticleGenerationState(payload);
      }
      if (typeof window !== "undefined") {
        if (Boolean(isGenerating) && typeof window.__marcieShowArticleGenerationSpinner === "function") {
          window.__marcieShowArticleGenerationSpinner(session);
        }

        if (!Boolean(isGenerating) && typeof window.__marcieHideArticleGenerationSpinner === "function") {
          window.__marcieHideArticleGenerationSpinner();
        }
      }
    };

    setGeneratingState(true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    closeActiveModal();

    // Actualizar inmediatamente título e icono en la barra lateral
    if (onUpdateSession) onUpdateSession();

    try {
      const generated = await draftArticleForMode({
        session,
        title: selectedTitle,
        topic: session.topic || selectedTitle,
        audience: aud,
        brief: selectedBrief
      });

      const existingArticle = session.articlesByAudience?.[aud];
      const mergedArticle = {
        ...generated,
        sources: generated.sources || existingArticle?.sources || session.trends?.[0]?.sources || [],
        supplementarySources: Array.isArray(existingArticle?.supplementarySources)
          ? existingArticle.supplementarySources
          : (Array.isArray(generated.supplementarySources) ? generated.supplementarySources : existingArticle?.supplementarySources || [])
      };

      if (!mergedArticle.sourceCitationStyle && existingArticle?.sourceCitationStyle) {
        mergedArticle.sourceCitationStyle = existingArticle.sourceCitationStyle;
      }

      session.articlesByAudience[aud] = mergedArticle;
      session.article = mergedArticle;
      delete session.audit; // Invalidar caché de auditoría anterior
      if (mergedArticle.title) session.title = mergedArticle.title;
      session.status = "review_required";

      await saveMarcieSession(session);
      if (onUpdateSession) onUpdateSession();
      showToast(`✨ Artículo ${isRegen ? 'regenerado' : 'redactado'} con éxito para ${audLabel}.`, "success");
    } catch (e) {
      console.error("[MarciePipeline] Error redactando artículo de propuesta:", e);
      session.status = "proposal_ready";
      await saveMarcieSession(session);
      if (onUpdateSession) onUpdateSession();
      showToast(`No se pudo redactar el artículo para ${audLabel}: ${e.message}`, "error");
    } finally {
      setGeneratingState(false);
    }
  }

  function bindCards() {
    // 1. Clic en botón regenerar individual de cada tarjeta
    document.querySelectorAll("[data-regen-audience]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const aud = btn.getAttribute("data-regen-audience");
        const card = btn.closest("[data-proposal-card]");
        const titleEl = card?.querySelector("h4");
        const briefEl = card?.querySelector("p");
        const selectedTitle = titleEl ? titleEl.innerText.trim() : session.title;
        const selectedBrief = briefEl ? briefEl.innerText.trim() : "";

        await generateAndOpenArticleForAudience(aud, selectedTitle, selectedBrief, true);
      });
    });

    // 2. Clic en la tarjeta (Abrir si ya existe, redactar si no existe)
    document.querySelectorAll("[data-proposal-card]").forEach((card) => {
      card.addEventListener("click", async (e) => {
        // Ignorar si se hizo clic en el botón de regeneración
        if (e.target.closest("[data-regen-audience]")) return;

        const aud = card.getAttribute("data-proposal-card");
        const titleEl = card.querySelector("h4");
        const briefEl = card.querySelector("p");
        const selectedTitle = titleEl ? titleEl.innerText.trim() : session.title;
        const selectedBrief = briefEl ? briefEl.innerText.trim() : "";

        session.audience = aud;
        if (!session.articlesByAudience) session.articlesByAudience = {};

        const audLabel = aud === "educators" ? "Docentes y directivos" : aud === "students" ? "Estudiantes" : aud === "coordinators" ? "Coordinadores académicos" : "Padres y tutores";
        const existingArticle = session.articlesByAudience[aud];
        const hasExisting = existingArticle && Array.isArray(existingArticle.blocks) && existingArticle.blocks.length > 0;

        // Si ya existe el artículo redactado para esta audiencia, ABRIRLO DE INMEDIATO sin llamar a Gemini
        if (hasExisting) {
          session.article = existingArticle;
          if (existingArticle.title) session.title = existingArticle.title;
          session.status = "review_required";
          await saveMarcieSession(session);
          closeActiveModal();
          showToast(`✨ Artículo abierto para: ${audLabel}`, "success");
          if (onUpdateSession) onUpdateSession();
        } else {
          // Si no existe, redactarlo por primera vez con Gemini
          await generateAndOpenArticleForAudience(aud, selectedTitle, selectedBrief, false);
        }
      });
    });
  }

  bindCards();

  const bindComplementarySources = () => {
    document.querySelectorAll("[data-complement-sources]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const aud = btn.getAttribute("data-complement-sources");
        const card = btn.closest("[data-proposal-card]");
        const titleEl = card?.querySelector("h4");
        const briefEl = card?.querySelector("p");
        const selectedTitle = titleEl ? titleEl.innerText.trim() : session.title;
        const selectedBrief = briefEl ? briefEl.innerText.trim() : "";
        if (!session.articlesByAudience) session.articlesByAudience = {};

        const existingArticle = session.articlesByAudience[aud];
        btn.disabled = true;
        btn.textContent = "Buscando páginas concretas…";
        const dossier = await researchTopicForMode({
          session,
          topic: `${selectedTitle}. ${selectedBrief}`,
          audience: aud,
          region: session.researchRegion || "MX",
          period: session.researchPeriod || "6m"
        });

        const article = existingArticle || {
          schemaVersion: "1.0",
          title: selectedTitle,
          subtitle: selectedBrief || "Artículo educativo con enfoque editorial",
          excerpt: selectedBrief || "Artículo educativo con enfoque editorial.",
          audience: aud,
          category: "Educación",
          readingTimeMinutes: 6,
          tags: ["Educación"],
          blocks: [],
          sources: Array.isArray(session.trends?.[0]?.sources) ? session.trends[0].sources : []
        };
        if (!article.sourceCitationStyle) {
          article.sourceCitationStyle = "apa";
        }
        article.sources = sanitizeTrustedSources(dossier.sources || []);
        article.researchSources = article.sources;
        article.supplementarySources = [];

        session.articlesByAudience[aud] = article;
        session.article = article;
        session.audience = aud;
        if (Array.isArray(article.blocks) && article.blocks.length > 0) {
          session.status = "review_required";
        } else {
          session.status = "proposal_ready";
        }
        await saveMarcieSession(session);
        btn.disabled = false;
        if (onUpdateSession) onUpdateSession();
        cardsContainer.innerHTML = renderProposalsHtml(session.proposals || defaultInitialProposals);
        bindCards();
        bindComplementarySources();
        showToast("Fuentes complementarias actualizadas en formato APA.", "success");
      });
    });
  };

  const bindSourceFormatControls = () => {
    document.querySelectorAll("[data-toggle-source-format]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const aud = btn.getAttribute("data-toggle-source-format");
        if (!session.articlesByAudience) session.articlesByAudience = {};
        const article = session.articlesByAudience[aud];

        if (!article) {
          showToast("Redacta o complementa el artículo antes de cambiar el formato de fuentes.", "info");
          return;
        }

        const nextSourceStyle = article.sourceCitationStyle === "apa" ? "default" : "apa";
        article.sourceCitationStyle = nextSourceStyle;
        session.article = article;
        session.audience = aud;
        await saveMarcieSession(session);
        if (onUpdateSession) onUpdateSession();

        cardsContainer.innerHTML = renderProposalsHtml(session.proposals || defaultInitialProposals);
        bindCards();
        bindComplementarySources();
        bindSourceFormatControls();
        showToast(`Formato de fuentes cambiado a ${nextSourceStyle === "apa" ? "APA" : "estándar"} para ${aud}.`, "success");
      });
    });
  };

  bindComplementarySources();
  bindSourceFormatControls();

  regenBtn?.addEventListener("click", async () => {
    if (!cardsContainer || !loadingContainer) return;
    cardsContainer.classList.add("hidden");
    loadingContainer.classList.remove("hidden");
    loadingContainer.textContent = "Regenerando los enfoques editoriales...";
    regenBtn.disabled = true;

    try {
      const resp = await generateProposalsForMode({
        session,
        topic: session.topic || session.title,
        signals: session.trends?.[0]?.signals || []
      });

      const requiredCount = session.selectedAudiences?.length || 3;
      const proposals = Array.isArray(resp?.proposals) ? resp.proposals.slice(0, requiredCount) : [];
      if (proposals.length < requiredCount) {
        throw new Error("Gemini no devolvió un enfoque para cada público seleccionado.");
      }

      const previousArticles = session.articlesByAudience || {};
      const regeneratedArticles = {};
      for (let index = 0; index < proposals.length; index += 1) {
        const proposal = proposals[index];
        const audience = proposal.audience || ["educators", "students", "parents"][index];
        const audienceLabel = proposal.audienceLabel || (audience === "students" ? "Estudiantes" : audience === "parents" ? "Padres y tutores" : audience === "coordinators" ? "Coordinadores académicos" : "Docentes y directivos");
        loadingContainer.textContent = `Redactando artículo ${index + 1} de ${requiredCount}: ${audienceLabel}...`;

        const generated = await draftArticleForMode({
          session,
          title: proposal.title || session.topic || session.title,
          topic: session.topic || proposal.title || session.title,
          audience,
          brief: proposal.brief || proposal.angle || ""
        });
        const previousArticle = previousArticles[audience] || {};
        const nextArticle = {
          ...generated,
          sources: generated.sources || previousArticle.sources || session.trends?.[0]?.sources || [],
          supplementarySources: Array.isArray(previousArticle.supplementarySources)
            ? previousArticle.supplementarySources
            : (Array.isArray(generated.supplementarySources) ? generated.supplementarySources : [])
        };
        ["featuredImage", "templateId", "appearance", "sourceCitationStyle"].forEach((field) => {
          if (previousArticle[field] !== undefined) nextArticle[field] = previousArticle[field];
          if (nextArticle[field] === undefined) delete nextArticle[field];
        });
        regeneratedArticles[audience] = nextArticle;
      }

      const activeAudience = regeneratedArticles[session.audience]
        ? session.audience
        : (proposals[0]?.audience || "educators");
      Object.entries(regeneratedArticles).forEach(([audience, article]) => {
        articlesByAud[audience] = article;
      });
      session.proposals = proposals;
      session.articlesByAudience = articlesByAud;
      session.audience = activeAudience;
      session.article = regeneratedArticles[activeAudience];
      session.title = session.article?.title || proposals.find((proposal) => proposal.audience === activeAudience)?.title || session.title;
      session.status = "review_required";
      delete session.audit;
      delete session.auditsByAudience;
      await saveMarcieSession(session);
      if (onUpdateSession) onUpdateSession();

      cardsContainer.innerHTML = renderProposalsHtml(proposals);
      bindCards();
      bindComplementarySources();
      bindSourceFormatControls();

      cardsContainer.classList.remove("hidden");
      loadingContainer.classList.add("hidden");
      regenBtn.disabled = false;
      showToast(`✨ ${requiredCount} enfoques y artículos fueron regenerados.`, "success");
    } catch (err) {
      console.error("[MarciePipeline] Error regenerando propuestas:", err);
      alert(`Error al regenerar propuestas y artículos: ${err.message}`);
      cardsContainer.classList.remove("hidden");
      loadingContainer.classList.add("hidden");
      regenBtn.disabled = false;
    }
  });
}

// 4. Auditoría y revisión editorial
function handleReviewStep({ getSession, onUpdateSession }) {
  const session = getSession();
  if (!session) return;
  const aidaMode = sessionUsesAida(session);

  const hasExistingAudit = !!session.audit;
  const getAudienceLabel = (aud = "educators") =>
    aud === "students" ? "Estudiantes" : aud === "parents" ? "Padres y tutores" : aud === "coordinators" ? "Coordinadores académicos" : "Docentes y directivos";
  const getAudienceFromSession = () => (session.article?.audience || session.audience || "educators");
  const resolvedIssueKeys = new Set(Array.isArray(session.audit?.resolvedIssueKeys) ? session.audit.resolvedIssueKeys : []);

  const getIssueKey = (issue, index) => {
    return String(
      issue?.id ||
      issue?.issueId ||
      issue?.key ||
      issue?.type ||
      issue?.message ||
      issue?.title ||
      issue?.finding ||
      issue?.suggestion ||
      `hallazgo-${index}`
    );
  };

  const getUnresolvedIssues = (issues = []) => {
    if (!Array.isArray(issues)) return [];
    return issues.filter((issue, index) => {
      const key = getIssueKey(issue, index);
      return !resolvedIssueKeys.has(key);
    });
  };

  showModal({
    title: aidaMode ? "4. Auditoría editorial y factual Aida" : "4. Auditoría y Revisión editorial",
    widthClass: "max-w-4xl",
    contentHtml: `
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-slate-500">${aidaMode ? "Comprueba las ocho fases, evidencia, cronología, idea central, analogía dominante y cierre de marca antes de aprobar." : "Revisa la calidad de tu artículo y asegúrate de que el tono pedagógico sea el correcto antes de publicar."}</p>
          ${hasExistingAudit ? `<span class="shrink-0 text-[10px] px-2 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-bold flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Auditoría guardada
          </span>` : ""}
        </div>

        <div id="review-loading" class="py-10 text-center text-xs text-slate-500 ${hasExistingAudit ? 'hidden' : ''}">
          <svg class="animate-spin mx-auto h-6 w-6 text-teal-600 mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ${aidaMode ? "Auditando estructura Aida, fidelidad al tema y evidencia..." : "Auditando hechos, tono y SEO..."}
        </div>

        <div id="review-content" class="${hasExistingAudit ? '' : 'hidden'} flex flex-col md:flex-row gap-5 items-start">
          <section class="w-full md:w-1/3 rounded-xl border border-slate-200 bg-white shadow-sm p-5 flex flex-col gap-3">
            <p class="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Resumen editorial</p>
            <div class="flex items-start gap-3">
              <div class="text-4xl font-black text-slate-900 leading-none" id="audit-score">${hasExistingAudit ? (session.audit.readabilityScore || 92) : "--"}</div>
              <div>
                <p class="text-sm font-semibold text-slate-800">Puntaje Editorial</p>
                <p class="text-[11px] text-slate-500 mt-0.5">Evaluación de tono, claridad y estructura.</p>
              </div>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed" id="audit-summary">${hasExistingAudit ? escapeHtml(session.audit.summary || "") : ""}</p>
          </section>

          <section class="w-full md:w-2/3 rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-2">
                <span class="inline-flex h-6 w-6 rounded-md bg-slate-100 text-slate-500 items-center justify-center text-xs font-bold">!</span>
                <h4 class="text-sm font-semibold text-slate-900">Hallazgos y Sugerencias</h4>
              </div>
              <span class="text-[10px] uppercase tracking-wide text-slate-400">Prioridad</span>
            </div>
            <div id="audit-issues" class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-1">

            </div>
          </section>
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-regen-audit" class="btn btn-outline h-9 px-4 text-xs flex items-center gap-1.5 ${hasExistingAudit ? '' : 'hidden'}">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        Re-auditar
      </button>
      <button class="btn btn-outline h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cerrar sin aprobar</button>
      <button id="btn-approve-and-publish" class="btn btn-primary h-9 px-4 text-xs ${hasExistingAudit ? '' : 'hidden'}">Aprobar artículo</button>
    `
  });

  const loadingEl = document.getElementById("review-loading");
  const contentEl = document.getElementById("review-content");
  const approveBtn = document.getElementById("btn-approve-and-publish");
  const regenBtn = document.getElementById("btn-regen-audit");

  const populateAuditUI = (reviewResult) => {
    const allIssues = Array.isArray(reviewResult?.issues) ? reviewResult.issues : [];
    const unresolvedIssues = getUnresolvedIssues(allIssues);

    document.getElementById("audit-score").textContent = reviewResult.readabilityScore || (allIssues.length === 0 || unresolvedIssues.length === 0 ? 98 : 92);

    if (allIssues.length === 0) {
      document.getElementById("audit-summary").textContent = "No se encontraron problemas. ¡El artículo está excelente!";
    } else if (unresolvedIssues.length === 0) {
      document.getElementById("audit-summary").textContent = "No hay hallazgos pendientes. El artículo quedó en estado editorial correcto.";
    } else {
      document.getElementById("audit-summary").textContent = reviewResult.summary || "Artículo claro y alineado pedagógicamente.";
    }

    document.getElementById("audit-issues").innerHTML = renderAuditIssues(
      unresolvedIssues,
      reviewResult.resolvedIssueKeys || []
    );

    return unresolvedIssues;
  };

  const fixIssue = async (issue, issueIndex, btn) => {
    if (!issue) return;

    const recommendation = issue.suggestion || issue.recommendation || issue.description || "Ajustar este punto editorial para mejorar la calidad del contenido.";
    const issueKey = getIssueKey(issue, issueIndex);
    const label = getAudienceLabel(getAudienceFromSession());
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.dataset.status = "fixing";
    btn.innerHTML = `
      <svg class="animate-spin h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M12 2a10 10 0 0 1 10 10"></path></svg>
      Corrigiendo...
    `;

    try {
      if (!session.article || !Array.isArray(session.article.blocks)) {
        throw new Error("No hay un artículo activo para corregir en esta sesión.");
      }

      const correctedBrief = `Corrige el artículo aplicando esta mejora prioritaria para ${label}:

Hallazgo: ${issue.message || issue.title || issue.finding || "Hallazgo editorial"}
Sugerencia: ${recommendation}

Regenera el texto editorial manteniendo estructura, enfoque, tono y fuentes, priorizando esta mejora de forma precisa.`;

      const correctedArticle = await draftArticleForMode({
        session,
        title: session.article?.title || session.title,
        topic: session.topic || session.title || "",
        audience: getAudienceFromSession(),
        brief: correctedBrief
      });

      if (!correctedArticle) {
        throw new Error("No se recibió un artículo corregido desde Gemini.");
      }

      session.article = correctedArticle;
      if (correctedArticle.title) session.title = correctedArticle.title;
      session.status = "review_required";
      delete session.audit;
      resolvedIssueKeys.add(issueKey);
      if (!session.audit) {
        session.audit = {};
      }
      session.audit.resolvedIssueKeys = Array.from(resolvedIssueKeys);
      await saveMarcieSession(session);
      await runAudit(true, { keepArticleCardVisible: true, throwOnError: true });
      if (onUpdateSession) onUpdateSession();
      btn.dataset.fixStatus = "fixed";
      showToast(`✅ Hallazgo corregido para ${label}.`, "success");
    } catch (err) {
      console.error("[MarciePipeline] Error corrigiendo hallazgo editorial:", err);
      showToast(`No se pudo aplicar la corrección: ${err.message}`, "error");
      btn.disabled = false;
      btn.dataset.status = "";
      btn.innerHTML = originalHtml;
    }
  };

  const bindAuditIssueActions = (issues = []) => {
    const issueContainer = document.getElementById("audit-issues");
    if (!issueContainer) return;

    issueContainer.onclick = (event) => {
      const btn = event.target.closest("[data-fix-audit-issue]");
      if (!btn || btn.disabled || btn.dataset.status === "fixing" || btn.dataset.fixStatus === "fixed") return;

      const issueIndex = Number(btn.getAttribute("data-fix-audit-issue"));
      const issue = issues[issueIndex];
      if (!issue) return;

      void fixIssue(issue, issueIndex, btn);
    };
  };

  const approveArticle = async () => {
    const unresolved = getUnresolvedIssues(session.audit?.issues || []);
    if (unresolved.length) {
      showToast(`Quedan ${unresolved.length} hallazgos por resolver antes de aprobar.`, "error");
      return;
    }
    const evidenceBlockers = articleVerificationBlockers(session.article || {}, { editorialMode: session.editorialMode });
    if (evidenceBlockers.length) {
      showToast(`No se puede aprobar: ${evidenceBlockers.join(" · ")}`, "error");
      return;
    }
    const approvedAudience = getAudienceFromSession();
    session.article.approval = { approvedAt: new Date().toISOString(), contentHash: session.article.verification?.contentHash || "", articleVersion: session.updatedAt || "" };
    session.approvedAudiences = [...new Set([...(Array.isArray(session.approvedAudiences) ? session.approvedAudiences : []), approvedAudience])];
    session.status = "approved";
    await saveMarcieSession(session);
    closeActiveModal();
    showToast("Artículo aprobado. Ya puede enviarse a WordPress.", "success");
    if (onUpdateSession) onUpdateSession();
  };

  const bindApproveButton = () => {
    const currentApproveBtn = document.getElementById("btn-approve-and-publish");
    if (!currentApproveBtn) return;

    currentApproveBtn.disabled = false;
    currentApproveBtn.classList.remove("hidden");

    if (currentApproveBtn.dataset.marcieBound === "1") return;
    currentApproveBtn.dataset.marcieBound = "1";
    currentApproveBtn.addEventListener("click", approveArticle);
  };

  const runAudit = async (forceRegen = false, options = {}) => {
    const keepArticleCardVisible = Boolean(options.keepArticleCardVisible);
    const throwOnError = Boolean(options.throwOnError);
    const persistedResolvedKeys = Array.isArray(session.audit?.resolvedIssueKeys)
      ? [...session.audit.resolvedIssueKeys]
      : [];

    if (!keepArticleCardVisible) {
      loadingEl.classList.remove("hidden");
      contentEl.classList.add("hidden");
      if (regenBtn) regenBtn.classList.add("hidden");
      if (approveBtn) approveBtn.classList.add("hidden");
    }

    if (regenBtn) {
      regenBtn.disabled = true;
    }
    if (approveBtn) {
      approveBtn.disabled = true;
    }

    try {
      if (forceRegen) delete session.audit;
      let reviewResult = session.audit;

      if (!reviewResult) {
        reviewResult = await reviewArticleForMode({
          session,
          article: session.article || { title: session.title, blocks: [] }
        });
        if (reviewResult?.verifiedArticle) {
          session.article = reviewResult.verifiedArticle;
          if (!session.articlesByAudience) session.articlesByAudience = {};
          session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
          reviewResult = { ...reviewResult };
          delete reviewResult.verifiedArticle;
        }
        // Guardar inmediatamente sin importar si el usuario aprueba o no
        reviewResult.resolvedIssueKeys = persistedResolvedKeys;
        session.audit = reviewResult;
        await saveMarcieSession(session);
        showToast("✅ Auditoría guardada en la sesión.", "success");
      }

      if (!keepArticleCardVisible) {
        loadingEl.classList.add("hidden");
        contentEl.classList.remove("hidden");
        if (regenBtn) regenBtn.classList.remove("hidden");
        if (regenBtn) regenBtn.disabled = false;
      }

      const unresolvedIssues = populateAuditUI(reviewResult);
      bindAuditIssueActions(unresolvedIssues);

      bindApproveButton();
    } catch (err) {
      console.error("[MarciePipeline] Error en auditoría:", err);
      loadingEl.innerHTML = `<div class="text-red-500 font-medium">Error al auditar el contenido: ${err.message}</div>`;
      if (regenBtn) {
        regenBtn.disabled = false;
      }
      if (approveBtn) {
        approveBtn.disabled = false;
      }
      if (!keepArticleCardVisible) {
        loadingEl.classList.remove("hidden");
        contentEl.classList.add("hidden");
      }
      if (throwOnError) {
        throw err;
      }
    }
  };

  if (regenBtn) {
    regenBtn.addEventListener("click", () => runAudit(true));
  }

  if (hasExistingAudit) {
    bindApproveButton();
  }

  // Solo llamar a Gemini si no hay auditoría guardada
  if (!hasExistingAudit) {
    runAudit();
    return;
  }

  const initialIssues = populateAuditUI(session.audit || {});
  bindAuditIssueActions(initialIssues);
}

// 5. Exportar (Antes Paso 6)
function handleExportStep({ getSession }) {
  const session = getSession();
  if (!session) return;

  if (session.status === "new" || session.status === "researching" || session.status === "proposal_ready") {
    alert("Primero debes generar el artículo (Paso 3) y opcionalmente aprobarlo (Paso 4).");
    return;
  }

  const article = session.article || {};
  const sourceDisplayMode = article.sourceCitationStyle === "apa" ? "apa" : "default";
  const exportSources = getAllExportSources(article);

  const buildSourceHtmlMarkup = (mode = "default") => {
    if (!exportSources.length) {
      return "<p>Sin fuentes registradas.</p>";
    }
    return `<ul>${exportSources.map((source) => {
      const safeSourceHref = toSafeSourceUrl(source.url);
      const citation = getSourceCitationText(source, mode);
      return `<li><a href="${safeSourceHref}" target="${safeSourceHref === "#" ? "_self" : "_blank"}" rel="${safeSourceHref === "#" ? "" : "noopener noreferrer"}">${escapeHtml(citation)}</a></li>`;
    }).join("")}</ul>`;
  };

  const buildSourceMdMarkup = (mode = "default") => {
    if (!exportSources.length) {
      return "- Sin fuentes registradas.";
    }
    return exportSources.map((source) => {
      const citation = getSourceCitationText(source, mode);
      const sourceUrl = toSafeSourceUrl(source.url);
      return mode === "apa"
        ? `- ${citation}${sourceUrl === "#" ? "" : ` (${sourceUrl})`}`
        : `- [${citation}](${sourceUrl})`;
    }).join("\n");
  };

  const buildHtmlPreview = (mode = "default") => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${article.title || session.title}</title>
</head>
<body>
  <h1>${article.title || session.title}</h1>
  <p><em>${article.subtitle || ""}</em></p>
  ${(article.blocks || []).map((b) => {
    if (b.type === "paragraph") return `<p>${b.text}</p>`;
    if (b.type === "heading") return `<h3>${b.text}</h3>`;
    if (b.type === "quote") return `<blockquote>${b.text} <cite>— ${b.attribution || ""}</cite></blockquote>`;
    if (b.type === "bulletList") return `<ul>${(b.items || []).map((it) => `<li>${it}</li>`).join("")}</ul>`;
    return `<p>${b.text || ""}</p>`;
  }).join("\n  ")}
  <hr>
  <h3>Fuentes de consulta</h3>
  ${buildSourceHtmlMarkup(mode)}
</body>
</html>
  `.trim();

  const buildMdPreview = (mode = "default") => `
# ${article.title || session.title}

*${article.subtitle || ""}*

${(article.blocks || []).map((b) => {
  if (b.type === "paragraph") return b.text;
  if (b.type === "heading") return `### ${b.text}`;
  if (b.type === "quote") return `> ${b.text}\n> *— ${b.attribution || ""}*`;
  if (b.type === "bulletList") return (b.items || []).map((it) => `- ${it}`).join("\n");
  return b.text || "";
}).join("\n\n")}

---
### Fuentes consultadas:
${buildSourceMdMarkup(mode)}
  `.trim();

  let currentSourceFormat = sourceDisplayMode;
  const buildCurrentSources = (mode = "default") => ({
    html: buildHtmlPreview(mode),
    md: buildMdPreview(mode)
  });
  let currentOutputs = buildCurrentSources(currentSourceFormat);

  showModal({
    title: "5. Exportar y Publicar",
    contentHtml: `
      <div class="flex flex-col gap-4">
        <p class="text-xs text-slate-500">Selecciona el formato de salida para tu CMS o publicación externa:</p>

        <div class="flex gap-2">
          <button id="export-tab-html" class="flex-1 btn btn-primary h-8 text-xs">HTML Limpio</button>
          <button id="export-tab-md" class="flex-1 btn btn-outline h-8 text-xs">Markdown</button>
          <button id="btn-export-source-format" class="btn btn-outline h-8 text-xs flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 21V7a2 2 0 0 1 2-2h3.6a2.6 2.6 0 0 1 2.6 2.6V9h4a2.6 2.6 0 0 1 2.6 2.6V21M2 21h20" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="M12 21V3" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>
            ${currentSourceFormat === "apa" ? "Formato estándar" : "Formato APA"}
          </button>
        </div>

        <textarea id="export-preview-area" class="input-field h-40 font-mono text-xs p-2 bg-slate-50" readonly>${buildHtmlPreview(currentSourceFormat)}</textarea>
      </div>
    `,
    footerButtonsHtml: `
      <button id="btn-copy-export" class="btn btn-outline h-9 px-4 text-xs">Copiar Código</button>
      <button id="btn-download-export" class="btn btn-primary h-9 px-4 text-xs">Descargar Archivo</button>
    `
  });

  const previewArea = document.getElementById("export-preview-area");
  const tabHtml = document.getElementById("export-tab-html");
  const tabMd = document.getElementById("export-tab-md");
  const sourceFormatBtn = document.getElementById("btn-export-source-format");
  const copyBtn = document.getElementById("btn-copy-export");
  const downloadBtn = document.getElementById("btn-download-export");

  let currentFormat = "html";
  const updateOutput = () => {
    if (sourceFormatBtn) {
      sourceFormatBtn.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 21V7a2 2 0 0 1 2-2h3.6a2.6 2.6 0 0 1 2.6 2.6V9h4a2.6 2.6 0 0 1 2.6 2.6V21M2 21h20" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="M12 21V3" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>
        ${currentSourceFormat === "apa" ? "Formato estándar" : "Formato APA"}
      `;
      sourceFormatBtn.className = currentSourceFormat === "apa" ? "btn btn-primary h-8 text-xs flex items-center gap-1.5" : "btn btn-outline h-8 text-xs flex items-center gap-1.5";
    }
    currentOutputs = buildCurrentSources(currentSourceFormat);
    previewArea.value = currentFormat === "html" ? currentOutputs.html : currentOutputs.md;
  };

  sourceFormatBtn?.addEventListener("click", () => {
    currentSourceFormat = currentSourceFormat === "apa" ? "default" : "apa";
    if (session.article) {
      session.article.sourceCitationStyle = currentSourceFormat;
      saveMarcieSession(session).catch((error) => {
        console.warn("[MarciePipeline] No se pudo guardar el estilo de citas para la sesión", error);
      });
    }
    updateOutput();
  });

  tabHtml?.addEventListener("click", () => {
    currentFormat = "html";
    tabHtml.className = "flex-1 btn btn-primary h-8 text-xs";
    tabMd.className = "flex-1 btn btn-outline h-8 text-xs";
    previewArea.value = currentOutputs.html;
  });

  tabMd?.addEventListener("click", () => {
    currentFormat = "md";
    tabMd.className = "flex-1 btn btn-primary h-8 text-xs";
    tabHtml.className = "flex-1 btn btn-outline h-8 text-xs";
    previewArea.value = currentOutputs.md;
  });
  updateOutput();

  copyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(previewArea.value).then(() => {
      showToast("Contenido exportado copiado al portapapeles", "success");
    });
  });

  downloadBtn?.addEventListener("click", () => {
    const blob = new Blob([previewArea.value], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `articulo-${session.id}.${currentFormat}`;
    a.click();
    showToast("Archivo descargado exitosamente", "success");
  });
}
