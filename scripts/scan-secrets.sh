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

# The Firebase Web apiKey is public by design: it ships inside the browser bundle, so it
# is allowed wherever it appears. It is pinned to the exact value instead of to an
# `apiKey:`-looking line, which keeps a Gemini or other Google key pasted into a config
# object failing the scan. Adding a second Firebase app means listing its public key here.
FIREBASE_WEB_API_KEYS=(
  "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0"
)

AZ_LINES="$(rg -n -S 'AIza[0-9A-Za-z_-]{20,}' . "${EXCLUDES[@]}" || true)"
if [[ -n "$AZ_LINES" ]]; then
  FILTERED="$AZ_LINES"
  for web_key in "${FIREBASE_WEB_API_KEYS[@]}"; do
    FILTERED="$(printf '%s\n' "$FILTERED" | rg -v -- "$web_key" || true)"
  done
  if [[ -n "$FILTERED" ]]; then
    printf '%s\n' "$FILTERED"
    echo "[secret-scan] FAIL: potential non-Firebase Google API keys found"
    exit 1
  fi
fi

echo "[secret-scan] OK: no known secret signatures found"
