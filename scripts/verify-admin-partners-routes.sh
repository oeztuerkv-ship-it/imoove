#!/usr/bin/env bash
# Verifiziert Admin-Build (dist) und optional HTTP 200 gegen einen laufenden Server.
# Nutzung:
#   ./scripts/verify-admin-partners-routes.sh              # nur Dateisystem
#   ./scripts/verify-admin-partners-routes.sh http://127.0.0.1:8080   # + curl
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/artifacts/admin-panel/dist"
INDEX="$DIST/index.html"

if [[ ! -f "$INDEX" ]]; then
  echo "Fehlt: $INDEX — bitte zuerst: pnpm --filter admin-panel run build (Repo-Root)" >&2
  exit 1
fi

echo "== Dateisystem: $DIST"
ASSETS_FILE="$(mktemp)"
grep -oE '/partners/assets/[^"'"'"'<> ]+' "$INDEX" | sort -u >"$ASSETS_FILE"
if [[ ! -s "$ASSETS_FILE" ]]; then
  echo "FEHLT: keine /partners/assets/…-Referenzen in index.html (base falsch?)" >&2
  rm -f "$ASSETS_FILE"
  exit 1
fi
while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  disk="${rel#/partners/}"
  f="$DIST/$disk"
  if [[ ! -f "$f" ]]; then
    echo "FEHLT auf Platte: $f (referenziert in index.html)" >&2
    rm -f "$ASSETS_FILE"
    exit 1
  fi
  echo "OK  $rel"
done <"$ASSETS_FILE"

if [[ ! -f "$DIST/favicon.svg" ]]; then
  echo "WARN: favicon.svg fehlt unter dist/ (optional aus public/)" >&2
else
  echo "OK  /partners/favicon.svg (Datei dist/favicon.svg)"
fi

BASE="${1:-}"
if [[ -n "$BASE" ]]; then
  echo "== HTTP gegen $BASE"
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/partners/" || true)
  if [[ "$code" != "200" ]]; then
    echo "FEHLT: GET /partners/ → $code (Server läuft?)" >&2
    exit 1
  fi
  echo "OK  GET /partners/ → 200"
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    url="${BASE}${rel}"
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)
    if [[ "$code" != "200" ]]; then
      echo "FEHLT: GET $url → $code" >&2
      rm -f "$ASSETS_FILE"
      exit 1
    fi
    echo "OK  GET $rel → 200"
  done <"$ASSETS_FILE"
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/partners/favicon.svg" || true)
  if [[ "$code" == "200" ]]; then
    echo "OK  GET /partners/favicon.svg → 200"
  fi
fi

rm -f "$ASSETS_FILE"
echo "Alles OK."
