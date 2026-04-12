#!/usr/bin/env bash
# Feste Projekt-Invarianten (Passwort-scrypt, Mandanten-Typ, Migrationen, Panel-Apps).
# Soll stillen Drift zwischen Code und dokumentierten Regeln verhindern.
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

INIT="${ROOT}/artifacts/api-server/src/db/init-onroda.sql"
[[ -f "$INIT" ]] || err "Fehlt: $INIT"
grep -q 'company_id TEXT' "$INIT" || \
  err "init-onroda.sql: rides.company_id sollte TEXT sein."

MIG_DIR="${ROOT}/artifacts/api-server/src/db/migrations"
[[ -d "$MIG_DIR" ]] || err "Fehlt: $MIG_DIR"

# Erwartete Reihenfolge (bei neuen Dateien Skript erweitern)
for n in 001 002 003 004 005 006; do
  found=0
  for f in "$MIG_DIR"/${n}_*.sql; do
    [[ -e "$f" ]] || continue
    found=1
    break
  done
  [[ "$found" -eq 1 ]] || err "Migration ${n}_*.sql fehlt unter $MIG_DIR"
done

PP="${ROOT}/artifacts/partner-panel/package.json"
[[ -f "$PP" ]] || err "Fehlt: $PP"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$PP', 'utf8'));
if (!p.scripts || !p.scripts.build) process.exit(1);
" || err "partner-panel: package.json braucht scripts.build"

AP="${ROOT}/artifacts/admin-panel/package.json"
[[ -f "$AP" ]] || err "Fehlt: $AP"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$AP', 'utf8'));
if (!p.scripts || !p.scripts.build) process.exit(1);
" || err "admin-panel: package.json braucht scripts.build"

echo "verify-onroda-repo-invariants: OK"
