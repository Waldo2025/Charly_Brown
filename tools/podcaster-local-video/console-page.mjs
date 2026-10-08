// Consola web del "Servidor Snoopy": panel tipo dashboard (motor, escena en
// curso, conexiones, memoria, calidad, videos guardados). Se sirve SOLO sin
// cabeceras CORS para que ningún otro origen pueda leer la consola key embebida.
// Ojo: todo el HTML+JS vive dentro de una plantilla literal; no usar backticks
// ni `${` en el JavaScript inyectado. Sin emojis: el estado se marca con iconos.

const ICONS = {
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 9v4M12 16h.01"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  broom: '<path d="M13 5l6 6"/><path d="M11 7 4 14v6h6l7-7z"/><path d="M8 16l3 3"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  download: '<path d="M12 3v12"/><path d="M6 11l6 6 6-6"/><path d="M4 21h16"/>',
  drive: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h18M3 15h18"/>',
  gauge: '<path d="M12 21a9 9 0 1 1 9-9"/><path d="M12 12l5-3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  link: '<path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1"/><path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  rocket: '<path d="M12 3c4 3 6 7 6 12l-3 2H9l-3-2c0-5 2-9 6-12z"/><circle cx="12" cy="10" r="2"/><path d="M9 19l-2 3M15 19l2 3"/>',
  star: '<path d="M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.1L12 17.3 6.4 20.2l1.1-6.1L3 9.8l6.1-.9z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 6a3 3 0 0 1 0 6M18 20c0-2.5-1-4.5-2.5-5.6"/>',
};

function icon(name, extra = "") {
  const body = ICONS[name] || ICONS.check;
  return '<svg class="icon ' + extra + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
}

