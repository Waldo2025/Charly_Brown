import { chromium } from "playwright";
import { resolve } from "node:path";

const base = "http://127.0.0.1:5014";
const output = resolve("artifacts/ai-savings-preview");
const browser = await chromium.launch({ headless: true });

async function pageWithOrigin(width = 1280, height = 720) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/public/header.css`);
  return page;
}

try {
  const header = await pageWithOrigin(1280, 360);
  await header.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Vista previa · Ahorro automático</title></head><body>
    <header class="main-header"><div class="header-content"><div class="logo-area"><img class="logo-header" src="${base}/public/logoCharly.png" alt=""><h4>Charly Brown</h4></div>
      <div class="cb-savings-header" role="status"><span class="cb-savings-badge">Automático · Ahorro alto</span><select class="cb-savings-select" aria-label="Nivel global de ahorro de IA"><option>Sin ahorro</option><option>Ahorro medio</option><option>Ahorro alto</option><option>Ahorro Ultra</option><option selected>Automático</option></select><span class="cb-savings-billing">Gasto $3,500 · aviso $3,000</span></div>
    </div></header><main><p class="preview-eyebrow">VISTA PREVIA LOCAL</p><h1>Modo de ahorro automático</h1><p>El administrador ve el modo elegido, el nivel efectivo y la última lectura de gasto mensual.</p><div class="preview-scale"><span>Menos de $2,000<br><b>Sin ahorro</b></span><span>Desde $2,000<br><b>Medio</b></span><span class="is-current">Desde $3,500<br><b>Alto</b></span><span>Desde $5,000<br><b>Ultra</b></span></div></main></body></html>`);
  await header.addStyleTag({ url: `${base}/public/header.css` });
  await header.addStyleTag({ content: `body{margin:0;background:#f4f6fa;color:#172033;font:15px system-ui,sans-serif}main{padding:105px 48px 32px;max-width:1100px;margin:auto}.preview-eyebrow{font-size:11px;letter-spacing:.13em;color:#64748b;font-weight:800}h1{font-size:27px;margin:4px 0 8px}main p{color:#475569}.preview-scale{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:28px}.preview-scale span{border:1px solid #dce3eb;border-radius:12px;background:white;padding:14px 18px;color:#64748b;line-height:1.55}.preview-scale b{color:#172033}.preview-scale .is-current{border-color:#3f4d98;background:#eef0fb}` });
  await header.screenshot({ path: `${output}/ahorro-automatico.png` });
  await header.close();

  const studio = await pageWithOrigin();
  await studio.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Vista previa · Snoopy Editor</title></head><body><div id="podcastVideoShell" class="podcast-video-shell"><div class="preview-app-header"><img src="${base}/public/SnoopyPodcastCreator.png" alt=""><strong>Snoopy Editor</strong><span>Proyecto de ejemplo · Timeline</span></div>
    <section class="preview-stage"><div class="preview-player"><i class="fas fa-play-circle"></i><span>Vista previa de la escena</span></div></section>
    <section class="preview-timeline"><div class="preview-label">VIDEO</div><div class="preview-track"><article class="podcast-video-timeline-clip has-video is-active" style="left:35px;width:280px"><div class="podcast-video-clip-body"><div class="podcast-video-clip-actions"><button class="row-icon-btn podcast-video-clip-menu-btn" type="button"><i class="fas fa-ellipsis-v"></i></button></div><div class="podcast-video-clip-meta"><strong>Escena 2 · Locutora</strong><span>Imagen de referencia</span></div></div></article><article class="podcast-video-timeline-clip has-video" style="left:338px;width:280px"><div class="podcast-video-clip-body"><div class="podcast-video-clip-meta"><strong>Escena 3 · Invitado</strong><span>Video generado</span></div></div></article></div></section>
    <div class="preview-caption">Menú de escena · nuevo icono de imagen</div><div class="podcast-video-clip-menu is-visible preview-menu" role="menu" aria-label="Acciones de escena">
      <button class="row-icon-btn" title="Configurar duración"><i class="fas fa-sliders-h"></i></button><button class="row-icon-btn" title="Congelar frame"><i class="fas fa-camera"></i></button><button class="row-icon-btn" title="Velocidad"><i class="fas fa-tachometer-alt"></i></button><button class="row-icon-btn" title="Duplicar"><i class="fas fa-copy"></i></button><button class="row-icon-btn" title="Reemplazar video"><i class="fas fa-exchange-alt"></i></button><button class="row-icon-btn preview-new-action" title="Usar imagen de referencia como escena" aria-label="Usar imagen de referencia como escena"><i class="fas fa-image"></i></button><button class="row-icon-btn" title="Reproducir"><i class="fas fa-play"></i></button><button class="row-icon-btn" title="Publicar"><i class="fas fa-globe"></i></button><button class="row-icon-btn" title="Compartir"><i class="fas fa-link"></i></button><button class="row-icon-btn" title="Generar video"><i class="fas fa-film"></i></button><button class="row-icon-btn" title="Regenerar"><i class="fas fa-wand-magic-sparkles"></i></button><button class="row-icon-btn" title="Texto"><i class="fas fa-quote-right"></i></button><button class="row-icon-btn" title="Color"><i class="fas fa-palette"></i></button><button class="row-icon-btn" title="Eliminar"><i class="fas fa-trash"></i></button>
    </div><div class="preview-callout"><i class="fas fa-image"></i> Usar imagen de referencia como escena</div>
    </div></body></html>`);
  await studio.addStyleTag({ url: `${base}/public/vendor/fontawesome/all.min.css` });
  await studio.addStyleTag({ url: `${base}/public/podcaster.css` });
  await studio.addStyleTag({ url: `${base}/public/podcaster/css/podcaster-media-editor.css` });
  await studio.addStyleTag({ content: `body{margin:0;background:#10151d;font:14px system-ui,sans-serif;color:#e8edf4}#podcastVideoShell{position:relative;min-height:720px;--pod-bg:#20242c;--pod-surface:#272c35;--pod-surface-2:#2d3440;--pod-surface-soft:#2d3440;--pod-text:#f1f5f9;--pod-muted:#aab4c3;--pod-border:rgba(203,213,225,.2);--pod-accent:#60a5fa}.preview-app-header{height:70px;display:flex;align-items:center;gap:13px;padding:0 30px;border-bottom:1px solid #3d4654;background:#20242c}.preview-app-header img{width:40px;height:40px;object-fit:contain}.preview-app-header strong{font-size:19px}.preview-app-header span{margin-left:auto;color:#aab4c3}.preview-stage{height:350px;display:grid;place-items:center;background:#171b22}.preview-player{width:640px;height:300px;border:1px solid #414c5a;border-radius:14px;background:#222933;display:grid;place-items:center;color:#aab4c3}.preview-player i{font-size:52px;color:#60a5fa}.preview-player span{margin-top:-95px}.preview-timeline{display:flex;align-items:center;gap:18px;margin:34px 30px 0}.preview-label{width:80px;color:#aab4c3;font-size:11px;letter-spacing:.12em}.preview-track{height:95px;flex:1;position:relative;border:1px solid #3e4652;border-radius:12px;background:#1d232c}.preview-track .podcast-video-timeline-clip{top:10px;bottom:10px}.preview-track .podcast-video-clip-body{grid-template-columns:34px minmax(0,1fr);touch-action:auto}.preview-track .podcast-video-clip-meta{grid-column:2}.preview-track .podcast-video-clip-meta strong{color:#f1f5f9}.preview-caption{position:absolute;left:135px;top:585px;color:#aab4c3}.preview-menu{position:absolute;left:135px;top:611px;z-index:10;transform:none!important}.preview-new-action{background:#1e3a5f!important;color:#93c5fd!important;box-shadow:0 0 0 2px #60a5fa inset}.preview-callout{position:absolute;left:800px;top:613px;color:#dbeafe;background:#1e3a5f;border:1px solid #60a5fa;border-radius:10px;padding:14px 18px}.preview-callout i{margin-right:9px}` });
  await studio.screenshot({ path: `${output}/menu-escena-snoopy.png` });

  await studio.evaluate(async (imageBase) => {
    const { chooseReferenceSceneImage } = await import("/public/podcaster/podcaster-reference-scene.js");
    void chooseReferenceSceneImage([
      { name: "Referencia 1 · Portada", downloadUrl: `${imageBase}/public/propuesta-activity-cards-chic.png` },
      { name: "Referencia 2 · Escenario", downloadUrl: `${imageBase}/public/mindmapBackground.png` },
      { name: "Referencia 3 · Personaje", downloadUrl: `${imageBase}/public/charlyEditor.png` }
    ]);
  }, base);
  await studio.waitForSelector(".podcast-reference-scene-picker .podcast-reference-scene-card");
  await studio.waitForFunction(() => [...document.querySelectorAll(".podcast-reference-scene-card img")].every((image) => image.complete && image.naturalWidth > 0));
  await studio.screenshot({ path: `${output}/selector-referencias-snoopy.png` });
  await studio.close();
} finally {
  await browser.close();
}
