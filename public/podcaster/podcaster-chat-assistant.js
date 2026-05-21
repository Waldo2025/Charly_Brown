/**
 * Podcaster Studio - Chat Assistant Module
 * Handles all states, builders, formatting, and rendering of the Snoopy Chat Assistant.
 */
import { requirePodcasterScriptGeneratorApiFunction } from "./podcaster-script-generator-registry.js";
import { buildSpeakerMapsForHosts as buildSpeakerMapsForHostsShared } from "./podcaster-speaker-maps.js";
import { replaceHostTokensWithNames as replaceHostTokensWithNamesShared } from "./podcaster-speaker-text.js";
import { toMarkdownTableCell } from "./podcaster-markdown-table.js";

// --- Global Chat Generation State ---
const connectScriptPanelGenerationState = {
  active: false,
  messageId: "",
  abortController: null,
  token: 0
};

const escapeHtml = typeof window.escapeHtml === "function"
  ? window.escapeHtml
  : (value = "") => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSpeakerMapsForHosts = (hosts = [], session = null, snapshots = {}) => buildSpeakerMapsForHostsShared(hosts, session, snapshots, {
  getSpeakerVoiceMap: window.getSpeakerVoiceMap,
  getSpeakerExpressionMap: window.getSpeakerExpressionMap,
  getSpeakerNameMap: window.getSpeakerNameMap,
  getSpeakerScenarioMap: window.getSpeakerScenarioMap,
  normalizeLiveVoiceName: window.normalizeLiveVoiceName,
  resolveSpeakerVoiceName: window.resolveSpeakerVoiceName,
  EXPRESSIONS: window.EXPRESSIONS,
  DEFAULT_SPEAKER_NAME_MAP: window.DEFAULT_SPEAKER_NAME_MAP,
  DEFAULT_SPEAKER_SCENARIO_MAP: window.DEFAULT_SPEAKER_SCENARIO_MAP,
  rewriteScenarioPromptForEducationalVideo: requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")
});
const replaceHostTokensWithNames = (text = "", session = null) => replaceHostTokensWithNamesShared(text, session, {
  getSpeakerNameMap: window.getSpeakerNameMap
});

// --- Chat State Modification API ---
function addChatMessage(role, text, extra = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedText = String(text || "").trim();
  if (normalizedRole === "system") {
    const logMethod = /error|fallo|no se pudo|no disponible/i.test(normalizedText) ? "error" : "log";
    console[logMethod]("[podcaster][chat:system]", normalizedText, extra && typeof extra === "object" ? extra : {});
    return null;
  }
  const payload = {
    id: window.makeId("msg"),
    role: normalizedRole || "assistant",
    text: normalizedText,
    ...(extra && typeof extra === "object" ? extra : {})
  };
  window.upsertActiveSession((session) => ({
    ...session,
    chat: [
      ...(session.chat || []),
      payload
    ]
  }));
}

function removeChatMessage(messageId = "") {
  const key = String(messageId || "").trim();
  if (!key) return;
  window.upsertActiveSession((session) => ({
    ...session,
    chat: (session.chat || []).filter((message) => String(message?.id || "").trim() !== key)
  }));
}

