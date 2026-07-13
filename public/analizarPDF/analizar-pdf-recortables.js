import { escapeHtml, renderIssues, slugifyAnchorPart, buildPageAnchorScope } from "./analizar-pdf-results.js";

export function getRecortableAnchorId(page = {}, context = {}) {
  return `analizar-pdf-recortable-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

export function renderRecortableMetaList(page = {}, options = {}) {
  const summary = page?.recortableSummary || {};
  const issues = Array.isArray(page?.recortableIssues) ? page.recortableIssues : [];
  const originCodes = Array.isArray(summary.originCodes) ? summary.originCodes : [];
  const destinationCodes = Array.isArray(summary.destinationCodes) ? summary.destinationCodes : [];
  const pending = Array.isArray(summary.pendingDestinations) ? summary.pendingDestinations : [];
  const resolved = Array.isArray(summary.resolvedDestinations) ? summary.resolvedDestinations : [];
  const resolvedLinks = Array.isArray(summary.resolvedLinks) ? summary.resolvedLinks : [];
  const hasPending = pending.length || issues.some((item) => String(item?.severity || "").trim().toLowerCase() === "pending");
  const hasErrors = issues.some((item) => String(item?.severity || "").trim().toLowerCase() === "error");
  const statusBadge = hasErrors
    ? `<span class="analizar-pdf-inline-badge is-error">Error</span>`
    : hasPending
      ? `<span class="analizar-pdf-inline-badge is-warning">Pendiente</span>`
    : (originCodes.length || destinationCodes.length || resolved.length)
      ? `<span class="analizar-pdf-inline-badge is-ok">OK</span>`
      : "";
  const rows = [];

  const renderMatchBadge = (status = "") => {
    const cleanStatus = String(status || "").trim().toLowerCase();
    if (cleanStatus === "match") {
      return `<span class="analizar-pdf-inline-badge is-ok">Coincide</span>`;
    }
    if (cleanStatus === "mismatch") {
      return `<span class="analizar-pdf-inline-badge is-error">No coincide</span>`;
    }
    if (cleanStatus === "pending") {
      return `<span class="analizar-pdf-inline-badge is-warning">Sin origen</span>`;
    }
    return "";
  };

  const seenRows = new Set();
  const pushRow = (row) => {
    const text = typeof row === "string" ? row : String(row?.text || "");
    const key = text.trim().toLowerCase();
    if (!key || seenRows.has(key)) return;
    seenRows.add(key);
    rows.push(row);
  };

  if (resolvedLinks.length) {
    resolvedLinks.forEach((item) => {
      const origins = Array.isArray(item?.origins) ? item.origins.filter(Boolean) : [];
      const originLabel = origins.length ? origins.map((folio) => `pág. ${folio}`).join(", ") : "pág. ?";
      const destinationLabel = String(item?.destination || "?").trim();
      const matchBadge = renderMatchBadge(item?.status);
      const isDestinationRole = item?.role === "destination";
      pushRow({
        badge: matchBadge,
        text: isDestinationRole
          ? `${item.code}: ${item?.status === "match" ? "origen encontrado" : "origen pendiente"} · destino detectado`
          : `Origen ${item.code}: ${originLabel} · destino ${destinationLabel}`,
      });
    });
  }
  if (originCodes.length) {
    originCodes.forEach((code) => pushRow(`Origen ${code}: pág. ${page?.pageName || "?"}`));
  }
  if (destinationCodes.length) {
    destinationCodes.forEach((code) => pushRow(`Destino ${code}: pág. ${page?.pageName || "?"}`));
  }
  if (pending.length) {
    pending.forEach((item) => pushRow(`${item.code || "Recortable"}: destino ${item.destinationLabel || "pendiente"}`));
  }
  if (resolved.length) {
    resolved.forEach((item) => pushRow(`${item.code}: destino pág. ${item.destination}`));
  }
  if (!rows.length && !issues.length && !summary.originIndicator) {
    return "";
  }
  const title = String(options?.title || "Recortables / Fichas / Anexos / Videos").trim() || "Recortables / Fichas / Anexos / Videos";
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>${escapeHtml(title)} ${statusBadge}</span>
      ${rows.length ? `
        <div class="analizar-pdf-page-body">
          ${rows.map((row) => {
            if (typeof row === "string") {
              return `<p>${escapeHtml(row)}</p>`;
            }
            return `<p>${row.badge || ""} ${escapeHtml(row.text || "")}</p>`;
          }).join("")}
        </div>
      ` : ""}
      ${issues.length ? renderIssues(issues, "") : ""}
    </div>
  `;
}
