#!/usr/bin/env bash
# Ops: hängende Mid-Trip-Abbrüche (customer_abort_pending_fare) manuell abschließen.
# Nutzt PATCH /api/rides/:id/status mit Admin-Bearer (isMidTripAbortFinalize).
#
# Usage:
#   ADMIN_API_BEARER_TOKEN=… FINAL_FARE_EUR=5.00 \
#     ./scripts/finalize-mid-trip-abort-ride.sh REQ-…
#
# Optional: API_BASE (default https://api.onroda.de/api)

set -euo pipefail

RIDE_ID="${1:-}"
if [[ -z "$RIDE_ID" ]]; then
  echo "usage: $0 <rideId>" >&2
  exit 1
fi

API_BASE="${API_BASE:-https://api.onroda.de/api}"
API_BASE="${API_BASE%/}"
TOKEN="${ADMIN_API_BEARER_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  echo "ADMIN_API_BEARER_TOKEN required" >&2
  exit 1
fi

FARE="${FINAL_FARE_EUR:-}"
if [[ -z "$FARE" ]]; then
  echo "FINAL_FARE_EUR required (Taxameter-/Ops-Betrag in EUR)" >&2
  exit 1
fi

ENC_ID=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$RIDE_ID")
URL="${API_BASE}/rides/${ENC_ID}/status"
OUT="$(mktemp)"

echo "Finalizing mid-trip abort: $RIDE_ID → cancelled_by_customer @ ${FARE} EUR"
HTTP=$(curl -sS -o "$OUT" -w "%{http_code}" \
  -X PATCH "$URL" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"status\":\"cancelled_by_customer\",\"finalFare\":${FARE}}")

echo "HTTP $HTTP"
python3 -c "import json,sys; p=sys.argv[1];
raw=open(p).read();
try:
 d=json.loads(raw)
except Exception:
 print(raw[:800]); sys.exit(0)
keys=('id','status','finalFare','error','message','from','to')
print(json.dumps({k:d.get(k) for k in keys if k in d}, indent=2, ensure_ascii=False) or raw[:800])" "$OUT"
rm -f "$OUT"

if [[ "$HTTP" != "200" ]]; then
  exit 1
fi
