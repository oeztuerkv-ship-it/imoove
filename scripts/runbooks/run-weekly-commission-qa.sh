#!/usr/bin/env bash
# Wochenlauf-QA auf dem Server — ADMIN_API_BEARER_TOKEN bleibt lokal, wird nicht ausgegeben.
#
# Usage (Repo-Root, z. B. /root/imoove):
#   export COMPANY_ID=co-…
#   # optional: PERIOD_START / PERIOD_END / SEED_TAG / SKIP_SEED=1
#   ./scripts/runbooks/run-weekly-commission-qa.sh seed
#   ./scripts/runbooks/run-weekly-commission-qa.sh dry
#   ./scripts/runbooks/run-weekly-commission-qa.sh live
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-}"
if [[ "$MODE" != "seed" && "$MODE" != "dry" && "$MODE" != "live" ]]; then
  echo "Usage: $0 seed|dry|live" >&2
  exit 1
fi

API_ENV="${ROOT}/artifacts/api-server/.env"
if [[ ! -f "$API_ENV" ]]; then
  echo "Fehlt: $API_ENV" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$API_ENV"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL fehlt in API-.env" >&2
  exit 1
fi
if [[ "$MODE" != "seed" && -z "${ADMIN_API_BEARER_TOKEN:-}" ]]; then
  echo "ADMIN_API_BEARER_TOKEN fehlt in API-.env" >&2
  exit 1
fi
if [[ -z "${COMPANY_ID:-}" ]]; then
  echo "COMPANY_ID setzen (aktives taxi-Unternehmen)." >&2
  exit 1
fi

API_BASE="${ONRODA_QA_API_BASE:-https://api.onroda.de/api}"

if [[ -z "${PERIOD_START:-}" || -z "${PERIOD_END:-}" ]]; then
  read -r PERIOD_START PERIOD_END < <(
    psql "$DATABASE_URL" -At -F ' ' -c "
WITH b AS (SELECT (now() AT TIME ZONE 'Europe/Berlin')::date AS d)
SELECT
  (date_trunc('week', d)::date - 7)::text,
  (date_trunc('week', d)::date - 1)::text
FROM b;"
  )
fi
SEED_TAG="${SEED_TAG:-netting-qa-$(date +%Y%m%d)}"

echo "MODE=$MODE COMPANY_ID=$COMPANY_ID PERIOD=${PERIOD_START}..${PERIOD_END} SEED_TAG=$SEED_TAG"
echo "(Token wird nicht ausgegeben.)"

# company_code-Lücke (Onboarding): Überblick vor dem Lauf
psql "$DATABASE_URL" -v company_id="$COMPANY_ID" -c "
SELECT
  count(*) FILTER (WHERE trim(coalesce(company_code, '')) = '') AS missing_company_code,
  count(*) AS total_companies
FROM admin_companies;
SELECT id, name, company_code
FROM admin_companies
WHERE id = :'company_id';
"

run_seed() {
  psql "$DATABASE_URL" \
    -v company_id="$COMPANY_ID" \
    -v period_start="$PERIOD_START" \
    -v period_end="$PERIOD_END" \
    -v seed_tag="$SEED_TAG" \
    -f "$ROOT/scripts/runbooks/sql/seed-taxi-cash-negativsaldo-week.sql"
}

if [[ "$MODE" == "seed" ]]; then
  run_seed
  exit 0
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  run_seed
else
  echo "SKIP_SEED=1 — Seed übersprungen"
fi

DRY_JSON=true
OUT=/tmp/weekly-netting-dry.json
if [[ "$MODE" == "live" ]]; then
  DRY_JSON=false
  OUT=/tmp/weekly-netting-live.json
fi

curl -sS -X POST "${API_BASE}/admin/finance/settlements/weekly-commission-run" \
  -H "Authorization: Bearer ${ADMIN_API_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":${DRY_JSON},\"periodStart\":\"${PERIOD_START}\",\"periodEnd\":\"${PERIOD_END}\"}" \
  | tee "$OUT" >/dev/null

python3 -m json.tool <"$OUT" | head -120
echo ""
echo "Vollständige Response: $OUT"
echo "UI: scripts/runbooks/qa-store-login-and-weekly-netting.md §1.6–1.7"
