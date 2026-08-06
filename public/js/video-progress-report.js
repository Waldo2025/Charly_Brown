import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const REPORT_MODAL_ID = "videoProgressReportModal";
let xlsxLoaderPromise = null;

function text(value = "") {
  return String(value ?? "").trim();
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeFileName(value = "") {
  return text(value || "video")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "video";
}

function asDate(value = null) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value = null) {
  const date = asDate(value);
  if (!date) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function normalizeRows(session = null) {
  if (Array.isArray(session?.script?.rows)) return session.script.rows;
  if (Array.isArray(session?.rows)) return session.rows;
  return [];
}

function normalizeList(value = []) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => text(item))
      .filter(Boolean)
  ));
}

function resolveMapRecord(map = null, row = null, index = 0) {
  if (!map || typeof map !== "object") return null;
  const rowId = text(row?.id);
  const candidates = [
    rowId,
    `row_${index}`,
    `row_${index + 1}`,
    `scene_${index}`,
    `scene_${index + 1}`,
    String(index),
    String(index + 1)
  ].filter(Boolean);
  for (const key of candidates) {
    if (map[key]) return map[key];
  }
  return null;
}

function hasMedia(record = null) {
  if (!record) return false;
  if (typeof record === "string") return Boolean(text(record));
  return Boolean(
    text(record.url)
    || text(record.downloadUrl)
    || text(record.storagePath)
    || text(record.dataUrl)
    || record.status === "ready"
  );
}

function proposalKey(sceneId = "", proposal = "") {
  let hash = 2166136261;
  const source = `${text(sceneId)}::${text(proposal).toLowerCase()}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `proposal_${(hash >>> 0).toString(36)}`;
}

function ensureModal() {
  let modal = document.getElementById(REPORT_MODAL_ID);
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = REPORT_MODAL_ID;
  modal.className = "video-progress-report";
  modal.hidden = true;
  modal.innerHTML = `
    <button class="video-progress-report__backdrop" type="button" data-report-close aria-label="Cerrar reporte"></button>
    <section class="video-progress-report__card" role="dialog" aria-modal="true" aria-labelledby="videoProgressReportTitle">
      <header class="video-progress-report__head">
        <div>
          <p class="video-progress-report__eyebrow">Producción y revisión</p>
          <h2 id="videoProgressReportTitle">Reporte de avance</h2>
        </div>
        <div class="video-progress-report__actions">
          <button class="video-progress-report__button is-primary" type="button" data-report-export>
            <i class="fas fa-file-excel" aria-hidden="true"></i><span>Descargar Excel</span>
          </button>
          <button class="video-progress-report__button" type="button" data-report-close aria-label="Cerrar reporte">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      </header>
      <nav class="video-progress-report__tabs" aria-label="Secciones del reporte">
        <button class="video-progress-report__tab is-active" type="button" data-report-tab="scenes">Escenas y propuestas</button>
        <button class="video-progress-report__tab" type="button" data-report-tab="checklist">Checklist de cambios</button>
        <label class="video-progress-report__scene-filter" title="Mostrar únicamente escenas que recibieron propuestas">
          <input type="checkbox" data-report-scene-filter>
          <span>Solo escenas con propuestas</span>
          <span class="video-progress-report__scene-filter-count" data-report-scene-filter-count>0</span>
        </label>
      </nav>
      <div class="video-progress-report__body">
        <div class="video-progress-report__loading"><span>Cargando reporte actualizado...</span></div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-report-close]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.hidden = true;
      document.body.classList.remove("is-video-progress-report-open");
    });
  });
  modal.querySelectorAll("[data-report-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.reportTab;
      modal.querySelectorAll("[data-report-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
      modal.querySelectorAll("[data-report-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.reportPanel !== tab;
      });
    });
  });
  modal.querySelector("[data-report-scene-filter]")?.addEventListener("change", () => {
    applyReportSceneFilter(modal);
  });
  return modal;
}

