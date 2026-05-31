#!/usr/bin/env bash
# Prüft nur: set_config(…, true) + current_setting in derselben Transaktion (ohne DELETE).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ONRODA_API_ENV:-$ROOT/artifacts/api-server/.env}"
KEEP_FROM_CLI="${ONRODA_KEEP_ADMIN_LOGIN:-}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

KEEP="${KEEP_FROM_CLI:-${ONRODA_KEEP_ADMIN_LOGIN:-}}"
if [[ -z "${DATABASE_URL:-}" || -z "$KEEP" ]]; then
  echo "DATABASE_URL und ONRODA_KEEP_ADMIN_LOGIN erforderlich." >&2
  exit 1
fi

echo "Prelude-Test keep_login=$KEEP"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v "keep_login=${KEEP}" <<'EOSQL'
BEGIN;
SELECT set_config('onroda.wipe.keep_login', :'keep_login', true);
DO $$
DECLARE
  k text := current_setting('onroda.wipe.keep_login', true);
BEGIN
  IF k IS NULL OR btrim(k) = '' THEN
    RAISE EXCEPTION 'Prelude FAIL: keep_login leer in Transaktion';
  END IF;
  RAISE NOTICE 'Prelude OK: keep_login=%', k;
END $$;
ROLLBACK;
EOSQL
echo "Prelude-Test bestanden."
