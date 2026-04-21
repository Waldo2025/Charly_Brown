let mp4boxLoadPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script"))
      .find((script) => String(script.src || "").includes(src));
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", (e) => reject(e), { once: true });
      // If it already loaded, resolve quickly.
      setTimeout(() => resolve(), 0);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", (e) => reject(e), { once: true });
    document.head.appendChild(script);
  });
}

export async function loadMP4Box() {
  if (typeof window !== "undefined" && window.MP4Box) return window.MP4Box;
  if (!mp4boxLoadPromise) {
    mp4boxLoadPromise = (async () => {
      await loadScript("./vendor/mp4box/mp4box.all.min.js");
      if (!window.MP4Box) throw new Error("MP4Box no está disponible después de cargar el script.");
      return window.MP4Box;
    })();
  }
  return mp4boxLoadPromise;
}

