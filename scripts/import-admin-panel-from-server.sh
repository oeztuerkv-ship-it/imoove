#!/usr/bin/env bash
# Admin-Panel-Source nach artifacts/admin-panel spiegeln.
#
# Variante A (SSH):  ADMIN_SERVER=root@host ./scripts/import-admin-panel-from-server.sh
# Variante B (lokal): ADMIN_LOCAL_PATH=/pfad/zum/admin-panel ./scripts/import-admin-panel-from-server.sh
# Optional: Werte in .env.deploy im Repo-Root (gitignored), siehe .env.deploy.example
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="${ROOT}/artifacts/admin-panel"
DEPLOY_FILE="${ROOT}/.env.deploy"

if [[ -f "$DEPLOY_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_FILE"
  set +a
fi

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .next
  --exclude dist
  --exclude build
  --exclude out
  --exclude .env
  --exclude '.env.*'
)

mkdir -p "${DST}"

if [[ -n "${ADMIN_LOCAL_PATH:-}" ]]; then
  SRC="${ADMIN_LOCAL_PATH}"
  [[ -d "$SRC" ]] || { echo "ADMIN_LOCAL_PATH ist kein Ordner: $SRC" >&2; exit 1; }
  echo "Kopiere lokal: ${SRC}/ -> ${DST}/"
  rsync -a "${RSYNC_EXCLUDES[@]}" "${SRC}/" "${DST}/"
elif [[ -n "${ADMIN_SERVER:-}" ]]; then
  echo "Rsync ${ADMIN_SERVER}:/root/imoove/artifacts/admin-panel/ -> ${DST}/"
  rsync -avz "${RSYNC_EXCLUDES[@]}" \
    "${ADMIN_SERVER}:/root/imoove/artifacts/admin-panel/" \
    "${DST}/"
else
  echo "Bitte setzen:" >&2
  echo "  ADMIN_SERVER=root@hostname   ${0}" >&2
  echo "oder" >&2
  echo "  ADMIN_LOCAL_PATH=/pfad/zum/admin-panel   ${0}" >&2
  echo "oder Werte in ${DEPLOY_FILE} (Vorlage: .env.deploy.example)" >&2
  exit 1
fi

echo "Fertig. Als Nächstes: ./scripts/verify-admin-panel-source.sh"
