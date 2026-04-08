(function () {
  function init() {
    if (!window.VanillaTilt) return;
    const targets = document.querySelectorAll(".login-container");
    if (!targets.length) return;
    window.VanillaTilt.init(targets);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
})();
