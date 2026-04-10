#!/usr/bin/env bash
# Einmaliger (oder wiederholter) Abgleich: Server -> lokales artifacts/admin-panel
# Nutzung: ADMIN_SERVER=root@hostname ./scripts/import-admin-panel-from-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="${ROOT}/artifacts/admin-panel"
SERVER="${ADMIN_SERVER:-}"

if [[ -z "${SERVER}" ]]; then
  echo "Setze ADMIN_SERVER, z. B.:" >&2
  echo "  ADMIN_SERVER=root@dein-host ${0}" >&2
  exit 1
fi

echo "Sync ${SERVER}:/root/imoove/artifacts/admin-panel/ -> ${DST}/"
mkdir -p "${DST}"

rsync -avz \
  --exclude node_modules \
  --exclude .next \
  --exclude dist \
  --exclude build \
  --exclude out \
  --exclude .env \
  --exclude '.env.*' \
  "${SERVER}:/root/imoove/artifacts/admin-panel/" \
  "${DST}/"

echo "Fertig. Bitte prüfen: git -C \"${ROOT}\" status"
