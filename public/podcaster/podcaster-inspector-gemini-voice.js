import { getGeminiDirectionPresets } from "./podcaster-gemini-direction-presets.js?v=2026-10-05.gemini-presets-3";

const DIRECTION_FIELDS = ["stylePrompt", "pacingPrompt", "accentPrompt"];
const GLOBAL_DIRECTION_IDS = {
  stylePrompt: "globalTtsStylePrompt",
  pacingPrompt: "globalTtsPacingPrompt",
  accentPrompt: "globalTtsAccentPrompt"
};

function populateDirectionPresets(control, field, value, locale) {
  const presetKey = `${field}:${locale}:${value}`;
  if (control.dataset.presetKey === presetKey) return;
  const presets = getGeminiDirectionPresets(field, locale);
  if (value && !presets.some(([candidate]) => candidate === value)) {
    presets.push([value, "Configuración guardada"]);
  }
  control.replaceChildren(...presets.map(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    return option;
  }));
  control.dataset.presetKey = presetKey;
}

export function applyVoiceToAllScenes(session, voice, speakers = [], { speechLocale = session.speechLocale, direction = session.ttsDirectionDefaults || {} } = {}) {
  const rows = session.script?.rows || [];
  const speakerVoiceMap = { ...session.speakerVoiceMap };
  const allSpeakers = new Set([...Object.keys(speakerVoiceMap), ...speakers, ...rows.map(row => row.speaker)]);
  for (const speaker of allSpeakers) if (speaker) speakerVoiceMap[speaker] = voice;
  return {
    ...session,
    speechLocale,
    speakerVoiceMap,
    ttsDirectionDefaults: { ...direction },
    script: {
      ...session.script,
      rows: rows.map(row => ({
        ...row,
        voiceName: voice,
        voiceNameSource: "host",
        ttsDirectionConfig: {
          ...(row.ttsDirectionConfig || {}),
          stylePrompt: direction.stylePrompt || "",
          pacingPrompt: direction.pacingPrompt || "",
          accentPrompt: direction.accentPrompt || ""
        }
      }))
    }
  };
}

export function applyNarratorDirectionToSession(session, narrator, field, value, normalize) {
  if (!DIRECTION_FIELDS.includes(field)) return session;
  const previous = normalize(session.ttsDirectionDefaults || {});
  const direction = normalize({ ...previous, [field]: value });
  return {
    ...session,
    ttsDirectionDefaults: direction,
    script: {
      ...session.script,
      rows: (session.script?.rows || []).map((row) => {
        if (row.speaker !== narrator) return row;
        const rowDirection = normalize(row.ttsDirectionConfig || previous);
        // Propaga el valor heredado y conserva las indicaciones particulares de una escena.
        if (rowDirection[field] !== previous[field]) return row;
        return { ...row, ttsDirectionConfig: { ...rowDirection, [field]: direction[field] } };
      })
    }
  };
}

function pcm16ToWavDataUrl(base64, sampleRate = 24000) {
  const binary = atob(String(base64 || ""));
  const pcm = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) pcm[index] = binary.charCodeAt(index);
  const wav = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(wav);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + pcm.length, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.length, true);
  new Uint8Array(wav, 44).set(pcm);
  return new Blob([wav], { type: "audio/wav" });
}

