(function () {
  function init() {
    if (!window.$ || !window.$.fn || !window.$.fn.selectpicker) return;
    window.$(".selectpicker").selectpicker("render");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
})();
