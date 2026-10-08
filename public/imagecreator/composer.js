export function convertClipboardToTableData(clipboardData) {
  if (!clipboardData) return null;

  // 1. Probar tabla HTML (estándar desde Excel, Google Sheets o páginas web)
  try {
    const html = clipboardData.getData("text/html");
    if (html && /<table/i.test(html)) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const table = doc.querySelector("table");
      if (table) {
        const rows = Array.from(table.querySelectorAll("tr"));
        const matrix = rows.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("th, td"));
          return cells.map((td) => (td.innerText || "").trim().replace(/[\r\n\t]+/g, " "));
        }).filter((row) => row.length > 0 && row.some((c) => c !== ""));

        if (matrix.length > 0) {
          const headers = matrix[0];
          const dataRows = matrix.slice(1);
          return {
            id: `tbl-${Date.now()}`,
            headers,
            rowCount: dataRows.length,
            colCount: Math.max(...matrix.map((r) => r.length)),
            matrix,
            preview: headers.slice(0, 3).join(", ")
          };
        }
      }
    }
  } catch (_) {}

  // 2. Probar texto plano TSV (valores separados por tabulaciones de Excel)
  try {
    const text = clipboardData.getData("text/plain");
    if (text && text.includes("\t")) {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length >= 1) {
        const matrix = lines.map((line) => line.split("\t").map((c) => c.trim().replace(/[\r\n]+/g, " ")));
        const maxCols = Math.max(...matrix.map((r) => r.length));
        if (maxCols >= 2 || (lines.length >= 2 && maxCols >= 1)) {
          const headers = matrix[0];
          const dataRows = matrix.slice(1);
          return {
            id: `tbl-${Date.now()}`,
            headers,
            rowCount: dataRows.length,
            colCount: maxCols,
            matrix,
            preview: headers.slice(0, 3).join(", ")
          };
        }
      }
    }
  } catch (_) {}

  return null;
}

export function formatMatrixAsMarkdownTable(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return "";
  const numCols = Math.max(...matrix.map((r) => r.length));
  if (numCols < 1) return "";

  const normalized = matrix.map((row) => {
    const copy = [...row];
    while (copy.length < numCols) copy.push("");
    return copy.map((cell) => cell.replace(/\|/g, "\\|"));
  });

  const colWidths = Array(numCols).fill(3);
  normalized.forEach((row) => {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  });

  const header = normalized[0];
  const headerLine = "| " + header.map((c, i) => c.padEnd(colWidths[i], " ")).join(" | ") + " |";
  const separatorLine = "| " + colWidths.map((w) => "-".repeat(Math.max(3, w))).join(" | ") + " |";

  const dataRows = normalized.slice(1).map((row) =>
    "| " + row.map((c, i) => c.padEnd(colWidths[i], " ")).join(" | ") + " |"
  );

  return [headerLine, separatorLine, ...dataRows].join("\n");
}

export const MODE_CAPSULE_METADATA = Object.freeze({
  generate: { label: "Crear", icon: "fa-wand-magic-sparkles", color: "#f59e0b" },
  edit: { label: "Editar", icon: "fa-paintbrush", color: "#ec4899" },
  compose: { label: "Componer", icon: "fa-layer-group", color: "#3b82f6" },
  variation: { label: "Variar", icon: "fa-shuffle", color: "#10b981" },
  video_script: { label: "Guion de Video", icon: "fa-clapperboard", color: "#a855f7" }
});

