// Contrato: una escena local (Servidor Snoopy) no se pierde al refrescar el sitio.
// El módulo del generador está demasiado acoplado al DOM para ejecutarse en Node,
// así que aquí se verifica el contrato de código que hace posible la reanudación.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const sharedSource = readFileSync(new URL("../public/podcaster/podcaster-generation-shared.js", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../public/podcaster/podcaster-local-video-client.js", import.meta.url), "utf8");

test("el jobId local se guarda en cuanto Snoopy acepta la escena", () => {
  assert.match(
    generatorSource,
    /const \{ jobId, plan \} = await createLocalVideoJob\(\{[\s\S]*?\}\);[\s\S]*rememberLocalVideoPendingJob\(\{[\s\S]*jobId,[\s\S]*plan,[\s\S]*sessionId,[\s\S]*rowId,/m,
    "generateLocalDialogueVideo debe recordar el jobId antes de empezar a esperar."
  );
  assert.match(generatorSource, /const LOCAL_VIDEO_PENDING_STORAGE_KEY = "snoopy-local-video-jobs";/);
  // El registro vive keyed por sesión:escena, la misma llave que usan los chips.
  assert.match(generatorSource, /return `\$\{cleanSession\}:\$\{cleanRow\}`;/);
});

test("la espera, la subida y el enlace comparten una sola función reanudable", () => {
  const finish = generatorSource.match(/async function finishLocalDialogueVideoJob\(context = {}\) \{[\s\S]*?\n\}/m)?.[0] || "";
  assert.ok(finish.length > 400, "finishLocalDialogueVideoJob debe existir con su cola completa.");
  ["pollLocalDialogueVideoJob", "fetchLocalVideoBlob", "uploadPodcasterAsset", "local-video/accounting", "linkLocalVideoClip"]
    .forEach((step) => assert.ok(finish.includes(step), `finishLocalDialogueVideoJob debe incluir ${step}`));
  assert.ok(!finish.includes("createLocalVideoJob"), "reanudar jamás debe pedir un video nuevo.");
});

test("al recargar, la escena se marca como pendiente y se reanuda sin reintento", () => {
  const resume = generatorSource.match(/async function resumeLocalDialogueVideoJob\(record = {}\) \{[\s\S]*?\n\}/m)?.[0] || "";
  assert.ok(resume.length > 400, "debe existir la función de reanudación.");
  ["ensureTimelineScenePendingVisible", "dialogueVideoGenerationPending.add(pendingKey)", "finishLocalDialogueVideoJob", "probeLocalVideoEngine"]
    .forEach((step) => assert.ok(resume.includes(step), `la reanudación necesita ${step}`));
  assert.ok(!resume.includes("createLocalVideoJob"), "la reanudación no puede crear un segundo job (gastaría GPU de más).");
  // El clip recuperado pasa por la misma aplicación de selección que uno nuevo.
  assert.match(resume, /runtime\.applySceneMediaSelection\([\s\S]*runtime\.captureSceneMediaSelection\(session, record\.rowId\)/m);
  assert.match(generatorSource, /async function resumeLocalDialogueVideoJobs\(\)[\s\S]*readLocalVideoPendingJobs\(\)/m);
});

test("el registro de la escena se limpia tanto al terminar como al cancelar", () => {
  const finallyBlock = generatorSource.match(/\} finally \{\n\s*dialogueVideoGenerationPending\.delete\(pendingKey\);[\s\S]*?\n\s*\}/m)?.[0] || "";
  assert.ok(finallyBlock.includes("forgetLocalVideoPendingJob(pendingKey)"), "el finally debe borrar el registro pendiente.");
  assert.match(generatorSource, /resumeLocalDialogueVideoJob[\s\S]*?finally \{[\s\S]*?forgetLocalVideoPendingJob\(pendingKey\);/m);
});

test("podcaster.js reanuda al abrir la sesión y comparte una sola copia del cliente", () => {
  assert.match(
    podcasterSource,
    /revealWorkspace\(\);\n\s*\/\/[^\n]*\n\s*void podcasterGenerationShared\.resumeLocalDialogueVideoJobs\?\.\(\);/,
    "la reanudación debe correr justo cuando el espacio de trabajo está visible."
  );
  assert.match(sharedSource, /resumeLocalDialogueVideoJobs: null,/);
  assert.match(generatorSource, /registerPodcasterGenerationShared\(\{[\s\S]*resumeLocalDialogueVideoJobs,/m);
  const clientRev = /"\.\/podcaster-local-video-client\.js\?v=([^"]+)"/;
  const inPodcaster = podcasterSource.match(clientRev)?.[1];
  const inGenerator = generatorSource.match(clientRev)?.[1];
  assert.ok(inPodcaster, "podcaster.js debe fijar la versión del cliente local.");
  assert.equal(inGenerator, inPodcaster, "los dos módulos deben importar la MISMA url del cliente para no duplicar estado.");
});

test("el enlace de un clic de la consola se canjea y limpia la URL", () => {
  assert.match(clientSource, /export async function redeemLocalVideoInviteFromUrl\(\)/);
  assert.match(clientSource, /searchParams\.delete\("snoopy"\)/);
  assert.match(clientSource, /localVideoEngineUrl\("\/pair\/redeem"\)/);
  assert.match(clientSource, /setLocalVideoToken\(data\.token\)/);
  assert.match(podcasterSource, /redeemLocalVideoInviteFromUrl/);
  assert.match(podcasterSource, /void consumeLocalVideoInvite\(\);/);
});

test("la descarga de Servidor Snoopy siempre está a la vista en Ajustes", () => {
  const studioHtml = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  const render = podcasterSource.match(/function renderGlobalVideoModelOptions\([\s\S]*?\n\}/m)?.[0] || "";
  assert.ok(render, "podcaster.js debe seguir pintando el selector de modelo de video");
  // Borrar la app (o tener Snoopy caído) no puede dejar al usuario sin forma de
  // reinstalarla: la fila es HTML estático y ningún render la oculta ya.
  assert.match(studioHtml, /<div class="global-config-row" id="podcasterLocalSnoopyRow">/);
  assert.match(studioHtml, /href="\/descargas\/servidor-snoopy-mac\.zip" download/);
  assert.doesNotMatch(render, /podcasterLocalSnoopyRow/);
  assert.doesNotMatch(podcasterSource, /getElementById\("podcasterLocalSnoopyRow"\)/);
});
