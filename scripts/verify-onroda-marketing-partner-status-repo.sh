#!/usr/bin/env bash
# Repo: Marketing-Static für Partner-Statusseite muss existieren und erkennbar sein.
# Optional auf dem Server nach rsync: LIVE_MARKETING_ROOT=/var/www/onroda ./scripts/verify-onroda-marketing-partner-status-repo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
err() { echo "verify-onroda-marketing-partner-status-repo: $*" >&2; exit 1; }

STATIC="${ROOT}/artifacts/api-server/static"
STATUS="${STATIC}/partner-status.html"
IDX="${STATIC}/index.html"

[[ -f "$STATUS" ]] || err "Fehlt: $STATUS (Partner-Statusseite)"
[[ -f "$IDX" ]] || err "Fehlt: $IDX"

grep -qF "Status Ihrer Partneranfrage" "$STATUS" || err "partner-status.html: erwarteter Titel-Text fehlt"
grep -qF "registration-request-status" "$STATUS" || err "partner-status.html: API-Pfad-Hinweis fehlt"
grep -qF "onroda-public-api-base" "$STATUS" || err "partner-status.html: Meta API-Base fehlt"

# Homepage darf nicht denselben eindeutigen H1 wie die Statusseite haben (Drift-Erkennung).
if grep -qF "Status Ihrer Partneranfrage" "$IDX"; then
  err "index.html enthält fälschlich den Status-Titel — prüfen Sie die Static-Kopie."
fi

echo "verify-onroda-marketing-partner-status-repo: OK (Repo-Static)"

if [[ -n "${LIVE_MARKETING_ROOT:-}" ]]; then
  L="${LIVE_MARKETING_ROOT%/}/partner-status.html"
  [[ -f "$L" ]] || err "Live-Webroot: fehlt $L — rsync aus artifacts/api-server/static/ ausführen"
  grep -qF "Status Ihrer Partneranfrage" "$L" || err "Live partner-status.html: Inhalt unplausibel"
  echo "verify-onroda-marketing-partner-status-repo: OK (LIVE_MARKETING_ROOT=${LIVE_MARKETING_ROOT})"
fi
