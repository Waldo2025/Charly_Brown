(function initPodcasterRuntimeGlobals(global) {
  if (!global) return;

  function readDataUrlFromFile(file, options) {
    const settings = options && typeof options === "object" ? options : {};
    const maxChars = Number(settings.maxChars || 0);
    const errorMessage = String(settings.errorMessage || "No se pudo leer el archivo.").trim() || "No se pudo leer el archivo.";

    return new Promise(function executor(resolve, reject) {
      if (!(file instanceof File)) {
        reject(new Error(errorMessage));
        return;
      }

      const reader = new FileReader();

      reader.onerror = function onError() {
        reject(new Error(errorMessage));
      };

      reader.onload = function onLoad() {
        const dataUrl = String(reader.result || "").trim();
        if (!dataUrl) {
          reject(new Error(errorMessage));
          return;
        }
        if (maxChars > 0 && dataUrl.length > maxChars) {
          reject(new Error(errorMessage));
          return;
        }
        resolve(dataUrl);
      };

      reader.readAsDataURL(file);
    });
  }

  async function generateDialogueAudioForRow() {
    const impl = global.__podcasterAudioGeminiGenerateDialogueAudioForRow
      || global.PodcasterGeneration?.generateDialogueAudioForRow;
    if (typeof impl !== "function") {
      throw new Error("generateDialogueAudioForRow no está disponible todavía.");
    }
    return impl.apply(global, arguments);
  }

  function captureVideoFrameDataUrlFromElement(videoEl, timeSec) {
    const width = Math.max(2, Math.floor(Number(videoEl?.videoWidth || 0) || 0));
    const height = Math.max(2, Math.floor(Number(videoEl?.videoHeight || 0) || 0));
    if (!width || !height) return "";
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(videoEl, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function measureVideoFile(file) {
    return new Promise(function executor(resolve, reject) {
      if (!(file instanceof File)) {
        reject(new Error("No se pudo medir el video."));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      let settled = false;

      function finish(payload, error) {
        if (settled) return;
        settled = true;
        try {
          video.pause();
        } catch (_) {}
        try {
          video.removeAttribute("src");
          video.load();
        } catch (_) {}
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
        if (error) reject(error);
        else resolve(payload);
      }

      function fail() {
        finish(null, new Error("No se pudo medir el video."));
      }

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      video.addEventListener("error", fail, { once: true });
      video.addEventListener("loadedmetadata", function onLoadedMetadata() {
        const durationSec = Math.max(0, Number(video.duration || 0) || 0);
        const safeSeekTime = durationSec > 0.15 ? Math.min(durationSec * 0.25, durationSec - 0.08) : 0;
        const finalize = function finalizeMeasurement() {
          const thumbDataUrl = captureVideoFrameDataUrlFromElement(video, safeSeekTime);
          finish({
            durationSec,
            thumbDataUrl
          });
        };

        if (safeSeekTime <= 0) {
          finalize();
          return;
        }

        video.addEventListener("seeked", finalize, { once: true });
        try {
          video.currentTime = safeSeekTime;
        } catch (_) {
          finalize();
        }
      }, { once: true });

      video.src = objectUrl;
      try {
        video.load();
      } catch (_) {
        fail();
      }
    });
  }

  function setButtonLoadingState(button, busy, options) {
    const settings = options && typeof options === "object" ? options : {};
    const target = button instanceof Element ? button : null;
    if (!target) return;

    const isBusy = busy === true;
    const loadingTitle = String(settings.loadingTitle || target.dataset.loadingTitle || target.getAttribute("title") || "").trim();
    const idleTitle = String(
      settings.idleTitle
      || target.dataset.idleTitle
      || target.dataset.originalTitle
      || target.getAttribute("title")
      || ""
    ).trim();

    if (!target.dataset.originalDisabled) {
      target.dataset.originalDisabled = target.disabled ? "1" : "0";
    }
    if (!target.dataset.originalTitle) {
      target.dataset.originalTitle = idleTitle;
    }

    target.disabled = isBusy;
    target.classList.toggle("is-loading", isBusy);
    target.setAttribute("aria-busy", isBusy ? "true" : "false");

    if (isBusy) {
      if (loadingTitle) target.setAttribute("title", loadingTitle);
    } else {
      const wasDisabled = target.dataset.originalDisabled === "1";
      target.disabled = wasDisabled;
      const nextTitle = String(target.dataset.originalTitle || idleTitle || "").trim();
      if (nextTitle) target.setAttribute("title", nextTitle);
      else target.removeAttribute("title");
    }
  }

  global.readDataUrlFromFile = readDataUrlFromFile;
  global.generateDialogueAudioForRow = generateDialogueAudioForRow;
  global.measureVideoFile = measureVideoFile;
  global.setButtonLoadingState = setButtonLoadingState;
  if (typeof globalThis !== "undefined") {
    globalThis.readDataUrlFromFile = readDataUrlFromFile;
    globalThis.generateDialogueAudioForRow = generateDialogueAudioForRow;
    globalThis.measureVideoFile = measureVideoFile;
    globalThis.setButtonLoadingState = setButtonLoadingState;
  }
})(typeof window !== "undefined" ? window : globalThis);
