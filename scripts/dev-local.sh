#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-8787}"
WEB_PORT="${WEB_PORT:-5010}"
export API_PORT
export WEB_PORT
BACKEND_LOG="${BACKEND_LOG:-/tmp/charlybrown-backend-${API_PORT}.log}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"
API_PID=""
WEB_PID=""
MONITOR_PID=""
WEB_MONITOR_PID=""

kill_stale_backend_processes() {
  local matches=""
  matches="$(pgrep -fal "node .*backend/server.js" 2>/dev/null | awk '{print $1}' | tr '\n' ' ' | xargs echo -n || true)"
  if [[ -z "${matches}" ]]; then
    return 0
  fi
  echo "[dev-local] stopping stale backend/server.js processes (pids: ${matches})"
  kill ${matches} >/dev/null 2>&1 || true
  sleep 0.6
  local alive=""
  alive="$(pgrep -fal "node .*backend/server.js" 2>/dev/null | awk '{print $1}' | tr '\n' ' ' | xargs echo -n || true)"
  if [[ -n "${alive}" ]]; then
    echo "[dev-local] force killing stale backend/server.js processes (pids: ${alive})"
    kill -9 ${alive} >/dev/null 2>&1 || true
  fi
}

kill_port() {
  local port="$1"
  local pids=""
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null | tr '\n' ' ' | xargs echo -n || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  echo "[dev-local] freeing port ${port} (pids: ${pids})"
  kill ${pids} >/dev/null 2>&1 || true
  sleep 0.6
  local alive=""
  alive="$(lsof -ti tcp:"${port}" 2>/dev/null | tr '\n' ' ' | xargs echo -n || true)"
  if [[ -n "${alive}" ]]; then
    echo "[dev-local] force killing port ${port} (pids: ${alive})"
    kill -9 ${alive} >/dev/null 2>&1 || true
  fi
}

is_node_listener() {
  local pid="$1"
  local command_name=""
  command_name="$(ps -p "${pid}" -o comm= 2>/dev/null | xargs echo -n || true)"
  if [[ "${command_name}" == *node* ]]; then
    return 0
  fi
  return 1
}

resolve_web_port() {
  local preferred_port="$1"
  local candidate="${preferred_port}"
  local max_tries=20
  local try_num=1
  while [[ "${try_num}" -le "${max_tries}" ]]; do
    local listeners=""
    listeners="$(lsof -ti tcp:"${candidate}" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs echo -n || true)"
    if [[ -z "${listeners}" ]]; then
      WEB_PORT="${candidate}"
      WEB_URL="http://127.0.0.1:${WEB_PORT}"
      export WEB_PORT
      return 0
    fi
    local all_node="1"
    for pid in ${listeners}; do
      if ! is_node_listener "${pid}"; then
        all_node="0"
        break
      fi
    done
    if [[ "${all_node}" == "1" ]]; then
      echo "[dev-local] freeing web port ${candidate} used by node processes (pids: ${listeners})"
      kill ${listeners} >/dev/null 2>&1 || true
      sleep 0.6
      listeners="$(lsof -ti tcp:"${candidate}" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs echo -n || true)"
      if [[ -z "${listeners}" ]]; then
        WEB_PORT="${candidate}"
        WEB_URL="http://127.0.0.1:${WEB_PORT}"
        export WEB_PORT
        return 0
      fi
      kill -9 ${listeners} >/dev/null 2>&1 || true
      sleep 0.4
      listeners="$(lsof -ti tcp:"${candidate}" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs echo -n || true)"
      if [[ -z "${listeners}" ]]; then
        WEB_PORT="${candidate}"
        WEB_URL="http://127.0.0.1:${WEB_PORT}"
        export WEB_PORT
        return 0
      fi
    fi
    if [[ "${candidate}" == "${preferred_port}" ]]; then
      echo "[dev-local] preferred web port ${preferred_port} is busy by non-node process; selecting next free port"
    fi
    candidate=$((candidate + 1))
    try_num=$((try_num + 1))
  done
  echo "[dev-local] unable to find an available web port near ${preferred_port}"
  return 1
}

kill_stale_backend_processes
kill_port "${API_PORT}"
kill_port "${WEB_PORT}"
resolve_web_port "${WEB_PORT}"

start_backend() {
  echo "[dev-local] starting backend on http://127.0.0.1:${API_PORT}"
  rm -f "${BACKEND_LOG}"
  node backend/server.js >"${BACKEND_LOG}" 2>&1 &
  API_PID=$!
}

cleanup() {
  if [[ -n "${MONITOR_PID:-}" ]] && kill -0 "$MONITOR_PID" >/dev/null 2>&1; then
    kill "$MONITOR_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_MONITOR_PID:-}" ]] && kill -0 "$WEB_MONITOR_PID" >/dev/null 2>&1; then
    kill "$WEB_MONITOR_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

wait_for_backend() {
  local attempts="${1:-25}"
  local delay="${2:-0.4}"
  local url="http://127.0.0.1:${API_PORT}/api/health"
  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$API_PID" >/dev/null 2>&1; then
      echo "[dev-local] backend exited unexpectedly"
      if [[ -f "${BACKEND_LOG}" ]]; then
        echo "[dev-local] backend log:"
        cat "${BACKEND_LOG}"
      fi
      return 1
    fi
    sleep "${delay}"
  done
  echo "[dev-local] backend did not become healthy on ${url}"
  if [[ -f "${BACKEND_LOG}" ]]; then
    echo "[dev-local] backend log:"
    cat "${BACKEND_LOG}"
  fi
  return 1
}

