const MAX_HTML_BYTES = 2_000_000;
export const GENERATED_SIMULATOR_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
export function generatedSimulatorDocument(generated) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${GENERATED_SIMULATOR_CSP}">` + generated.html;
}

export async function validateGeneratedSimulator(generated, cryptoProvider = globalThis.crypto) {
  if (!generated || generated.reviewStatus !== "approved" || typeof generated.candidateId !== "string" || !generated.candidateId.trim()) throw new Error("El simulador generado requiere una revisión aprobada.");
  if (typeof generated.html !== "string" || !generated.html.trim() || new TextEncoder().encode(generated.html).length > MAX_HTML_BYTES) throw new Error("El documento del simulador generado no es válido.");
  if (!/^[a-f0-9]{64}$/i.test(generated.htmlHash || "") || !cryptoProvider?.subtle) throw new Error("No se puede verificar la integridad del simulador generado.");
  const digest = await cryptoProvider.subtle.digest("SHA-256", new TextEncoder().encode(generated.html));
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== generated.htmlHash.toLowerCase()) throw new Error("El simulador generado cambió después de su revisión.");
  return generated;
}

export async function createGeneratedScienceSimulator(host, activity, options = {}) {
  const generated = await validateGeneratedSimulator(activity.simulator.generated);
  const frame = document.createElement("iframe");
  frame.title = activity.title || "Simulador científico revisado";
  frame.className = "science-generated-simulator-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
  frame.setAttribute("width", "100%");
  frame.setAttribute("height", "620");
  // This document has an opaque origin. Hash metadata is an integrity check,
  // not authorization; the server owns approval and the sandbox remains mandatory.
  frame.srcdoc = generatedSimulatorDocument(generated);
  host.replaceChildren(frame);
  host.classList.add("science-simulator-host");
  let state = { modelId: "generated", candidateId: generated.candidateId, running: false, values: {}, measurement: null }, destroyed = false;
  const listener = event => {
    if (destroyed || event.source !== frame.contentWindow || event.data?.type !== "science-simulator:state") return;
    const incoming = event.data.state;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return;
    // Clone data only, retaining the parent-owned identity and never evaluating
    // strings or accepting a DOM reference, navigation command or callback.
    try {
      const serialized = JSON.stringify(incoming);
      if (serialized.length > 100_000) return;
      state = { ...JSON.parse(serialized), modelId: "generated", candidateId: generated.candidateId };
      options.onStateChange?.(structuredClone(state));
    } catch { /* Malformed child telemetry cannot break the host. */ }
  };
  globalThis.addEventListener("message", listener);
  const command = (command, fields = {}) => {
    if (destroyed) return false;
    frame.contentWindow?.postMessage({ type: "science-simulator:command", command, ...fields }, "*");
    return true;
  };
  return {
    run() { state.running = true; command("run"); },
    pause() { state.running = false; command("pause"); },
    reset() { state.running = false; command("reset"); },
    setParam(id, value) { return typeof id === "string" && Number.isFinite(Number(value)) ? command("setParam", { id, value: Number(value) }) : false; },
    getState() { return structuredClone(state); },
    getMeasurement() { return structuredClone(state.measurement); },
    destroy() { if (destroyed) return; destroyed = true; globalThis.removeEventListener("message", listener); frame.remove(); host.classList.remove("science-simulator-host"); }
  };
}
