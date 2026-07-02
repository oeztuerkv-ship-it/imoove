#!/usr/bin/env bash
# E2E: Partner-Panel JWT → Sofort-Taxi + Reservierung via POST /panel/v1/rides
#
# Nutzung (Passwörter niemals committen):
#   export PANEL_USERNAME="dein-login"
#   export PANEL_PASSWORD="…"
#   optional: export API_BASE="https://api.onroda.de/api"
#   optional: export BOOKING_FROM="Musterstraße 1, 70771 Leinfelden-Echterdingen"
#   optional: export BOOKING_TO="Hauptbahnhof, 70173 Stuttgart"
#   bash scripts/test-panel-ride-booking.sh

set -euo pipefail

API_BASE="${API_BASE:-https://api.onroda.de/api}"
API_BASE="${API_BASE%/}"

BOOKING_FROM="${BOOKING_FROM:-Musterstraße 1, 70771 Leinfelden-Echterdingen}"
BOOKING_TO="${BOOKING_TO:-Hauptbahnhof, 70173 Stuttgart}"

if [[ -z "${PANEL_USERNAME:-}" || -z "${PANEL_PASSWORD:-}" ]]; then
  echo "Bitte setzen: PANEL_USERNAME und PANEL_PASSWORD (Account mit rides.create)." >&2
  exit 1
fi

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
ME_JSON=$(curl -sS "$API_BASE/panel/v1/me" -H "Authorization: Bearer $TOKEN")
echo "$ME_JSON" | python3 -m json.tool

COMPANY_KIND=$(echo "$ME_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('companyKind') or d.get('company',{}).get('company_kind') or '')")
echo "company_kind: ${COMPANY_KIND:-?}"

echo "→ POST $API_BASE/panel/v1/route-distance"
ROUTE_BODY=$(python3 -c "import json,os; print(json.dumps({'fromFull':os.environ['BOOKING_FROM'],'toFull':os.environ['BOOKING_TO']}))")
ROUTE_RES=$(curl -sS -X POST "$API_BASE/panel/v1/route-distance" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ROUTE_BODY")
echo "$ROUTE_RES" | python3 -m json.tool

read -r DIST_KM DUR_MIN EST_FARE <<<"$(echo "$ROUTE_RES" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('ok'):
  print('0 0 0')
  sys.exit(0)
km=float(d.get('distanceKm') or 0)
fare=float(d.get('estimatedFare') or 0)
if fare <= 0:
  base=5
  rate1=2.4
  rate2=2.0
  thr=10
  fee=2
  charge = km*rate1 if km<=thr else thr*rate1+(km-thr)*rate2
  fare=round((base+charge+fee)*100)/100
print(f\"{km} {int(d.get('durationMinutes') or 1)} {fare}\")
")"

if [[ "$DIST_KM" == "0" || "$EST_FARE" == "0" ]]; then
  echo "Route-Berechnung fehlgeschlagen — Abbruch." >&2
  exit 1
fi

create_ride() {
  local label="$1"
  local body="$2"
  echo ""
  echo "=== $label ==="
  echo "→ POST $API_BASE/panel/v1/rides"
  TMP=$(mktemp)
  HTTP=$(curl -sS -o "$TMP" -w "%{http_code}" \
    -X POST "$API_BASE/panel/v1/rides" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "HTTP $HTTP"
  python3 -m json.tool <"$TMP" 2>/dev/null || cat "$TMP"
  RIDE_ID=$(python3 -c "import json; d=json.load(open('$TMP')); print((d.get('ride') or {}).get('id',''))" 2>/dev/null || true)
  RIDE_STATUS=$(python3 -c "import json; d=json.load(open('$TMP')); print((d.get('ride') or {}).get('status',''))" 2>/dev/null || true)
  rm -f "$TMP"
  if [[ "$HTTP" != "201" ]]; then
    echo "FEHLER: $label" >&2
    return 1
  fi
  echo "OK: ride_id=$RIDE_ID status=$RIDE_STATUS"
}

FROM_SHORT=$(python3 -c "print('${BOOKING_FROM}'.split(',')[0].strip())")
TO_SHORT=$(python3 -c "print('${BOOKING_TO}'.split(',')[0].strip())")

INSTANT_BODY=$(python3 -c "import json,os; print(json.dumps({
  'customerName': 'E2E Sofort Panel',
  'customerPhone': '+491700000001',
  'from': os.environ['FROM_SHORT'],
  'fromFull': os.environ['BOOKING_FROM'],
  'to': os.environ['TO_SHORT'],
  'toFull': os.environ['BOOKING_TO'],
  'distanceKm': float(os.environ['DIST_KM']),
  'durationMinutes': int(float(os.environ['DUR_MIN'])),
  'estimatedFare': float(os.environ['EST_FARE']),
  'paymentMethod': 'rechnung',
  'vehicle': 'standard',
  'rideKind': 'standard',
  'payerKind': 'passenger',
  'driverNote': 'E2E Sofort-Test Panel',
}))" FROM_SHORT="$FROM_SHORT" TO_SHORT="$TO_SHORT" DIST_KM="$DIST_KM" DUR_MIN="$DUR_MIN" EST_FARE="$EST_FARE")

RES_AT=$(python3 -c "
from datetime import datetime, timedelta, timezone
d = datetime.now(timezone.utc) + timedelta(hours=2, minutes=5)
print(d.strftime('%Y-%m-%dT%H:%M:%S.000Z'))
")

RES_BODY=$(python3 -c "import json,os; print(json.dumps({
  'customerName': 'E2E Reservierung Panel',
  'customerPhone': '+491700000002',
  'from': os.environ['FROM_SHORT'],
  'fromFull': os.environ['BOOKING_FROM'],
  'to': os.environ['TO_SHORT'],
  'toFull': os.environ['BOOKING_TO'],
  'distanceKm': float(os.environ['DIST_KM']),
  'durationMinutes': int(float(os.environ['DUR_MIN'])),
  'estimatedFare': float(os.environ['EST_FARE']),
  'paymentMethod': 'rechnung',
  'vehicle': 'standard',
  'rideKind': 'standard',
  'payerKind': 'passenger',
  'scheduledAt': os.environ['RES_AT'],
  'driverNote': 'E2E Reservierung Panel',
}))" FROM_SHORT="$FROM_SHORT" TO_SHORT="$TO_SHORT" DIST_KM="$DIST_KM" DUR_MIN="$DUR_MIN" EST_FARE="$EST_FARE" RES_AT="$RES_AT")

FAIL=0
create_ride "Sofort-Taxi" "$INSTANT_BODY" || FAIL=1
create_ride "Reservierung (+2h)" "$RES_BODY" || FAIL=1

echo ""
echo "→ GET $API_BASE/panel/v1/rides (letzte Einträge)"
RIDES=$(curl -sS "$API_BASE/panel/v1/rides" -H "Authorization: Bearer $TOKEN")
echo "$RIDES" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rides=d.get('rides') or []
for r in rides[:5]:
  rid=str(r.get('id','?'))
  print(f\"- {rid[:12]}… status={r.get('status')} customer={r.get('customerName')} scheduled={r.get('scheduledAt')}\")
"

if [[ "$FAIL" -ne 0 ]]; then
  echo "Mindestens ein Buchungstest fehlgeschlagen." >&2
  exit 1
fi

echo ""
echo "Alle Buchungstests OK (Sofort + Reservierung)."
