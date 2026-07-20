import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");
const audioSource = readFileSync(new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url), "utf8");
const videoSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");

if (!/const fromScript = normalizeRows\(session\.script\?\.rows\)\.map\(\(row\) => normalizeRowVoiceConfig\(row, session\)\);/.test(podcasterSource)) {
  throw new Error("getSessionRows debe hidratar voiceName/voiceNameSource por fila.");
}

if (!/function resolveConfiguredSpeakerVoiceForGeneration\(speaker = "", session = null\) \{[\s\S]*normalizeVoiceNameSource\(row\?\.voiceNameSource\) === "row"[\s\S]*collectGlobalSpeakerDraft\(activeSession\)[\s\S]*readRowVoiceDraftValue\(rowId\)/m.test(podcasterSource)) {
  throw new Error("La resolución de voz debe priorizar override de fila, luego voz global, y solo después draft local marcado como row.");
}

if (!/function readRowVoiceDraftValue\(rowId = ""\) \{[\s\S]*normalizeVoiceNameSource\(input\?\.dataset\?\.voiceSource\) !== "row"[\s\S]*continue;/m.test(podcasterSource)) {
  throw new Error("El draft del selector de voz por escena solo debe contar cuando data-voice-source='row'.");
}

if (!/function flushScriptEditorVoiceDraftsToSession\(\) \{[\s\S]*normalizeVoiceNameSource\(input\?\.dataset\?\.voiceSource\) !== "row"[\s\S]*return;/m.test(podcasterSource)) {
  throw new Error("El flush previo a regenerar audio no debe convertir voces heredadas del host en overrides por escena.");
}

if (!/persistSpeakerIdentityDraft\(\) \{[\s\S]*normalizeVoiceNameSource\(row\?\.voiceNameSource\) === "row"[\s\S]*voiceNameSource: "host"/m.test(podcasterSource)) {
  throw new Error("La persistencia global debe propagar la voz del host solo a filas heredadas.");
}

if (!/field === "voiceName"[\s\S]*script:\s*\{[\s\S]*voiceNameSource: "row"/m.test(editorSource)) {
  throw new Error("Editar voiceName en una escena debe persistir override local por fila.");
}

if (!/data-field="voiceName"[\s\S]*data-voice-source="\$\{escapeHtml\(window\.normalizeVoiceNameSource\?\.\(row\.voiceNameSource\) \|\| "host"\)\}"/m.test(editorSource)) {
  throw new Error("El selector de voz por escena debe marcar si hereda del host o si es override local.");
}

if (!/field === "voiceName"[\s\S]*target\.dataset\.voiceSource = "row";/m.test(editorSource)) {
  throw new Error("Cambiar manualmente la voz de una escena debe marcar el selector como override local.");
}

if (/if \(field === "voiceName"\) \{[\s\S]*?speakerVoiceMap:[\s\S]*?return;/m.test(editorSource)) {
  throw new Error("Editar voiceName en una escena no debe mutar speakerVoiceMap global.");
}

if (!/field === "speaker"[\s\S]*voiceNameSource: "host"/m.test(editorSource)) {
  throw new Error("Cambiar speaker en una fila debe resetear la voz a herencia del nuevo host.");
}

if (!audioSource.includes("window.resolveConfiguredSpeakerVoiceForGeneration(row, session)")) {
  throw new Error("La regeneración de audios Gemini debe usar la voz por fila.");
}

if (!videoSource.includes("resolveConfiguredSpeakerVoiceForGeneration(row, session)")) {
  throw new Error("La generación de video también debe usar la voz por fila.");
}

if (!/const aliasMap = buildSpeakerAliasMap\(hosts, \{ nameMap: maps\.nameMap \}\);[\s\S]*const connectedRows = normalizeRows\(nextScriptWithDisfluency\.rows\)\.map\(\(row,\s*index\) => \{[\s\S]*const expectedSpeaker = hosts\[index % Math\.max\(1,\s*hosts\.length\)\] \|\| hosts\[0\] \|\| "Host A";[\s\S]*const speaker = resolveSpeakerFromAliases\(String\(row\?\.speaker \|\| ""\)\.trim\(\), \{[\s\S]*fallback: expectedSpeaker,[\s\S]*nameMap: maps\.nameMap[\s\S]*normalizeVoiceNameSource\(row\?\.voiceNameSource\) === "row"[\s\S]*hostVoiceName: maps\.voiceMap\[speaker\][\s\S]*voiceNameSource: "host"/m.test(generatorSource)) {
  throw new Error("connectScriptSnapshotToPanel debe resolver alias de Locutor al host correcto, caer al host esperado por posición y rehidratar la voz del host del snapshot, preservando solo los overrides row.");
}

if (!/const voiceNameSource = String\(row\?\.voiceNameSource \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "row" \? "row" : "host";[\s\S]*const explicitVoice = voiceNameSource === "row"[\s\S]*voiceName: explicitVoice \|\| fallbackVoice,[\s\S]*voiceNameSource: explicitVoice \? "row" : "host"/m.test(generatorSource)) {
  throw new Error("normalizeScriptPayload debe recalcular la voz heredada desde el speaker actual y conservar voiceName solo para overrides row.");
}

console.log("Podcaster row-level voice source of truth OK.");
