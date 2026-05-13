function ensureSentence(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function normalizePromptList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function buildDialogueVideoPromptBundle(options = {}) {
  const promptProfile = String(options?.promptProfile || "").trim();
  if (promptProfile !== "timeline-scene-video") {
    return null;
  }

  const educationalVideo = options?.educationalVideo === true;
  const sceneDescription = String(options?.sceneDescription || options?.scenePrompt || "").replace(/\s+/g, " ").trim();
  const visualNotes = String(options?.visualNotes || options?.videoDirective || "").replace(/\s+/g, " ").trim();
  const scenePrompt = String(options?.scenePrompt || "").replace(/\s+/g, " ").trim();
  const videoDirective = String(options?.videoDirective || "").replace(/\s+/g, " ").trim();
  const voiceOverText = String(options?.text || "").replace(/\s+/g, " ").trim();
  const onScreenText = String(options?.onScreenText || "").replace(/\s+/g, " ").trim();
  const transition = String(options?.transition || "").replace(/\s+/g, " ").trim();
  const imagePrompts = normalizePromptList(options?.imagePrompts || []);
  const previousScene = options?.previousScene && typeof options.previousScene === "object" ? options.previousScene : null;
  const relateWithPreviousScene = options?.relateWithPreviousScene === true;
  const continuityFrameBase64 = String(options?.continuityFrameBase64 || "").trim();
  const forceImmediateChange = options?.forceImmediateChange === true;
  const performanceDirective = String(options?.performanceDirective || "").replace(/\s+/g, " ").trim();
  const useSceneReferenceAsInitImage = options?.useSceneReferenceAsInitImage === true;
  const referenceImageName = String(options?.referenceImageName || "").replace(/\s+/g, " ").trim();
  const hasSceneReferenceVideo = options?.hasSceneReferenceVideo === true;
  const referenceVideoName = String(options?.referenceVideoName || "").replace(/\s+/g, " ").trim();

  const sceneVisualPrompt = [
    sceneDescription ? `Descripción de escena obligatoria: ${ensureSentence(sceneDescription)}` : "",
    visualNotes ? `Elemento visual obligatorio: ${ensureSentence(visualNotes)}` : "",
    scenePrompt ? `Apoyo secundario de composición: ${ensureSentence(scenePrompt)}` : "",
    videoDirective ? `Apoyo secundario de dirección visual: ${ensureSentence(videoDirective)}` : ""
  ].filter(Boolean).join(" ").trim();

  const sceneImagePromptList = imagePrompts.length ? imagePrompts : (sceneVisualPrompt ? [
    `${sceneVisualPrompt} Variación horizontal 16:9 enfocada en el contenido principal.`,
    `${sceneVisualPrompt} Toma alternativa de apoyo que preserve la intención visual.`
  ] : []);

  const prompt = [
    educationalVideo
      ? "Genera un video educativo corto, claro y realista."
      : "Genera un video cinematográfico corto y realista.",
    sceneDescription ? `Usa exactamente esta descripción de escena como base del plano/entorno: ${ensureSentence(sceneDescription)}` : "",
    visualNotes ? `Usa exactamente este elemento visual como contenido principal del clip: ${ensureSentence(visualNotes)}` : "",
    relateWithPreviousScene
      ? "Conserva continuidad con la escena anterior en el primer fotograma y luego obedece el nuevo contenido solicitado."
      : "",
    relateWithPreviousScene
      ? "La continuidad con la escena anterior es obligatoria solo como punto de arranque del clip; el contenido nuevo obligatorio sigue siendo la Descripción de escena y el Elemento visual de esta escena."
      : "",
    useSceneReferenceAsInitImage
      ? `La imagen adjunta${referenceImageName ? ` (${referenceImageName})` : ""} es referencia visual de apoyo para composición y estilo.`
      : "",
    hasSceneReferenceVideo
      ? `El video adjunto${referenceVideoName ? ` (${referenceVideoName})` : ""} se convirtió en referencia visual de apoyo para continuidad y encuadre.`
      : "",
    scenePrompt ? `ScenePrompt de apoyo: ${ensureSentence(scenePrompt)}` : "",
    videoDirective ? `VideoDirective de apoyo: ${ensureSentence(videoDirective)}` : "",
    sceneImagePromptList.length ? `ImagePrompts de apoyo: ${sceneImagePromptList.map((item, idx) => `${idx + 1}. ${String(item || "").replace(/\s+/g, " ").trim()}`).join(" | ")}` : "",
    voiceOverText ? `Contexto narrativo de voz en off: ${ensureSentence(voiceOverText)}` : "",
    transition ? `Transición de apoyo: ${ensureSentence(transition)}` : "",
    onScreenText ? `Semántica de texto en pantalla de apoyo: ${ensureSentence(onScreenText)} No incrustarlo en el video.` : "",
    performanceDirective ? `Actuación o movimiento de apoyo: ${ensureSentence(performanceDirective)}` : "",
    relateWithPreviousScene && previousScene?.speakerLabel
      ? `Continuidad narrativa: esta es la escena posterior a la escena ${Math.max(1, Number(previousScene.sceneNumber) || 1)} de ${previousScene.speakerName || previousScene.speakerLabel}.`
      : "",
    relateWithPreviousScene && previousScene?.targetSpeechLine
      ? `Escena previa (texto objetivo): "${String(previousScene.targetSpeechLine).replace(/"/g, '\\"')}"`
      : "",
    relateWithPreviousScene && previousScene?.previousVideoTargetSpeechLine
      ? `Escena previa (texto usado en video): "${String(previousScene.previousVideoTargetSpeechLine).replace(/"/g, '\\"')}"`
      : "",
    relateWithPreviousScene && previousScene?.expression
      ? `Transición emocional: evoluciona de "${previousScene.expression}" hacia "${String(options?.expression || "").replace(/\s+/g, " ").trim() || "Neutral"}" de forma natural y coherente.`
      : "",
    relateWithPreviousScene && previousScene?.hasVideo
      ? (forceImmediateChange
        ? "Tras el primer fotograma, prioriza el nuevo Elemento visual aunque implique un cambio claro de plano, contenido o composición respecto al clip previo."
        : (educationalVideo
          ? "Mantén continuidad visual y de estilo con el clip previo como apoyo secundario, sin desplazar el nuevo contenido obligatorio."
          : "Mantén continuidad visual con el clip previo como apoyo secundario, sin desplazar el nuevo contenido obligatorio."))
      : "",
    continuityFrameBase64 && relateWithPreviousScene
      ? (forceImmediateChange
        ? "La referencia de continuidad aplica obligatoriamente al primer fotograma; después cambia con rapidez hacia la nueva escena solicitada."
        : "La referencia de continuidad aplica obligatoriamente al primer fotograma para evitar un corte visible.")
      : "",
    educationalVideo
      ? "La prioridad es representar fielmente la Descripción de escena y el Elemento visual del guion técnico."
      : "La prioridad es representar fielmente la Descripción de escena y el Elemento visual del clip.",
    educationalVideo
      ? "Puedes mostrar escenas sin personas si el recurso visual lo pide."
      : "Si la escena no necesita personas, evita introducirlas.",
    "Prohibido texto incrustado, subtítulos, overlays o elementos de interfaz.",
    "Composición horizontal 16:9, limpia y coherente con el contenido solicitado."
  ].filter(Boolean).join("\n");

  return {
    sceneVisualPrompt,
    sceneImagePromptList,
    prompt
  };
}

module.exports = {
  buildDialogueVideoPromptBundle
};