// --- Reply Builders and Formatting Helpers ---
function buildPodcastAssistantReply(script = {}, options = {}) {
  const isRefinement = options?.isRefinement === true;
  const session = options?.session || null;
  const episodeTitle = String(script.episodeTitle || "Podcast").trim();
  const summary = String(script.summary || "").trim();
  const hosts = Array.isArray(script.hosts) && script.hosts.length
    ? script.hosts.join(", ")
    : "Host A, Host B";
  const rows = window.normalizeRows(script.rows);
  const duration = window.secondsToClock(window.countTotalDuration(rows));
  const previewLimit = 24;
  const isTruncatedPreview = rows.length > previewLimit;

  let currentTime = 0;
  const previewRows = rows
    .slice(0, previewLimit)
    .map((row, index) => {
      const seconds = Math.max(1, Number(row?.durationSec) || 5);
      const startTime = window.secondsToClock(currentTime);
      currentTime += seconds;
      const endTime = window.secondsToClock(currentTime);
      const timeRange = `${startTime} - ${endTime}`;

      const speaker = String(row.speaker || "Host A").trim() || "Host A";
      const speakerName = window.resolveSpeakerDisplayName(String(row.speaker || "Host A").trim(), session);
      const expression = String(row.expression || "Neutral").trim() || "Neutral";
      const text = replaceHostTokensWithNames(String(row.text || "").trim(), session);
      const media = String(row?.mediaCue || "Sin media").trim() || "Sin media";
      const notes = String(row?.notes || "").replace(/\s+/g, " ").trim() || "-";
      return `| ${timeRange} | ${toMarkdownTableCell(speaker)} | ${toMarkdownTableCell(speakerName)} | ${toMarkdownTableCell(expression)} | ${toMarkdownTableCell(text)} | ${toMarkdownTableCell(media)} | ${toMarkdownTableCell(notes)} |`;
    })
    .join("\n");

  const tableHeader = "| Tiempo | Locutor | Nombre del locutor | Expresión | Guion | Media | Notas |\n| --- | --- | --- | --- | --- | --- | --- |";
  const previewTable = previewRows ? `${tableHeader}\n${previewRows}` : "";

  const responseLines = [];
  if (isRefinement) {
    responseLines.push(`### Guion Actualizado: ${episodeTitle}`);
  } else {
    responseLines.push(`### Nuevo Guion: ${episodeTitle}`);
  }

  if (summary) {
    responseLines.push(`> ${summary}`);
  }

  responseLines.push(`**Configuración:** ${hosts} | **Duración:** ${duration} | **Escenas:** ${rows.length}`);
  responseLines.push("");
  if (previewTable) {
    responseLines.push(previewTable);
  }

  if (isTruncatedPreview) {
    responseLines.push(`*Mostrando primeras ${previewLimit} escenas. El resto está disponible en el panel de edición.*`);
  }

  return responseLines.join("\n");
}

