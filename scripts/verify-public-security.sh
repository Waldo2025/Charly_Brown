#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

check_absent() {
  local pattern="$1"
  local scope="$2"
  if rg -n --hidden --glob '!functions/**' --glob '!servidor-dalle/**' --glob '!charly-app/**' --glob '!public/vendor/**' "$pattern" $scope; then
    echo "Pattern still present: $pattern" >&2
    exit 1
  fi
}

check_missing_file() {
  local target="$1"
  if [[ -e "$target" ]]; then
    echo "Unexpected public artifact still present: $target" >&2
    exit 1
  fi
}

check_absent_pcre2() {
  local pattern="$1"
  local scope="$2"
  if rg -n --pcre2 --hidden --glob '!functions/**' --glob '!servidor-dalle/**' --glob '!charly-app/**' --glob '!public/vendor/**' "$pattern" $scope; then
    echo "Pattern still present: $pattern" >&2
    exit 1
  fi
}

check_absent "huggingface" "public firebase.json"
check_absent "/api/hf/" "public firebase.json"
check_absent "wikipedia\\.org" "public firebase.json"
check_absent "googleapis\\.com/books" "public firebase.json"
check_absent "Google Books" "public firebase.json"
check_absent "generativelanguage\\.googleapis\\.com" "public firebase.json"
check_absent "api\\.openai\\.com" "public firebase.json"
check_absent "@google/genai" "public"
check_absent "<script[^>]+src=[\"']config\\.local\\.js" "public"
check_missing_file "public/README.cmd"
check_missing_file "public/firebase-messaging-sw.js"
check_missing_file "public/radiora.zip"
check_missing_file "public/js/html-docx-js-master.zip"

if ! jq -e '
  .hosting.ignore
  | index("config.local.js")
  | type == "number"
' firebase.json >/dev/null; then
  echo "firebase.json hosting.ignore must exclude config.local.js" >&2
  exit 1
fi

if ! jq -e '
  .hosting.ignore
  | index("server.js")
  | type == "number"
' firebase.json >/dev/null; then
  echo "firebase.json hosting.ignore must exclude server.js" >&2
  exit 1
fi

if ! jq -e '
  .hosting.ignore
  | index("app.py")
  | type == "number"
' firebase.json >/dev/null; then
  echo "firebase.json hosting.ignore must exclude config.local.js, server.js and app.py" >&2
  exit 1
fi

if [[ -e "public/config.local.js" ]] && ! rg -n 'public/config\.local\.js' .firebaseignore >/dev/null; then
  echo "public/config.local.js exists and must be excluded in .firebaseignore" >&2
  exit 1
fi

tmp_http_refs="$(mktemp)"
trap 'rm -f "$tmp_http_refs"' EXIT

{
  rg -n -o '(src|href)=["'"'"']http://[^"'"'"']+' public/*.html || true
  rg -n -o 'from ["'"'"']http://[^"'"'"']+["'"'"']' public/*.js || true
  rg -n -o 'import\(["'"'"']http://[^"'"'"']+["'"'"']\)' public/*.js || true
  rg -n -o 's\.src\s*=\s*["'"'"']http://[^"'"'"']+["'"'"']' public/*.js || true
  rg -n -o 'fetch\(["'"'"']http://[^"'"'"']+["'"'"']' public/*.js || true
} 2>/dev/null \
  | sed -E 's#^[^:]*:[0-9]*:##' \
  | sed -E 's#^(src|href)=["'"'"']##' \
  | sed -E 's#^from ["'"'"']##' \
  | sed -E 's#^import\(["'"'"']##' \
  | sed -E 's#^s\.src\s*=\s*["'"'"']##' \
  | sed -E 's#^fetch\(["'"'"']##' \
  | sed -E 's#["'"'"']\)?$##' \
  | sort -u > "$tmp_http_refs"

if [[ -s "$tmp_http_refs" ]]; then
  disallowed_http="$(grep -Ev '^http://(127\.0\.0\.1|localhost)([:/]|$)' "$tmp_http_refs" || true)"
  if [[ -n "$disallowed_http" ]]; then
    echo "Disallowed runtime http:// dependencies detected:" >&2
    printf '%s\n' "$disallowed_http" >&2
    exit 1
  fi
fi

echo "Public security verification passed."
