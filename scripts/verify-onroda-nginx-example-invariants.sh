#!/usr/bin/env bash
# Prüft das Repo-Beispiel artifacts/deploy/nginx-onroda.example.conf gegen harte Routing-Invarianten.
# Verhindert wiederholte Regressionen (z. B. Panel → Admin-301, fehlende Proxy-Blöcke).
# Produktions-nginx (z. B. /etc/nginx/sites-enabled/final-try) bleibt serverseitig — dieses Skript
# hält den kanonischen Stand im Git konsistent; CI + lokales ./scripts/verify-onroda-repo-invariants.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
err() { echo "verify-onroda-nginx-example-invariants: $*" >&2; exit 1; }

F="${ROOT}/artifacts/deploy/nginx-onroda.example.conf"
[[ -f "$F" ]] || err "Fehlt: $F"

grep -qE 'server_name[[:space:]]+admin\.onroda\.de' "$F" || err "server_name admin.onroda.de fehlt"
grep -qE 'server_name[[:space:]]+panel\.onroda\.de' "$F" || err "server_name panel.onroda.de fehlt"
grep -qE 'server_name[[:space:]]+api\.onroda\.de' "$F" || err "server_name api.onroda.de fehlt"
grep -qE 'server_name[[:space:]]+onroda\.de' "$F" || err "Marketing server_name onroda.de fehlt"

pp_count=$(grep -c 'proxy_pass http://onroda_node' "$F" || true)
[[ "${pp_count}" -ge 3 ]] || \
  err "Erwartet mindestens 3× proxy_pass http://onroda_node (admin, api, panel), gefunden: ${pp_count}"

if grep -qF 'return 301 https://admin.onroda.de/partners' "$F"; then
  err "Regression: panel.onroda.de darf nicht per 301 auf admin.onroda.de/partners zeigen"
fi

grep -q 'location ^~ /partners' "$F" || err "panel: location ^~ /partners (Redirect Admin-Pfad) fehlt"

grep -qE 'client_max_body_size[[:space:]]+25M' "$F" || \
  err "api: client_max_body_size 25M fehlt (413 bei Partner-PDF-Registrierung vor Node)"

echo "verify-onroda-nginx-example-invariants: OK"