export function renderComposerCapsules(elements, options = {}, tableData = null, callbacks = {}) {
  const container = elements.composerCapsules || document.getElementById("icComposerCapsules");
  if (!container) return;
  const currentMode = options?.mode || "generate";
  const modeMeta = MODE_CAPSULE_METADATA[currentMode] || MODE_CAPSULE_METADATA.generate;
  const hasTable = Boolean(tableData && tableData.matrix);

  container.classList.remove("hidden");
  let html = `
    <div class="ic-composer-capsule ic-composer-mode-capsule" data-capsule-mode="${currentMode}" style="--capsule-color: ${modeMeta.color};">
      <i class="fa-solid ${modeMeta.icon}" style="color: ${modeMeta.color} !important;"></i>
      <span>${modeMeta.label}</span>
      ${currentMode !== "generate" ? `
        <button type="button" class="ic-capsule-remove" data-capsule-action="remove-mode" aria-label="Volver a Crear" title="Volver a modo Crear">
          <i class="fa-solid fa-xmark"></i>
        </button>
      ` : ""}
    </div>
  `;

  if (hasTable) {
    html += `
      <div class="ic-composer-capsule ic-composer-table-capsule" data-capsule-table="${tableData.id || ""}">
        <i class="fa-solid fa-table"></i>
        <span>Tabla Excel (${tableData.rowCount || tableData.matrix.length - 1} filas × ${tableData.colCount || tableData.matrix[0]?.length || 0} cols)</span>
        <button type="button" class="ic-capsule-remove" data-capsule-action="remove-table" aria-label="Quitar tabla" title="Quitar tabla adjunta">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll("[data-capsule-action]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = btn.dataset.capsuleAction;
      if (action === "remove-mode") callbacks.onRemoveMode?.();
      if (action === "remove-table") callbacks.onRemoveTable?.();
    });
  });
}

export function syncComposerModeMenu(elements, mode = "generate") {
  const menu = elements.composerModeMenu || document.getElementById("icComposerModeMenu");
  if (!menu) return;
  menu.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

export function bindComposer(elements, handlers = {}) {
  if (elements.promptInput) {
    elements.promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handlers.onSubmit?.();
      }
    });

    elements.promptInput.addEventListener("paste", (event) => {
      const tableData = convertClipboardToTableData(event.clipboardData);
      if (tableData) {
        event.preventDefault();
        handlers.onTableAttached?.(tableData);
      }
    });
  }

  if (elements.composerModeBtn && elements.composerModeMenu) {
    const menu = elements.composerModeMenu;
    const btn = elements.composerModeBtn;

    const toggleMenu = (open) => {
      const shouldOpen = open !== undefined ? open : menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !shouldOpen);
      btn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      btn.classList.toggle("is-active", shouldOpen);
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    menu.querySelectorAll("[data-mode]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const mode = item.dataset.mode;
        toggleMenu(false);
        handlers.onModeSelected?.(mode);
      });
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        toggleMenu(false);
      }
    });
  }

  elements.attachBtn?.addEventListener("click", () => elements.attachmentInput?.click());
  elements.attachmentInput?.addEventListener("change", (event) => handlers.onFilesSelected?.(event.target.files));
  elements.sendBtn?.addEventListener("click", () => handlers.onSubmit?.());

  elements.clearPromptBtn?.addEventListener("click", () => {
    clearComposer(elements);
    handlers.onClear?.();
    elements.promptInput?.focus();
  });

  elements.videoScriptBtn?.addEventListener("click", () => {
    handlers.onVideoScript?.();
  });

  elements.composerExpandBtn?.addEventListener("click", () => {
    if (!elements.promptInput) return;
    const isExpanded = elements.promptInput.classList.toggle("is-expanded");
    elements.promptInput.style.minHeight = isExpanded ? "140px" : "48px";
    elements.promptInput.focus();
  });
}

export function setComposerDisabled(elements, disabled = false) {
  if (elements.promptInput) elements.promptInput.disabled = disabled;
  if (elements.attachBtn) elements.attachBtn.disabled = disabled;
  if (elements.videoScriptBtn) elements.videoScriptBtn.disabled = disabled;
  if (elements.clearPromptBtn) elements.clearPromptBtn.disabled = disabled;
  if (elements.sendBtn) elements.sendBtn.disabled = disabled;
  if (elements.attachmentInput) elements.attachmentInput.disabled = disabled;
}

export function clearComposer(elements) {
  if (elements.promptInput) {
    elements.promptInput.value = "";
    elements.promptInput.style.removeProperty("height");
    elements.promptInput.style.removeProperty("min-height");
    elements.promptInput.classList.remove("is-expanded");
  }
  if (elements.attachmentInput) elements.attachmentInput.value = "";
}
