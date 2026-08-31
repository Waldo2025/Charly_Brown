const STYLE_FINISH_DIRECTIONS = Object.freeze({
  "rive-kawaii-signal": "contemporary Japanese cartoon illustration, coral, aqua and lime palette, soft rounded linework, controlled cel shading, natural materials",
  "rive-tokyo-tech": "clean Japanese editorial illustration, graphite and warm-white palette with restrained cyan and lime accents, precise linework, natural lighting",
  "rive-arcade-matsuri": "crisp contemporary cartoon illustration, deep indigo with restrained magenta, festival yellow and cyan accents, clean shapes, controlled shading",
  "rive-solar-circuit": "clean illustrated finish, ink-blue and warm ivory palette with restrained solar orange and cyan accents, precise linework, realistic materials",
  "rive-bio-pulse": "naturalistic editorial illustration, forest green, turquoise, lime and cream palette, organic linework, documentary lighting",
  "rive-lunar-blueprint": "precise editorial illustration, midnight blue, ice white and restrained electric-blue accents, clean linework, realistic materials",
  "rive-volcanic-core": "dramatic editorial illustration, charcoal, mineral red, warm sand and restrained orange accents, realistic textures and lighting",
  "rive-prism-glass": "luminous editorial illustration, warm white, cobalt, coral and aqua palette, subtle translucent materials, clean natural lighting",
  "kawaii-lab": "polished adolescent cartoon illustration, optimistic color, natural body proportions, clean cel shading, credible materials",
  "tech-minimal": "minimal Japanese editorial illustration, white and navy palette with restrained cyan accents, precise geometry, realistic materials",
  "arcade-science": "crisp game illustration, restrained high-contrast palette, readable silhouettes, natural proportions, controlled shading",
  "pastel-adventure": "young-adult editorial illustration, restrained pastel palette, gouache texture, natural proportions, cinematic but plausible lighting",
  "cosmic-kawaii": "polished adolescent cartoon illustration, deep navy, violet and luminous accent palette, natural proportions, controlled cel shading",
  "eco-explorer": "documentary-inspired illustrated finish, organic greens and earth tones, natural textures, scientifically accurate subjects",
  "storybook-science": "young-adult editorial watercolor and collage finish, restrained color, natural proportions, plausible light and materials",
  "neon-lab": "contemporary illustrated finish, dark ink palette with restrained cyan and magenta accents, precise linework, natural proportions and materials",
  "ocean-discovery": "documentary-inspired illustrated finish, layered ocean blues, restrained bioluminescent accents, natural proportions and scientifically accurate organisms"
});

export const ACTIVITY_SCENE_REALISM_CONTRACT = [
  "SCENE REALISM IS MANDATORY: the teacher-authored experience determines the actual place, objects, tools, people and action.",
  "The selected visual style may change only color palette, linework, shading and lighting; it must never replace or reinterpret the requested situation.",
  "Depict one coherent, physically plausible moment with realistic anatomy, posture, scale, gravity, object contact and cause-and-effect.",
  "Use real contemporary places and real available tools whenever the experience is everyday, domestic, school, sport, street, media or technology based.",
  "Do not turn an ordinary task into a laboratory, command center, spaceship, fantasy world or symbolic science scene.",
  "No holograms, floating screens, floating charts, imaginary control panels, sci-fi machinery, cybernetic rooms, decorative HUD, projected formulas or impossible interfaces unless the teacher explicitly requested them.",
  "For mathematics in a real-life experience, show the named real action and objects; mathematical ideas may appear only through physically present paper, a normal board, measuring tools or a plausible device screen.",
  "Cartoon or illustrated rendering is allowed, but the environment and action must remain recognizable, truthful and executable in real life."
].join(" ");

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const SPECULATIVE_SCENE_TERMS = [
  /\b(?:hologram|holographic|hologr[aá]fico|holograma)s?\b/i,
  /\b(?:futuristic|futurista|cyberpunk|sci[- ]?fi|science fiction|ciencia ficci[oó]n)\b/i,
  /\b(?:command cent(?:er|re)|control room|centro de mando|sala de control)\b/i,
  /\b(?:spaceship|space station|spacecraft|nave espacial|estaci[oó]n espacial)\b/i,
  /\b(?:floating (?:screens?|interfaces?|charts?|displays?)|(?:pantallas?|interfaces?|gr[aá]ficas?) flotantes?)\b/i,
  /\b(?:laboratory|science lab|laboratorio cient[ií]fico)\b/i
];
const STYLE_AS_SCENE_TERMS = /\b(?:HUD|Tokyo Tech|Arcade Matsuri|Kawaii Signal|Lunar Blueprint|Solar Circuit|Bio Pulse|Volcanic Core|Prism Glass)\b/i;

export function contextualLevelImageDetails(activity = {}, level = {}) {
  const sourceOfTruth = [activity.experiencePrompt, activity.mission].map(cleanText).join(" ");
  return cleanText(level.imagePrompt)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      if (!sentence || STYLE_AS_SCENE_TERMS.test(sentence)) return false;
      return SPECULATIVE_SCENE_TERMS.every((term) => !term.test(sentence) || term.test(sourceOfTruth));
    })
    .join(" ");
}

export function activitySceneStyleFinish(visualStyle = "tech-minimal") {
  return STYLE_FINISH_DIRECTIONS[visualStyle] || STYLE_FINISH_DIRECTIONS["tech-minimal"];
}

export function buildActivityLevelSceneSeed(activity = {}, level = {}, index = 0) {
  const example = typeof level.example === "string"
    ? level.example
    : [level.example?.text, level.example?.situation, level.example?.result].map(cleanText).filter(Boolean).join(" ");
  return [
    `Teacher-authored experience: ${cleanText(activity.experiencePrompt) || cleanText(activity.mission) || cleanText(activity.topic)}.`,
    `Game objective: ${cleanText(activity.mission) || cleanText(level.objective) || cleanText(activity.topic)}.`,
    `Level ${index + 1} action: ${cleanText(level.narrative) || cleanText(level.objective) || cleanText(activity.topic)}.`,
    example ? `Concrete level example: ${example}.` : "",
    `Subject and topic: ${cleanText(activity.subject)} — ${cleanText(activity.topic)}.`
  ].filter(Boolean).join(" ");
}

export function buildRealisticActivityImagePrompt(activity = {}, level = {}, index = 0, levelCount = 1) {
  const contextualDetails = contextualLevelImageDetails(activity, level);
  return [
    buildActivityLevelSceneSeed(activity, level, index),
    contextualDetails ? `Additional scene details, valid only when consistent with the experience: ${contextualDetails}.` : "",
    ACTIVITY_SCENE_REALISM_CONTRACT,
    `Art finish only: ${activitySceneStyleFinish(activity.visualStyle)}.`,
    `This is level ${index + 1} of ${Math.max(1, Number(levelCount) || 1)}.`
  ].filter(Boolean).join(" ");
}