export function renderConsolePage({ version, consoleKey, token, comfyBase }) {
  const view = { version, comfyBase };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Servidor Snoopy · motor de video gratis en tu Mac</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#09090b; --surface:#111114; --surface-2:#17171b; --elev:#1e1e23;
    --line:#26262c; --line-strong:#3a3a43;
    --text:#ededf0; --muted:#a1a1ab; --faint:#71717a;
    --primary:#818cf8; --primary-ink:#0b0b10; --ok:#34d399; --warn:#f59e0b; --bad:#f87171;
    --radius:12px; --ring:0 0 0 2px rgba(129,140,248,.5);
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); min-height:100vh; font-size:14px; line-height:1.45;
    font-family:-apple-system,"SF Pro Text","Segoe UI",Inter,Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1120px; margin:0 auto; padding:26px 20px 72px; }

  header { display:flex; align-items:center; gap:14px; padding-bottom:16px; border-bottom:1px solid var(--line); }
  header img { width:42px; height:42px; border-radius:11px; object-fit:cover; border:1px solid var(--line-strong); }
  h1 { font-size:16px; margin:0; font-weight:600; letter-spacing:-.01em; }
  .sub { color:var(--faint); font-size:12px; margin-top:3px; }
  .head-meta { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }

  .badge { display:inline-flex; align-items:center; gap:7px; padding:4px 10px; border-radius:999px; font-size:11.5px;
    font-weight:500; border:1px solid var(--line-strong); background:var(--surface-2); color:var(--muted); }
  .badge.ok { color:#6ee7b7; border-color:rgba(52,211,153,.32); background:rgba(52,211,153,.1); }
  .badge.warn { color:#fcd34d; border-color:rgba(245,158,11,.32); background:rgba(245,158,11,.1); }
  .badge.bad { color:#fca5a5; border-color:rgba(248,113,113,.32); background:rgba(248,113,113,.1); }
  .badge .k { color:var(--faint); font-weight:400; }
  .icon { width:15px; height:15px; flex:0 0 auto; }
  .dot { width:7px; height:7px; border-radius:50%; background:var(--faint); flex:0 0 auto; }
  .dot.ok { background:var(--ok); box-shadow:0 0 0 3px rgba(52,211,153,.15); }
  .dot.bad { background:var(--bad); box-shadow:0 0 0 3px rgba(248,113,113,.15); }

  button, .btnlink { display:inline-flex; align-items:center; justify-content:center; gap:8px; font:inherit;
    font-size:13px; font-weight:500; letter-spacing:-.01em; cursor:pointer; border:1px solid transparent;
    border-radius:10px; padding:9px 14px; text-decoration:none; background:var(--primary); color:var(--primary-ink);
    transition:filter .15s, background .15s; }
  button:hover, .btnlink:hover { filter:brightness(1.08); }
  button:focus-visible, .btnlink:focus-visible, input:focus-visible, select:focus-visible { outline:none; box-shadow:var(--ring); }
  button.ghost { background:var(--surface-2); color:var(--text); border-color:var(--line-strong); }
  button.ghost:hover { background:var(--elev); }
  button.subtle { background:transparent; color:var(--muted); border-color:var(--line); padding:6px 10px; font-size:12px; }
  button.subtle:hover { color:var(--text); background:var(--surface-2); }
  button.tiny { padding:5px 10px; font-size:12px; border-radius:8px; }
  button.danger { margin-left:auto; background:transparent; color:#fca5a5; border-color:#422a2f; padding:6px 11px; font-size:12px; }
  button.danger:hover { background:#2a171a; color:#fecaca; }
  button:disabled { opacity:.5; cursor:not-allowed; filter:none; }

  input[type=text], select { font:inherit; width:100%; padding:9px 12px; border-radius:10px;
    border:1px solid var(--line-strong); background:var(--surface-2); color:var(--text); }
  input#pairCode { letter-spacing:.16em; font-variant-numeric:tabular-nums; }

  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-top:18px; }
  .tile { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:14px; }
  .tile .k { display:flex; align-items:center; gap:7px; font-size:11px; text-transform:uppercase;
    letter-spacing:.06em; color:var(--faint); }
  .tile .v { font-size:17px; font-weight:600; margin-top:9px; display:flex; align-items:center; gap:8px;
    font-variant-numeric:tabular-nums; }
  .tile .v small { font-size:12px; font-weight:400; color:var(--muted); }

  .scene { margin-top:12px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:18px; }
  .scene-top { display:flex; align-items:center; gap:10px; }
  .scene h2 { margin:0; font-size:15px; font-weight:600; letter-spacing:-.01em; }
  .scene .phase { margin-left:auto; }
  .scene-line { color:var(--muted); font-size:12.5px; margin-top:9px; }
  .scene-meta { display:flex; gap:7px; flex-wrap:wrap; margin-top:14px; }
  .meter { height:6px; border-radius:999px; background:var(--surface-2); border:1px solid var(--line);
    overflow:hidden; margin-top:16px; }
  .meter > div { height:100%; width:0%; background:var(--primary); transition:width .6s cubic-bezier(.4,0,.2,1); }

  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:12px; margin-top:12px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:16px; }
  .card-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
  .card-head h2 { margin:0; font-size:13px; font-weight:600; letter-spacing:-.01em; }
  .card-head .tail { margin-left:auto; }
  .card h3 { font-size:11px; margin:18px 0 8px; color:var(--faint); text-transform:uppercase;
    letter-spacing:.06em; font-weight:500; }

  .segmented { display:flex; gap:4px; padding:4px; background:var(--surface-2); border:1px solid var(--line); border-radius:11px; }
  .segmented button { flex:1; background:transparent; color:var(--muted); border:0; padding:8px 10px; border-radius:8px; }
  .segmented button:hover { background:var(--elev); color:var(--text); }
  .segmented button.active { background:var(--primary); color:var(--primary-ink); font-weight:600; }

  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .toggle { display:flex; gap:8px; align-items:center; font-size:12.5px; color:var(--text); cursor:pointer; }
  .toggle input { width:15px; height:15px; accent-color:var(--primary); cursor:pointer; }
  .muted { color:var(--muted); font-size:12.5px; }
  .faint { color:var(--faint); font-size:11.5px; }
  ul.plain, ol.plain { margin:4px 0 0; padding:0; list-style:none; }
  ul.plain li, ol.plain li { padding:10px 0; border-bottom:1px solid var(--line); font-size:12.5px; }
  ul.plain li:last-child, ol.plain li:last-child { border-bottom:0; }
  .side { display:flex; justify-content:space-between; gap:10px; align-items:center; }
  .who { display:inline-flex; align-items:center; gap:8px; min-width:0; }
  .toast { display:flex; align-items:center; gap:7px; margin-top:10px; font-size:12.5px; min-height:19px; color:var(--muted); }
  .toast.ok { color:#6ee7b7; } .toast.bad { color:#fca5a5; }
  code, .mono { background:var(--surface-2); border:1px solid var(--line); border-radius:6px; padding:1px 6px;
    font-size:11.5px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .hidden { display:none; }
  pre.log { background:var(--surface-2); border:1px solid var(--line); border-radius:10px; padding:10px;
    font-size:11px; color:var(--muted); max-height:150px; overflow:auto; white-space:pre-wrap; }
  details { margin-top:12px; border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); }
  details summary { cursor:pointer; padding:12px 14px; font-size:12.5px; color:var(--muted);
    display:flex; align-items:center; gap:8px; list-style:none; }
  details summary::-webkit-details-marker { display:none; }
  details[open] summary { color:var(--text); border-bottom:1px solid var(--line); }
  details .body { padding:12px 14px; }
  #clipPlayer { width:100%; margin-top:12px; border-radius:10px; background:#000; border:1px solid var(--line); }
  .clip { display:flex; flex-direction:column; gap:7px; }
  .clip-top { display:flex; align-items:center; gap:8px; }
  .clip-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .linklike { color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:5px; }
  @media (max-width:720px) { .head-meta { width:100%; margin-left:0; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img src="/consola/logo.png" alt="Snoopy">
    <div>
      <h1>Servidor Snoopy</h1>
      <div class="sub">Motor de video gratis en la GPU de tu Mac</div>
    </div>
    <div class="head-meta">
      <span class="badge">v${view.version}</span>
      <span class="badge">${icon("bolt")} ${view.comfyBase}</span>
    </div>
  </header>

  <div class="tiles">
    <div class="tile"><div class="k">${icon("rocket")} Motor</div><div class="v"><span id="dotEngine" class="dot"></span><span id="txtEngine">Consultando…</span></div></div>
    <div class="tile"><div class="k">${icon("cpu")} ComfyUI</div><div class="v"><span id="dotComfy" class="dot"></span><span id="txtComfy">Consultando…</span></div></div>
    <div class="tile"><div class="k">${icon("users")} Editores</div><div class="v"><span id="dotPairs" class="dot"></span><span id="txtPairs">—</span></div></div>
    <div class="tile"><div class="k">${icon("gauge")} Calidad</div><div class="v"><span id="txtQualityTile">—</span></div></div>
  </div>

  <section class="scene">
    <div class="scene-top">
      ${icon("film")}
      <h2 id="heroTitle">Snoopy tranquilo</h2>
      <span class="badge phase" id="heroPhase">${icon("clock")} En reposo</span>
      <button id="heroCancel" class="danger hidden" type="button">${icon("trash")} Cancelar escena</button>
    </div>
    <div class="scene-line" id="heroLine">No hay escenas en curso. Pídelas desde Snoopy Editor.</div>
    <div id="sceneToast" class="toast"></div>
    <div class="scene-meta" id="heroMeta"></div>
    <div class="meter"><div id="heroBar"></div></div>
  </section>

  <div class="grid">
    <div class="card">
      <div class="card-head">${icon("link")}<h2>Snoopy Editor</h2></div>
      <div class="row">
        <select id="inviteOrigin" class="hidden"></select>
        <button id="inviteBtn">${icon("link")} Generar código y conectar</button>
      </div>
      <div class="row" style="margin-top:10px">
        <input id="pairCode" type="text" inputmode="numeric" maxlength="7" placeholder="O escribe el código: 482-015" autocomplete="off">
        <button id="pairConfirm" class="ghost">Confirmar</button>
      </div>
      <div id="pairToast" class="toast"></div>

      <div id="inviteBox" class="hidden">
        <div class="muted" style="margin-top:10px">Si la pestaña no se abrió sola, usa este enlace (sirve una vez y caduca en 5 minutos):</div>
        <a id="inviteLink" class="btnlink" href="#" target="_blank" rel="noopener">${icon("globe")} Abrir Snoopy Editor</a>
      </div>

      <h3>Editores conectados</h3>
      <ol id="editorsBox" class="plain"></ol>
      <p class="muted" id="editorsHint">Nadie conectado todavía. Pulsa “Generar código y conectar”.</p>

      <div id="pendingBox" class="hidden">
        <h3>Códigos esperando confirmación</h3>
        <ul id="pendingList" class="plain"></ul>
        <p class="faint">La cuenta atrás es del código, no de la escena: si caduca, lo que se está generando sigue su camino.</p>
      </div>

      <details>
        <summary>${icon("copy")} Clave manual y cómo funciona la conexión</summary>
        <div class="body">
          <p class="muted">Snoopy solo atiende a los editores que tú conectaste. Al reiniciar la app, el mismo editor conserva su sitio sin teclear nada. Si un día falla, copia esta clave y pégala en el campo “Token del motor local” de Snoopy Editor.</p>
          <div class="row">
            <button id="copyToken" class="ghost tiny">${icon("copy")} Copiar clave</button>
            <span id="copyToast" class="toast" style="margin:0"></span>
          </div>
        </div>
      </details>
    </div>

    <div class="card">
      <div class="card-head">${icon("drive")}<h2>Memoria del Mac</h2></div>
      <div class="row"><span class="badge" id="memVerdict">${icon("drive")} Consultando…</span><span class="badge hidden" id="memState"></span></div>
      <div class="meter" style="margin-top:12px"><div id="memSwapBar"></div></div>
      <p class="muted" id="memAdvice" style="margin:10px 0 0"></p>
      <p class="faint" id="memRelease" style="margin:6px 0 0"></p>
      <div class="row" style="margin-top:12px">
        <button id="freeMemoryBtn" class="ghost tiny">${icon("broom")} Liberar memoria</button>
        <span id="memToast" class="toast" style="margin:0"></span>
      </div>
    </div>

    <div class="card">
      <div class="card-head">${icon("gauge")}<h2>Calidad de la escena</h2></div>
      <div class="segmented">
        <button class="quality-btn" data-preset="rapido">${icon("bolt")} Rápido</button>
        <button class="quality-btn" data-preset="equilibrado">${icon("film")} Equilibrado</button>
        <button class="quality-btn" data-preset="maximo">${icon("star")} Máximo</button>
      </div>
      <p class="muted" id="qualityTier" style="margin:14px 0 0">Consultando tu Mac…</p>
      <p class="faint" id="qualityEngines" style="margin:8px 0 0"></p>
      <p class="faint" id="qualityNext" style="margin:8px 0 0"></p>
      <label class="toggle" style="margin-top:14px">
        <input type="checkbox" id="smoothMotion">
        <span>Movimiento suave (hasta 24 fps)</span>
      </label>
      <p class="faint" id="smoothHint" style="margin:6px 0 0"></p>
      <div id="ladderBox" class="hidden" style="margin-top:12px">
        <div class="row">
          <button id="ladderBtn" class="ghost tiny">${icon("download")} Descargar Rápido Turbo</button>
          <span class="faint" id="ladderPct"></span>
        </div>
        <div class="meter" style="margin-top:10px"><div id="ladderBar" style="width:0%"></div></div>
        <p class="faint" id="ladderHint" style="margin:8px 0 0"></p>
      </div>
      <div id="qualityToast" class="toast"></div>
    </div>

    <div class="card">
      <div class="card-head">${icon("film")}<h2>Videos guardados</h2><span class="badge tail" id="clipsCount">—</span></div>
      <p class="muted" id="clipsHint">Consultando la carpeta de este Mac…</p>
      <ol id="clipsBox" class="plain"></ol>
      <video id="clipPlayer" class="hidden" controls playsinline></video>
    </div>
  </div>

  <div id="installCard" class="card hidden" style="margin-top:12px">
    <div class="card-head">${icon("rocket")}<h2>Instalar motor gratis (Wan 2.2)</h2></div>
    <p class="muted" id="installBlurb">Tu Mac aún no tiene el motor de video (ComfyUI + Wan 2.2, open source). Un solo clic lo instala y lo configura; no necesitas abrir Terminal.</p>
    <div class="row">
      <button id="installBtn">${icon("download")} Instalar motor gratis</button>
      <span class="faint">Descarga ≈20 GB de modelos · puede tardar 30–60 min según tu conexión</span>
    </div>
    <div id="installProgress" class="hidden" style="margin-top:14px">
      <div class="meter"><div id="installBar" style="width:0%"></div></div>
      <div class="row" style="margin-top:10px"><span id="installPct">0 %</span><span class="muted" id="installMsg">Preparando…</span></div>
      <pre id="installLog" class="log hidden"></pre>
    </div>
    <div id="installToast" class="toast"></div>
  </div>

  <details style="margin-top:12px">
    <summary>${icon("chevron")} ¿Qué hace Snoopy y por qué no gasta un peso?</summary>
    <div class="body">
      <p class="muted">Snoopy mueve la GPU de tu Mac con Wan 2.2 (open source), sin llamadas de pago. Dibuja la escena chica y rápido (≈640 px) y la agranda con un afinador gratuito hasta 1080p, así que la calidad se compra con pasos de muestreo y no con dinero. Si ComfyUI está apagado no se generan videos: Snoopy nunca usará un servicio de pago de tu cuenta. La primera vez usa “Instalar motor gratis”; si ya lo instalaste, cierra y vuelve a abrir Servidor Snoopy con doble clic.</p>
    </div>
  </details>
</div>

<script>
const CONSOLE_KEY = ${JSON.stringify(consoleKey)};
const ICONS = ${JSON.stringify(ICONS)};
const $ = (id) => document.getElementById(id);

function iconSvg(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.check) + "</svg>";
}
function badge(text, tone) {
  return '<span class="badge ' + (tone || "") + '">' + text + "</span>";
}
function labeled(label, value, tone) {
  return badge('<span class="k">' + label + "</span>" + value, tone);
}
function note(ok, text) {
  return (ok ? iconSvg("check") : iconSvg("alert")) + " " + text;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function agoText(ts) {
  if (!ts) return "sin uso todavía";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "hace segundos";
  if (mins < 60) return "hace " + mins + " min";
  const horas = Math.round(mins / 60);
  if (horas < 48) return "hace " + horas + " h";
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

// ── Estado general ───────────────────────────────────────────────────────────
let motorOk = false;
let sceneJobId = "";
let installRunning = false;
let installFinishedOk = false;
let memTick = 0;

async function refreshStatus() {
  try {
    const health = await (await fetch("/health")).json();
    $("dotEngine").className = "dot ok";
    $("txtEngine").textContent = "Activo";
    $("dotComfy").className = health.comfyReachable ? "dot ok" : "dot bad";
    $("txtComfy").textContent = health.comfyReachable ? "Conectado" : "Apagado";
    if (!health.comfyReachable) {
      $("heroTitle").textContent = "Falta encender ComfyUI";
      $("heroLine").textContent = "Sin ComfyUI no se generan videos, y Snoopy nunca usará un servicio de pago. Si ya instalaste el motor, cierra y vuelve a abrir Servidor Snoopy con doble clic.";
      $("heroPhase").innerHTML = iconSvg("alert") + " Sin motor";
    }
    motorOk = Boolean(health.comfyReachable);
    if (health.engineInstalled && !installRunning) {
      $("installBlurb").textContent = "El motor ya está instalado en este Mac. Si ComfyUI está apagado, cierra y vuelve a abrir Servidor Snoopy con doble clic y se encenderá solo.";
    }
    updateInstallCardVisibility();
  } catch {
    $("dotEngine").className = "dot bad";
    $("txtEngine").textContent = "Servidor caído";
  }
  refreshEditors();
  if (installRunning) await pollInstallStatus();
  // Una descarga de nivel que seguía en curso (o que se reanudó al recargar la
  // pestaña) retoma su barra aquí; si no hay nada, la llamada es barata.
  if (ladderRunning) await pollLadderStatus();
  refreshQueue();
  if ((memTick = (memTick + 1) % 3) === 0) { refreshMemory(); refreshQuality(); refreshClips(); }
}

// ── Conexiones (editores emparejados + códigos esperando) ────────────────────
let editorsCache = [];

async function refreshEditors() {
  try {
    const data = await (await fetch("/pair/pending", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
    const list = Array.isArray(data?.pairs) ? data.pairs : [];
    editorsCache = Array.isArray(data?.editors) ? data.editors : [];
    $("pendingBox").classList.toggle("hidden", list.length === 0);
    $("pendingList").innerHTML = list.map((p) => "<li><div class='side'><span class='who'>"
      + escapeHtml(p.origin || "origen desconocido")
      + "<span class='mono'>" + escapeHtml(p.code) + "</span></span>"
      + "<span class='end'>" + badge(iconSvg("clock") + "caduca en " + Math.max(0, Math.round(p.secondsLeft)) + " s", "warn")
      + "<button class='subtle' data-cancel-code='" + escapeHtml(p.pairId || "") + "' data-code='" + escapeHtml(p.code) + "'>"
      + iconSvg("trash") + " Cancelar código</button></span></div></li>").join("");
    paintEditors();
  } catch { /* la consola sigue útil */ }
}

$("pendingList").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-cancel-code]");
  if (!btn) return;
  const toast = $("pairToast");
  try {
    const resp = await fetch("/pair/cancel-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ pairId: btn.dataset.cancelCode, code: btn.dataset.code }),
    });
    const data = await resp.json().catch(() => ({}));
    toast.className = resp.ok ? "toast ok" : "toast bad";
    toast.innerHTML = resp.ok
      ? note(true, "Código cancelado. La cuenta atrás no afecta a ninguna escena en marcha.")
      : note(false, escapeHtml(data.error || "No se pudo cancelar el código."));
    if (resp.ok) await refreshEditors();
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo cancelar el código (" + escapeHtml(error.message) + ").");
  }
  setTimeout(() => { toast.textContent = ""; }, 6000);
});

function paintEditors() {
  $("editorsBox").innerHTML = editorsCache.map((e) => "<li><div class='side'><span class='who'>"
    + "<span class='dot " + (e.connected ? "ok" : "") + "'></span>" + escapeHtml(e.origin)
    + "<span class='faint'>último uso " + escapeHtml(agoText(e.lastSeen || e.pairedAt)) + "</span></span>"
    + "<button class='subtle' data-disconnect='" + escapeHtml(e.origin) + "'>"
    + iconSvg("trash") + " Desconectar</button></div></li>").join("");
  $("editorsHint").classList.toggle("hidden", editorsCache.length > 0);
  const select = $("inviteOrigin");
  const options = editorsCache.map((e) => "<option value='" + escapeHtml(e.origin) + "'>" + escapeHtml(e.origin) + "</option>");
  select.innerHTML = options.join("") || "<option value=''>El sitio que abras el enlace</option>";
  select.classList.toggle("hidden", options.length <= 1);
  const online = editorsCache.filter((e) => e.connected).length;
  $("dotPairs").className = "dot" + (online ? " ok" : "");
  $("txtPairs").textContent = online ? online + (online === 1 ? " editor activo" : " editores activos") : "Ninguno";
}

$("editorsBox").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-disconnect]");
  if (!btn) return;
  const toast = $("pairToast");
  try {
    const resp = await fetch("/pair/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ origin: btn.dataset.disconnect }),
    });
    const data = await resp.json().catch(() => ({}));
    toast.className = resp.ok ? "toast ok" : "toast bad";
    toast.innerHTML = resp.ok
      ? note(true, "Desconectado. Ese sitio ya no puede usar tu GPU.")
      : note(false, escapeHtml(data.error || "No se pudo desconectar."));
    if (resp.ok && Array.isArray(data.editors)) { editorsCache = data.editors; paintEditors(); }
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo desconectar (" + escapeHtml(error.message) + ").");
  }
  setTimeout(() => { toast.textContent = ""; }, 6000);
});

$("inviteBtn").addEventListener("click", async () => {
  const toast = $("pairToast");
  const btn = $("inviteBtn");
  btn.disabled = true;
  toast.className = "toast";
  toast.textContent = "";
  try {
    const resp = await fetch("/pair/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ origin: $("inviteOrigin").value || "" }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "La consola no pudo crear el enlace.");
    const link = $("inviteLink");
    link.href = data.url;
    link.innerHTML = iconSvg("globe") + " Abrir " + escapeHtml(String(data.origin || "Snoopy Editor").replace(/^https?:\\/\\//, ""));
    $("inviteBox").classList.remove("hidden");
    const opened = window.open(data.url, "_blank");
    toast.className = "toast ok";
    toast.innerHTML = opened
      ? note(true, "Listo: Snoopy Editor se abrió ya conectado, sin teclear códigos.")
      : note(false, "Tu navegador bloqueó la pestaña; usa el enlace de abajo.");
    setTimeout(refreshEditors, 1500);
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, escapeHtml(error.message));
  }
  btn.disabled = false;
  setTimeout(() => { $("inviteBox").classList.add("hidden"); }, 60000);
});

$("pairConfirm").addEventListener("click", async () => {
  const code = String($("pairCode").value || "").replace(/\\D/g, "");
  const toast = $("pairToast");
  if (code.length !== 6) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "El código son 6 números (los guiones no cuentan).");
    return;
  }
  try {
    const resp = await fetch("/pair/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, consoleKey: CONSOLE_KEY }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      toast.className = "toast ok";
      toast.innerHTML = note(true, "Conectado: " + escapeHtml(data.origin || "sitio") + ". Ya puede generar videos gratis.");
      $("pairCode").value = "";
      $("inviteBox").classList.add("hidden");
      if (Array.isArray(data.editors)) { editorsCache = data.editors; paintEditors(); }
    } else {
      toast.className = "toast bad";
      toast.innerHTML = note(false, escapeHtml(data.error || "Código inválido o expirado. Pide uno nuevo en el sitio."));
    }
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo confirmar (" + escapeHtml(error.message) + ").");
  }
  setTimeout(refreshStatus, 400);
});

$("copyToken").addEventListener("click", async () => {
  const tokenValue = ${JSON.stringify(token)};
  try {
    await navigator.clipboard.writeText(tokenValue);
    $("copyToast").className = "toast ok";
    $("copyToast").innerHTML = note(true, "¡Listo! Pégala en Snoopy Editor.");
  } catch {
    $("copyToast").className = "toast bad";
    $("copyToast").innerHTML = note(false, "Tu navegador bloqueó el portapapeles; usa el botón de conectar.");
  }
  setTimeout(() => { $("copyToast").textContent = ""; }, 4000);
});

// ── Escena en curso ──────────────────────────────────────────────────────────
function trimSeconds(value) {
  return String(Number(Number(value || 0).toFixed(2)));
}

function planChips(plan) {
  if (!plan || !Number(plan.width)) return "";
  return [
    labeled("duración", trimSeconds(plan.durationSec) + " s"),
    labeled("lienzo", Math.round(plan.width) + "×" + Math.round(plan.height)),
    labeled("cuadros", plan.lengthFrames + " @ " + plan.fps),
    labeled("pasos", String(plan.steps)),
    labeled("estimado", "~" + Math.round(plan.estimatedMinutes) + " min"),
  ].join("");
}

// La barra tiene que decir en qué fase está Wan: el muestreo avanza por pasos
// reales y después viene la compresión del video, que era la parte que se veía
// como «se colgó en el 90 %».
function heroFromQueue(q) {
  const jobs = q.jobs || [];
  const running = jobs.filter((job) => job.status === "running");
  const waiting = jobs.filter((job) => job.status !== "running");
  const meta = $("heroMeta");
  const bar = $("heroBar");
  sceneJobId = (running[0] || waiting[0] || {}).jobId || "";
  $("heroCancel").classList.toggle("hidden", !sceneJobId);
  if (running.length) {
    const job = running[0];
    const plan = job.plan || null;
    const step = job.step || null;
    const sampling = step && step.phase === "sample";
    $("heroTitle").textContent = sampling
      ? "Muestreando paso " + step.value + " de " + step.max
      : (step ? "Comprimiendo el video" : "Preparando la escena");
    $("heroPhase").innerHTML = sampling ? iconSvg("cpu") + " GPU trabajando"
      : (step ? iconSvg("drive") + " Ensamblando frames" : iconSvg("clock") + " Preparando");
    $("heroLine").textContent = String(job.hint || "Snoopy está trabajando en tu GPU.");
    bar.style.width = Math.max(3, Math.min(100, Math.round((job.progress || 0) * 100))) + "%";
    const reloj = plan && Number.isFinite(plan.elapsedMinutes)
      ? labeled("tiempo", plan.elapsedMinutes + " min"
        + (plan.remainingMinutes ? " · faltan ~" + plan.remainingMinutes + " min" : "")
        + (plan.overEstimate ? " · por delante del estimado" : ""), plan.overEstimate ? "warn" : "")
      : "";
    meta.innerHTML = (plan ? planChips(plan) : "") + reloj
      + (waiting.length > 1 ? labeled("en cola", String(waiting.length - 1)) : "");
    return;
  }
  if (waiting.length) {
    $("heroTitle").textContent = waiting.length + " escena(s) en espera";
    $("heroPhase").innerHTML = iconSvg("clock") + " En cola";
    $("heroLine").textContent = "Snoopy genera de una en una para no reventar la RAM de tu Mac.";
    bar.style.width = "2%";
    meta.innerHTML = planChips(waiting[0].plan);
    return;
  }
  if (q.last) {
    const ok = q.last.status === "ready";
    $("heroTitle").textContent = ok ? "Última escena lista" : "La última escena no salió";
    $("heroPhase").innerHTML = ok ? iconSvg("check") + " Terminada" : iconSvg("alert") + " Falló";
    const spent = q.last.plan && q.last.plan.elapsedMinutes ? "Tardó " + q.last.plan.elapsedMinutes + " min. " : "";
    $("heroLine").textContent = spent + (ok
      ? "Está en “Videos guardados” de este Mac y en tu escena de Snoopy Editor."
      : (q.last.error && q.last.error.message ? q.last.error.message : "Snoopy Editor puede reintentarla; nunca se envía a un servicio de pago."));
    bar.style.width = ok ? "100%" : "0%";
    meta.innerHTML = ok ? planChips(q.last.plan) : "";
    return;
  }
  $("heroTitle").textContent = "Snoopy tranquilo";
  $("heroPhase").innerHTML = iconSvg("clock") + " En reposo";
  $("heroLine").textContent = "No hay escenas en curso. Pídelas desde Snoopy Editor.";
  bar.style.width = "0%";
  meta.innerHTML = "";
}

async function refreshQueue() {
  try {
    heroFromQueue(await (await fetch("/queue", { headers: { "X-Console-Key": CONSOLE_KEY } })).json());
  } catch { /* la consola sigue útil */ }
}

// Cancelar es lo contrario de dejar la escena colgada: para la GPU ya no genera.
$("heroCancel").addEventListener("click", async () => {
  const toast = $("sceneToast");
  const btn = $("heroCancel");
  if (!sceneJobId) return;
  btn.disabled = true;
  try {
    const resp = await fetch("/scene/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ jobId: sceneJobId }),
    });
    const data = await resp.json().catch(() => ({}));
    toast.className = resp.ok ? "toast ok" : "toast bad";
    toast.innerHTML = resp.ok
      ? note(true, "Escena cancelada. Tu GPU ya está libre.")
      : note(false, escapeHtml(data.error || "No se pudo cancelar la escena."));
    await refreshQueue();
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo cancelar la escena (" + escapeHtml(error.message) + ").");
  }
  btn.disabled = false;
  setTimeout(() => { toast.textContent = ""; }, 6000);
});

