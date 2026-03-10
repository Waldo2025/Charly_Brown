// ✅ Crear o mostrar la consola visual
window.createDebugConsole = function () {
  // Si ya existe, no la duplicamos
  if (document.getElementById("debugConsole")) return;

  const divDebug = document.createElement("div");
  divDebug.id = "debugConsole";
  divDebug.style.cssText = `
    position: fixed; bottom: 0; left: 2%;
    background: rgba(0,0,0,0.85); color: #0f0;
    font-family: monospace; font-size: 11px;
    padding: 8px; width: 95%; max-height: 200px;
    overflow-y:auto; z-index: 99999; border:1px solid #444; border-radius:15px;
  `;

  // ✅ Botón de cierre
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.style.cssText = `
    position:absolute; top:4px; right:8px;
    background:#f44; color:#fff; border:none;
    font-size:12px; padding:2px 6px; cursor:pointer;
    border-radius:4px;
  `;
  closeBtn.onclick = () => {
    divDebug.style.display = "none"; // ✅ solo ocultamos
    window.showOpenDebugButton();    // mostramos el botón flotante para abrirla. 
  };

  // ✅ Título superior
  const titleBar = document.createElement("div");
  titleBar.textContent = "🔍 Debug Visual";
  titleBar.style.cssText = `
    font-weight:bold; margin-bottom:4px; color:#0ff;
    padding-right:20px; text-align:left;
  `;

  divDebug.appendChild(closeBtn);
  divDebug.appendChild(titleBar);
  document.body.appendChild(divDebug);
};

// ✅ Función para loguear visualmente (ya estaba global)
window.logVisual = function (msg) {
  const consoleDiv = document.getElementById("debugConsole");
  if (!consoleDiv) return;
  const p = document.createElement("div");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  consoleDiv.appendChild(p);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
};

// ✅ Crear botón flotante para volver a abrir el debug
window.showOpenDebugButton = function () {
  if (document.getElementById("openDebugBtn")) return; // si ya está, no lo duplicamos

  const btn = document.createElement("button");
  btn.id = "openDebugBtn";
  btn.textContent = "🔍 Mostrar Debug";
  btn.style.cssText = `
    position: fixed; bottom: 10px;
    background: #222; color: #0f0; border: 1px solid #0f0;
    padding: 6px 10px; cursor: pointer; border-radius: 8px;
    font-size: 12px; z-index: 99999;
  `;

  btn.onclick = () => {
    btn.remove();
    const debugConsole = document.getElementById("debugConsole");
    if (debugConsole) {
        debugConsole.style.display = "block"; // ✅ volvemos a mostrarla
    } else {
        window.createDebugConsole(); // si no existía, la creamos
    }
  };


  document.body.appendChild(btn);
};

// ✅ Inicializa la consola al cargar
window.createDebugConsole();
