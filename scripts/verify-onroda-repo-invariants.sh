#!/usr/bin/env bash
# Feste Projekt-Invarianten (Passwort-scrypt, Mandanten-Typ, Migrationen, getrennte Panel-Builds).
# Soll stillen Drift zwischen Code, DB-Doku und Deploy-Wegen verhindern.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
err() { echo "verify-onroda-repo-invariants: $*" >&2; exit 1; }

PW="${ROOT}/artifacts/api-server/src/lib/password.ts"
[[ -f "$PW" ]] || err "Fehlt: $PW"

grep -q 'maxmem: 64 \* 1024 \* 1024' "$PW" || \
  err "password.ts: maxmem muss 64 * 1024 * 1024 sein (Panel-Login / scrypt)."

if grep -q '128 \* 16384 \* 8' "$PW"; then
  err "password.ts: alter maxmem-Wert 128 * 16384 * 8 — bitte entfernen."
fi

SCHEMA="${ROOT}/artifacts/api-server/src/db/schema.ts"
[[ -f "$SCHEMA" ]] || err "Fehlt: $SCHEMA"
grep -q 'company_id: text("company_id")' "$SCHEMA" || \
  err "schema.ts: rides.company_id muss text() sein (Mandanten-IDs)."

if grep -q 'integer("company_id")' "$SCHEMA"; then
  err "schema.ts: Mandanten company_id darf nicht integer(\"company_id\") sein."
fi

INIT="${ROOT}/artifacts/api-server/src/db/init-onroda.sql"
[[ -f "$INIT" ]] || err "Fehlt: $INIT"
grep -q 'CREATE TABLE IF NOT EXISTS rides' "$INIT" || err "init-onroda.sql: rides-Tabelle fehlt"
grep -q 'company_id TEXT' "$INIT" || err "init-onroda.sql: rides.company_id sollte TEXT sein."

MIG_DIR="${ROOT}/artifacts/api-server/src/db/migrations"
[[ -d "$MIG_DIR" ]] || err "Fehlt: $MIG_DIR"

shopt -s nullglob
nums=()
for f in "$MIG_DIR"/*.sql; do
  base=$(basename "$f")
  if [[ ! "$base" =~ ^([0-9]{3})_.+\.sql$ ]]; then
    err "Migration muss ^NNN_beschreibung.sql heißen: $base"
  fi
  nums+=($((10#${BASH_REMATCH[1]})))
done
shopt -u nullglob
[[ ${#nums[@]} -gt 0 ]] || err "Keine .sql-Dateien unter $MIG_DIR"

sorted=$(printf '%s\n' "${nums[@]}" | sort -n)
dups=$(printf '%s\n' "$sorted" | uniq -d | tr '\n' ' ')
[[ -z "${dups// }" ]] || err "Doppelte Migrationsnummer(n): $dups"

prev=0
while IFS= read -r num; do
  [[ -n "$num" ]] || continue
  if [[ "$prev" -eq 0 ]]; then
    [[ "$num" -eq 1 ]] || err "Erste Migration muss 001 sein (Zahl 1), gefunden: $num"
  else
    exp=$((prev + 1))
    [[ "$num" -eq "$exp" ]] || err "Lücke in Migrationen: nach $(printf '%03d' "$prev") erwartet $(printf '%03d' "$exp"), gefunden $(printf '%03d' "$num")"
  fi
  prev=$num
done <<< "$sorted"

API_PKG="${ROOT}/artifacts/api-server/package.json"
[[ -f "$API_PKG" ]] || err "Fehlt: $API_PKG"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$API_PKG', 'utf8'));
const b = p.scripts && p.scripts.build;
if (b !== 'node ./build.mjs') {
  console.error('api-server: scripts.build muss exakt \"node ./build.mjs\" sein, ist:', b);
  process.exit(1);
}
" || err "api-server package.json"

PP="${ROOT}/artifacts/partner-panel/package.json"
[[ -f "$PP" ]] || err "Fehlt: $PP"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$PP', 'utf8'));
const b = p.scripts && p.scripts.build;
if (b !== 'vite build') {
  console.error('partner-panel: scripts.build muss \"vite build\" sein (eigenes Base), ist:', b);
  process.exit(1);
}
if (!p.scripts.lint) process.exit(1);
" || err "partner-panel: package.json build/lint"

AP="${ROOT}/artifacts/admin-panel/package.json"
[[ -f "$AP" ]] || err "Fehlt: $AP"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$AP', 'utf8'));
const b = p.scripts && p.scripts.build;
if (typeof b !== 'string' || !b.includes('--base /partners/')) {
  console.error('admin-panel: scripts.build muss --base /partners/ enthalten, ist:', b);
  process.exit(1);
}
if (!p.scripts.lint) process.exit(1);
" || err "admin-panel: package.json build/lint"

PANEL_API="${ROOT}/artifacts/api-server/src/routes/panelApi.ts"
[[ -f "$PANEL_API" ]] || err "Fehlt: $PANEL_API"
grep -q '/panel/v1/rides' "$PANEL_API" || err "panelApi.ts: /panel/v1/rides muss existieren"

echo "verify-onroda-repo-invariants: OK"