export function extractGeminiPreviewAudio(response) {
  if (response?.audio?.data) {
    const mimeType = String(response.audio.mimeType || "audio/wav").toLowerCase();
    const binary = atob(response.audio.data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((part) => part?.inlineData?.data && /^audio\//i.test(String(part.inlineData.mimeType || "")));
  if (!audioPart) throw new Error("Gemini no devolvió audio de muestra. Inténtalo de nuevo.");
  const mimeType = String(audioPart.inlineData.mimeType || "").toLowerCase();
  if (mimeType.includes("pcm") || mimeType.includes("l16")) {
    const rate = Number(mimeType.match(/rate=(\d+)/i)?.[1] || 24000);
    return pcm16ToWavDataUrl(audioPart.inlineData.data, rate);
  }
  const binary = atob(audioPart.inlineData.data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export function createInspectorGeminiVoicePanel(deps) {
  const panel = document.getElementById("podcastStudioInspectorGeminiVoice");
  if (!panel) return { render() {} };
  const controls = [...panel.querySelectorAll("[data-gemini-voice-field]")];
  const previewButton = panel.querySelector("[data-gemini-voice-preview]");
  const previewStatus = panel.querySelector("[data-gemini-voice-preview-status]");
  let previewAudio = null;
  let previewUrl = "";
  let previewRequestId = 0;
  const regionalVoiceCatalogs = new Map();
  const regionalVoiceCatalogErrors = new Map();
  let voiceCatalogRequestId = 0;
  let regionalVoiceLoading = false;
  const stopPreview = () => {
    previewRequestId += 1;
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.removeAttribute("src");
      previewAudio = null;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    if (previewButton) {
      previewButton.disabled = !deps.getActiveSession();
      previewButton.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> Escuchar muestra';
    }
  };
  previewButton?.addEventListener("click", async () => {
    if (previewAudio) { stopPreview(); return; }
    const session = deps.getActiveSession();
    if (!session || !previewButton) return;
    const requestId = ++previewRequestId;
    const voice = (deps.normalizePodcasterVoiceName || deps.normalizeLiveVoiceName)(
      panel.querySelector('[data-gemini-voice-field="voiceName"]')?.value,
      deps.resolveSpeakerVoiceName(narratorFor(session), session)
    );
    const locale = deps.normalizeSpeechLocale(panel.querySelector('[data-gemini-voice-field="speechLocale"]')?.value || deps.getSessionSpeechLocale(session));
    const direction = deps.normalizeTtsDirectionConfig({
      stylePrompt: panel.querySelector('[data-gemini-voice-field="stylePrompt"]')?.value,
      pacingPrompt: panel.querySelector('[data-gemini-voice-field="pacingPrompt"]')?.value,
      accentPrompt: panel.querySelector('[data-gemini-voice-field="accentPrompt"]')?.value
    });
    const speechConfig = deps.resolveSpeechGenerationConfig(narratorFor(session), session);
    const expression = deps.getSpeakerExpressionMap?.(session)?.[narratorFor(session)] || "Neutral";
    previewButton.disabled = true;
    previewButton.dataset.generating = "true";
    previewButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Generando…';
    if (previewStatus) previewStatus.textContent = "Preparando una muestra breve…";
    try {
      const result = await deps.authFetchJson("/api/podcaster/tts/preview", {
        method: "POST",
        body: JSON.stringify({
          voiceName: voice,
          speechLocale: locale,
          localeInstruction: speechConfig.localeInstruction,
          expression,
          ttsDirection: direction
        })
      });
      if (requestId !== previewRequestId) return;
      const blob = extractGeminiPreviewAudio(result);
      previewUrl = URL.createObjectURL(blob);
      previewAudio = new Audio(previewUrl);
      previewAudio.addEventListener("ended", stopPreview, { once: true });
      previewAudio.addEventListener("error", () => {
        stopPreview();
        if (previewStatus) previewStatus.textContent = "No se pudo reproducir la muestra. Inténtalo de nuevo.";
      }, { once: true });
      previewButton.disabled = false;
      delete previewButton.dataset.generating;
      previewButton.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i> Detener muestra';
      if (previewStatus) previewStatus.textContent = `${voice} · ${locale}`;
      await previewAudio.play();
    } catch (error) {
      if (requestId !== previewRequestId) return;
      stopPreview();
      delete previewButton.dataset.generating;
      if (previewStatus) previewStatus.textContent = String(error?.message || "No se pudo generar la muestra.");
    }
  });
  const narratorFor = (session) => {
    const speakers = deps.getSpeakerOptions(session);
    return speakers.find((speaker) => speaker.toLowerCase() === "narrador") || speakers[0] || "Narrador";
  };
  const loadRegionalVoices = async (locale, sessionId) => {
    if (!/^es-(MX|ES|419)$/i.test(locale)) return;
    const voiceControl = panel.querySelector('[data-gemini-voice-field="voiceName"]');
    if (!voiceControl) return;
    const requestId = ++voiceCatalogRequestId;
    let voices = regionalVoiceCatalogs.get(locale);
    if (voices) {
      regionalVoiceLoading = false;
      const applyAll = panel.querySelector("[data-gemini-apply-all]");
      if (applyAll) delete applyAll.dataset.loadingRegionalVoices;
    }
    if (!voices) {
      regionalVoiceLoading = true;
      if (previewButton && !previewAudio) previewButton.disabled = true;
      const applyAll = panel.querySelector("[data-gemini-apply-all]");
      if (applyAll) {
        applyAll.dataset.loadingRegionalVoices = "true";
        applyAll.disabled = true;
      }
      const selectedProfile = deps.resolveAgentVoiceProfile?.(voiceControl.value);
      const gender = selectedProfile?.genderGroup === "femenina" ? "female" : selectedProfile?.genderGroup === "masculina" ? "male" : "";
      const query = new URLSearchParams({ language_code: locale, ...(gender ? { gender } : {}) });
      try {
        const result = await deps.authFetchJson(`/api/podcaster/tts/voices?${query.toString()}`, { method: "GET" });
        voices = Array.isArray(result?.voices) ? result.voices : [];
        if (!voices.length && gender) {
          const retry = await deps.authFetchJson(`/api/podcaster/tts/voices?language_code=${encodeURIComponent(locale)}`, { method: "GET" });
          voices = Array.isArray(retry?.voices) ? retry.voices : [];
        }
        regionalVoiceCatalogs.set(locale, voices);
      } catch (error) {
        const missingLocalRoute = /\b404\b/.test(String(error?.message || error?.status || ""));
        if (missingLocalRoute) {
          regionalVoiceCatalogs.set(locale, []);
          regionalVoiceCatalogErrors.set(locale, "El backend local no tiene la ruta de voces regionales. Reinicia `npm run dev` y recarga Snoopy.");
        }
        if (requestId === voiceCatalogRequestId && panel.dataset.sessionId === sessionId && previewStatus) {
          previewStatus.textContent = missingLocalRoute
            ? regionalVoiceCatalogErrors.get(locale)
            : `No se pudieron cargar las voces regionales ${locale}: ${String(error?.message || "error de catálogo")}`;
        }
        if (requestId === voiceCatalogRequestId) {
          regionalVoiceLoading = false;
          if (previewButton && !previewAudio) previewButton.disabled = !deps.getActiveSession() || deps.isGenerationBusy();
          const applyAll = panel.querySelector("[data-gemini-apply-all]");
          if (applyAll) {
            delete applyAll.dataset.loadingRegionalVoices;
            applyAll.disabled = !deps.getActiveSession()?.script?.rows?.length || deps.isGenerationBusy();
          }
        }
        return;
      }
    }
    if (requestId !== voiceCatalogRequestId || panel.dataset.sessionId !== sessionId) return;
    regionalVoiceLoading = false;
    if (previewButton && !previewAudio) previewButton.disabled = !deps.getActiveSession() || deps.isGenerationBusy();
    const applyAll = panel.querySelector("[data-gemini-apply-all]");
    if (applyAll) {
      delete applyAll.dataset.loadingRegionalVoices;
      applyAll.disabled = !deps.getActiveSession()?.script?.rows?.length || deps.isGenerationBusy();
    }
    const selectedVoice = voiceControl.value;
    const staticSelect = document.createElement("select");
    staticSelect.innerHTML = deps.buildVoiceOptions(selectedVoice);
    const regionalGroup = document.createElement("optgroup");
    regionalGroup.label = `Voces regionales ${locale}`;
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = [voice.displayName, voice.accent].filter(Boolean).join(" · ");
      option.title = voice.description || `${voice.languageCode} · ${voice.accent || "acento regional"}`;
      regionalGroup.append(option);
    }
    voiceControl.replaceChildren(...[...staticSelect.childNodes], ...(voices.length ? [regionalGroup] : []));
    const selectedIsRegional = voices.some((voice) => voice.id === selectedVoice);
    if (!selectedIsRegional && voices.length) {
      // A locale such as es-MX only becomes a reliable variant when paired with
      // a voice from that exact regional catalog, so replace generic prebuilt voices.
      voiceControl.value = voices[0].id;
      persist({ target: voiceControl });
      if (previewStatus) previewStatus.textContent = `Voz regional ${locale} seleccionada para respetar el idioma y la variante.`;
    } else if (voices.length && previewStatus) {
      previewStatus.textContent = `Voz ${voices.find((voice) => voice.id === selectedVoice)?.displayName || selectedVoice} · ${locale}`;
    } else if (previewStatus) {
      previewStatus.textContent = regionalVoiceCatalogErrors.get(locale)
        || `No hay voces regionales disponibles para ${locale}. Gemini detecta el idioma desde el texto y el acento queda como indicación de estilo.`;
    }
  };
  const render = (session = deps.getActiveSession()) => {
    controls.forEach((control) => { control.disabled = !session; });
    const applyAll = panel.querySelector("[data-gemini-apply-all]");
    applyAll.disabled = regionalVoiceLoading || !session || !session.script?.rows?.length || deps.isGenerationBusy();
    if (previewButton && !previewAudio && previewButton.dataset.generating !== "true") {
      previewButton.disabled = regionalVoiceLoading || !session || deps.isGenerationBusy();
    }
    if (!session) return;
    const changedSession = panel.dataset.sessionId !== String(session.id || "");
    panel.dataset.sessionId = String(session.id || "");
    const narrator = narratorFor(session);
    panel.dataset.speaker = narrator;
    panel.querySelector("[data-gemini-narrator-label]").textContent = narrator;
    const voice = deps.resolveSpeakerVoiceName(narrator, session);
    const locale = deps.getSessionSpeechLocale(session);
    const direction = deps.normalizeTtsDirectionConfig(session.ttsDirectionDefaults || {});
    for (const control of controls) {
      const field = control.dataset.geminiVoiceField;
      if (field === "voiceName" && !control.options.length) control.innerHTML = deps.buildVoiceOptions(voice);
      else if (field === "speechLocale" && !control.options.length) control.innerHTML = deps.buildSpeechLocaleOptions(locale);
      const value = field === "voiceName" ? voice : field === "speechLocale" ? locale : direction[field] || "";
      if (DIRECTION_FIELDS.includes(field)) {
        populateDirectionPresets(control, field, value, locale);
        control.value = value;
      }
      if (control.value !== value && (changedSession || document.activeElement !== control)) control.value = value;
    }
    void loadRegionalVoices(locale, String(session.id || ""));

  };
  const persist = (event) => {
    const control = event.target.closest("[data-gemini-voice-field]");
    const session = deps.getActiveSession();
    if (!control || !session) return;
    const field = control.dataset.geminiVoiceField;
    const narrator = narratorFor(session);
    deps.upsertActiveSession((current) => {
      if (field === "voiceName") {
        const voice = (deps.normalizePodcasterVoiceName || deps.normalizeLiveVoiceName)(control.value, deps.resolveSpeakerVoiceName(narrator, current));
        return deps.applySpeakerVoiceMapToSession(current, { ...deps.getSpeakerVoiceMap(current), [narrator]: voice });
      }
      if (field === "speechLocale") return { ...current, speechLocale: deps.normalizeSpeechLocale(control.value) };
      return applyNarratorDirectionToSession(current, narrator, field, control.value, deps.normalizeTtsDirectionConfig);
    }, { render: false });
    if (field === "voiceName") {
      deps.syncSpeakerFieldAcrossPanels(narrator, "voiceName", control.value);
      void deps.stopGeminiLiveSession().catch(() => {});
    } else if (field === "speechLocale") {
      const globalLocale = document.getElementById("globalSpeechLocaleSelect");
      if (globalLocale) globalLocale.value = control.value;
      void deps.stopGeminiLiveSession().catch(() => {});
    } else {
      const globalDirection = document.getElementById(GLOBAL_DIRECTION_IDS[field]);
      if (globalDirection) globalDirection.value = control.value;
    }
    deps.scheduleSessionLocalPersist("inspector-gemini-voice");
    if (field === "speechLocale") render(deps.getActiveSession());
  };
  panel.addEventListener("change", (event) => {
    if (event.target.matches("select")) persist(event);
  });
  panel.querySelector("[data-gemini-apply-all]").addEventListener("click", () => {
    const session = deps.getActiveSession();
    if (!session || deps.isGenerationBusy() || !session.script?.rows?.length) return;
    const narrator = narratorFor(session);
    const voice = (deps.normalizePodcasterVoiceName || deps.normalizeLiveVoiceName)(
      panel.querySelector('[data-gemini-voice-field="voiceName"]').value,
      deps.resolveSpeakerVoiceName(narrator, session)
    );
    const speechLocale = deps.normalizeSpeechLocale(
      panel.querySelector('[data-gemini-voice-field="speechLocale"]')?.value || deps.getSessionSpeechLocale(session)
    );
    const direction = deps.normalizeTtsDirectionConfig(Object.fromEntries(
      DIRECTION_FIELDS.map((field) => [field, panel.querySelector(`[data-gemini-voice-field="${field}"]`)?.value || ""])
    ));
    deps.upsertActiveSession(current => applyVoiceToAllScenes(current, voice, deps.getSpeakerOptions(current), {
      speechLocale,
      direction
    }), { render: false });
    const current = deps.getActiveSession();
    const globalLocale = document.getElementById("globalSpeechLocaleSelect");
    if (globalLocale) globalLocale.value = speechLocale;
    for (const field of DIRECTION_FIELDS) {
      const globalDirection = document.getElementById(GLOBAL_DIRECTION_IDS[field]);
      if (globalDirection) globalDirection.value = direction[field] || "";
    }
    const speakers = new Set([...deps.getSpeakerOptions(current), ...current.script.rows.map(row => row.speaker)]);
    for (const speaker of speakers) if (speaker) deps.syncSpeakerFieldAcrossPanels(speaker, "voiceName", voice);
    deps.scheduleSessionLocalPersist("inspector-gemini-voice-all-scenes");
    void deps.stopGeminiLiveSession().catch(() => {});
    deps.setGenerationStatus(`Voz y estilo aplicados a todas las escenas. Regenera los audios existentes para escuchar el cambio.`);
    render(current);
  });
  return { render };
}
