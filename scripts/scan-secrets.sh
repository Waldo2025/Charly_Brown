#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATTERN='(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|"private_key"\s*:\s*"-----BEGIN)'

EXCLUDES=(
  --glob '!node_modules/**'
  --glob '!backups/**'
  --glob '!*.example'
  --glob '!config.local.example.js'
  --glob '!config.local.js'
  --glob '!public/config.local.example.js'
  --glob '!public/config.local.js'
)

echo "[secret-scan] scanning tracked source files..."
if rg -n -S "$PATTERN" . "${EXCLUDES[@]}"; then
  echo "[secret-scan] FAIL: potential secrets found"
  exit 1
fi

# Allow Firebase Web apiKey (public by design), but block other AIza keys.
AZ_LINES="$(rg -n -S 'AIza[0-9A-Za-z_-]{20,}' . "${EXCLUDES[@]}" || true)"
if [[ -n "$AZ_LINES" ]]; then
  FILTERED="$(printf '%s\n' "$AZ_LINES" | rg -v 'apiKey\s*:\s*"AIza|firebase-web-config\.js' || true)"
  if [[ -n "$FILTERED" ]]; then
    printf '%s\n' "$FILTERED"
    echo "[secret-scan] FAIL: potential non-Firebase Google API keys found"
    exit 1
  fi
fi

echo "[secret-scan] OK: no known secret signatures found"
