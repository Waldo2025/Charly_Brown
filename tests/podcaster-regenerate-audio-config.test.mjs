import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { sourceFunctions } from "./helpers/snoopy-source.mjs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

test("language and speaker controls share the Estructura y Locutores section", () => {
  const sectionStart = html.indexOf("Estructura y Locutores");
  const nextSection = html.indexOf("Muletillas y Errores", sectionStart);
  const localeSelect = html.indexOf('id="globalSpeechLocaleSelect"');
  const speakerSettings = html.indexOf('id="globalSpeakerSettings"');

  assert.ok(sectionStart >= 0);
  assert.ok(nextSection > sectionStart);
  assert.ok(localeSelect > sectionStart && localeSelect < nextSection);
  assert.ok(speakerSettings > sectionStart && speakerSettings < nextSection);
  assert.equal(html.match(/id="globalSpeakerSettings"/g)?.length, 1);
});

test("bulk Gemini regeneration is gated by the language and voice modal", () => {
  for (const id of [
    "regenerateGeminiAudioConfigModal",
    "regenerateGeminiSpeechLocaleSelect",
    "regenerateGeminiVoiceSettings",
    "continueCurrentGeminiAudioConfigBtn",
    "applyAndRegenerateGeminiAudiosBtn"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(source, /data-action='regenerate-all-gemini-audios'[\s\S]*?openRegenerateGeminiAudioConfig\(btn\)/);
  assert.match(source, /continueCurrentGeminiAudioConfigBtn\.addEventListener\("click", async \(\) => \{[\s\S]*?runRegenerateAllGeminiAudios\(\)/);
  assert.match(source, /applyAndRegenerateGeminiAudiosBtn\.addEventListener\("click", async \(\) => \{[\s\S]*?applyRegenerateGeminiAudioConfigDraft\(\)[\s\S]*?runRegenerateAllGeminiAudios\(\)/);
});

test("applying global voices updates inherited rows and preserves scene overrides", () => {
  const context = vm.createContext({
    getSpeakerVoiceMap: (session) => ({ ...session.speakerVoiceMap }),
    getSpeakerOptions: () => ["Narrador"],
    normalizeLiveVoiceName: (voiceName, fallback) => voiceName || fallback,
    resolveSpeakerVoiceName: (speaker, session) => session.speakerVoiceMap[speaker],
    normalizeRows: (rows) => rows,
    normalizeVoiceNameSource: (source) => source === "row" ? "row" : "host",
    normalizeRowVoiceConfig: (row, _session, options) => ({
      ...row,
      voiceName: options.voiceName,
      voiceNameSource: options.voiceNameSource
    })
  });
  vm.runInContext(sourceFunctions(new URL("../public/podcaster/podcaster.js", import.meta.url), [
    "applySpeakerVoiceMapToSession"
  ]), context);

  const session = {
    speakerVoiceMap: { Narrador: "Kore" },
    script: {
      rows: [
        { id: "inherited", speaker: "Narrador", voiceName: "Kore", voiceNameSource: "host" },
        { id: "override", speaker: "Narrador", voiceName: "Puck", voiceNameSource: "row" }
      ]
    }
  };
  const result = context.applySpeakerVoiceMapToSession(session, { Narrador: "Orus" });

  assert.equal(result.speakerVoiceMap.Narrador, "Orus");
  assert.deepEqual(
    result.script.rows.map(({ voiceName, voiceNameSource }) => ({ voiceName, voiceNameSource })),
    [
      { voiceName: "Orus", voiceNameSource: "host" },
      { voiceName: "Puck", voiceNameSource: "row" }
    ]
  );
});
