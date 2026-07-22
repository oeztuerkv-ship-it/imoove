#!/usr/bin/env bash
# Auf dem Produktionsserver: Auffälligkeiten zu Fahrten / Tarif-Korridor in PM2-Logs.
# Usage: cd /root/imoove && ./scripts/grep-onroda-ride-fare-logs.sh
# Optional: LINES=8000 SINCE_HINT="seit 19 Uhr" ./scripts/grep-onroda-ride-fare-logs.sh
set -euo pipefail

LINES="${LINES:-8000}"
APP="${ONRODA_PM2_APP:-onroda-api}"

echo "=== PM2 logs: $APP (letzte $LINES Zeilen, nostream) ==="
echo "Hinweis: Zeitfilter manuell — Logs seit ~19 Uhr anhand Timestamps prüfen."
echo ""

dump() {
  pm2 logs "$APP" --lines "$LINES" --nostream 2>/dev/null || true
}

echo "=== Tarif-Korridor (neu) ==="
dump | grep -E 'final_fare_below_base|final_fare_outside_tariff_corridor|tariff_corridor|final_fare_plausibility' || echo "(keine Treffer)"

echo ""
echo "=== GPS-Mindestbeförderung / Abschluss ==="
dump | grep -E 'insufficient_transport_for_fare|final_fare_required|complete_without_trip|complete_trip_not_started' || echo "(keine Treffer)"

echo ""
echo "=== Dispatch / Markt / Annahme ==="
dump | grep -Ei 'market-rides|fleet-accept|dispatch|accept.*fail|status_transition_invalid|pickup_geofence|trip_start_geofence' || echo "(keine Treffer)"

echo ""
echo "=== HTTP 4xx/5xx / Timeout / Rate-Limit (Fahrten-nah) ==="
dump | grep -Ei '"statusCode":(4|5)[0-9]{2}|statusCode.: (4|5)|ETIMEDOUT|ESOCKETTIMEDOUT|too_many_requests|Rate limit| 429 | 500 | 502 | 503 ' || echo "(keine Treffer)"

echo ""
echo "=== error / warn (Stichprobe) ==="
dump | grep -Ei '"level":(40|50)|\[error\]|\[warn\]| level: (error|warn)' | tail -80 || echo "(keine Treffer)"

echo ""
echo "Fertig."
echo "Bei Bedarf Rohauszug: pm2 logs $APP --lines $LINES --nostream | less"
echo "Oder nur PATCH status: pm2 logs $APP --lines $LINES --nostream | grep -E 'PATCH.*/rides/.*/status|/rides/.*/status'"
