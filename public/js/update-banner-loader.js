(function () {
  if (window.__cbUpdateBannerLoaderInit) return;
  window.__cbUpdateBannerLoaderInit = true;

  function getVersionInfo() {
    window.__CHARLY_VERSION_INFO_PROMISE__ ||= fetch(`version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({}));
    return window.__CHARLY_VERSION_INFO_PROMISE__;
  }

  async function load() {
    let version = "";
    try {
      const data = await getVersionInfo();
      version = data && data.version ? String(data.version) : "";
    } catch (_) {
      version = "";
    }

    const script = document.createElement("script");
    script.src = "js/updateBanner.js?v=" + encodeURIComponent(version || Date.now().toString());
    document.body.appendChild(script);
  }

  function scheduleLoad() {
    const run = () => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(() => void load(), { timeout: 1500 });
      else setTimeout(() => void load(), 0);
    };
    const isScienceActivities = /(?:^|\/)scienceActivities(?:\.html)?$/i.test(location.pathname);
    if (isScienceActivities && document.documentElement.dataset.scienceActivitiesInteractive !== "true") {
      document.addEventListener("scienceactivities:interactive", run, { once: true });
    } else {
      run();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleLoad, { once: true });
  else scheduleLoad();
})();
