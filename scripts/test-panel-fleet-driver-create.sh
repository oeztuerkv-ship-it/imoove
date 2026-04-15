#!/usr/bin/env bash
# Test: Partner-Panel JWT → POST /panel/v1/fleet/drivers
#
# Nutzung (Passwörter niemals committen):
#   export PANEL_USERNAME="dein-login"
#   export PANEL_PASSWORD="…"
#   optional: export API_BASE="https://api.onroda.de/api"
#   optional: export DRIVER_TEST_EMAIL="einmalig@example.com"
#   bash scripts/test-panel-fleet-driver-create.sh

set -euo pipefail

API_BASE="${API_BASE:-https://api.onroda.de/api}"
API_BASE="${API_BASE%/}"

if [[ -z "${PANEL_USERNAME:-}" || -z "${PANEL_PASSWORD:-}" ]]; then
  echo "Bitte setzen: PANEL_USERNAME und PANEL_PASSWORD (Account mit fleet.manage)." >&2
  exit 1
fi

export DRIVER_EMAIL="${DRIVER_TEST_EMAIL:-fleet-e2e-$(date +%s)@example.invalid}"

LOGIN_PAYLOAD=$(python3 -c "import json,os; print(json.dumps({'username':os.environ['PANEL_USERNAME'],'password':os.environ['PANEL_PASSWORD']}))")

echo "→ POST $API_BASE/panel-auth/login"
LOGIN_RES=$(curl -sS -X POST "$API_BASE/panel-auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD")

TOKEN=$(echo "$LOGIN_RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or '')")
if [[ -z "$TOKEN" ]]; then
  echo "Login fehlgeschlagen:" >&2
  echo "$LOGIN_RES" | python3 -m json.tool >&2 || echo "$LOGIN_RES" >&2
  exit 1
fi

echo "→ GET $API_BASE/panel/v1/me"
curl -sS "$API_BASE/panel/v1/me" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

CREATE_BODY=$(python3 -c "import json,os; print(json.dumps({
  'email': os.environ['DRIVER_EMAIL'],
  'firstName': 'E2E',
  'lastName': 'Script',
  'phone': '+491700000000',
}))")

echo "→ POST $API_BASE/panel/v1/fleet/drivers (E-Mail: $DRIVER_EMAIL)"
TMP=$(mktemp)
HTTP=$(curl -sS -o "$TMP" -w "%{http_code}" \
  -X POST "$API_BASE/panel/v1/fleet/drivers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_BODY")

echo "HTTP $HTTP"
python3 -m json.tool <"$TMP" 2>/dev/null || cat "$TMP"
rm -f "$TMP"

if [[ "$HTTP" == "201" ]]; then
  echo "OK: Fahrer angelegt."
  exit 0
fi
echo "Hinweis: 403 mit error aus JSON = Governance (Profil/Nachweise/Vertrag) oder fehlendes Modul taxi_fleet / keine Berechtigung." >&2
exit 1
