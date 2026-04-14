#!/usr/bin/env bash
# Prüft, ob die Produktions-DB die von der API erwarteten Objekte hat (siehe verify-onroda-db-schema.sql / MIGRATION_ORDER.txt).
# Gleiche DATABASE_URL-Logik wie deploy-onroda-production.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="${ROOT}/artifacts/api-server"
SQL_FILE="${ROOT}/scripts/verify-onroda-db-schema.sql"

# Optional: lokale Overrides (gitignored)
if [[ -f "${ROOT}/scripts/onroda-deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT}/scripts/onroda-deploy.env"
fi

load_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL
    return 0
  fi
  local env_file="${API_DIR}/.env"
  [[ -f "$env_file" ]] || return 1
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    if [[ "$line" =~ ^DATABASE_URL=(.*)$ ]]; then
      DATABASE_URL="${BASH_REMATCH[1]}"
      DATABASE_URL="${DATABASE_URL#\"}"
      DATABASE_URL="${DATABASE_URL%\"}"
      DATABASE_URL="${DATABASE_URL#\'}"
      DATABASE_URL="${DATABASE_URL%\'}"
      export DATABASE_URL
      return 0
    fi
  done <"$env_file"
  return 1
}

if ! load_database_url; then
  echo "[verify-onroda-db-schema] DATABASE_URL fehlt (Umgebung oder ${API_DIR}/.env)." >&2
  exit 1
fi
command -v psql >/dev/null 2>&1 || { echo "[verify-onroda-db-schema] psql nicht im PATH" >&2; exit 1; }
[[ -f "$SQL_FILE" ]] || { echo "[verify-onroda-db-schema] Fehlt: $SQL_FILE" >&2; exit 1; }

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "[verify-onroda-db-schema] OK — Schema passt zu den Prüfungen in verify-onroda-db-schema.sql."