// ── Memoria ──────────────────────────────────────────────────────────────────
async function refreshMemory() {
  try {
    const m = await (await fetch("/memory", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
    if (typeof m?.swapUsedGb !== "number") return;
    const tones = { comoda: "ok", justa: "warn", critica: "bad" };
    const labels = { comoda: "Cómoda", justa: "Justa", critica: "Saturada" };
    $("memVerdict").className = "badge " + (tones[m.level] || "");
    $("memVerdict").innerHTML = iconSvg("drive") + (labels[m.level] || "Memoria") + " · " + m.ramTotalGb + " GB";
    $("memSwapBar").style.width = Math.max(2, Math.min(100, Math.round((m.swapUsedGb / Math.max(1, m.swapTotalGb)) * 100))) + "%";
    $("memAdvice").textContent = "Apoyo en disco: " + m.swapUsedGb + " de " + m.swapTotalGb + " GB · " + (m.advice || "");
    if (m.busy) {
      $("memState").className = "badge";
      $("memState").innerHTML = iconSvg("cpu") + " Generando · la suelta al terminar";
    } else if (m.level === "critica") {
      $("memState").className = "badge warn";
      $("memState").innerHTML = iconSvg("broom") + " Puedes liberar ahora";
    } else {
      $("memState").className = "badge hidden";
      $("memState").innerHTML = "";
    }
    $("memRelease").textContent = m.lastRelease
      ? (m.lastRelease.automatic ? "Liberación automática" : "Liberación manual")
        + " hace " + m.lastRelease.minutesAgo + " min · " + m.lastRelease.freedGb + " GB recuperados"
      : "";
  } catch { /* la consola sigue útil */ }
}

$("freeMemoryBtn").addEventListener("click", async () => {
  const btn = $("freeMemoryBtn");
  const toast = $("memToast");
  btn.disabled = true;
  btn.innerHTML = iconSvg("broom") + " Liberando…";
  toast.className = "toast";
  toast.textContent = "";
  try {
    const resp = await fetch("/memory/free", { method: "POST", headers: { "X-Console-Key": CONSOLE_KEY } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      toast.className = "toast bad";
      toast.innerHTML = note(false, escapeHtml(data.error || "No se pudo liberar memoria."));
    } else {
      toast.className = "toast ok";
      toast.innerHTML = note(true, "Modelos sueltos · ahora " + data.swapUsedGb + " GB en disco.");
      if (typeof data.swapUsedGb === "number") {
        $("memSwapBar").style.width = Math.max(2, Math.min(100, Math.round((data.swapUsedGb / Math.max(1, data.swapTotalGb)) * 100))) + "%";
      }
    }
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo liberar memoria (" + escapeHtml(error.message) + ").");
  }
  btn.disabled = false;
  btn.innerHTML = iconSvg("broom") + " Liberar memoria";
  refreshMemory();
});

// ── Calidad ──────────────────────────────────────────────────────────────────
let lastQuality = null;
let ladderRunning = false;

function gbText(value) {
  return String(Math.round(Number(value) * 10) / 10).replace(".", ",");
}

async function refreshQuality() {
  try {
    const q = await (await fetch("/quality", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
    lastQuality = q;
    const finish = q.clipFinish === "ffmpeg" ? "ffmpeg"
      : q.clipFinish === "pyav" ? "el afinador de ComfyUI"
        : "sin afinador (queda en su tamaño nativo)";
    $("txtQualityTile").innerHTML = escapeHtml(q.presetId || "a la medida")
      + " <small>" + q.budgetMinutes + " min</small>";
    $("qualityTier").innerHTML = "<b style='color:var(--text)'>Tu Mac:</b> " + q.ramGb + " GB · dibuja a "
      + q.maxNativeLongEdge + " px y entrega " + q.upscaleLongEdge + " px con " + escapeHtml(finish)
      + (q.kCalibrated ? " · cálculo ya corregido con tus escenas" : "");
    // Cada nivel dice con qué motor trabaja: «Rápido» no puede ser una promesa vacía.
    $("qualityEngines").innerHTML = (q.presets || []).map((p) => escapeHtml(p.label)
      + " <span class='faint'>· " + escapeHtml(p.engineLabel) + "</span>").join(" · ")
      + (q.engine && q.engine.fallbackNote
        ? "<br><span class='faint'>" + escapeHtml(q.engine.fallbackNote) + "</span>" : "");
    document.querySelectorAll(".quality-btn").forEach((btn) => {
      const preset = (q.presets || []).find((p) => p.id === btn.dataset.preset);
      btn.classList.toggle("active", btn.dataset.preset === q.presetId);
      btn.disabled = false;
      btn.title = preset ? preset.engineLabel + (preset.note ? " · " + preset.note : "") : "";
    });
    const next = q.nextPlan;
    $("qualityNext").textContent = next
      ? "Siguiente escena: " + trimSeconds(next.durationSec) + " s en " + Math.round(next.width) + "×"
        + Math.round(next.height) + ", " + next.steps + " pasos con "
        + (next.engineLabel || "Wan 2.2") + " · ~" + Math.round(next.estimatedMinutes) + " min"
        + (next.note ? " · " + next.note : "")
      : "";
    renderLadder(q);
    // El interruptor de movimiento suave refleja lo que Snoopy hará de verdad.
    const smooth = $("smoothMotion");
    const planFps = Number(q.nextPlan && q.nextPlan.fps) || 0;
    if (!smooth.dataset.busy) {
      smooth.checked = q.smoothMotion !== false;
      $("smoothHint").textContent = q.smoothNextFps
        ? "La GPU entrega " + planFps + " fps y el afinado los pasa a " + q.smoothNextFps
          + " fps mezclando fotogramas vecinos: se mueve mucho más suave y no gasta GPU. "
          + "En movimientos rápidos puede dejar un leve rastro."
        : !q.clipFinish
          ? "Sin afinador en este Mac: los clips se guardan a la cadencia que sale de la GPU."
          : q.smoothMotion === false
            ? "Apagado: la próxima escena queda a " + planFps + " fps."
            : "La próxima escena ya sale a " + planFps + " fps: se ve suelta y no se mezcla más.";
    }
  } catch { /* la consola sigue útil */ }
}

/**
 * El peldaño que falta (nivel Rápido = Turbo): botón de descarga con su peso real y
 * el motivo honesto si el disco no alcanza. Solo se ofrece si el Mac lo aguanta.
 */
function renderLadder(q) {
  const box = $("ladderBox");
  const missing = (q.engines || []).find((e) => Number(e.extraGb) > 0 && e.disponibleParaElEquipo && !e.installed);
  if (!missing) {
    if (!ladderRunning) box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const btn = $("ladderBtn");
  if (!ladderRunning) {
    btn.disabled = !missing.alcanzaElDisco;
    btn.innerHTML = iconSvg("download") + " Descargar Rápido Turbo (" + gbText(missing.extraGb) + " GB)";
  }
  $("ladderHint").textContent = !missing.alcanzaElDisco
    ? "Falta espacio: hay ~" + q.diskFreeGb + " GB libres y este nivel pide ~"
      + gbText(Number(missing.extraGb) + 3) + " GB. Borra clips viejos o películas y vuelve a intentarlo."
    : (missing.missing || []).join(" · ") + ". La descarga es gratis; solo ocupa disco"
      + (Number.isFinite(q.diskFreeGb) ? " (quedan ~" + q.diskFreeGb + " GB)" : "") + ".";
}

async function pollLadderStatus({ probe = false } = {}) {
  let st = null;
  try {
    st = await (await fetch("/engine/ladder/status", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
  } catch { /* Snoopy se cerró: se reintenta en el siguiente turno */ }
  if (!st) {
    if (probe) return;
    ladderRunning = false;
    $("ladderBar").style.width = "0%";
    $("ladderPct").textContent = "";
    return;
  }
  // La sonda del arranque solo quiere saber si había una descarga en curso: si no la
  // hay, no pinta barras ni lanza avisos de una instalación de hace días.
  if (probe && !st.running) return;
  if (st.error) {
    ladderRunning = false;
    $("ladderBar").style.width = "0%";
    $("ladderPct").textContent = "";
    $("qualityToast").className = "toast bad";
    $("qualityToast").innerHTML = note(false, escapeHtml(st.error.message
      + (st.error.hint ? " — " + st.error.hint : "")));
    refreshQuality();
    return;
  }
  $("ladderBar").style.width = Math.max(2, Math.min(100, Number(st.percent) || 0)) + "%";
  $("ladderPct").textContent = Math.round(Number(st.percent) || 0) + " %";
  if (st.message) $("ladderHint").textContent = st.message;
  if (!st.running) {
    ladderRunning = false;
    $("ladderBtn").disabled = false;
    if (st.done) {
      $("qualityToast").className = "toast ok";
      $("qualityToast").innerHTML = note(true, "🟢 Nivel Rápido listo: la siguiente escena ya usa el modelo Turbo de 4 pasos.");
    }
    refreshQuality();
    return;
  }
  ladderRunning = true;
  $("ladderBox").classList.remove("hidden");
  $("ladderBtn").disabled = true;
  $("ladderBtn").innerHTML = iconSvg("clock") + " Descargando el nivel Rápido… no cierres esta ventana";
}

$("ladderBtn").addEventListener("click", async () => {
  if (ladderRunning) return;
  const btn = $("ladderBtn");
  const toast = $("qualityToast");
  const target = ((lastQuality && lastQuality.engines) || [])
    .find((e) => Number(e.extraGb) > 0 && !e.installed && e.disponibleParaElEquipo);
  if (!target) return;
  btn.disabled = true;
  toast.className = "toast";
  toast.textContent = "";
  try {
    const resp = await fetch("/engine/ladder/download", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ artifactId: target.id }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      toast.className = "toast bad";
      toast.innerHTML = note(false, escapeHtml(data.error || "No se pudo iniciar la descarga."));
      btn.disabled = false;
      return;
    }
    if (!data.running && data.done) {
      toast.className = "toast ok";
      toast.innerHTML = note(true, escapeHtml(data.message || "Ese nivel ya está instalado."));
      btn.disabled = false;
      refreshQuality();
      return;
    }
    ladderRunning = true;
    $("ladderBox").classList.remove("hidden");
    btn.innerHTML = iconSvg("clock") + " Descargando el nivel Rápido… no cierres esta ventana";
    $("ladderBar").style.width = "2%";
    pollLadderStatus();
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo descargar (" + escapeHtml(error.message) + ").");
    btn.disabled = false;
  }
});

document.querySelectorAll(".quality-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const toast = $("qualityToast");
    document.querySelectorAll(".quality-btn").forEach((b) => { b.disabled = true; });
    toast.className = "toast";
    toast.textContent = "";
    try {
      const resp = await fetch("/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
        body: JSON.stringify({ preset: btn.dataset.preset }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.className = "toast bad";
        toast.innerHTML = note(false, escapeHtml(data.error || "No se pudo cambiar la calidad."));
      } else {
        toast.className = "toast ok";
        toast.innerHTML = note(true, escapeHtml(btn.textContent.trim()) + " · " + data.budgetMinutes + " min por escena.");
      }
    } catch (error) {
      toast.className = "toast bad";
      toast.innerHTML = note(false, "No se pudo cambiar (" + escapeHtml(error.message) + ").");
    }
    refreshQuality();
    setTimeout(() => { toast.textContent = ""; }, 6000);
  });
});

// El suavizado se guarda al instante: vale para la siguiente escena, como la calidad.
$("smoothMotion").addEventListener("click", async (event) => {
  const input = event.currentTarget;
  const toast = $("qualityToast");
  input.dataset.busy = "1";
  toast.className = "toast";
  toast.textContent = "";
  try {
    const resp = await fetch("/quality", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
      body: JSON.stringify({ smoothMotion: input.checked }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      input.checked = !input.checked;
      toast.className = "toast bad";
      toast.innerHTML = note(false, escapeHtml(data.error || "No se pudo guardar el movimiento suave."));
    } else {
      toast.className = "toast ok";
      toast.innerHTML = note(true, input.checked
        ? (data.smoothNextFps
          ? "Movimiento suave: la siguiente escena sale a " + data.smoothNextFps + " fps."
          : "Movimiento suave encendido: se aplica cuando la escena sale de la GPU a 8 o 12 fps.")
        : "Movimiento suave apagado: los clips quedan a la cadencia de la GPU.");
    }
  } catch (error) {
    input.checked = !input.checked;
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo guardar (" + escapeHtml(error.message) + ").");
  }
  delete input.dataset.busy;
  refreshQuality();
  setTimeout(() => { toast.textContent = ""; }, 6000);
});

// ── Biblioteca de clips ──────────────────────────────────────────────────────
function clipLine(clip) {
  const when = new Date(clip.createdAt);
  const fecha = when.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    + " " + when.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const datos = [];
  if (clip.durationSec) datos.push(trimSeconds(clip.durationSec) + " s");
  if (clip.width) datos.push(clip.width + "×" + clip.height);
  if (clip.steps) datos.push(clip.steps + " pasos");
  if (clip.fps) datos.push(clip.fps + " fps" + (clip.motionSmoothed ? " suaves" : ""));
  if (clip.bytes) datos.push((clip.bytes / 1048576).toFixed(1).replace(".", ",") + " MB");
  if (clip.minutes) datos.push(clip.minutes + " min de GPU");
  const titulo = clip.title || "Escena " + String(clip.jobId || "").slice(0, 8);
  const origen = clip.storageUrl
    ? " · <a class='linklike' href='" + escapeHtml(clip.storageUrl) + "' target='_blank' rel='noopener'>"
      + iconSvg("globe") + " en el sitio</a>"
    : "";
  return "<li><div class='clip'>"
    + "<div class='clip-top'>" + iconSvg("film") + "<span>" + escapeHtml(titulo) + "</span>"
    + "<span class='faint' style='margin-left:auto'>" + escapeHtml(fecha) + "</span></div>"
    + "<div class='faint'>" + escapeHtml(datos.join(" · ")) + origen + "</div>"
    + "<div class='clip-actions'>"
    + "<button class='ghost tiny' data-play='" + escapeHtml(clip.id) + "'>" + iconSvg("play") + " Ver</button>"
    + "<button class='subtle' data-save='" + escapeHtml(clip.id) + "'>" + iconSvg("download") + " Descargar</button>"
    + "</div></div></li>";
}

async function refreshClips() {
  try {
    const data = await (await fetch("/clips", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
    const clips = data.clips || [];
    $("clipsCount").textContent = clips.length + (clips.length === 1 ? " video" : " videos");
    $("clipsHint").textContent = clips.length
      ? "Guardados en este Mac; se conservan aunque luego borres la escena del sitio."
      : "Todavía no hay videos guardados. Cada escena que termine se queda aquí, aunque luego la borres del sitio.";
    $("clipsBox").innerHTML = clips.map(clipLine).join("");
  } catch { /* la consola sigue útil */ }
}

$("clipsBox").addEventListener("click", async (event) => {
  const playBtn = event.target.closest("[data-play]");
  const saveBtn = event.target.closest("[data-save]");
  const id = playBtn ? playBtn.dataset.play : saveBtn ? saveBtn.dataset.save : "";
  if (!id) return;
  try {
    const resp = await fetch("/clips/" + encodeURIComponent(id), { headers: { "X-Console-Key": CONSOLE_KEY } });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || "no se pudo leer");
    const url = URL.createObjectURL(await resp.blob());
    if (playBtn) {
      const player = $("clipPlayer");
      player.src = url;
      player.classList.remove("hidden");
      player.play().catch(() => {});
      player.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = id + ".mp4";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  } catch (error) {
    $("clipsHint").textContent = "No se pudo abrir ese video (" + error.message + ").";
  }
});

// ── Instalador del motor ─────────────────────────────────────────────────────
function updateInstallCardVisibility() {
  // La tarjeta se oculta solo cuando ComfyUI ya responde; así el mensaje de éxito
  // ("cierra y vuelve a abrir") permanece visible tras instalar.
  $("installCard").classList.toggle("hidden", motorOk);
}

function setInstallUi(st) {
  const pct = Math.max(0, Math.min(100, Number(st.percent) || 0));
  $("installProgress").classList.remove("hidden");
  $("installBar").style.width = pct + "%";
  $("installPct").textContent = Math.round(pct) + " %";
  $("installMsg").textContent = st.message || (st.running ? "Instalando…" : st.done ? "Instalación terminada." : "En pausa.");
  if (st.logTail) {
    $("installLog").classList.remove("hidden");
    $("installLog").textContent = String(st.logTail).slice(-1200);
  }
  if (st.error) {
    $("installToast").className = "toast bad";
    $("installToast").innerHTML = note(false, escapeHtml(st.error.message
      + (st.error.hint ? " — Consejo: " + st.error.hint : "")));
  }
}

async function pollInstallStatus() {
  try {
    const st = await (await fetch("/install/status", { headers: { "X-Console-Key": CONSOLE_KEY } })).json();
    if (st.done && !st.error) installFinishedOk = true;
    if (st.running || st.done || st.error || installRunning) {
      setInstallUi(st);
    } else {
      $("installProgress").classList.add("hidden");
    }
    if (st.running) {
      installRunning = true;
      $("installBtn").disabled = true;
      $("installBtn").innerHTML = iconSvg("clock") + " Instalando… no cierres esta ventana";
    } else if (installRunning) {
      installRunning = false;
      $("installBtn").disabled = false;
      $("installBtn").innerHTML = installFinishedOk
        ? iconSvg("check") + " Motor instalado"
        : iconSvg("download") + " Reintentar instalación";
      if (installFinishedOk) {
        $("installToast").className = "toast ok";
        $("installToast").innerHTML = note(true, "Motor instalado. Último paso: cierra esta pestaña y vuelve a abrir "
          + "Servidor Snoopy (doble clic); ComfyUI se encenderá solo.");
      }
    }
    updateInstallCardVisibility();
  } catch { /* el daemon puede reiniciarse */ }
}

$("installBtn").addEventListener("click", async () => {
  if (installFinishedOk || installRunning) return;
  const toast = $("installToast");
  toast.className = "toast";
  toast.textContent = "";
  try {
    const resp = await fetch("/install/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": CONSOLE_KEY },
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 409 || data.error) {
      toast.className = "toast bad";
      toast.innerHTML = note(false, escapeHtml(data.error || "No se pudo iniciar la instalación."));
      if (!resp.ok && resp.status !== 409) return;
    }
    installRunning = true;
    $("installBtn").disabled = true;
    $("installBtn").innerHTML = iconSvg("clock") + " Instalando… no cierres esta ventana";
    setInstallUi({ running: true, percent: 0, message: "Preparando la instalación…" });
    pollInstallStatus();
  } catch (error) {
    toast.className = "toast bad";
    toast.innerHTML = note(false, "No se pudo iniciar (" + escapeHtml(error.message) + ").");
  }
});

pollInstallStatus();
refreshQuality();
// Si la pestaña se cerró durante una descarga, el nivel sigue bajando en Snoopy:
// se averigua aquí para retomar su barra sin esperar al próximo clic.
pollLadderStatus({ probe: true });
refreshClips();
refreshStatus();
setInterval(refreshStatus, 3000);
</script>
</body>
</html>`;
}