verify_podcaster_routes() {
  local health_url="http://127.0.0.1:${API_PORT}/api/health"
  local dialogue_route_url="http://127.0.0.1:${API_PORT}/api/podcaster/dialogue-audio/generate"
  local music_route_url="http://127.0.0.1:${API_PORT}/api/podcaster/music/generate"
  local health_json=""
  local route_status=""
  local music_status=""

  health_json="$(curl -fsS "${health_url}" 2>/dev/null || true)"
  if [[ -z "${health_json}" ]]; then
    echo "[dev-local] backend health check returned empty response"
    return 1
  fi
  if ! echo "${health_json}" | grep -Eq '"podcasterDialogueAudioRoute"[[:space:]]*:[[:space:]]*true'; then
    echo "[dev-local] backend health missing podcasterDialogueAudioRoute=true"
    echo "[dev-local] health payload: ${health_json}"
    return 1
  fi
  if ! echo "${health_json}" | grep -Eq '"podcasterMusicGenerateRoute"[[:space:]]*:[[:space:]]*true'; then
    echo "[dev-local] backend health missing podcasterMusicGenerateRoute=true"
    echo "[dev-local] health payload: ${health_json}"
    return 1
  fi

  route_status="$(curl -sS -o /tmp/charlybrown-dialogue-audio-route-check.json -w "%{http_code}" -X POST "${dialogue_route_url}" -H "Content-Type: application/json" -d '{}' || true)"
  if [[ "${route_status}" == "404" ]]; then
    echo "[dev-local] backend active no corresponde a versión con diálogo-audio (POST /api/podcaster/dialogue-audio/generate -> 404)"
    return 1
  fi
  if [[ "${route_status}" == "000" || -z "${route_status}" ]]; then
    echo "[dev-local] backend dialogue-audio route check did not reach server"
    return 1
  fi
  echo "[dev-local] dialogue-audio route probe status: ${route_status} (expected != 404)"

  music_status="$(curl -sS -o /tmp/charlybrown-music-generate-route-check.json -w "%{http_code}" -X POST "${music_route_url}" -H "Content-Type: application/json" -d '{}' || true)"
  if [[ "${music_status}" == "404" ]]; then
    echo "[dev-local] backend active no corresponde a versión con music-generate (POST /api/podcaster/music/generate -> 404)"
    return 1
  fi
  if [[ "${music_status}" == "000" || -z "${music_status}" ]]; then
    echo "[dev-local] backend music-generate route check did not reach server"
    return 1
  fi
  echo "[dev-local] music-generate route probe status: ${music_status} (expected != 404)"
  return 0
}

start_backend
wait_for_backend
verify_podcaster_routes

monitor_backend() {
  local retry_delay=2
  while true; do
    sleep "${retry_delay}"
    if [[ -z "${API_PID:-}" ]]; then
      continue
    fi
    if kill -0 "$API_PID" >/dev/null 2>&1; then
      retry_delay=2
      continue
    fi
    echo "[dev-local] backend process stopped; restarting..."
    start_backend
    if ! wait_for_backend 20 0.4; then
      echo "[dev-local] backend restart failed; retrying in ${retry_delay}s"
      retry_delay=$((retry_delay < 20 ? retry_delay * 2 : 20))
      continue
    fi
    if ! verify_podcaster_routes; then
      echo "[dev-local] backend restart inválido para rutas críticas de podcaster; retrying in ${retry_delay}s"
      retry_delay=$((retry_delay < 20 ? retry_delay * 2 : 20))
      continue
    fi
    retry_delay=2
    echo "[dev-local] backend restarted on http://127.0.0.1:${API_PORT}"
  done
}

monitor_backend &
MONITOR_PID=$!
echo "[dev-local] backend monitor started (pid: ${MONITOR_PID})"

echo "[dev-local] building voxel.js bundle"
if ! npm run build:voxel; then
  echo "[dev-local] WARNING: build:voxel failed; continuing with backend/frontend running"
fi

wait_for_frontend() {
  local attempts="${1:-25}"
  local delay="${2:-0.4}"
  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS "${WEB_URL}" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
      echo "[dev-local] live-server exited unexpectedly"
      return 1
    fi
    sleep "${delay}"
  done
  echo "[dev-local] frontend did not become reachable on ${WEB_URL}"
  return 1
}

open_browser() {
  if [[ "${NO_OPEN_BROWSER:-0}" == "1" ]]; then
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "${WEB_URL}" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${WEB_URL}" >/dev/null 2>&1 || true
    return 0
  fi
  return 0
}

start_frontend() {
  echo "[dev-local] starting live-server on ${WEB_URL}"
  npx live-server public --host=127.0.0.1 --port="${WEB_PORT}" --no-browser &
  WEB_PID=$!
}

monitor_frontend() {
  local retry_delay=2
  while true; do
    if [[ -z "${WEB_PID:-}" ]] || ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
      echo "[dev-local] live-server not running; restarting..."
      start_frontend
      if wait_for_frontend 25 0.4; then
        echo "[dev-local] frontend restarted on ${WEB_URL}"
        retry_delay=2
      else
        echo "[dev-local] frontend restart failed; retrying in ${retry_delay}s"
        sleep "${retry_delay}"
        retry_delay=$((retry_delay < 20 ? retry_delay * 2 : 20))
        continue
      fi
    fi
    sleep 2
  done
}

start_frontend
if wait_for_frontend 25 0.4; then
  open_browser
  echo "[dev-local] app ready at ${WEB_URL}"
else
  echo "[dev-local] WARNING: frontend did not become reachable yet; monitor will retry"
fi

monitor_frontend &
WEB_MONITOR_PID=$!
echo "[dev-local] frontend monitor started (pid: ${WEB_MONITOR_PID})"

while true; do
  sleep 60
done
