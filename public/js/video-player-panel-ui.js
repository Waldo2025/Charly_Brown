const SCENE_PANEL_HIDDEN_CLASS = "scene-panel-is-hidden";

export function setScenePanelSectionVisibility(element, isHidden) {
  if (!element) return;
  element.classList.toggle(SCENE_PANEL_HIDDEN_CLASS, Boolean(isHidden));
}

export function toggleScenePanelSection(element) {
  if (!element) return false;
  const isHidden = element.classList.contains(SCENE_PANEL_HIDDEN_CLASS);
  element.classList.toggle(SCENE_PANEL_HIDDEN_CLASS, !isHidden);
  return isHidden;
}

export function bindNewProposalToggleButtons({
  buttonId = "btnShowNewProposal",
  containerId = "newProposalContainer",
  proposalTextAreaId = "infoSceneProposalText",
  notifyActivity = null
} = {}) {
  const button = document.getElementById(buttonId);
  const container = document.getElementById(containerId);
  if (!button || !container) return;

  const textarea = document.getElementById(proposalTextAreaId);

  button.onclick = () => {
    const wasHidden = toggleScenePanelSection(container);

    if (wasHidden) {
      button.classList.add("is-active");
      if (textarea) {
        textarea.focus();
      }

      if (typeof notifyActivity === "function") {
        notifyActivity("está proponiendo cambios");
      }
      return;
    }

    button.classList.remove("is-active");

    if (textarea) {
      textarea.value = "";
      textarea.style.backgroundColor = "rgba(251, 191, 36, 0.1)";
      setTimeout(() => {
        if (textarea) textarea.style.backgroundColor = "";
      }, 300);
      textarea.focus();
    }
  };
}
