import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const payloadSource = readFileSync(new URL("../public/podcaster/podcaster-session-payload.js", import.meta.url), "utf8");

if (!/const isVideoMode = isCreativeVideoMode\(session\);[\s\S]*const hosts = isVideoMode[\s\S]*currentHosts\.length \? currentHosts : \["Narrador"\][\s\S]*hostsForCount\(hostCount\)/m.test(podcasterSource)) {
  throw new Error("Aplicar cambios en modo video debe conservar Narrador como host, no reemplazarlo por Host A.");
}

if (!/creativeVideoConfig: isVideoMode[\s\S]*globalVoiceName: voiceMap\["Narrador"\] \|\| voiceMap\[hosts\[0\]\]/m.test(podcasterSource)) {
  throw new Error("Aplicar cambios debe sincronizar la voz del Narrador hacia creativeVideoConfig.globalVoiceName.");
}

if (!/els\.creativeGlobalVoiceName\.addEventListener\("change"[\s\S]*speakerVoiceMap:\s*\{[\s\S]*Narrador: voiceName[\s\S]*scheduleSessionLocalPersist\("creative-global-voice"\);/m.test(podcasterSource)) {
  throw new Error("Cambiar Voz global en off debe guardar speakerVoiceMap.Narrador y marcar persistencia local.");
}

if (!/rows: normalizeRows\(session\.script\?\.rows\)\.map\(\(row\) => normalizeRowVoiceConfig\(row, session, \{[\s\S]*hostVoiceName: voiceName[\s\S]*voiceNameSource: "host"/m.test(podcasterSource)) {
  throw new Error("Cambiar Voz global en off debe rehidratar filas heredadas con la voz del Narrador sin convertirlas en override local.");
}

if (!/speakerVoiceMap: getSpeakerVoiceMap\?\.\(source\) \|\| \{\}/.test(payloadSource)) {
  throw new Error("El payload cloud debe conservar speakerVoiceMap.");
}

if (!/creativeVideoConfig: normalizeCreativeVideoConfig\?\.\(source\?\.creativeVideoConfig \|\| \{\}\) \|\| \{\}/.test(payloadSource)) {
  throw new Error("El payload cloud debe conservar creativeVideoConfig.globalVoiceName.");
}

console.log("Podcaster creative narrator voice persistence OK.");
