(function () {
  if (window.__cbUpdateBannerLoaderInit) return;
  window.__cbUpdateBannerLoaderInit = true;

  async function load() {
    let version = "";
    try {
      const response = await fetch("version.json", {cache: "no-store"});
      const data = await response.json();
      version = data && data.version ? String(data.version) : "";
    } catch (_) {
      version = "";
    }

    const script = document.createElement("script");
    script.src = "js/updateBanner.js?v=" + encodeURIComponent(version || Date.now().toString());
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, {once: true});
  } else {
    load();
  }
})();
