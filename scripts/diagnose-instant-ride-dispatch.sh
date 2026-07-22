#!/usr/bin/env bash
# Diagnose Sofortfahrt-Dispatch/Push für konkrete Ride-IDs (Produktionsserver).
# Usage:
#   cd /root/imoove
#   DATABASE_URL=... ./scripts/diagnose-instant-ride-dispatch.sh REQ-1784740657400 REQ-1784740687775 REQ-1784740704866
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 REQ-id [REQ-id ...]" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f artifacts/api-server/.env ]]; then
    # shellcheck disable=SC1091
    set -a
    # nur DATABASE_URL laden
    DATABASE_URL="$(grep -E '^DATABASE_URL=' artifacts/api-server/.env | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')"
    set +a
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL fehlt" >&2
  exit 1
fi

IDS_SQL=$(printf "'%s'," "$@" | sed 's/,$//')

echo "=== rides (Status, Tier, Koordinaten, Passenger) ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT id, status, passenger_id, company_id, vehicle,
       dispatch_tier, dispatch_tier_started_at, created_at, completed_at,
       from_lat, from_lon, driver_id,
       (rejected_by IS NOT NULL) AS has_rejected
FROM rides
WHERE id IN (${IDS_SQL})
ORDER BY created_at;
"

echo ""
echo "=== ride_events (u. a. dispatch_tier_advanced) ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT ride_id, event_type, from_status, to_status, created_at, payload
FROM ride_events
WHERE ride_id IN (${IDS_SQL})
ORDER BY created_at;
"

echo ""
echo "=== Markt-ONLINE Fahrer (taxi) zum Zeitpunkt jetzt (Snapshot) ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT d.id, d.company_id, d.dispatch_priority, d.is_market_online,
       d.last_market_lat, d.last_market_lon, d.last_market_location_at,
       d.approval_status, d.access_status, d.is_active,
       EXISTS (
         SELECT 1 FROM fleet_driver_expo_push_tokens t
         WHERE t.fleet_driver_id = d.id AND t.company_id = d.company_id
       ) AS has_push_token
FROM fleet_drivers d
JOIN admin_companies c ON c.id = d.company_id
WHERE c.company_kind = 'taxi'
  AND d.is_market_online = true
ORDER BY d.dispatch_priority, d.id;
"

echo ""
echo "=== PM2-Logs zu diesen Ride-IDs / Expo-Push ==="
pm2 logs onroda-api --lines 5000 --nostream 2>/dev/null \
  | grep -E "$(printf '%s|' "$@" | sed 's/|$//')|\[expo-push\]|instant_ride_offer|dispatch_tier" \
  || echo "(keine Log-Treffer — Push ohne Empfänger loggt oft nichts)"

echo ""
echo "Fertig. Interpretation:"
echo "- dispatch_tier A + nur Fahrer mit Priority B/C online → weder Push noch Markt bis Timeout A→B→C"
echo "- has_push_token=false → Poll könnte reichen, Push/Klingeln im Hintergrund nicht"
echo "- last_market_lat NULL oder außerhalb Radius → aus Pool gefiltert (wenn beide Seiten Koordinaten haben)"
