#!/bin/bash
# Servidor Snoopy — motor de video gratis en la GPU del Mac.
# Doble clic desde Finder (o "Abrir" si macOS lo marca de otra procedencia).
cd "$(dirname "$0")" || exit 1

PORT="${PODCASTER_LOCAL_VIDEO_PORT:-8792}"
COMFY_PORT="${COMFY_PORT:-8188}"

echo "🐶 Servidor Snoopy — video gratis en tu Mac"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Hace falta Node.js. Descarga la versión LTS desde https://nodejs.org e instálala,"
  echo "   luego vuelve a dar doble clic en este archivo."
  read -n1 -s -r -p "Presiona una tecla para cerrar…"
  exit 1
fi

already_running() {
  curl -s -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1
}

comfy_running() {
  curl -s -m 1 "http://127.0.0.1:${COMFY_PORT}/system_stats" >/dev/null 2>&1
}

if already_running; then
  echo "✔ Snoopy ya estaba corriendo. Abriendo la consola…"
  open "http://127.0.0.1:${PORT}/consola"
  exit 0
fi

RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
COMFY_ARGS=()
if [ "$RAM_BYTES" -le 25769803776 ]; then
  # En Macs de 16 GB mantener el texto codificador + la UNet en memoria a la vez
  # provoca intercambio constante y el muestreo nunca avanza.
  COMFY_ARGS+=(--cache-none)
fi

if ! comfy_running; then
  if [ -x "$HOME/ComfyUI/venv/bin/python" ] && [ -f "$HOME/ComfyUI/main.py" ]; then
    echo "🌀 Iniciando ComfyUI en segundo plano (tarda unos segundos)…"
    ( cd "$HOME/ComfyUI" && ./venv/bin/python main.py --port "$COMFY_PORT" "${COMFY_ARGS[@]}" >/tmp/snoopy-comfyui.log 2>&1 & )
  else
    echo "⚠️  ComfyUI (el motor) todavía no está instalado en ~/ComfyUI."
    echo "   En la consola que se va a abrir pulsa el botón verde «🚀 Instalar motor gratis» una sola vez."
  fi
fi

node server.mjs &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM

for _ in 1 2 3 4 5 6 7 8 9 10; do
  already_running && break
  sleep 0.4
done

echo "✅ Snoopy encendido. Se abrió su consola en el navegador (esa ventanita es el control)."
echo "   En Snoopy Editor aparece la opción \"Wan 2.2 local · gratis\" al abrir Ajustes de video."
echo "   Este archivo de texto no necesita más comandos; si lo cierras, el motor se apaga."
open "http://127.0.0.1:${PORT}/consola"

wait "$SERVER_PID"
