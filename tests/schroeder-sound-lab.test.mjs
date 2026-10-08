import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../public/schroederSoundLab.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/schroeder-sound-lab/app.js", import.meta.url), "utf8");
const sessions = readFileSync(new URL("../public/schroeder-sound-lab/sessions.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/schroeder-sound-lab/styles.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../public/js/chromeLayout.js", import.meta.url), "utf8");
const jobs = readFileSync(new URL("../functions/src/ai-jobs.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const libraryUi = readFileSync(new URL("../public/schroeder-sound-lab/audio-library.js", import.meta.url), "utf8");

test("Schroeder Sound Lab usa tres paneles desplazables y tres temas", () => {
  assert.match(html, /class="ssl-grid"/);
  assert.match(html, /id="sslSessionList"/);
  assert.match(html, /id="sslChatFeed"/);
  assert.match(html, /id="sslLibraryList"/);
  assert.match(css, /\.ssl-session-list,[\s\S]*?\.ssl-library-list,[\s\S]*?\.ssl-chat-feed[\s\S]*?overflow:\s*auto/);
  assert.match(css, /data-schroeder-theme="mid"/);
  assert.match(css, /data-schroeder-theme="light"/);
  assert.match(html, /id="sslLeftResizer"/);
  assert.match(html, /id="sslRightResizer"/);
  assert.match(css, /\.ssl-panel-resizer\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(html, /class="ssl-panel ssl-sessions"[\s\S]*?<header class="ssl-header">/);
  assert.doesNotMatch(html, /<main class="ssl-shell"[^>]*>\s*<header class="ssl-header">/);
  assert.match(css, /\.ssl-shell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\)/);
});

test("la generación requiere aprobar brief y audio antes de entrar a biblioteca", () => {
  assert.match(app, /Aprobar y generar/);
  assert.match(app, /Aprobar audio/);
  assert.match(app, /lab\.library\.unshift/);
  assert.match(app, /Seguir editando/);
  assert.match(app, /class="ssl-draft-content"/);
  assert.match(app, /class="ssl-draft-icon"/);
  assert.match(app, /class="ssl-draft-discard"[\s\S]*?data-tooltip="Descartar brief"/);
  assert.match(app, /ssl-draft-generate/);
  assert.match(css, /\.ssl-draft-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto[\s\S]*?box-shadow:\s*none/);
  assert.match(app, /lab\.messages = \[\]; lab\.draft = null; lab\.pending = \[\]/);
});

test("ofrece canciones completas, voces agrupadas y descarga MP3", () => {
  assert.match(html, /lyria-3\.5/);
  assert.match(html, /lyria-3-pro-preview/);
  assert.match(html, /id="sslVoiceLanguage"/);
  assert.match(html, /id="sslVoiceName"/);
  assert.match(app, /gemini-3\.8-flash-tts/);
  assert.match(app, /schroeder\/music\/generate/);
  assert.match(jobs, /schroeder\/voice\/generate/);
  assert.match(readFileSync(new URL("../public/schroeder-sound-lab/audio-library.js", import.meta.url), "utf8"), /item\.kind === "music" \? "mp3"/);
});

test("mueve la configuración a modales y deja libre el área de chat", () => {
  assert.match(html, /id="sslAgentModal"/);
  assert.match(html, /id="sslGeneralModal"/);
  assert.match(html, /id="sslGeneralSettingsBtn"/);
  assert.match(html, /data-genre-preset="Afrobeat"/);
  assert.match(css, /\.ssl-modal-card/);
  assert.match(css, /\.ssl-modal \*[\s\S]*?box-sizing:\s*border-box/);
  assert.doesNotMatch(html, />Firebase</);
});

test("las generaciones persisten, se reanudan y solo se detienen al cancelar", () => {
  assert.match(sessions, /jobs:\s*\(Array\.isArray\(lab\.jobs\)/);
  assert.match(app, /resumeSessionJobs/);
  assert.match(app, /startJobPolling/);
  assert.match(app, /schroeder\/jobs\/\$\{encodeURIComponent\(jobId\)\}/);
  assert.match(app, /data-chat-action="cancel-job"/);
  assert.match(jobs, /schroeder\/jobs\/:jobId\/cancel/);
  assert.match(backend, /schroederGenerationJobs/);
  assert.match(backend, /client\.interactions\.create/);
  assert.match(backend, /"lyria-3\.5", "lyria-3-pro-preview", "lyria-3-clip-preview"/);
});

test("guarda sesiones en localStorage y publica solo audios aprobados en Firebase Storage", () => {
  assert.match(sessions, /schroeder-sound-lab:sessions/);
  assert.match(sessions, /localStorage\.setItem/);
  assert.doesNotMatch(sessions, /podcaster\/sessions\/(?:save|list|get|delete)/);
  assert.match(app, /approveAudio\(item, state\.active\)/);
  assert.match(jobs, /schroeder-sound-lab\/previews/);
  assert.match(jobs, /schroeder-sound-lab\/approved/);
  assert.match(backend, /\/api\/schroeder\/library\/approve/);
  assert.match(backend, /\/api\/schroeder\/library\/list/);
  assert.match(backend, /\/api\/schroeder\/previews\/delete/);
  assert.match(sessions, /\/api\/schroeder\/previews\/list/);
  assert.match(app, /recoverPendingPreviews/);
  assert.match(backend, /\/api\/schroeder\/previews\/list/);
  assert.match(jobs, /\/api\/schroeder\/previews\/list/);
});

test("el acceso aparece inmediatamente después de Image Creator", () => {
  assert.match(layout, /imageCreator\.html'[^\n]+\n\s*\{ href: 'schroederSoundLab\.html'/);
  assert.match(html, /id="sslAdminBtn"/);
  assert.match(sessions, /podcaster\/users\/list/);
});

test("usa logotipo propio, acciones compactas y reproductor persistente", () => {
  assert.match(html, /schroeder-adult-piano\.png/);
  assert.match(html, /id="sslNowPlaying"/);
  assert.match(html, /class="ssl-panel ssl-library"[\s\S]*?id="sslNowPlaying"[\s\S]*?<\/div>\s*<\/main>/);
  assert.match(html, /data-tooltip="Nueva sesión"/);
  assert.match(css, /@keyframes ssl-spotlight/);
  assert.match(css, /@keyframes ssl-composer-trace/);
  assert.match(libraryUi, /class="ssl-track-row"/);
  assert.match(libraryUi, /fa-ellipsis-vertical/);
  assert.match(libraryUi, /createAudioPlayer/);
  assert.match(libraryUi, /schroeder-sound-lab:player:v1/);
  assert.match(libraryUi, /pagehide/);
  assert.match(libraryUi, /async restore\(\)/);
  assert.match(html, /data-player-action="close"[\s\S]*?Cerrar reproductor/);
  assert.match(libraryUi, /close:\s*closePlayer/);
  assert.match(app, /action === "close"[\s\S]*?player\.close\(\)/);
  assert.match(app, /player\.restore\(\)/);
  assert.match(css, /\.ssl-now-playing\s*\{[\s\S]*?right:\s*calc\(var\(--ssl-right-panel-width\) \+ 1px\)[\s\S]*?left:\s*calc\(var\(--ssl-left-panel-width\) \+ 1px\)[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /\.ssl-player-active \.ssl-chat\s*\{\s*margin-bottom:\s*var\(--ssl-player-height\)/);
  assert.doesNotMatch(css, /\.ssl-player-active \.ssl-chat,\s*\n\s*\.ssl-player-active \.ssl-library/);
  assert.doesNotMatch(css, /\.ssl-player-active \.ssl-shell\s*\{/);
  assert.doesNotMatch(libraryUi, /<audio controls/);
  assert.match(html, /<h2>Música aprobada<\/h2>/);
  assert.match(app, /class="ssl-review-player"/);
  assert.doesNotMatch(app, /ssl-review-card[^\n]+<h3>/);
  assert.doesNotMatch(app, /ssl-review-card[^\n]+<audio controls/);
});

test("convierte una grabación vocal en brief y permite enviarla a Podcaster", () => {
  assert.match(html, /id="sslRecordIdeaBtn"/);
  assert.match(html, /id="sslRecordedReference"[\s\S]*?id="sslRecordedPlayBtn"[\s\S]*?id="sslRecordedProgress"/);
  assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(app, /function attachRecordedReference\(blob, durationSec,/);
  assert.match(app, /if \(recorderState\.pendingBlob \|\| recorderState\.pendingEditItem\)[\s\S]*?analyzeRecordedIdea/);
  assert.match(app, /preparedDraftId/);
  assert.match(app, /schroeder-sound-lab:pending-recording:v1/);
  assert.match(app, /function restoreRecordedReference\(\)/);
  assert.match(app, /localStorage\.setItem\(RECORDED_REFERENCE_KEY/);
  assert.doesNotMatch(app, /await analyzeRecordedIdea\(recorderState\.pendingBlob[\s\S]{0,180}discardRecordedReference\(\)/);
  assert.match(app, /Escribe qué quieres hacer con este audio/);
  assert.match(app, /schroeder\/audio-reference\/analyze/);
  assert.match(app, /analysisMode:\s*"musical-reference"/);
  assert.match(app, /userInstruction:\s*String\(userInstruction/);
  assert.match(app, /echoCancellation:\s*false, noiseSuppression:\s*false, autoGainControl:\s*false/);
  assert.match(html, /Grabar melodía o sonido/);
  assert.match(app, /addApprovedAudioToPodcaster/);
  assert.match(sessions, /schroeder\/library\/add-to-podcaster/);
  assert.match(backend, /\/api\/schroeder\/audio-reference\/analyze/);
  assert.match(backend, /analyzeHummingWithFallback/);
  assert.match(backend, /whistling, beatboxing, clicks, buzzing/);
  assert.match(backend, /When a target instrument is requested/);
  assert.match(backend, /No se detectó un gesto musical claro/);
  assert.match(backend, /\/api\/schroeder\/library\/add-to-podcaster/);
  assert.match(jobs, /\/api\/schroeder\/audio-reference\/analyze/);
  assert.match(jobs, /HUMMING_ANALYSIS_FALLBACK_PROMPT/);
  assert.match(jobs, /buildPolicySafeMusicPrompt/);
  assert.match(backend, /buildPolicySafeMusicPrompt/);
  assert.match(jobs, /music_prompt_blocked/);
  assert.match(jobs, /userInstruction:\s*req\.body\?\.userInstruction/);
  assert.doesNotMatch(backend, /clone the speaker's voice/);
  assert.doesNotMatch(jobs, /clone the speaker's voice/);
  assert.match(jobs, /podcaster_music_library/);
  assert.match(css, /\.ssl-recorded-reference\s*\{[\s\S]*?grid-template-columns:/);
});

test("el chat tiene un único header compacto, modos por icono y brillo contenido", () => {
  assert.match(html, /class="ssl-chat-header"[^>]*>[\s\S]*?data-mode="music"[\s\S]*?data-mode="voice"/);
  assert.match(html, /class="ssl-chat-header-actions"[\s\S]*?Acciones de creación[\s\S]*?ssl-action-separator[\s\S]*?class="ssl-header-actions ssl-action-group"/);
  assert.match(html, /class="ssl-header-actions ssl-action-group"[\s\S]*?id="sslThemeBtn"[\s\S]*?id="sslGeneralSettingsBtn"/);
  assert.match(html, /id="sslAgentSettingsBtn"[\s\S]*?fa-wand-magic-sparkles/);
  assert.match(html, /id="sslGeneralSettingsBtn"[\s\S]*?fa-gear/);
  assert.match(css, /\.ssl-action-separator\s*\{[\s\S]*?width:\s*1px/);
  assert.doesNotMatch(html, /class="ssl-creation-toolbar"/);
  assert.match(html, /class="ssl-composer-input-shell"/);
  assert.match(html, /class="ssl-composer-input-footer"/);
  assert.match(html, /ssl-composer-toolbar[\s\S]*?id="sslRecordIdeaBtn"[\s\S]*?ssl-composer-quick-settings[\s\S]*?ssl-send-button/);
  assert.match(html, /id="sslQuickGenrePicker"[\s\S]*?id="sslQuickGenre"[\s\S]*?Fusión latina/);
  assert.match(app, /elements\.quickGenre\.value[\s\S]*?elements\.genre\.value/);
  assert.match(css, /\.ssl-composer-input-footer\s*\{[\s\S]*?justify-content:\s*center/);
  assert.match(html, /id="sslGeminiModel"[\s\S]*?lyria-3\.5[\s\S]*?lyria-3-pro-preview[\s\S]*?lyria-3-clip-preview/);
  assert.match(css, /\.ssl-composer-model-picker/);
  assert.match(css, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.ssl-composer-input-shell::before/);
  assert.match(css, /@keyframes ssl-composer-trace/);
  assert.match(css, /@property --ssl-trace-color/);
  assert.match(css, /var\(--ssl-trace-color\) 94%/);
  assert.match(css, /--ssl-trace-color:\s*#75e8c4/);
  assert.match(css, /\.ssl-message p[\s\S]*?font-size:\s*calc\(14px \+ var\(--ssl-font-adjust\)\)/);
  assert.match(html, /data-genre-family="latin"/);
  assert.match(css, /data-genre-family="electronic"/);
  assert.match(css, /--ssl-chat-agent:/);
  assert.match(css, /--ssl-chat-user:/);
  assert.match(css, /body\[data-page="schroederSoundLab\.html" i\] \.ssl-message\.is-user p[\s\S]*?var\(--ssl-chat-user\)/);
  assert.match(css, /\.ssl-message p[\s\S]*?var\(--ssl-chat-agent\)/);
  assert.match(css, /\.ssl-header\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /\.ssl-panel\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /\.ssl-chat-feed\s*\{[\s\S]*?padding:\s*30px clamp\(28px, 6vw, 88px\)/);
  assert.match(css, /\.ssl-composer\s*\{[\s\S]*?margin:\s*0 12px 14px/);
  assert.match(css, /\.ssl-composer textarea[\s\S]*?min-height:\s*88px/);
  assert.match(css, /\.ssl-composer textarea[\s\S]*?grid-row:\s*2/);
  assert.match(css, /\.ssl-composer-input-footer[\s\S]*?grid-row:\s*3/);
  assert.match(css, /\.ssl-message p[\s\S]*?border:\s*0[\s\S]*?box-shadow:\s*none/);
});

test("los tooltips flotan sobre la interfaz y permanecen dentro de la pantalla", () => {
  assert.match(app, /function setupFloatingTooltips\(\)/);
  assert.match(app, /document\.body\.append\(tooltip\)/);
  assert.match(app, /window\.visualViewport/);
  assert.match(app, /Math\.max\(viewportLeft \+ margin, Math\.min\(idealLeft/);
  assert.match(app, /useBelow/);
  assert.match(css, /\.ssl-floating-tooltip\s*\{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*2147483647/);
  assert.match(css, /max-width:\s*min\(260px, calc\(100vw - 16px\)\)/);
  assert.match(css, /\[data-tooltip\]::after\s*\{\s*content:\s*none !important/);
  assert.doesNotMatch(html, /data-tooltip="[^"]+"[^>]+title=/);
});

test("el selector del compositor usa Lyria y mantiene separado el análisis de audio", () => {
  assert.match(html, /id="sslGeminiModel"[\s\S]*?lyria-3\.5[\s\S]*?lyria-3-pro-preview[\s\S]*?lyria-3-clip-preview/);
  assert.match(app, /composerMusicModel:\s*elements\.geminiModel\.value/);
  assert.match(app, /model:\s*AUDIO_ANALYSIS_MODEL/);
  assert.match(app, /agentModel:\s*base\?\.agentModel \|\| AUDIO_ANALYSIS_MODEL/);
  assert.match(html, /id="sslQuickDuration"[\s\S]*?id="sslQuickMusicType"[\s\S]*?id="sslQuickLanguage"[\s\S]*?id="sslQuickBpm"/);
  assert.match(css, /\.ssl-composer-quick-settings/);
  assert.match(backend, /allowedModels = new Set\(\["gemini-3\.8-flash", "gemini-3\.5-flash-lite", "gemini-3\.1-pro-preview"\]\)/);
  assert.match(jobs, /allowedModels = new Set\(\["gemini-3\.8-flash", "gemini-3\.5-flash-lite", "gemini-3\.1-pro-preview"\]\)/);
});

test("simplifica el header, conserva preferencias y muestra el logo durante la generación", () => {
  assert.doesNotMatch(html, /ssl-persistence-state/);
  assert.doesNotMatch(html, /Estudio generativo/);
  assert.match(html, /id="sslFontSize"/);
  assert.match(app, /fontSize:\s*document\.documentElement\.dataset\.schroederFontSize/);
  assert.match(app, /creationMode:\s*state\.mode/);
  assert.match(app, /panelLeftWidth/);
  assert.match(app, /ssl-job-logo-spinner/);
  assert.match(app, /function updateJobCard\(job\)/);
  assert.match(app, /!updateJobCard\(job\)/);
  assert.match(css, /@keyframes ssl-logo-spin/);
  assert.match(css, /\.ssl-job-card::before[\s\S]*?animation:\s*ssl-composer-trace 9s/);
  assert.match(css, /\.ssl-job-card\s*\{[\s\S]*?min-height:\s*168px[\s\S]*?flex:\s*0 0 auto/);
  assert.doesNotMatch(css, /\.ssl-job-card\s*\{\s*border-left:\s*3px/);
  assert.doesNotMatch(app, /titleFromText\(prompt/);
  assert.match(app, /title:\s*base\?\.title \|\| "Nueva canción"/);
  assert.match(app, /"Nueva palabra"[\s\S]*?"Nuevo diálogo"[\s\S]*?"Nueva frase"/);
});

test("mantiene la cronología, guarda la configuración por sesión y reutiliza la huella musical", () => {
  assert.match(app, /timeline\.sort\(\(a, b\) => a\.time - b\.time/);
  assert.match(app, /settings:\s*source\.settings/);
  assert.match(sessions, /settings:\s*lab\.settings/);
  assert.match(app, /elements\.agentModal\.addEventListener\("change", persistCreationSettings\)/);
  assert.match(app, /latestRevisionSource/);
  assert.match(app, /musicalFingerprint/);
  assert.match(app, /Preserve the original song identity, harmony, recurring motifs/);
  assert.match(backend, /analyzeGeneratedSongFingerprint/);
  assert.match(jobs, /analyzeMusicalFingerprint/);
  assert.match(backend, /chordProgression/);
  assert.match(jobs, /anchorNotes/);
  const continueFlow = app.match(/if \(action === "continue" && item\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(continueFlow, /lab\.draft\s*=/);
  assert.doesNotMatch(continueFlow, /discardPreview|lab\.pending\s*=/);
});

test("separa títulos, permite renombrar canciones y usa menú por sesión", () => {
  assert.doesNotMatch(app, /state\.active\.title === "Nueva sesión"/);
  assert.match(app, /addEventListener\("dblclick"/);
  assert.match(app, /renameApprovedAudio\(item, nextTitle\)/);
  assert.match(sessions, /schroeder\/library\/rename/);
  assert.match(backend, /\/api\/schroeder\/library\/rename/);
  assert.match(jobs, /\/api\/schroeder\/library\/rename/);
  assert.match(app, /data-action="session-menu"/);
  assert.match(app, /data-action="rename-session"/);
  assert.match(app, /Eliminar sesión/);
});

test("la referencia de micrófono detecta backends antiguos y normaliza WebM", () => {
  const devLocal = readFileSync(new URL("../scripts/dev-local.sh", import.meta.url), "utf8");
  assert.match(backend, /schroederAudioReferenceRoute:\s*true/);
  assert.match(devLocal, /schroederAudioReferenceRoute/);
  assert.match(devLocal, /schroeder\/audio-reference\/analyze/);
  assert.match(backend, /toLowerCase\(\)\.split\(";"\)/);
  assert.match(jobs, /toLowerCase\(\)\.slice\(0, 80\)\.split\(";"\)/);
  assert.match(css, /animation:\s*ssl-composer-trace 9s/);
  assert.match(css, /--ssl-trace-size:\s*12%/);
});

test("el agente conversa, acumula géneros y ofrece perfiles vocales oficiales", () => {
  assert.match(app, /function shouldPrepareDraft\(prompt/);
  assert.match(app, /function sendConversationalMessage\(prompt\)/);
  assert.match(app, /\/api\/gemini\/generate/);
  assert.match(app, /No conviertas autom[aá]ticamente cada mensaje en un brief/);
  assert.match(app, /type:\s*"genre"/);
  assert.match(sessions, /message\?\.type === "genre"/);
  assert.match(html, /id="sslVoiceMenuBtn"[^>]*>[\s\S]*?fa-microphone-lines[\s\S]*?<\/button>/);
  assert.match(html, /data-voice-mode="instrumental"[\s\S]*?data-voice-mode="vocal"/);
  assert.match(html, /data-singer-profile="female-soprano"[\s\S]*?data-singer-profile="female-alto"[\s\S]*?data-singer-profile="male-tenor"[\s\S]*?data-singer-profile="male-baritone"[\s\S]*?data-singer-profile="weathered-rocker"/);
  assert.match(app, /Singer profile:/);
  assert.match(css, /\.ssl-chat-genre-badge/);
  assert.match(css, /\.ssl-singer-menu/);
});

test("adjunta y analiza una canción antes de preparar su variación", () => {
  assert.match(app, /function attachExistingAudioReference\(item/);
  assert.match(app, /kind:\s*"existing-audio"/);
  assert.match(app, /analysisMode:\s*"song-revision"/);
  assert.match(app, /storagePath:\s*editItem\.storagePath/);
  assert.match(app, /prepareDraft\(prompt,[\s\S]*?revisionBase\)/);
  assert.match(backend, /SONG_REVISION_ANALYSIS_PROMPT/);
  assert.match(backend, /allowedPrefixes[\s\S]*?schroeder-sound-lab\/previews/);
  assert.match(jobs, /SONG_REVISION_ANALYSIS_PROMPT/);
  assert.match(jobs, /file\.download\(\)/);
});

test("replica una voz con consentimiento y la limita a frases y diálogos", () => {
  assert.match(html, /id="sslVoiceCloneModal"/);
  assert.match(html, /id="sslRecordVoiceSampleBtn"/);
  assert.match(html, /id="sslRecordConsentBtn"/);
  assert.match(html, /id="sslVoiceSamplePreview"/);
  assert.match(html, /id="sslVoiceConsentPreview"/);
  assert.match(html, /id="sslVoiceSampleTimer"/);
  assert.match(html, /id="sslVoiceSamplePace"/);
  assert.match(html, /id="sslVoiceConsentTimer"/);
  assert.match(html, /id="sslVoiceOwnership"/);
  const cloneModal = html.match(/<div id="sslVoiceCloneModal"[\s\S]*?<\/div>\s*<div id="sslGeneralModal"/)?.[0] || "";
  assert.match(cloneModal, /Primera muestra/);
  assert.match(cloneModal, /Texto sugerido para la muestra/);
  assert.match(cloneModal, /id="sslVoiceSampleScript"/);
  assert.match(cloneModal, /Consentimiento · lee esta frase exacta/);
  assert.doesNotMatch(cloneModal, /graba esta frase/);
  assert.match(html, /id="sslVoiceMenuBtn"[\s\S]*?fa-microphone-lines/);
  assert.match(app, /\/api\/schroeder\/voices\/replicate/);
  assert.match(app, /customVoices/);
  assert.match(app, /sourceAudio:[\s\S]*?consentAudio:/);
  assert.match(app, /getUserMedia\(\{ audio:/);
  assert.match(app, /same microphone|voiceCloneRecording\.stream/);
  assert.match(app, /VOICE_SAMPLE_SCRIPTS/);
  assert.match(app, /durations:\s*\{\s*source:\s*0,\s*consent:\s*0\s*\}/);
  assert.match(app, /Date\.now\(\) - voiceCloneRecording\.startedAt/);
  assert.match(app, /sourceDuration < 10 \|\| sourceDuration > 30\.5/);
  assert.match(app, /elapsed < 10/);
  assert.match(app, /Sigue grabando…/);
  assert.match(backend, /\/api\/schroeder\/voices\/replicate/);
  assert.match(backend, /source_audio:[\s\S]*?consent_audio:/);
  assert.match(backend, /schroeder_voice_profiles/);
  assert.match(jobs, /\/api\/schroeder\/voices\/replicate/);
  assert.match(jobs, /generation_config:\s*\{ speech_config:\s*\[\{ voice: voiceName \}\]/);
  assert.match(jobs, /custom_voice_forbidden/);
  assert.doesNotMatch(app, /customVoice[^\n]{0,120}singerProfile/);
});

test("limpia referencias de previsualización que ya no existen sin tocar la biblioteca", () => {
  assert.match(app, /listPendingPreviews\(session\.id\)/);
  assert.match(app, /path.startsWith\("schroeder-sound-lab\/previews\/"\)/);
  assert.match(app, /remotePaths\.has\(path\)/);
  assert.match(app, /if \(removed \|\| recovered\.length\) await saveSession\(session\)/);
  assert.match(app, /audio preload="none"/);
});

test("conserva el borrador del compositor y solo lo limpia al enviar", () => {
  assert.match(app, /COMPOSER_DRAFTS_KEY/);
  assert.match(app, /function persistComposerDraft/);
  assert.match(app, /function restoreComposerDraft/);
  assert.match(app, /elements\.prompt\.addEventListener\("input", \(\) => persistComposerDraft\(\)\)/);
  assert.match(app, /localStorage\.setItem\(COMPOSER_DRAFTS_KEY/);
  assert.match(app, /elements\.prompt\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /persistComposerDraft\(\{ immediate: true \}\)/);
  assert.doesNotMatch(app, /Date\.now\(\) - Number\(saved\.savedAt/);
  assert.match(app, /clearComposerDraft\(\);[\s\S]{0,120}await persist\(\);/);
});

test("utiliza la grabación vocal adjunta como voz de referencia replicada en modo voz", () => {
  assert.match(app, /isVoiceTarget/);
  assert.match(app, /blobTo24kHzMonoWav\(recorderState\.pendingBlob\)/);
  assert.match(app, /voiceSampleAudio:\s*base64Audio/);
  assert.match(app, /voiceSampleAudio:\s*draft\.voiceSampleAudio/);
  assert.match(backend, /voiceSampleAudio/);
  assert.match(backend, /replicatedVoiceConfig:\s*\{\s*voiceSampleAudio/);
  assert.match(jobs, /voiceSampleAudio/);
  assert.match(jobs, /replicatedVoiceConfig:\s*\{\s*voiceSampleAudio/);
});

