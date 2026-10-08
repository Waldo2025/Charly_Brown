export const VOICE_LANGUAGES = [
  { value: "es-MX", label: "Español · México" },
  { value: "es-419", label: "Español · Latinoamérica" },
  { value: "es-ES", label: "Español · España" },
  { value: "en-US", label: "English · United States" },
  { value: "en-GB", label: "English · United Kingdom" },
  { value: "fr-FR", label: "Français" },
  { value: "pt-BR", label: "Português · Brasil" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "ja-JP", label: "日本語" }
];

export const GEMINI_VOICES = [
  { group: "Femeninas", voices: [
    ["Aoede", "Aoede · ligera"], ["Kore", "Kore · firme"], ["Leda", "Leda · juvenil"],
    ["Callirrhoe", "Callirrhoe · tranquila"], ["Despina", "Despina · suave"], ["Achernar", "Achernar · delicada"],
    ["Vindemiatrix", "Vindemiatrix · amable"], ["Sulafat", "Sulafat · cálida"]
  ] },
  { group: "Masculinas", voices: [
    ["Puck", "Puck · animada"], ["Charon", "Charon · informativa"], ["Fenrir", "Fenrir · enérgica"],
    ["Orus", "Orus · firme"], ["Algenib", "Algenib · grave"], ["Gacrux", "Gacrux · madura"],
    ["Rasalgethi", "Rasalgethi · narrativa"], ["Sadaltager", "Sadaltager · experta"]
  ] },
  { group: "Neutras", voices: [
    ["Zephyr", "Zephyr · brillante"], ["Iapetus", "Iapetus · clara"], ["Umbriel", "Umbriel · relajada"],
    ["Algieba", "Algieba · fluida"], ["Schedar", "Schedar · equilibrada"], ["Achird", "Achird · amistosa"]
  ] }
];

export function populateVoiceSelectors(languageSelect, voiceSelect) {
  languageSelect.innerHTML = VOICE_LANGUAGES.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  voiceSelect.innerHTML = GEMINI_VOICES.map((group) => (
    `<optgroup label="${group.group}">${group.voices.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</optgroup>`
  )).join("");
}
