(function () {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("game") || params.has("readingId")) {
      document.documentElement.classList.add("is-dedicated-game-mode");
    }
  } catch (_) {
    // no-op
  }
})();
