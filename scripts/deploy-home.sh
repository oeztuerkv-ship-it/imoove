#!/usr/bin/env bash
# Marketing-Static (onroda.de) → Nginx-Webroot synchronisieren.
# Kanonische Quelle: artifacts/marketing-site/ (nicht nur index/style/script).
#
# Vollständiger Produktions-Deploy: ./scripts/deploy-onroda-production.sh
# (gleiches rsync + API/Panel-Builds). Dieses Skript nur für Homepage-Static.
#
# Verwendung (Server):
#   cd /root/imoove && ./scripts/deploy-home.sh
# Optional:
#   ONRODA_MARKETING_WEBROOT=/var/www/onroda ./scripts/deploy-home.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/artifacts/marketing-site"
TARGET="${ONRODA_MARKETING_WEBROOT:-/var/www/onroda}"

if [[ ! -d "$SRC" ]]; then
  echo "[deploy-home] Fehlt: ${SRC}" >&2
  exit 1
fi

if [[ ! -d "$TARGET" ]]; then
  echo "[deploy-home] Zielverzeichnis existiert nicht: ${TARGET}" >&2
  echo "[deploy-home] Anlegen: sudo mkdir -p ${TARGET} && sudo chown …" >&2
  exit 1
fi

echo "[deploy-home] rsync ${SRC}/ → ${TARGET}/"
rsync -av \
  --exclude='*.bak' \
  --exclude='README.md' \
  --exclude='mockups/' \
  "${SRC}/" "${TARGET}/"

for f in index.html style.css script.js datenschutz.html impressum.html partner-status.html onroda-brand.css; do
  if [[ ! -f "${TARGET}/${f}" ]]; then
    echo "[deploy-home] FEHLER: fehlt nach rsync: ${TARGET}/${f}" >&2
    exit 1
  fi
done

if [[ -x "${ROOT}/scripts/verify-onroda-marketing-partner-status-repo.sh" ]]; then
  LIVE_MARKETING_ROOT="${TARGET}" bash "${ROOT}/scripts/verify-onroda-marketing-partner-status-repo.sh"
fi

echo "[deploy-home] OK — Marketing-Static unter ${TARGET}"
