#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ALLOWLIST_REGEX='^https://(www\.gstatic\.com|www\.google\.com|recaptcha\.google\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|firebase\.googleapis\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com|content-firebaseappcheck\.googleapis\.com|firebaseappcheck\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|code\.jquery\.com|cdnjs\.cloudflare\.com|unpkg\.com|cdn\.datatables\.net|cdn\.sheetjs\.com)'

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

{
  rg -n -o '(src|href)=["'"'"']https://[^"'"'"']+' public/*.html || true
  rg -n -o 'from ["'"'"']https://[^"'"'"']+["'"'"']' public/*.js || true
  rg -n -o 'import\(["'"'"']https://[^"'"'"']+["'"'"']\)' public/*.js || true
  rg -n -o 's\.src\s*=\s*["'"'"']https://[^"'"'"']+["'"'"']' public/*.js || true
  rg -n -o 'fetch\(["'"'"']https://[^"'"'"']+["'"'"']' public/*.js || true
  rg -n -o 'https://[^ ;"]+' firebase.json || true
} 2>/dev/null \
  | sed -E 's#^[^:]*:[0-9]*:##' \
  | sed -E 's#^[0-9]+:##' \
  | sed -E 's#^[[:space:]]+##' \
  | sed -E 's#^(src|href)=["'"'"']##' \
  | sed -E 's#^from ["'"'"']##' \
  | sed -E 's#^import\(["'"'"']##' \
  | sed -E 's#^s\.src\s*=\s*["'"'"']##' \
  | sed -E 's#^fetch\(["'"'"']##' \
  | sed -E 's#["'"'"']\)?$##' \
  | grep '^https://' \
  | sort -u > "$tmp_file"

if [[ ! -s "$tmp_file" ]]; then
  echo "No remote hosting dependencies found."
  exit 0
fi

echo "Remote dependencies detected:"
cat "$tmp_file"

disallowed="$(grep -Ev "$ALLOWLIST_REGEX" "$tmp_file" || true)"
if [[ -n "$disallowed" ]]; then
  echo
  echo "Disallowed or unreviewed remote dependencies:"
  printf '%s\n' "$disallowed"
  exit 1
fi

echo
echo "Hosting supply-chain verification passed."
