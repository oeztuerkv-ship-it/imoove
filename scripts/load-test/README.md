# ONRODA Load- / Stress-Tests

Isolierte Lastsimulation **ohne produktive Fahrten**. Test-Rides nutzen `passengerId: load-test-passenger-*` und werden nach Tests storniert.

## Schnellstart (ohne k6)

```bash
cd /path/to/imoove
pnpm --filter @workspace/api-server run build
node scripts/load-test/run.mjs
```

Report unter `scripts/load-test/reports/load-report-*.md`.

### Mit PostgreSQL (Staging/lokal)

```bash
LOAD_TEST_USE_API_ENV=1 \
LOAD_TEST_FLEET_EMAIL=fahrer@example.com \
LOAD_TEST_FLEET_PASSWORD='…' \
LOAD_TEST_ADMIN_BEARER='…' \
node scripts/load-test/run.mjs
```

### Gegen externes Staging (nur lesend + isolierte Writes wenn erlaubt)

```bash
LOAD_TEST_BASE_URL=https://api.staging.example.com node scripts/load-test/run.mjs
```

**Nicht** gegen Produktion mit hoher Last oder Ride-Erstellung fahren.

## k6 (optional)

k6 installieren: https://grafana.com/docs/k6/latest/set-up/install-k6/

```bash
# Terminal 1: API (In-Memory)
cd artifacts/api-server
NODE_ENV=development AUTH_JWT_SECRET=dev PORT=29876 node dist/index.mjs

# Terminal 2
k6 run -e BASE_URL=http://127.0.0.1:29876 scripts/load-test/k6/onroda-public.js
```

Fahrer-Markt (Staging-Token):

```bash
TOKEN=$(curl -s -X POST "$BASE/api/fleet-auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"…","password":"…"}' | jq -r .token)
k6 run -e BASE_URL="$BASE" -e FLEET_TOKEN="$TOKEN" -e VUS=50 \
  scripts/load-test/k6/onroda-fleet-market.js
```

## Was gemessen wird

| Bereich | Tool |
|---------|------|
| p50/p95/p99, Fehlerrate, RPS | `run.mjs`, k6 Trends |
| CPU/RAM API-Prozess | `ps` während lokalem Spawn |
| DB Locks / slow queries | manuell auf Staging: `pg_stat_activity`, `pg_stat_statements` |
| WS | `lib/ws-load.mjs` (Join-Auth-Fehler erwartbar ohne echtes JWT) |

## Produktion

Für echte Kapazitätszahlen: **Staging-DB** mit repräsentativer `rides`-Zeilenanzahl, PM2/Nginx identisch, **keine** Produktiv-Buchungen.