function buildCreativeVideoAssistantReply(script = {}, options = {}) {
  const isRefinement = options?.isRefinement === true;
  const isCreative = String(script?.videoPreset || "").trim().toLowerCase() === "creative";
  const episodeTitle = String(script.episodeTitle || "Video creativo desde una idea").trim();
  const summary = String(script.summary || "Ya preparé una primera versión del video creativo.").trim();
  const rows = window.normalizeRows(script.rows);
  const duration = window.secondsToClock(window.countTotalDuration(rows));
  const creativeConfig = window.normalizeCreativeVideoConfig(script?.creativeVideoConfig || window.getCreativeVideoConfig(options?.session || null));
  const voiceLabel = String(creativeConfig.globalVoiceName || "Kore").trim() || "Kore";
  const voiceMimeType = String(creativeConfig.voiceMimeType || "audio/ogg").trim() || "audio/ogg";
  const voiceFormatLabel = voiceMimeType.replace(/^audio\//i, "").toUpperCase();
  const previewLimit = 24;
  const isTruncatedPreview = rows.length > previewLimit;
  const previewRows = rows
    .slice(0, previewLimit)
    .map((row, index) => {
      const seconds = Math.max(window.SHORT_SCENE_MIN_SEC, Number(row?.durationSec) || window.SHORT_SCENE_MAX_SEC);
      const voiceOver = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
      const sceneDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
      const transition = requirePodcasterScriptGeneratorApiFunction("normalizeTransitionForScene")(String(row?.transition || "").replace(/\s+/g, " ").trim(), {
        script: voiceOver,
        sceneDescription,
        visual: requirePodcasterScriptGeneratorApiFunction("resolveCreativeVisualNotesText")(row),
        partIndex: index
      });
      const visualElement = requirePodcasterScriptGeneratorApiFunction("resolveCreativeVisualNotesText")(row)
        || String(
          row?.videoDirective
          || row?.visual
          || row?.elementoVisual
          || (Array.isArray(row?.imagePrompts) ? row.imagePrompts[0] : "")
          || sceneDescription
          || ""
        ).replace(/\s+/g, " ").trim()
        || "Definir elemento visual.";
      const onScreenText = requirePodcasterScriptGeneratorApiFunction("ensureCompleteSentence")(requirePodcasterScriptGeneratorApiFunction("buildOnScreenText")(row?.onScreenText || "", {
        voiceOver,
        sceneDescription,
        visual: visualElement
      }));
      const startSec = rows
        .slice(0, index)
        .reduce((acc, item) => acc + Math.max(window.SHORT_SCENE_MIN_SEC, Number(item?.durationSec) || window.SHORT_SCENE_MAX_SEC), 0);
      const endSec = startSec + seconds;
      return {
        time: `${window.secondsToClock(startSec)}-${window.secondsToClock(endSec)}`,
        script: voiceOver || "Definir voz en off de la escena.",
        sceneDescription: sceneDescription || "Definir descripción de escena.",
        onScreenText,
        transition,
        visual: visualElement
      };
    })
    .map((item) => `| ${item.time} | ${item.script.replace(/\|/g, "\\|")} | ${item.sceneDescription.replace(/\|/g, "\\|")} | ${(item.onScreenText || "").replace(/\|/g, "\\|")} | ${item.transition.replace(/\|/g, "\\|")} | ${item.visual.replace(/\|/g, "\\|")} |`)
    .join("\n");
  const tableHeader = "| Tiempo | Guion | Descripción de escena | Texto en pantalla | Transición | Elemento visual |\n| --- | --- | --- | --- | --- | --- |";
  const previewTable = previewRows ? `${tableHeader}\n${previewRows}` : "";

  return [
    isRefinement
      ? `Listo. Actualicé tu guion de video creativo: "${episodeTitle}".`
      : `Listo. Preparé un primer guion de video creativo para "${episodeTitle}".`,
    "",
    `${summary}`,
    "",
    `Duración estimada: ${duration}.`,
    `Escenas creativas generadas: ${rows.length}.`,
    `Voz global: ${voiceLabel} (${voiceFormatLabel}).`,
    "",
    previewTable ? `Guión técnico en tabla${isTruncatedPreview ? " (parcial)" : ""}:\n${previewTable}` : "",
    isTruncatedPreview ? `Mostrando ${previewLimit} de ${rows.length} escenas. El resto está en la tabla del panel derecho.` : "",
    "",
    "Para ver/editar este guion en la tabla del panel derecho, usa el botón \"Conectar guion al panel\" de este mensaje.",
    "",
    "Campos del panel creativo: Tiempo, Guion (voz en off), Descripción de escena, Texto en pantalla, Transición y Elemento visual."
  ].filter(Boolean).join("\n");
}

function buildScriptAssistantReply(script = {}, options = {}) {
  const videoMode = options?.videoMode === true || script?.videoMode === true;
  return videoMode
    ? buildCreativeVideoAssistantReply(script, options)
    : buildPodcastAssistantReply(script, options);
}

function addScriptAssistantMessage(script = {}, options = {}) {
  const session = options?.session || window.getActiveSession();
  const preserveExactRows = options?.preserveExactRows === true;
  const normalized = window.normalizeCreativeVideoScriptForDisplay(script, session, {
    ...options,
    preserveExactRows
  });
  const hosts = Array.isArray(normalized?.hosts) && normalized.hosts.length ? normalized.hosts : window.getSpeakerOptions(session);
  const maps = buildSpeakerMapsForHosts(hosts, session, {
    ...(options?.snapshots || {}),
    videoMode: normalized?.videoMode === true,
    videoPreset: normalized?.videoPreset || options?.snapshots?.videoPreset
  });
  const text = buildScriptAssistantReply(normalized, {
    isRefinement: options?.isRefinement === true,
    session,
    videoMode: normalized?.videoMode === true
  });
  addChatMessage("assistant", text, {
    scriptSnapshot: normalized,
    speakerVoiceMapSnapshot: maps.voiceMap,
    speakerExpressionMapSnapshot: maps.expressionMap,
    speakerNameMapSnapshot: maps.nameMap,
    speakerScenarioMapSnapshot: maps.scenarioMap,
    disfluencyDefaultsSnapshot: window.normalizeDisfluencyConfig(session?.disfluencyDefaults || window.DEFAULT_DISFLUENCY_CONFIG),
    originalPrompt: options?.originalPrompt || null,
    originalOptions: options?.originalOptions || null
  });
}

// --- Sanitization & Markdown Rendering ---
function sanitizeChatHtml(input = "") {
  const source = String(input || "").trim();
  if (!source) return "";
  const allowedTags = new Set(["TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "P", "DIV", "SPAN", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI"]);
  const allowedAttrs = new Set(["style", "colspan", "rowspan", "align", "valign", "bgcolor", "width", "height"]);
  const sanitizeStyle = (styleValue = "") => String(styleValue || "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\(\s*['"]?\s*javascript:[^)]+\)/gi, "")
    .replace(/behavior\s*:[^;]+;?/gi, "")
    .trim();
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";
    const walk = (node) => {
      if (!(node instanceof Element)) return;
      const tag = String(node.tagName || "").toUpperCase();
      if (!allowedTags.has(tag)) {
        const text = doc.createTextNode(node.textContent || "");
        node.replaceWith(text);
        return;
      }
      Array.from(node.attributes).forEach((attr) => {
        const name = String(attr.name || "").toLowerCase();
        if (name.startsWith("on") || !allowedAttrs.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }
        if (name === "style") {
          const safeStyle = sanitizeStyle(attr.value);
          if (safeStyle) node.setAttribute("style", safeStyle);
          else node.removeAttribute("style");
        }
      });
      Array.from(node.children).forEach((child) => walk(child));
    };
    Array.from(root.children).forEach((child) => walk(child));
    return root.innerHTML.trim();
  } catch (_) {
    return "";
  }
}

