"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PODCASTER_VIDEO_PROMPT_VERSION,
  sanitizeVisualDirective,
  buildDialogueVideoPromptBundle
} = require("./dialogue-video-prompt.js");

function createFixture(overrides = {}) {
  return {
    promptProfile: "podcaster_video_v2",
    educationalVideo: true,
    contentMode: "educational",
    aspectRatio: "16:9",
    generator: "veo",
    textPolicy: "overlay_only",
    sceneDescription: "A cinematic classroom interior.",
    visualNotes: "An abstract aerial map. La palabra 'Descubrimiento' aparece brevemente. Latin America glows.",
    scenePrompt: "Slow dolly in.",
    videoDirective: "Keep the map readable and show a title saying History.",
    imagePrompts: ["Illuminated map without people."],
    performanceDirective: "The map lights travel from north to south.",
    transition: "Fade from darkness.",
    text: "Hoy cambia la forma de nombrar esta fecha.",
    headlineText: "OTRA MIRADA",
    captionText: "Hoy cambia la forma de nombrar esta fecha.",
    onScreenText: "LEGACY OVERLAY",
    dialogueAudioStoragePath: "podcaster/audio/scene.wav",
    inferredTargetDurationSec: 8,
    ...overrides
  };
}

test("builds the canonical English structure and removes overlay or legacy copy", () => {
  const result = buildDialogueVideoPromptBundle(createFixture());

  assert.equal(result.promptVersion, PODCASTER_VIDEO_PROMPT_VERSION);
  assert.equal(result.promptVersion, "podcaster_video_v2");
  assert.match(result.prompt, /Timeline 00:00–00:08:/);
  assert.match(result.prompt, /Use one continuous, unbroken shot with no scene cuts\./);
  assert.match(result.prompt, /Audio: generate ambient sound only\./);
  assert.match(result.prompt, /Visible text: none\./);
  assert.doesNotMatch(result.prompt, /OTRA MIRADA|LEGACY OVERLAY|Hoy cambia/);
  assert.doesNotMatch(result.prompt, /Descubrimiento|History/);
  assert.ok(result.removedDirectives.some((item) => item.field === "visualNotes"));
  assert.ok(result.removedDirectives.some((item) => item.field === "videoDirective"));
});

test("in-scene text appears exactly once and no contradictory no-text rule is added", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    generator: "omni",
    textPolicy: "in_scene",
    inSceneText: "CHARLY PODCAST",
    visualNotes: "A neon sign says something above the door. The host enters."
  }));

  assert.equal((result.prompt.match(/CHARLY PODCAST/g) || []).length, 1);
  assert.match(result.prompt, /Spell it exactly as quoted\. No other visible text\./);
  assert.doesNotMatch(result.prompt, /Visible text: none/);
  assert.doesNotMatch(result.prompt, /something above the door/);
});

test("removes repeated in-scene copy from every visual field before adding it once", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    generator: "omni",
    textPolicy: "in_scene",
    inSceneText: "CHARLY PODCAST",
    sceneDescription: "The storefront displays CHARLY PODCAST above the door.",
    visualNotes: "A wall bears CHARLY PODCAST beside the host.",
    scenePrompt: "The facade contains CHARLY PODCAST in warm light.",
    videoDirective: "Hold on CHARLY PODCAST while the host enters.",
    imagePrompts: ["A glass panel with CHARLY PODCAST behind the subject."]
  }));

  assert.equal((result.prompt.match(/CHARLY PODCAST/g) || []).length, 1);
  assert.match(result.prompt, /Spell it exactly as quoted\. No other visible text\./);
  assert.ok(result.removedDirectives.some((item) => item.field === "sceneDescription"));
  assert.ok(result.removedDirectives.some((item) => item.field === "imagePrompts"));
});

test("overlay copy never leaks through neutral visual prose and duplicate directions collapse", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    headlineText: "CHARLY PODCAST",
    captionText: "Hola mundo",
    sceneDescription: "The facade contains CHARLY PODCAST and the host greets with Hola mundo.",
    visualNotes: "A warm studio with a slow push in.",
    scenePrompt: "A warm studio with a slow push in.",
    videoDirective: "A warm studio with a slow push in.",
    imagePrompts: []
  }));

  assert.doesNotMatch(result.prompt, /CHARLY PODCAST|Hola mundo/);
  assert.equal((result.prompt.match(/A warm studio with a slow push in/g) || []).length, 1);
  assert.match(result.prompt, /Visible text: none\./);
});

test("individual caption sentences cannot leak when the stored caption has multiple sentences", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    captionText: "Primera frase literal. Segunda frase literal.",
    sceneDescription: "The host gestures while Primera frase literal appears in the visual concept.",
    visualNotes: "The facade contains Segunda frase literal beside the door.",
    scenePrompt: "",
    videoDirective: ""
  }));
  assert.doesNotMatch(result.prompt, /Primera frase literal|Segunda frase literal/);
  assert.match(result.prompt, /Visible text: none\./);
});

test("short editorial copy is removed only as a complete Unicode token", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    generator: "omni",
    textPolicy: "in_scene",
    inSceneText: "AI",
    sceneDescription: "A woman with braided hair walks down a staircase in a painting gallery. An AI sculpture rotates.",
    visualNotes: "",
    scenePrompt: "",
    videoDirective: "",
    imagePrompts: []
  }));

  assert.match(result.prompt, /braided hair walks down a staircase in a painting gallery/);
  assert.equal((result.prompt.match(/\bAI\b/g) || []).length, 1);
});

