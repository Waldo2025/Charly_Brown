export function createPodcasterPromptComposerApi(deps = {}) {
  const {
    els,
    escapeHtml,
    parseHtmlTableToRows,
    parsePlainTextTableToRows,
    buildHtmlTableFromRows
  } = deps;

  function updateLayoutOffset() {
    if (!els.chatStage) return;
    const composer = els.composerShell;
    const isCollapsed = composer?.classList.contains("is-collapsed") === true;
    const composerHeight = composer && !isCollapsed
      ? Math.ceil(composer.getBoundingClientRect().height || composer.offsetHeight || 0)
      : 0;
    els.chatStage.style.setProperty("--chat-composer-offset", `${Math.max(0, composerHeight)}px`);
  }

  function autoResize() {
    if (!els.promptInput) return;
    const node = els.promptInput;
    node.style.height = "0px";
    const nextHeight = Math.min(node.scrollHeight, 180);
    node.style.height = `${Math.max(34, nextHeight)}px`;
    node.style.overflowY = node.scrollHeight > 180 ? "auto" : "hidden";
    updateLayoutOffset();
  }

  function normalizeClipboardText(text = "") {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
  }

  function getPlainText() {
    if (!els.promptInput) return "";
    if (typeof els.promptInput.value === "string") {
      return normalizeClipboardText(els.promptInput.value).trim();
    }
    return normalizeClipboardText(els.promptInput.innerText || els.promptInput.textContent || "").trim();
  }

  function getHtml() {
    if (!els.promptInput) return "";
    if (typeof els.promptInput.value === "string") {
      return escapeHtml(els.promptInput.value).replace(/\n/g, "<br>");
    }
    return String(els.promptInput.innerHTML || "")
      .replace(/^(?:\s|<br\s*\/?>|&nbsp;)+$/i, "")
      .trim();
  }

  function setContent(content = "", options = {}) {
    if (!els.promptInput) return;
    const text = String(content || "");
    const html = String(options?.html || "").trim();
    if (typeof els.promptInput.value === "string") {
      els.promptInput.value = text;
      return;
    }
    if (html) {
      els.promptInput.innerHTML = html;
      return;
    }
    els.promptInput.textContent = text;
  }

  function insertText(text = "") {
    if (!els.promptInput) return;
    const normalized = String(text || "");
    const input = els.promptInput;
    if (typeof input.value === "string") {
      const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : input.value.length;
      if (typeof input.setRangeText === "function") {
        input.setRangeText(normalized, start, end, "end");
      } else {
        input.value = `${input.value.slice(0, start)}${normalized}${input.value.slice(end)}`;
        const caret = start + normalized.length;
        input.selectionStart = caret;
        input.selectionEnd = caret;
      }
      return;
    }
    input.focus();
    try {
      document.execCommand("insertText", false, normalized);
    } catch (_) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) {
        input.textContent = `${input.textContent || ""}${normalized}`;
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(normalized));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function insertHtml(html = "") {
    if (!els.promptInput) return;
    const normalized = String(html || "").trim();
    if (!normalized) return;
    if (typeof els.promptInput.value === "string") {
      insertText(normalized.replace(/<[^>]+>/g, " "));
      return;
    }
    els.promptInput.focus();
    try {
      document.execCommand("insertHTML", false, normalized);
    } catch (_) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) {
        els.promptInput.innerHTML += normalized;
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(normalized);
      range.insertNode(fragment);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function handlePaste(event) {
    if (!els.promptInput) return;
    const clipboardData = event?.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const html = clipboardData.getData("text/html");
    const plainText = clipboardData.getData("text/plain")
      || clipboardData.getData("text")
      || clipboardData.getData("Text")
      || "";
    if (/<(?:table|thead|tbody|tr|td|th)\b/i.test(html || "")) {
      window.setTimeout(autoResize, 0);
      return;
    }
    const htmlRows = parseHtmlTableToRows(html);
    const plainRows = parsePlainTextTableToRows(plainText);
    const rows = htmlRows.length ? htmlRows : plainRows;
    if (!rows.length) return;
    const htmlTable = buildHtmlTableFromRows(rows);
    if (!htmlTable) return;
    event.preventDefault();
    insertHtml(htmlTable);
    autoResize();
  }

  return {
    autoResize,
    updateLayoutOffset,
    getPlainText,
    getHtml,
    setContent,
    insertText,
    insertHtml,
    handlePaste
  };
}