function applyReportSceneFilter(modal) {
  const filter = modal?.querySelector("[data-report-scene-filter]");
  const rows = [...(modal?.querySelectorAll("[data-report-scene-row]") || [])];
  const onlyWithProposals = !!filter?.checked;
  let visibleCount = 0;
  rows.forEach((row) => {
    const hasProposals = row.dataset.reportSceneHasProposals === "true";
    const visible = !onlyWithProposals || hasProposals;
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  const count = modal?.querySelector("[data-report-scene-filter-count]");
  if (count) count.textContent = String(visibleCount);
}

async function resolveUser(db, uid = "") {
  const cleanUid = text(uid);
  if (!cleanUid) return { uid: "", name: "No disponible", email: "" };
  try {
    const snapshot = await getDoc(doc(db, "users", cleanUid));
    const data = snapshot.exists() ? snapshot.data() : {};
    const name = text(
      data.displayName
      || data.userName
      || data.nombre
      || `${text(data.firstName)} ${text(data.lastName)}`
    ) || text(data.email) || cleanUid;
    return { uid: cleanUid, name, email: text(data.email) };
  } catch (_) {
    return { uid: cleanUid, name: cleanUid, email: "" };
  }
}

async function loadAuditEvents(db, sessionId = "") {
  try {
    const snapshot = await getDocs(collection(db, "podcaster_sessions", sessionId, "audit_events"));
    return snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (asDate(a.occurredAt)?.getTime() || 0) - (asDate(b.occurredAt)?.getTime() || 0));
  } catch (error) {
    console.warn("[VideoReport] No se pudo cargar la auditoría:", error);
    return [];
  }
}

function buildReport({ session, owner, auditEvents }) {
  const rows = normalizeRows(session);
  const videoMap = session?.dialogueVideoMap || {};
  const audioMap = session?.dialogueAudioMap || {};
  const createdEventsByProposal = new Map();
  auditEvents.filter((event) => event.type === "proposal.created").forEach((event) => {
    createdEventsByProposal.set(text(event.proposalId), event);
  });

  const scenes = rows.map((row, index) => {
    const sceneId = text(row?.id) || `row_${index}`;
    const proposals = normalizeList([
      ...(Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals : []),
      row?.visualNotesProposal
    ]);
    const resolved = new Set(normalizeList(row?.visualNotesResolvedProposals));
    const sceneEvents = auditEvents.filter((event) => text(event.sceneId) === sceneId || Number(event.sceneIndex) === index + 1);
    const createdProposalEvents = sceneEvents.filter((event) => event.type === "proposal.created");
    const approvalEvents = sceneEvents.filter((event) => (
      event.type === "scene.approved" || event.type === "scene.approval_reopened"
    ));
    const latestApprovalEvent = approvalEvents.at(-1) || null;
    const storedApproval = row?.sceneApproval && typeof row.sceneApproval === "object"
      ? row.sceneApproval
      : {};
    const approved = storedApproval.approved === true
      || (!Object.prototype.hasOwnProperty.call(storedApproval, "approved")
        && latestApprovalEvent?.type === "scene.approved");
    const approvalReviewer = storedApproval.approvedBy || latestApprovalEvent?.reviewer || {};
    const approvedAt = approved
      ? (storedApproval.approvedAt || latestApprovalEvent?.occurredAt || null)
      : null;
    const proposalAuditMap = row?.visualNotesProposalAuditMap
      && typeof row.visualNotesProposalAuditMap === "object"
      ? row.visualNotesProposalAuditMap
      : {};
    const pendingCount = proposals.filter((proposal) => !resolved.has(proposal)).length;
    const video = resolveMapRecord(videoMap, row, index);
    const audio = resolveMapRecord(audioMap, row, index);
    const voiceRequired = Boolean(text(row?.voiceOverText || row?.text || row?.script));
    const videoReady = hasMedia(video);
    const audioReady = !voiceRequired || hasMedia(audio);
    const productionProgress = Math.round(((Number(videoReady) + Number(audioReady)) / 2) * 100);
    const proposalRecords = proposals.map((proposal) => {
      const id = proposalKey(sceneId, proposal);
      const createdEvent = createdEventsByProposal.get(id)
        || createdProposalEvents.find((event) => text(event.proposalText) === proposal)
        || null;
      const storedProposalAudit = proposalAuditMap[id]
        || Object.values(proposalAuditMap).find((entry) => text(entry?.proposalText) === proposal)
        || null;
      const reviewer = createdEvent?.reviewer || storedProposalAudit?.reviewer || {};
      const relatedEvents = sceneEvents.filter((event) => text(event.proposalId) === id || text(event.proposalText) === proposal);
      const latestEvent = relatedEvents.at(-1) || createdEvent;
      return {
        proposalId: id,
        sceneId,
        sceneIndex: index + 1,
        text: proposal,
        status: resolved.has(proposal) ? "Resuelta" : "Pendiente",
        reviewerName: text(reviewer?.name) || text(reviewer?.email) || text(reviewer?.uid) || "No disponible",
        reviewerEmail: text(reviewer?.email),
        reviewerUid: text(reviewer?.uid),
        createdAt: createdEvent?.occurredAt || storedProposalAudit?.occurredAt || null,
        lastEventAt: latestEvent?.occurredAt || createdEvent?.occurredAt || storedProposalAudit?.occurredAt || null
      };
    });
    const reviewerCounts = new Map();
    proposalRecords.forEach((proposal) => {
      if (proposal.reviewerName === "No disponible") return;
      reviewerCounts.set(proposal.reviewerName, (reviewerCounts.get(proposal.reviewerName) || 0) + 1);
    });
    const proposalDates = proposalRecords
      .map((proposal) => proposal.createdAt)
      .filter(Boolean);
    return {
      sceneId,
      sceneIndex: index + 1,
      title: text(row?.title || row?.speaker) || `Escena ${index + 1}`,
      script: text(row?.voiceOverText || row?.text || row?.script),
      createdAt: row?.createdAt || row?.sceneCreatedAt || null,
      creatorName: owner.name,
      creatorEmail: owner.email,
      videoReady,
      audioReady,
      productionProgress,
      proposalCount: proposals.length,
      pendingCount,
      resolvedCount: proposals.length - pendingCount,
      approved,
      approvedAt,
      approvedBy: text(approvalReviewer?.name) || text(approvalReviewer?.email),
      requiredChanges: proposals.length > 0,
      reviewers: Array.from(reviewerCounts.entries()).map(([name, count]) => ({ name, count })),
      firstReviewAt: createdProposalEvents[0]?.occurredAt || proposalDates[0] || null,
      lastReviewAt: sceneEvents.at(-1)?.occurredAt || proposalDates.at(-1) || null,
      lastReviewer: text(sceneEvents.at(-1)?.reviewer?.name)
        || text(sceneEvents.at(-1)?.reviewer?.email)
        || proposalRecords.at(-1)?.reviewerName
        || "No disponible",
      proposals: proposalRecords
    };
  });

  const proposals = scenes.flatMap((scene) => scene.proposals);
  const reviewerMap = new Map();
  proposals.forEach((proposal) => {
    if (proposal.reviewerName === "No disponible") return;
    reviewerMap.set(proposal.reviewerName, (reviewerMap.get(proposal.reviewerName) || 0) + 1);
  });
  const productionProgress = scenes.length
    ? Math.round(scenes.reduce((sum, scene) => sum + scene.productionProgress, 0) / scenes.length)
    : 0;
  const reviewProgress = proposals.length
    ? Math.round((proposals.filter((proposal) => proposal.status === "Resuelta").length / proposals.length) * 100)
    : 100;
  const approvedSceneCount = scenes.filter((scene) => scene.approved).length;
  const pendingApprovalCount = Math.max(0, scenes.length - approvedSceneCount);
  const scenesRequiringChanges = scenes.filter((scene) => scene.requiredChanges).length;

  return {
    generatedAt: new Date().toISOString(),
    sessionId: text(session?.id),
    title: text(session?.title) || "Video sin título",
    owner,
    scenes,
    proposals,
    auditEvents,
    reviewers: Array.from(reviewerMap.entries()).map(([name, count]) => ({ name, count })),
    productionProgress,
    reviewProgress,
    approvedSceneCount,
    pendingApprovalCount,
    scenesRequiringChanges
  };
}

function status(value, ready = false) {
  return `<span class="video-progress-report__status ${ready ? "is-ready" : "is-pending"}">${escapeHtml(value)}</span>`;
}

function reportTable(headers = [], rows = []) {
  return `
    <div class="video-progress-report__table-wrap">
      <table class="video-progress-report__table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="${headers.length}">No hay información disponible.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderReport(modal, report) {
  modal.querySelector("#videoProgressReportTitle").textContent = report.title;
  const sceneCards = report.scenes.map((scene) => {
    const proposals = scene.proposals.map((proposal) => `
      <tr>
        <td class="video-progress-report__change-text">${escapeHtml(proposal.text)}</td>
        <td>${status(proposal.status, proposal.status === "Resuelta")}</td>
        <td>${escapeHtml(proposal.reviewerName)}</td>
        <td>${escapeHtml(proposal.reviewerEmail || "—")}</td>
        <td>${escapeHtml(formatDate(proposal.createdAt))}</td>
        <td>${escapeHtml(formatDate(proposal.lastEventAt))}</td>
      </tr>
    `);
    return `
      <article class="video-progress-report__scene-card"
        data-report-scene-row data-report-scene-has-proposals="${scene.proposalCount > 0}">
        <header class="video-progress-report__scene-head">
          <div>
            <p class="video-progress-report__scene-number">Escena ${scene.sceneIndex}</p>
            <h3>${escapeHtml(scene.title)}</h3>
          </div>
          <div class="video-progress-report__scene-meta">
            <div class="video-progress-report__scene-stats">
              <span>${scene.proposalCount} propuesta${scene.proposalCount === 1 ? "" : "s"}</span>
              <span>${scene.pendingCount} pendiente${scene.pendingCount === 1 ? "" : "s"}</span>
              <span>${scene.resolvedCount} resuelta${scene.resolvedCount === 1 ? "" : "s"}</span>
            </div>
            ${status(scene.approved ? "Aprobada" : "Pendiente de aprobación", scene.approved)}
          </div>
        </header>
        ${proposals.length
          ? reportTable(
              ["Cambio solicitado", "Estado", "Revisor", "Correo", "Fecha", "Última actualización"],
              proposals
            )
          : '<div class="video-progress-report__empty">Esta escena no recibió propuestas de cambio.</div>'}
      </article>
    `;
  }).join("");
  const checklistRows = report.proposals.map((proposal) => {
    const scene = report.scenes.find((item) => item.sceneIndex === proposal.sceneIndex);
    const complete = proposal.status === "Resuelta";
    return `
    <tr>
      <td><span class="video-progress-report__check ${complete ? "is-complete" : ""}">${complete ? "✓" : ""}</span></td>
      <td>${escapeHtml(report.title)}</td>
      <td>Escena ${proposal.sceneIndex}</td>
      <td>${escapeHtml(scene?.title || `Escena ${proposal.sceneIndex}`)}</td>
      <td class="video-progress-report__change-text">${escapeHtml(proposal.text)}</td>
      <td>${status(proposal.status, proposal.status === "Resuelta")}</td>
      <td>${escapeHtml(proposal.reviewerName)}</td>
      <td>${escapeHtml(formatDate(proposal.createdAt))}</td>
    </tr>
  `;
  });
  modal.querySelector(".video-progress-report__body").innerHTML = `
    <section data-report-panel="scenes">
      <div class="video-progress-report__overview">
        <div><span>Escenas</span><strong>${report.scenes.length}</strong></div>
        <div><span>Propuestas</span><strong>${report.proposals.length}</strong></div>
        <div><span>Aprobadas</span><strong>${report.approvedSceneCount}/${report.scenes.length}</strong></div>
        <div><span>Cambios pendientes</span><strong>${report.proposals.filter((item) => item.status !== "Resuelta").length}</strong></div>
      </div>
      <div class="video-progress-report__scene-list">${sceneCards}</div>
    </section>
    <section data-report-panel="checklist" hidden>
      ${reportTable(
        ["Hecho", "Documento / video", "Escena", "Contenido de la escena", "Cambio que debe realizarse", "Estado", "Solicitado por", "Fecha"],
        checklistRows
      )}
    </section>
  `;
  applyReportSceneFilter(modal);
}

function ensureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoaderPromise) return xlsxLoaderPromise;
  xlsxLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/xlsx/xlsx.full.min.js";
    script.async = true;
    script.dataset.role = "video-progress-xlsx";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("No se pudo cargar el exportador de Excel."));
    document.head.appendChild(script);
  });
  return xlsxLoaderPromise;
}

function applyEditorialSheetStyle(sheet, columnCount, rowCount, widths = []) {
  sheet["!cols"] = widths.map((width) => ({ wch: width }));
  sheet["!autofilter"] = { ref: `A2:${String.fromCharCode(64 + Math.min(columnCount, 26))}${rowCount}` };
  sheet["!freeze"] = { xSplit: 0, ySplit: 2 };
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 24 }];
  for (let row = 1; row <= rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const address = window.XLSX.utils.encode_cell({ r: row - 1, c: column });
      const cell = sheet[address];
      if (!cell) continue;
      cell.s = row === 1
        ? {
            font: { bold: true, color: { rgb: "FFFFFFFF" } },
            fill: { patternType: "solid", fgColor: { rgb: "FF16233A" } },
            alignment: { vertical: "center", wrapText: true }
          }
        : row === 2
          ? {
              font: { bold: true, color: { rgb: "FFFFFFFF" } },
              fill: { patternType: "solid", fgColor: { rgb: "FF2563EB" } },
              alignment: { vertical: "center", wrapText: true }
            }
          : {
              fill: row % 2 === 0 ? { patternType: "solid", fgColor: { rgb: "FFF1F5F9" } } : undefined,
              alignment: { vertical: "top", wrapText: true }
            };
    }
  }
}

async function exportReport(report) {
  const XLSX = await ensureXlsx();
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `Reporte de propuestas y checklist - ${report.title}`,
    Subject: "Control editorial de cambios por escena",
    Author: report.owner.name,
    CreatedDate: new Date()
  };

  const sceneProposalRows = [
    ["CONTROL EDITORIAL POR ESCENA", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Documento / video", "Escena", "Contenido", "Aprobación", "Aprobada por", "Fecha aprobación", "Video", "Voz en off", "Total propuestas", "Cambio solicitado", "Estado del cambio", "Revisor", "Correo", "Fecha propuesta", "Última actualización", "Creador"],
    ...report.scenes.flatMap((scene) => {
      const base = [
        report.title,
        `Escena ${scene.sceneIndex}`,
        scene.title,
        scene.approved ? "Aprobada" : "Pendiente",
        scene.approvedBy || "No disponible",
        scene.approved ? formatDate(scene.approvedAt) : "",
        scene.videoReady ? "Listo" : "Pendiente",
        scene.audioReady ? "Lista" : "Pendiente",
        scene.proposalCount
      ];
      if (!scene.proposals.length) {
        return [[...base, "Sin propuestas", "—", "—", "—", "—", "—", scene.creatorName]];
      }
      return scene.proposals.map((proposal) => [
        ...base,
        proposal.text,
        proposal.status,
        proposal.reviewerName,
        proposal.reviewerEmail || "No disponible",
        formatDate(proposal.createdAt),
        formatDate(proposal.lastEventAt),
        scene.creatorName
      ]);
    })
  ];
  const sceneProposalSheet = XLSX.utils.aoa_to_sheet(sceneProposalRows);
  sceneProposalSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }];
  applyEditorialSheetStyle(
    sceneProposalSheet,
    16,
    sceneProposalRows.length,
    [28, 12, 28, 16, 24, 22, 12, 14, 14, 62, 18, 24, 28, 23, 23, 24]
  );
  sceneProposalSheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  XLSX.utils.book_append_sheet(workbook, sceneProposalSheet, "Escenas y propuestas");

  const checklistRows = [
    ["CHECKLIST EDITORIAL DE CAMBIOS", "", "", "", "", "", "", "", ""],
    ["Checklist", "Documento / video", "Escena", "Contenido de la escena", "Cambio que debe realizarse", "Estado", "Solicitado por", "Fecha", "Última actualización"],
    ...report.proposals.map((proposal) => {
      const scene = report.scenes.find((item) => item.sceneIndex === proposal.sceneIndex);
      return [
        proposal.status === "Resuelta" ? "☑" : "☐",
        report.title,
        `Escena ${proposal.sceneIndex}`,
        scene?.title || `Escena ${proposal.sceneIndex}`,
        proposal.text,
        proposal.status,
        proposal.reviewerName,
        formatDate(proposal.createdAt),
        formatDate(proposal.lastEventAt)
      ];
    })
  ];
  const checklistSheet = XLSX.utils.aoa_to_sheet(checklistRows);
  checklistSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  applyEditorialSheetStyle(
    checklistSheet,
    9,
    checklistRows.length,
    [11, 30, 12, 30, 68, 18, 25, 23, 23]
  );
  checklistSheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  XLSX.utils.book_append_sheet(workbook, checklistSheet, "Checklist de cambios");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${safeFileName(report.title)}-control-editorial-${date}.xlsx`, {
    compression: true,
    cellStyles: true
  });
}

