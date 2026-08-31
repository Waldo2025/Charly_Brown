export function simulatorUsesFullyProgrammaticScene(activity = {}) {
  const modelId = String(activity?.simulator?.modelId || activity?.simulationType || "").trim();
  return modelId === "quadratic-factorization-rectangle";
}

export function simulatorUsesProgrammaticPrimary(activity = {}) {
  const modelId = String(activity?.simulator?.modelId || activity?.simulationType || "").trim();
  return modelId === "number-line" || simulatorUsesFullyProgrammaticScene(activity);
}

export function validateLocalizedSimulatorExportContract(activity, runtimeActivity, { simulatorVisualBytes = 0, budgetBytes = 10 * 1024 * 1024 } = {}) {
  if (activity?.gameMode !== "simulator") return;
  if (simulatorVisualBytes > budgetBytes) {
    throw new Error(`La escena visual pesa ${(simulatorVisualBytes / 1024 / 1024).toFixed(1)} MB y supera el límite de 10 MB del ZIP.`);
  }
  // La caja algebraica, las fichas, los signos y sus etiquetas se dibujan
  // íntegramente con HTML/CSS para preservar precisión y funcionamiento offline.
  if (simulatorUsesFullyProgrammaticScene(activity)) return;
  const manifestScene = activity?.visualScene;
  const runtimeScene = runtimeActivity?.visualScene;
  if (!String(manifestScene?.background?.imageSrc || "").startsWith("assets/simulator/")) {
    throw new Error("No se pudo incluir el fondo visual del simulador en el ZIP.");
  }
  const runtimeBackground = String(runtimeScene?.background?.dataUrl || "");
  if (!runtimeBackground.startsWith("data:image/")) {
    throw new Error("No se pudo incrustar el fondo del simulador para abrir el ZIP con doble clic.");
  }
  const isEcosystemEnergyFlow = activity?.simulator?.sceneVariant === "ecosystem-energy-flow";
  if (isEcosystemEnergyFlow) {
    for (let trophicLevel = 0; trophicLevel <= 5; trophicLevel += 1) {
      const manifestIndex = (manifestScene?.layers || []).findIndex((layer) => Number(layer?.trophicLevel) === trophicLevel);
      const manifestLayer = manifestScene?.layers?.[manifestIndex];
      const runtimeLayer = runtimeScene?.layers?.[manifestIndex];
      if (manifestIndex < 0 || !String(manifestLayer?.imageSrc || "").startsWith("assets/simulator/")) {
        throw new Error(`No se pudo incluir el recurso del nivel trófico ${trophicLevel} en el ZIP.`);
      }
      if (!String(runtimeLayer?.dataUrl || "").startsWith("data:image/")) {
        throw new Error(`No se pudo incrustar el recurso del nivel trófico ${trophicLevel} para abrir el ZIP con doble clic.`);
      }
    }
    return;
  }
  if (!simulatorUsesProgrammaticPrimary(activity)) {
    const primaryIndex = (manifestScene?.layers || []).findIndex((layer, index) => layer?.visible !== false && (layer?.role === "primary" || index === 0));
    if (primaryIndex < 0 || !String(manifestScene.layers[primaryIndex]?.imageSrc || "").startsWith("assets/simulator/")) {
      throw new Error("No se pudo incluir el objeto principal del simulador en el ZIP.");
    }
    const runtimePrimary = String(runtimeScene?.layers?.[primaryIndex]?.dataUrl || "");
    if (!runtimePrimary.startsWith("data:image/")) {
      throw new Error("No se pudo incrustar el objeto principal del simulador para abrir el ZIP con doble clic.");
    }
  }
}