test("drops whole display instructions after removing editorial copy", () => {
  const contexts = [
    "A wall displays CHARLY PODCAST in bright neon.",
    "The old facade bears CHARLY PODCAST above the door.",
    "Paint CHARLY PODCAST across the studio wall.",
    "A board showing CHARLY PODCAST beside the host.",
    "A brass plaque with CHARLY PODCAST near the entrance.",
    "The monitor presents CHARLY PODCAST in blue."
  ];
  for (const context of contexts) {
    const result = buildDialogueVideoPromptBundle(createFixture({
      headlineText: "CHARLY PODCAST",
      captionText: "",
      sceneDescription: context,
      visualNotes: "A host enters a warm modern studio.",
      scenePrompt: "",
      videoDirective: "",
      imagePrompts: []
    }));
    assert.doesNotMatch(result.prompt, /CHARLY PODCAST|displays|bears|\bPaint\b|board showing|plaque with|presents/iu);
    assert.match(result.prompt, /A host enters a warm modern studio/);
    assert.match(result.prompt, /Visible text: none\./);
  }
});

test("display-context filtering keeps neutral visual prose around short copy", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    generator: "omni",
    textPolicy: "in_scene",
    inSceneText: "AI",
    sceneDescription: "A woman with braided hair walks down a staircase in a painting gallery. An AI sculpture rotates.",
    visualNotes: "",
    scenePrompt: "",
    videoDirective: "",
    imagePrompts: []
  }));
  assert.match(result.prompt, /braided hair walks down a staircase in a painting gallery/);
  assert.match(result.prompt, /An sculpture rotates/);
  assert.equal((result.prompt.match(/\bAI\b/g) || []).length, 1);
});

test("Reel uses 9:16 consistently", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    contentMode: "reel",
    isReel: true,
    aspectRatio: "9:16"
  }));

  assert.equal(result.aspectRatio, "9:16");
  assert.match(result.prompt, /video in 9:16\./);
  assert.doesNotMatch(result.prompt, /16:9/);
});

test("native dialogue is spoken without quote-delimited copy", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    dialogueAudioStoragePath: "",
    dialogueAudioUrl: "",
    text: "Hola desde el estudio"
  }));

  assert.match(result.prompt, /The speaker says: Hola desde el estudio\./);
  assert.doesNotMatch(result.prompt, /The speaker says: "/);
  assert.match(result.prompt, /Never show the dialogue as visible text\./);
});

test("reference-only scene excludes the script and explicitly keeps the subject silent", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    dialogueAudioStoragePath: "",
    dialogueAudioUrl: "",
    text: "Este guion nunca debe llegar al video.",
    excludeScriptFromVideoPrompt: true,
    dialoguePolicy: "ambient_only"
  }));

  assert.equal(result.excludeScriptFromVideoPrompt, true);
  assert.equal(result.dialoguePolicy, "ambient_only");
  assert.doesNotMatch(result.prompt, /Este guion nunca debe llegar al video/);
  assert.match(result.prompt, /No speech, narration, or lip-synced dialogue/);
  assert.match(result.prompt, /subject remains silent with a closed, relaxed mouth/);
});

test("HQ regeneration guidance is included after analysis and text directives remain sanitized", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    regenerationAnalysis: {
      summary: "The camera movement is coherent.",
      preserve: ["Keep the warm lighting."],
      improve: ["Make the subject motion smoother."],
      avoid: ["Remove the visible title saying OLD COPY."],
      qualityPrompt: "Use natural cinematic detail."
    }
  }));

  assert.match(result.prompt, /Regeneration guidance:/);
  assert.match(result.prompt, /Keep the warm lighting/);
  assert.match(result.prompt, /Make the subject motion smoother/);
  assert.match(result.prompt, /Use natural cinematic detail/);
  assert.doesNotMatch(result.prompt, /OLD COPY|visible title/);
  assert.ok(result.removedDirectives.some((item) => item.field === "regenerationAvoid"));
});

test("scene visual fallback remains metadata without duplicating it in the provider prompt", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    sceneDescription: "A single cobalt sculpture rotates slowly.",
    visualNotes: "",
    scenePrompt: "",
    videoDirective: "",
    imagePrompts: []
  }));

  assert.equal((result.prompt.match(/A single cobalt sculpture rotates slowly/g) || []).length, 1);
  assert.equal(result.sceneImagePromptList.length, 1);
  assert.match(result.sceneImagePromptList[0], /cobalt sculpture/);
  assert.doesNotMatch(result.prompt, /Reference intent:/);
});

test("image role guidance matches Omni role tags without generic contradictions", () => {
  const firstFrame = buildDialogueVideoPromptBundle(createFixture({ generator: "omni", imageInputRole: "first_frame" }));
  assert.match(firstFrame.prompt, /supplied first-frame image as the opening frame/);
  assert.doesNotMatch(firstFrame.prompt, /<FIRST_FRAME>|<IMAGE_REF_N>/);

  const references = buildDialogueVideoPromptBundle(createFixture({ generator: "omni", imageInputRole: "references" }));
  assert.match(references.prompt, /reference images in input order/);
  assert.doesNotMatch(references.prompt, /<FIRST_FRAME>|<IMAGE_REF_N>/);
});

test("sanitizer preserves visual direction while dropping text directives", () => {
  const result = sanitizeVisualDirective("Slow camera orbit. Show the word FUTURE in a logo. Warm sunset light.");
  assert.equal(result.removedCount, 1);
  assert.match(result.value, /Slow camera orbit/);
  assert.match(result.value, /Warm sunset light/);
  assert.doesNotMatch(result.value, /FUTURE|logo/);
});