export async function openVideoProgressReport({ db, auth, session }) {
  if (!db || !auth?.currentUser || !session?.id) {
    throw new Error("Se requiere una sesión y un usuario autenticado para generar el reporte.");
  }
  const modal = ensureModal();
  modal.hidden = false;
  document.body.classList.add("is-video-progress-report-open");
  modal.querySelector(".video-progress-report__body").innerHTML =
    '<div class="video-progress-report__loading"><span>Cargando reporte actualizado...</span></div>';

  const sessionSnapshot = await getDoc(doc(db, "podcaster_sessions", session.id));
  if (!sessionSnapshot.exists()) throw new Error("La sesión ya no está disponible.");
  const documentData = sessionSnapshot.data() || {};
  const freshSession = { ...session, ...(documentData.session || documentData), id: session.id };
  const owner = await resolveUser(db, text(documentData.ownerId));
  const auditEvents = await loadAuditEvents(db, session.id);
  const report = buildReport({ session: freshSession, owner, auditEvents });
  renderReport(modal, report);

  const exportButton = modal.querySelector("[data-report-export]");
  exportButton.onclick = async () => {
    const original = exportButton.innerHTML;
    try {
      exportButton.disabled = true;
      exportButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Preparando Excel</span>';
      await exportReport(report);
    } finally {
      exportButton.disabled = false;
      exportButton.innerHTML = original;
    }
  };
  return report;
}
