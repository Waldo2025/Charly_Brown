export function createPodcasterHistoryApi(deps = {}) {
  const getPodcastVideoState = () => deps.getPodcastVideoState?.() || null;
  const getActiveSession = () => deps.getActiveSession?.() || null;
  const setGenerationStatus = (...args) => deps.setGenerationStatus?.(...args);
  const upsertActiveSession = (...args) => deps.upsertActiveSession?.(...args);
  const renderPodcastVideoShell = (...args) => deps.renderPodcastVideoShell?.(...args);

  function recordHistory(session = null, reason = "action") {
    const podcastVideoState = getPodcastVideoState();
    const activeSession = session || getActiveSession();
    if (!podcastVideoState || !activeSession) return;
    const snapshot = JSON.stringify({
      script: activeSession.script,
      config: activeSession.podcastVideoConfig || {}
    });
    if (podcastVideoState.undoStack.length > 0 && podcastVideoState.undoStack[podcastVideoState.undoStack.length - 1] === snapshot) {
      return;
    }
    podcastVideoState.undoStack.push(snapshot);
    if (podcastVideoState.undoStack.length > 50) {
      podcastVideoState.undoStack.shift();
    }
    if (reason !== "undo" && reason !== "redo") {
      podcastVideoState.redoStack = [];
    }
  }

  function applyHistorySnapshot(snapshotJson, reason = "undo") {
    try {
      const data = JSON.parse(snapshotJson);
      const session = getActiveSession();
      if (!session || !data) return;
      upsertActiveSession((current) => ({
        ...current,
        script: data.script,
        podcastVideoConfig: data.config
      }), {
        render: true,
        force: true,
        autosaveReason: `history-${reason}`,
        recordHistory: false
      });
      setGenerationStatus(reason === "undo" ? "Deshacer: Hecho" : "Rehacer: Hecho", "is-live");
      renderPodcastVideoShell(getActiveSession());
    } catch (error) {
      console.error("[History] Failed to apply snapshot:", error);
    }
  }

  function undo() {
    const podcastVideoState = getPodcastVideoState();
    if (!podcastVideoState || podcastVideoState.undoStack.length < 2) {
      setGenerationStatus("Nada que deshacer", "");
      return;
    }
    const currentSnapshot = podcastVideoState.undoStack.pop();
    podcastVideoState.redoStack.push(currentSnapshot);
    const previousSnapshot = podcastVideoState.undoStack[podcastVideoState.undoStack.length - 1];
    applyHistorySnapshot(previousSnapshot, "undo");
  }

  function redo() {
    const podcastVideoState = getPodcastVideoState();
    if (!podcastVideoState || podcastVideoState.redoStack.length === 0) {
      setGenerationStatus("Nada que rehacer", "");
      return;
    }
    const nextSnapshot = podcastVideoState.redoStack.pop();
    podcastVideoState.undoStack.push(nextSnapshot);
    applyHistorySnapshot(nextSnapshot, "redo");
  }

  function bindGlobalShortcuts() {
    window.addEventListener("keydown", (event) => {
      const isZ = event.key.toLowerCase() === "z";
      const isY = event.key.toLowerCase() === "y";
      const isMod = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;
      if (isMod && isZ) {
        if (isShift) redo();
        else undo();
        event.preventDefault();
      } else if (isMod && isY) {
        redo();
        event.preventDefault();
      }
    });
  }

  return {
    recordHistory,
    applyHistorySnapshot,
    undo,
    redo,
    bindGlobalShortcuts
  };
}
