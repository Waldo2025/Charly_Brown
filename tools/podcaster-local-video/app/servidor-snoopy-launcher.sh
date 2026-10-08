#!/bin/bash
# Arrancador de "Servidor Snoopy.app" (Contents/MacOS/servidor-snoopy).
# Ojo: cuando macOS lanza una app desde el Dock NO hereda el PATH de tu terminal,
# así que aquí se arma a mano; sin esto no se ven node, python ni ffmpeg.

# Ruta física (pwd -P): macOS monta /tmp como /private/tmp y una ruta "lógica"
# confunde al motor al reconocer si lo están ejecutando directo.
RES_DIR="$(cd "$(dirname "$0")/../Resources" 2>/dev/null && pwd -P)"
ENGINE_DIR="$RES_DIR/engine"
PORT="${PODCASTER_LOCAL_VIDEO_PORT:-8792}"
COMFY_PORT="${COMFY_PORT:-8188}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

alert() {
  osascript -e "tell app \"System Events\" to display alert \"$1\" message \"$2\" as warning buttons {\"Entendido\"}" >/dev/null 2>&1
}

engine_up() { curl -s -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; }
comfy_up() { curl -s -m 1 "http://127.0.0.1:${COMFY_PORT}/system_stats" >/dev/null 2>&1; }

if [ ! -f "$ENGINE_DIR/server.mjs" ]; then
  alert "Falta el motor" "El paquete de Servidor Snoopy está incompleto (no encontró server.mjs). Descarga la versión nueva desde Snoopy Editor."
  exit 1
fi

NODE_BIN=""
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
done
[ -z "$NODE_BIN" ] && NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  alert "Hace falta Node.js" "Descarga la versión LTS desde https://nodejs.org, instálala y vuelve a abrir Servidor Snoopy."
  exit 1
fi

# Ya hay un Snoopy encendido (por ejemplo el de desarrollo): no se arranca un segundo.
if engine_up; then
  open "http://127.0.0.1:${PORT}/consola"
  exit 0
fi

COMFY_ARGS=()
RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
if [ "${RAM_BYTES:-0}" -le 25769803776 ]; then
  # En Macs de poca RAM tener el modelo y el codificador a la vez en memoria provoca
  # intercambio constante y el muestreo nunca avanza.
  COMFY_ARGS+=(--cache-none)
fi

COMFY_PID=""
if ! comfy_up; then
  if [ -x "$HOME/ComfyUI/venv/bin/python" ] && [ -f "$HOME/ComfyUI/main.py" ]; then
    ( cd "$HOME/ComfyUI" && ./venv/bin/python main.py --port "$COMFY_PORT" "${COMFY_ARGS[@]}" >/tmp/snoopy-comfyui.log 2>&1 ) &
    COMFY_PID=$!
  fi
fi

"$NODE_BIN" "$ENGINE_DIR/server.mjs" >/tmp/snoopy-servidor.log 2>&1 &
SERVER_PID=$!

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$COMFY_PID" ] && kill "$COMFY_PID" 2>/dev/null
  return 0
}
trap cleanup EXIT INT TERM

# Snoopy tarda unos segundos en arrancar (y más si ComfyUI está cargando); si le
# tenemos poca paciencia salta una alarma falsa.
TICKS=0
while [ "$TICKS" -lt 40 ]; do
  engine_up && break
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.5
  TICKS=$((TICKS + 1))
done

if engine_up; then
  open "http://127.0.0.1:${PORT}/consola"
elif kill -0 "$SERVER_PID" 2>/dev/null; then
  # Sigue vivo, solo va lento: la consola se refresca sola.
  open "http://127.0.0.1:${PORT}/consola"
else
  DETALLE="$(tail -2 /tmp/snoopy-servidor.log 2>/dev/null | head -c 200)"
  alert "Snoopy no pudo encender" "El motor se cerró al arrancar. Suele ser el puerto ${PORT} ocupado por otra ventana de Snoopy. Detalle: ${DETALLE}"
fi

wait "$SERVER_PID"
