#!/usr/bin/env bash
# Löscht alle Mandanten/Partner/Fahrten/Kunden — behält genau einen admin_auth_users-Login.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ONRODA_API_ENV:-$ROOT/artifacts/api-server/.env}"
SQL_FILE="$ROOT/scripts/onroda-wipe-tenants-keep-one-admin.sql"

# CLI-Wert vor .env merken (source darf ONRODA_KEEP_ADMIN_LOGIN nicht überschreiben/leeren)
KEEP_FROM_CLI="${ONRODA_KEEP_ADMIN_LOGIN:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Fehlt: $ENV_FILE (oder ONRODA_API_ENV setzen)" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL nicht gesetzt in $ENV_FILE" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql nicht gefunden" >&2
  exit 1
fi

KEEP="${KEEP_FROM_CLI:-${ONRODA_KEEP_ADMIN_LOGIN:-}}"
if [[ -z "$KEEP" ]]; then
  KEEP="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT username FROM admin_auth_users WHERE is_active ORDER BY created_at LIMIT 1" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi

if [[ -z "$KEEP" ]]; then
  echo "Kein Admin-Login — setze ONRODA_KEEP_ADMIN_LOGIN=dein_username (muss in admin_auth_users existieren)." >&2
  exit 1
fi

echo "=== Onroda Mandanten-Wipe ==="
echo "Datenbank: ${DATABASE_URL%%@*}@…"
echo "Behalten Admin-Login: $KEEP"
echo ""
echo "Vorher:"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'admin_companies' AS t, count(*)::text FROM admin_companies
UNION ALL SELECT 'panel_users', count(*)::text FROM panel_users
UNION ALL SELECT 'fleet_drivers', count(*)::text FROM fleet_drivers
UNION ALL SELECT 'rides', count(*)::text FROM rides
UNION ALL SELECT 'customer_accounts', count(*)::text FROM customer_accounts
UNION ALL SELECT 'partner_registration_requests', count(*)::text FROM partner_registration_requests;
"

if [[ "${ONRODA_CONFIRM_WIPE:-}" != "1" ]]; then
  echo ""
  echo "Abbruch: zum Ausführen ONRODA_CONFIRM_WIPE=1 setzen (nach Backup!)."
  exit 2
fi

echo ""
echo "Prelude-Test (set_config in Transaktion) …"
ONRODA_KEEP_ADMIN_LOGIN="$KEEP" "$ROOT/scripts/test-onroda-wipe-prelude.sh"

echo ""
echo "Starte Wipe (psql -v keep_login=…) …"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v "keep_login=${KEEP}" -f "$SQL_FILE"

echo ""
echo "Nachher:"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'admin_companies' AS t, count(*)::text FROM admin_companies
UNION ALL SELECT 'panel_users', count(*)::text FROM panel_users
UNION ALL SELECT 'fleet_drivers', count(*)::text FROM fleet_drivers
UNION ALL SELECT 'rides', count(*)::text FROM rides
UNION ALL SELECT 'customer_accounts', count(*)::text FROM customer_accounts
UNION ALL SELECT 'admin_auth_users', count(*)::text FROM admin_auth_users;
"
echo "Fertig. Panel/Fleet/Mobile-Sessions auf Geräten ggf. neu anmelden."
