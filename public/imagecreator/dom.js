export function getImageCreatorDom() {
  return {
    panelsGrid: document.querySelector(".ic-panels-grid"),
    sessionList: document.getElementById("icSessionList"),
    sessionRail: document.getElementById("icSessionRail"),
    sessionStatus: document.getElementById("icSessionStatus"),
    sessionSearchInput: document.getElementById("icSessionSearchInput"),
    newSessionBtn: document.getElementById("icNewSessionBtn"),
    activeSessionTitle: document.getElementById("icActiveSessionTitle"),
    userBadge: document.getElementById("icUserBadge"),
    toggleChatBtn: document.getElementById("icToggleChatBtn"),
    toolsPanel: document.getElementById("icToolsPanel"),
    toolsResizer: document.getElementById("icToolsResizer"),
    toggleOptionsBtn: document.getElementById("icToggleOptionsBtn"),
    closeOptionsBtn: document.getElementById("icCloseOptionsBtn"),
    optionsModal: document.getElementById("icOptionsModal"),
    optionsPanel: document.getElementById("icOptionsPanel"),
    imageViewer: document.getElementById("icImageViewer"),
    imageViewerImage: document.getElementById("icImageViewerImage"),
    imageViewerOriginalImage: document.getElementById("icImageViewerOriginalImage"),
    imageViewerProposedImage: document.getElementById("icImageViewerProposedImage"),
    imageViewerComparison: document.getElementById("icImageViewerComparison"),
    imageViewerReviewBar: document.getElementById("icImageViewerReviewBar"),
    imageViewerCompareLabel: document.getElementById("icImageViewerCompareLabel"),
    imageViewerMeta: document.getElementById("icImageViewerMeta"),
    imageViewerMetaRight: document.getElementById("icImageViewerMetaRight"),
    imageViewerMenu: document.getElementById("icImageViewerMenu"),
    imageViewerMenuTrigger: document.getElementById("icImageViewerMenuTrigger"),
    imageViewerAnnotateBtn: document.getElementById("icImageViewerAnnotateBtn"),
    imageViewerAcceptRevisionBtn: document.getElementById("icImageViewerAcceptRevisionBtn"),
    imageViewerContinueRevisionBtn: document.getElementById("icImageViewerContinueRevisionBtn"),
    imageViewerRejectRevisionBtn: document.getElementById("icImageViewerRejectRevisionBtn"),
    imageViewerCloseButtons: Array.from(document.querySelectorAll("[data-image-viewer-close]")),
    imageInfoModal: document.getElementById("icImageInfoModal"),
    imageInfoModel: document.getElementById("icImageInfoModel"),
    imageInfoFormat: document.getElementById("icImageInfoFormat"),
    imageInfoDimensions: document.getElementById("icImageInfoDimensions"),
    imageInfoCreated: document.getElementById("icImageInfoCreated"),
    imageInfoCloseButtons: Array.from(document.querySelectorAll("[data-image-info-close]")),
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
    sendBtn: document.getElementById("icSendBtn"),
    regionEditor: document.getElementById("icRegionEditor"),
    regionCanvas: document.getElementById("icRegionCanvas"),
    regionInstruction: document.getElementById("icRegionInstruction"),
    regionPromptPanel: document.getElementById("icRegionPromptPanel"),
    regionTextFields: document.getElementById("icRegionTextFields"),
    regionCurrentText: document.getElementById("icRegionCurrentText"),
    regionNewText: document.getElementById("icRegionNewText"),
    regionFontStyle: document.getElementById("icRegionFontStyle"),
    regionTextColor: document.getElementById("icRegionTextColor"),
    regionTextModeInputs: Array.from(document.querySelectorAll('input[name="icTextRenderMode"]')),
    regionStatus: document.getElementById("icRegionStatus"),
    regionApplyBtn: document.getElementById("icRegionApplyBtn"),
    regionUndoBtn: document.getElementById("icRegionUndoBtn"),
    regionClearBtn: document.getElementById("icRegionClearBtn"),
    regionToolButtons: Array.from(document.querySelectorAll("[data-region-tool]")),
    regionCloseButtons: Array.from(document.querySelectorAll("[data-region-close]")),
    mobileSessionsBtn: document.getElementById("icMobileSessionsBtn"),
    mobileBackdrop: document.getElementById("icMobileBackdrop"),
    resizers: Array.from(document.querySelectorAll("[data-resizer]"))
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
