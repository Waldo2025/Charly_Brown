import { escapeHtml, renderIssues, slugifyAnchorPart, buildPageAnchorScope } from "./analizar-pdf-results.js";

export function getRecortableAnchorId(page = {}, context = {}) {
  return `analizar-pdf-recortable-${buildPageAnchorScope(context)}-page-${slugifyAnchorPart(page.pageName || "x")}`;
}

export function renderRecortableMetaList(page = {}) {
  const summary = page?.recortableSummary || {};
  const issues = Array.isArray(page?.recortableIssues) ? page.recortableIssues : [];
  const originCodes = Array.isArray(summary.originCodes) ? summary.originCodes : [];
  const destinationCodes = Array.isArray(summary.destinationCodes) ? summary.destinationCodes : [];
  const resolved = Array.isArray(summary.resolvedDestinations) ? summary.resolvedDestinations : [];
  const resolvedLinks = Array.isArray(summary.resolvedLinks) ? summary.resolvedLinks : [];
  const statusBadge = issues.length
    ? `<span class="analizar-pdf-inline-badge is-error">Error</span>`
    : (originCodes.length || destinationCodes.length || resolved.length)
      ? `<span class="analizar-pdf-inline-badge is-ok">OK</span>`
      : "";
  const rows = [];

  if (resolvedLinks.length) {
    rows.push(...resolvedLinks.flatMap((item) => {
      const origins = Array.isArray(item?.origins) ? item.origins.filter(Boolean) : [];
      const originLabel = origins.length ? origins.map((folio) => `pág. ${folio}`).join(", ") : "pág. ?";
      return [
        `Origen ${item.code}: ${originLabel}`,
        `${item.code}: destino pág. ${item.destination || "?"}`,
      ];
    }));
  } else {
    if (originCodes.length) {
      rows.push(...originCodes.map((code) => `Origen ${code}: pág. ${page?.pageName || "?"}`));
    }
    if (destinationCodes.length) {
      rows.push(`Destino: ${destinationCodes.join(", ")}`);
    }
    if (resolved.length) {
      rows.push(...resolved.map((item) => `${item.code}: destino pág. ${item.destination}`));
    }
  }
  if (!rows.length && !issues.length && !summary.originIndicator) {
    return "";
  }
  return `
    <div class="analizar-pdf-meta-row is-stack">
      <span>Recortables / Fichas / Anexos / Videos ${statusBadge}</span>
      ${rows.length ? `
        <div class="analizar-pdf-page-body">
          ${rows.map((row) => `<p>${escapeHtml(row)}</p>`).join("")}
        </div>
      ` : ""}
      ${issues.length ? renderIssues(issues, "") : ""}
    </div>
  `;
}
