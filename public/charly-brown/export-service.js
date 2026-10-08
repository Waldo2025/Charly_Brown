import { buildGeminiApiUrl } from "../js/api-client.js";
import { downloadDocxFromTemplate } from "../js/word-export.js";
import { resolveActivityCognitiveSkill } from "./cognitive-skills.js";

async function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js");
    const user = getAuth().currentUser;
    return (await user?.getIdToken?.()) || "";
  } catch (_) {
    return "";
  }
}

function clean(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function safeName(value = "") {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "contenido-charly-brown";
}

function compactAcademicNumber(value = "", fallback = "X") {
  const normalized = clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = { primero: "1", primer: "1", segundo: "2", tercero: "3", tercer: "3", cuarto: "4", quinto: "5", sexto: "6" };
  return normalized.match(/\d+/)?.[0] || words[normalized] || fallback;
}

function buildClientExportBaseName(session = {}) {
  const academic = session.academicMeta || session.meta || {};
  const units = Array.isArray(session.units) ? session.units : [];
  const activeUnit = units.find((unit) => unit.id === session.activeUnitId) || units[0] || {};
  const level = safeName(academic.level || "Primaria");
  const grade = compactAcademicNumber(academic.grade, "3");
  const trimester = compactAcademicNumber(academic.trimester, "1");
  const unit = compactAcademicNumber(activeUnit.meta?.unit || session.meta?.unit, "1");
  return `${level}_nv${grade}_trim${trimester}_U${unit}`;
}

function escapeHtmlText(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text = "") {
  return escapeHtmlText(text)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Anota y limpia el HTML de actividades para que tome con máxima fidelidad
 * los estilos de la plantilla ESTILOS_10ED.docx.
 */
export function annotateActivityHtmlForWord(rawHtml = "", mode = "student") {
  if (!rawHtml) return "";
  if (typeof DOMParser === "undefined") {
    let annotated = String(rawHtml || "");
    annotated = annotated.replace(/<p\b([^>]*)>(\s*<strong\b[\s\S]*?<\/strong>[\s\S]*?)<\/p>/gi, '<p$1 data-word-style="020100INSTRUCCION">$2</p>');
    annotated = annotated.replace(/<li\b([^>]*)>/gi, '<li$1 data-word-style="020200TEXTONUMERADONIVEL1">');
    annotated = annotated.replace(/<p\b([^>]*class=["'][^"']*answer[^"']*["'][^>]*)>/gi, '<p$1 data-word-style="080400RESPUESTAALUMNO" data-word-char-style="ARESPUESTAALUMNO">');
    if (mode === "teacher" || mode === "teacher-notes" || mode === "maestro") {
      annotated = annotated.replace(/<p\b(?![^>]*data-word-style)/gi, '<p data-word-style="1002SPEC"');
    }
    return annotated;
  }

  const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild || doc.body;

  // 1. Quitar controles de interfaz o elementos decorativos que no van al Word
  root.querySelectorAll("button, input, textarea, select, .btn, .cb-hud-ghost, .icono-control").forEach((el) => el.remove());
  root.querySelectorAll("i.fa, i.fas, i.far, i.fab, svg").forEach((el) => el.remove());

  // 2. Normalizar insignias de modalidad pedagógica a texto limpio
  root.querySelectorAll(".cb-ic-badge, [class*='cb-ic-badge']").forEach((badge) => {
    const raw = String(badge.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) return badge.remove();
    const normalized = /^\[.*\]$/.test(raw) ? raw : `[${raw}]`;
    badge.replaceWith(document.createTextNode(` ${normalized}`));
  });

  // 3. Respuestas y soluciones del alumno (080400RESPUESTAALUMNO)
  root.querySelectorAll(".answer, .respuesta, .cb-teacher-resp, [class*='answer']").forEach((el) => {
    el.setAttribute("data-word-style", "080400RESPUESTAALUMNO");
    el.setAttribute("data-word-char-style", "ARESPUESTAALUMNO");
  });
  root.querySelectorAll("[style*='e6007e'], [style*='magenta'], [style*='mediumvioletred']").forEach((el) => {
    el.setAttribute("data-word-char-style", "ARESPUESTAALUMNO");
  });

  // 4. Instrucciones directas (020100INSTRUCCION)
  root.querySelectorAll(".cb-simple-instruction, blockquote, .instrucciones, .instructions").forEach((el) => {
    el.setAttribute("data-word-style", "020100INSTRUCCION");
  });

  root.querySelectorAll(".activity > p, p").forEach((p) => {
    if (p.getAttribute("data-word-style")) return;
    const text = (p.textContent || "").trim();
    const firstChild = p.firstElementChild;
    const hasStrongLead = firstChild && ["STRONG", "B"].includes(firstChild.tagName) && text.startsWith(firstChild.textContent.trim());
    if (hasStrongLead || /^(lee|escribe|observa|subraya|completa|relaciona|clasifica|calcula|responde|contesta|encuentra|marca|une|ordena|traza|dibuja|recorta|colorea)\b/i.test(text)) {
      p.setAttribute("data-word-style", "020100INSTRUCCION");
    }
  });

  // 5. Listas numeradas (020200TEXTONUMERADONIVEL1) y viñetas (020202TEXTOBULLET)
  root.querySelectorAll("ol > li").forEach((li) => {
    li.setAttribute("data-word-style", "020200TEXTONUMERADONIVEL1");
  });
  root.querySelectorAll("ul > li").forEach((li) => {
    li.setAttribute("data-word-style", "020202TEXTOBULLET");
  });

  // 6. Tablas (030000TABLASCUERPO, 030100TABLASTITULOCENTRADO)
  root.querySelectorAll("table th").forEach((th) => {
    th.setAttribute("data-word-style", "030100TABLASTITULOCENTRADO");
  });
  root.querySelectorAll("table td").forEach((td) => {
    td.setAttribute("data-word-style", "030000TABLASCUERPO");
  });

  // 7. Lecturas y pasajes en contraste
  root.querySelectorAll(".cb-reading-passage, .reading-narrative, .reading-text").forEach((block) => {
    block.querySelectorAll("p").forEach((p) => {
      p.setAttribute("data-word-style", "020001TEXTOLITERATURA");
    });
  });

  // 8. Modo maestro / notas del maestro (1002SPEC)
  if (mode === "teacher" || mode === "teacher-notes" || mode === "maestro") {
    root.querySelectorAll("p, li, div").forEach((el) => {
      if (!el.getAttribute("data-word-style") || el.getAttribute("data-word-style") === "020000TEXTO") {
        el.setAttribute("data-word-style", "1002SPEC");
      }
    });
  }

  return root.innerHTML;
}

/**
 * Construye el HTML completo de la unidad con toda la jerarquía editorial exacta:
 * Subtema (0103), Metadatos Curriculares (0104, 0802, 080502, 0801), Título de Actividad (0105),
 * Instrucciones (0201), Listas numeradas (0202), etc.
 */
export function buildWordDocumentHtml(session = {}, { documentKind = "student" } = {}) {
  const units = Array.isArray(session.units) && session.units.length > 0
    ? session.units
    : [{ accepted: session.accepted, meta: session.meta, title: session.title, id: session.activeUnitId }];

  const academic = session.academicMeta || session.meta || {};
  const isTeacher = documentKind === "teacher-notes" || documentKind === "maestro";

  let fullHtml = "";

  units.forEach((unit, unitIdx) => {
    const accepted = unit.accepted || {};
    const unitTitle = clean(unit.title || `Unidad ${unit.meta?.unit || unitIdx + 1}`);
    const unitNum = unit.meta?.unit || unitIdx + 1;
    const subtitle = clean([academic.level, academic.grade, academic.trimester ? `Trimestre ${academic.trimester}` : ""].filter(Boolean).join(" · "));

    fullHtml += `
      <h1 data-word-style="0100TITULO">${escapeHtmlText(unitTitle)}</h1>
      ${subtitle ? `<p data-word-style="0102SUBTITULO">${escapeHtmlText(subtitle)}</p>` : ""}
    `;

    // 1. Si es Alumno, incluir Lectura principal si existe
    if (!isTeacher && accepted.reading) {
      const r = accepted.reading;
      const readingTitle = clean(r.title || `Lectura Unidad ${unitNum}`);
      fullHtml += `
        <div class="bloque-lectura" style="margin-bottom: 24px;">
          <p data-word-style="0103SUBTITULONIVEL2"><strong>Lectura generadora:</strong> ${escapeHtmlText(readingTitle)}</p>
          <p data-word-style="0105TITULOSECCIONYCOMPETENCIA">${escapeHtmlText(readingTitle)}</p>
          ${r.narrativeHtml ? annotateActivityHtmlForWord(r.narrativeHtml, "student") : (r.html ? annotateActivityHtmlForWord(r.html, "student") : "")}
          ${r.synonymsHtml ? `<p data-word-style="0103SUBTITULONIVEL2"><strong>Tabla de sinónimos:</strong></p>${annotateActivityHtmlForWord(r.synonymsHtml, "student")}` : ""}
          ${r.questionsHtml ? `<p data-word-style="0103SUBTITULONIVEL2"><strong>Preguntas de comprensión:</strong></p>${annotateActivityHtmlForWord(r.questionsHtml, "student")}` : ""}
        </div>
        <hr>
      `;
    }

    // 2. Actividades del alumno
    if (!isTeacher) {
      (accepted.activities || []).forEach((act) => {
        const subtopic = clean(act.subtopic || act.section || "Actividad");
        const title = clean(act.title || subtopic);
        const skill = resolveActivityCognitiveSkill(act, { subtopic });
        const habilidad = skill?.fullName ? `${skill.fullName} (${skill.code})` : "Captación de Sistemas Simbólicos (CSM)";
        const campo = clean(act.category || unit.meta?.category || academic.category || "Lenguaje y comunicación");
        const eje = clean(unit.sya?.ejeArticulador || "Apropiación de las culturas a través de la lectura y la escritura");
        const comp = clean(unit.sya?.competencia || "");

        fullHtml += `
          <div class="bloque-subtema" data-subtopic="${escapeAttr(subtopic)}">
            <p data-word-style="0103SUBTITULONIVEL2"><strong>Subtema:</strong> ${escapeHtmlText(subtopic)}</p>
            <p data-word-style="0104CAMPOFORMATIVO"><strong>Campo formativo:</strong> ${escapeHtmlText(campo)}</p>
            <p data-word-style="0802EJEARTICULADOR"><strong>Eje articulador:</strong> ${escapeHtmlText(eje)}</p>
            <p data-word-style="080502HABILIDADES"><strong>Habilidad cognitiva:</strong> ${escapeHtmlText(habilidad)}</p>
            ${comp ? `<p data-word-style="0801COMPETENCIA"><strong>Competencia:</strong> ${escapeHtmlText(comp)}</p>` : ""}
            <p data-word-style="0105TITULOSECCIONYCOMPETENCIA">${escapeHtmlText(title)}</p>
            ${annotateActivityHtmlForWord(act.html || "", "student")}
          </div>
          <hr>
        `;
      });

      // Recursos complementarios vinculados
      (accepted.resources || []).forEach((res) => {
        const code = clean(res.code || res.title || "Recurso");
        const subtopic = clean(res.subtopic || "Recurso complementario");
        fullHtml += `
          <div class="bloque-recurso">
            <p data-word-style="0103SUBTITULONIVEL2"><strong>Subtema:</strong> ${escapeHtmlText(subtopic)}</p>
            <p data-word-style="0105TITULOSECCIONYCOMPETENCIA"><strong>${escapeHtmlText(code)}:</strong> ${escapeHtmlText(res.title || "")}</p>
            ${annotateActivityHtmlForWord(res.html || "", "student")}
          </div>
          <hr>
        `;
      });
    }

    // 3. Notas del Maestro
    if (isTeacher) {
      const allNotes = [
        ...(accepted.teacherNotes || []),
        ...(accepted.activities || []).flatMap((a) => (a.notes || []).map((n) => ({ ...n, subtopic: n.subtopic || a.subtopic }))),
        ...(accepted.resources || []).flatMap((r) => (r.notes || []).map((n) => ({ ...n, subtopic: n.subtopic || r.subtopic })))
      ];

      allNotes.forEach((note) => {
        const subtopic = clean(note.subtopic || note.category || "Orientaciones didácticas");
        const noteTitle = clean(note.title || `Notas del Maestro: ${subtopic}`);
        fullHtml += `
          <div class="bloque-nota-maestro">
            <p data-word-style="0103SUBTITULONIVEL2"><strong>Subtema:</strong> ${escapeHtmlText(subtopic)}</p>
            <p data-word-style="0105TITULOSECCIONYCOMPETENCIA"><strong>Orientaciones Docentes:</strong> ${escapeHtmlText(noteTitle)}</p>
            ${annotateActivityHtmlForWord(note.html || note.text || "", "teacher-notes")}
          </div>
          <hr>
        `;
      });
    }
  });

  return fullHtml.trim();
}

export async function downloadApprovedContent({ session = null, sessionId = "", format = "docx", documentKind = "student" } = {}) {
  const currentSession = session || (typeof window !== "undefined" ? window.__cbStore?.getState()?.session : null);

  // Exportación directa desde plantilla 10ED en el navegador para Word
  if (format === "docx" && currentSession && typeof window !== "undefined" && typeof downloadDocxFromTemplate === "function") {
    try {
      const baseName = buildClientExportBaseName(currentSession);
      const isTeacher = documentKind === "teacher-notes" || documentKind === "maestro";
      const filename = isTeacher ? `${baseName}_Notas_Maestro.docx` : `${baseName}_Alumno.docx`;
      const html = buildWordDocumentHtml(currentSession, { documentKind });
      const docTitle = isTeacher ? `${currentSession.title || "Unidad"} · Notas del Maestro` : `${currentSession.title || "Unidad Alumno"}`;

      await downloadDocxFromTemplate({
        html,
        title: docTitle,
        mode: isTeacher ? "maestro" : "alumno",
        templateUrl: "word-templates/ESTILOS_10ED.docx",
        filename
      });

      return filename;
    } catch (clientError) {
      console.warn("[charly-brown] Fallo exportación directa con plantilla, usando backend:", clientError);
    }
  }

  // Fallback backend
  const url = buildGeminiApiUrl("/api/charly-brown/export");
  if (!url) throw new Error("Backend de exportación no configurado.");
  const token = await getAuthToken();
  if (!token && typeof window !== "undefined") throw new Error("Inicia sesión para descargar el contenido.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId: sessionId || currentSession?.id, format, documentKind })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(String(data?.message || data?.error || `Exportación HTTP ${response.status}`));
    error.status = response.status;
    error.code = String(data?.error || "CHARLY_EXPORT_FAILED");
    throw error;
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `charly-brown-${documentKind === "teacher-notes" ? "notas-del-maestro" : "contenido"}.${format}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return filename;
}

export async function downloadApprovedFiles({ session = null, sessionId = "", format = "docx" } = {}) {
  const currentSession = session || (typeof window !== "undefined" ? window.__cbStore?.getState()?.session : null);
  const targetSessionId = sessionId || currentSession?.id;

  const contentFilename = await downloadApprovedContent({ session: currentSession, sessionId: targetSessionId, format, documentKind: "student" });
  let notesFilename = "";
  try {
    notesFilename = await downloadApprovedContent({ session: currentSession, sessionId: targetSessionId, format, documentKind: "teacher-notes" });
  } catch (error) {
    if (error?.code !== "NO_TEACHER_NOTES" && error?.status !== 409) throw error;
  }
  return { contentFilename, notesFilename };
}
