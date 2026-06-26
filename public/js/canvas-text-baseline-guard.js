(function installCanvasTextBaselineGuard(root) {
  if (!root || root.__podcasterCanvasTextBaselineGuardInstalled === true) return;

  const ctxCtor = root.CanvasRenderingContext2D;
  const proto = ctxCtor && ctxCtor.prototype;
  if (!proto) return;

  const descriptor = Object.getOwnPropertyDescriptor(proto, "textBaseline");
  if (!descriptor || typeof descriptor.set !== "function") return;

  const normalizeBaseline = (value) => {
    if (String(value || "").trim().toLowerCase() === "alphabetical") {
      return "alphabetic";
    }
    return value;
  };

  try {
    Object.defineProperty(proto, "textBaseline", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        descriptor.set.call(this, normalizeBaseline(value));
      }
    });
    root.__podcasterCanvasTextBaselineGuardInstalled = true;
  } catch (_) {
    // If a browser makes the native descriptor non-configurable, leave it alone.
  }
})(typeof window !== "undefined" ? window : globalThis);
