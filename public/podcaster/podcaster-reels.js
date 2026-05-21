/**
 * Podcaster Reels Mode
 * Logic for handling vertical video formats (Reels, Shorts, TikTok).
 */

export const REEL_ASPECT_RATIO_CSS = "9 / 16";
export const NORMAL_ASPECT_RATIO_CSS = "16 / 9";

/**
 * Checks if reel mode is enabled for a given session.
 */
export function isReelModeEnabled(session) {
  return !!session?.podcastVideoConfig?.reelModeEnabled;
}

/**
 * Normalizes the resolution string based on reel mode.
 * @param {string} resolution - The requested resolution (e.g., '1080p', 'source').
 * @param {boolean} isReel - Whether reel mode is active.
 * @returns {string} The effective resolution string for the backend.
 */
export function resolveEffectiveExportResolution(resolution = "source", isReel = false) {
  const res = String(resolution || "source").trim().toLowerCase();
  if (!isReel) return res;

  if (res === "1080p") return "1080x1920";
  if (res === "720p") return "720x1280";
  if (res === "480p") return "480x854";
  
  // If source, we default to a standard vertical HD if we don't know the exact source size,
  // but usually the backend will handle 'source' + a flag if we pass it.
  // For now, let's map it to 720x1280 as a safe vertical default.
  if (res === "source") return "720x1280";

  return res;
}

/**
 * Updates the UI state for reel mode.
 * @param {Object} session - The active session.
 */
export function syncReelModeUi(session) {
  const isReel = isReelModeEnabled(session);

  // Update switch checkboxes (header and footer)
  document.querySelectorAll("[id^='reelModeToggle']").forEach(el => {
    if (el) el.checked = isReel;
  });
  
  // Update main studio shell
  const shell = document.getElementById("podcastVideoShell");
  if (shell) {
    shell.classList.toggle("is-reel-mode", isReel);
    // Update CSS variables for aspect ratio
    if (isReel) {
      shell.style.setProperty("--pod-stage-aspect", REEL_ASPECT_RATIO_CSS);
      shell.style.setProperty("--pod-stage-aspect-w", "9");
      shell.style.setProperty("--pod-stage-aspect-h", "16");
    } else {
      shell.style.removeProperty("--pod-stage-aspect");
      shell.style.removeProperty("--pod-stage-aspect-w");
      shell.style.removeProperty("--pod-stage-aspect-h");
    }
  }

  // Update home player if present
  const playerStage = document.getElementById("playerStage");
  if (playerStage) {
    playerStage.classList.toggle("is-reel-mode", isReel);
    if (isReel) {
      playerStage.style.aspectRatio = REEL_ASPECT_RATIO_CSS;
    } else {
      playerStage.style.aspectRatio = NORMAL_ASPECT_RATIO_CSS;
    }
  }

  // Sync all instances of the toggle
  document.querySelectorAll("[id^='reelModeToggle']").forEach(el => {
    el.checked = isReel;
  });
}