function splitMarkdownTableCells(line = "") {
  const source = String(line || "").trim();
  if (!source.includes("|")) return [];
  const normalized = source.startsWith("|") ? source.slice(1) : source;
  const tailTrimmed = normalized.endsWith("|") ? normalized.slice(0, -1) : normalized;
  return tailTrimmed.split("|").map((cell) => String(cell || "").trim());
}

function isMarkdownDividerCell(cell = "") {
  return /^:?-{3,}:?$/.test(String(cell || "").trim());
}

function convertMarkdownTableAt(lines = [], startIndex = 0) {
  const headerCells = splitMarkdownTableCells(lines[startIndex] || "");
  const dividerCells = splitMarkdownTableCells(lines[startIndex + 1] || "");
  if (!headerCells.length || !dividerCells.length) return null;
  if (headerCells.length !== dividerCells.length) return null;
  if (!dividerCells.every((cell) => isMarkdownDividerCell(cell))) return null;

  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const rowLine = String(lines[index] || "");
    if (!rowLine.includes("|")) break;
    const rowCells = splitMarkdownTableCells(rowLine);
    if (rowCells.length !== headerCells.length) break;
    rows.push(rowCells);
    index += 1;
  }

  if (!rows.length) return null;
  const headHtml = `<thead><tr>${headerCells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return {
    html: `<table>${headHtml}${bodyHtml}</table>`,
    nextIndex: index
  };
}

function renderChatTextWithMarkdownTables(text = "") {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "";
  const lines = source.split("\n");
  const htmlChunks = [];
  const textBuffer = [];
  const flushTextBuffer = () => {
    if (!textBuffer.length) return;
    htmlChunks.push(escapeHtml(textBuffer.join("\n")).replace(/\n/g, "<br>"));
    textBuffer.length = 0;
  };

  let index = 0;
  while (index < lines.length) {
    const parsed = convertMarkdownTableAt(lines, index);
    if (parsed) {
      flushTextBuffer();
      htmlChunks.push(parsed.html);
      index = parsed.nextIndex;
      continue;
    }
    textBuffer.push(lines[index]);
    index += 1;
  }
  flushTextBuffer();
  return htmlChunks.join("<br>");
}

function renderChatMessageBody(message = {}) {
  const html = sanitizeChatHtml(message?.html || "");
  if (html) return html;
  return renderChatTextWithMarkdownTables(String(message?.text || ""));
}

function isConsoleOnlyAssistantMessage(message = {}) {
  if (String(message?.role || "").trim().toLowerCase() !== "assistant") return false;
  const text = String(message?.text || "").trim();
  return text.startsWith("Sesion guardada en Firebase (")
    || text.startsWith("Sesión guardada en Firebase (")
    || text === "Reajusté el guión con Gemini para equilibrar los nuevos locutores."
    || text === "Gemini Live quedó conectado para reproducir voces por escena desde el panel derecho.";
}

// --- Render Chat Flow ---
function renderChat(session) {
  const messages = session.chat || [];
  const visibleMessages = messages.filter((message, index) => {
    if (index === 0 && message.role === "assistant" && messages.length === 1) return false;
    if (String(message?.role || "").trim().toLowerCase() === "system") return false;
    if (isConsoleOnlyAssistantMessage(message)) return false;
    return true;
  });
  const target = window.els.chatFeedMessages || window.els.chatFeed;
  target.innerHTML = visibleMessages.map((message) => `
    <article class="chat-message ${message.role === "user" || message.role === "system" ? escapeHtml(message.role) : "assistant"}" data-message-id="${escapeHtml(message.id || "")}">
      <div class="chat-message-body">${renderChatMessageBody(message)}</div>
      <div class="chat-message-actions">
        ${message.role === "assistant"
      ? (() => {
        const isConnectGenerating = connectScriptPanelGenerationState.active && String(connectScriptPanelGenerationState.messageId || "").trim() === String(message?.id || "").trim();
        const action = isConnectGenerating ? "stop-connect-script-panel" : "connect-script-panel";
        const title = isConnectGenerating ? "Detener conexión y generación de audios" : "Conectar guión al panel";
        const icon = isConnectGenerating ? "fa-stop" : "fa-link";
        return `
          <button class="chat-connect-btn${isConnectGenerating ? " is-stop" : ""}" type="button" data-action="${action}" title="${title}" aria-label="${title}"${message?.scriptSnapshot || isConnectGenerating ? "" : " disabled"}><i class="fas ${icon}"></i></button>
          <button class="chat-regenerate-btn" type="button" data-action="regenerate-chat-message" title="Regenerar propuesta de guion alternativa" aria-label="Regenerar propuesta de guion alternativa"${isConnectGenerating ? " disabled" : ""}><i class="fas fa-sync-alt"></i></button>
        `;
      })()
      : ""}
        ${message.role === "system" || message.role === "assistant"
      ? `<button class="chat-delete-btn" type="button" data-action="delete-chat-message" title="Eliminar mensaje" aria-label="Eliminar mensaje"><i class="fas fa-trash"></i></button>`
      : ""}
        <button class="chat-copy-btn" type="button" data-action="copy-chat-message" title="Copiar texto" aria-label="Copiar texto">
          <i class="fas fa-copy"></i>
        </button>
      </div>
    </article>
  `).join("");
  window.els.chatStage?.classList.toggle("has-messages", visibleMessages.length > 0);
  window.els.chatFeed.scrollTop = window.els.chatFeed.scrollHeight;
}

const podcasterChatAssistantApi = {
  connectScriptPanelGenerationState,
  addChatMessage,
  removeChatMessage,
  buildPodcastAssistantReply,
  buildCreativeVideoAssistantReply,
  buildScriptAssistantReply,
  addScriptAssistantMessage,
  sanitizeChatHtml,
  splitMarkdownTableCells,
  isMarkdownDividerCell,
  convertMarkdownTableAt,
  renderChatTextWithMarkdownTables,
  renderChatMessageBody,
  renderChat
};

window.PodcasterChatAssistant = podcasterChatAssistantApi;
Object.assign(window, podcasterChatAssistantApi);
