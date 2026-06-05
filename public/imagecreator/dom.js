export function getImageCreatorDom() {
  return {
    sessionList: document.getElementById("icSessionList"),
    sessionStatus: document.getElementById("icSessionStatus"),
    sessionSearchInput: document.getElementById("icSessionSearchInput"),
    newSessionBtn: document.getElementById("icNewSessionBtn"),
    activeSessionTitle: document.getElementById("icActiveSessionTitle"),
    userBadge: document.getElementById("icUserBadge"),
    archiveSessionBtn: document.getElementById("icArchiveSessionBtn"),
    deleteSessionBtn: document.getElementById("icDeleteSessionBtn"),
    toggleOptionsBtn: document.getElementById("icToggleOptionsBtn"),
    closeOptionsBtn: document.getElementById("icCloseOptionsBtn"),
    optionsPanel: document.getElementById("icOptionsPanel"),
    chatFeed: document.getElementById("icChatFeed"),
    modeSelect: document.getElementById("icModeSelect"),
    modelSelect: document.getElementById("icModelSelect"),
    aspectRatioSelect: document.getElementById("icAspectRatioSelect"),
    imageSizeSelect: document.getElementById("icImageSizeSelect"),
    downloadFormatSelect: document.getElementById("icDownloadFormatSelect"),
    countSelect: document.getElementById("icCountSelect"),
    optionsHint: document.getElementById("icOptionsHint"),
    promptInput: document.getElementById("icPromptInput"),
    attachBtn: document.getElementById("icAttachBtn"),
    attachmentInput: document.getElementById("icAttachmentInput"),
    attachmentTray: document.getElementById("icAttachmentTray"),
    composerError: document.getElementById("icComposerError"),
    composerMeta: document.getElementById("icComposerMeta"),
    sendBtn: document.getElementById("icSendBtn")
  };
}

export function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatRelativeDate(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "sin fecha";
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch (_) {
    return "sin fecha";
  }
}

export function autosizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
}
