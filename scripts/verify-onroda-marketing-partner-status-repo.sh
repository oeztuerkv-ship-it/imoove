#!/usr/bin/env bash
# Repo: Marketing-Static für Partner-Statusseite muss existieren und erkennbar sein.
# Optional auf dem Server nach rsync: LIVE_MARKETING_ROOT=/var/www/onroda ./scripts/verify-onroda-marketing-partner-status-repo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
err() { echo "verify-onroda-marketing-partner-status-repo: $*" >&2; exit 1; }

STATIC="${ROOT}/artifacts/marketing-site"
STATUS="${STATIC}/partner-status.html"
IDX="${STATIC}/index.html"

[[ -f "$STATUS" ]] || err "Fehlt: $STATUS (Partner-Statusseite)"
[[ -f "$IDX" ]] || err "Fehlt: $IDX"
[[ -f "${STATIC}/impressum.html" ]] || err "Fehlt: ${STATIC}/impressum.html"
[[ -f "${STATIC}/datenschutz.html" ]] || err "Fehlt: ${STATIC}/datenschutz.html"
[[ -f "${STATIC}/ueber-onroda.html" ]] || err "Fehlt: ${STATIC}/ueber-onroda.html"
[[ -f "${STATIC}/fixpreise.html" ]] || err "Fehlt: ${STATIC}/fixpreise.html"
[[ -f "${STATIC}/fixpreise/index.html" ]] || err "Fehlt: ${STATIC}/fixpreise/index.html (Nginx try_files /fixpreise)"

grep -qF 'id="fixpreis-page-title"' "${STATIC}/fixpreise/index.html" || err "fixpreise/index.html: erwarteter Seiten-Marker fehlt"

grep -qF "Status Ihrer Partner-Registrierung" "$STATUS" || err "partner-status.html: erwarteter Titel-Text fehlt"
grep -qF "registration-request" "$STATUS" || err "partner-status.html: API-Pfad-Hinweis fehlt"
grep -qF "onroda-public-api-base" "$STATUS" || err "partner-status.html: Meta API-Base fehlt"

# Homepage darf nicht denselben eindeutigen H1 wie die Statusseite haben (Drift-Erkennung).
if grep -qF "Status Ihrer Partner-Registrierung" "$IDX"; then
  err "index.html enthält fälschlich den Status-Titel — prüfen Sie die Static-Kopie."
fi

echo "verify-onroda-marketing-partner-status-repo: OK (Repo-Static)"

if [[ -n "${LIVE_MARKETING_ROOT:-}" ]]; then
  L="${LIVE_MARKETING_ROOT%/}/partner-status.html"
  [[ -f "$L" ]] || err "Live-Webroot: fehlt $L — rsync aus artifacts/marketing-site/ ausführen"
  grep -qF "Status Ihrer Partner-Registrierung" "$L" || err "Live partner-status.html: Inhalt unplausibel"
  L_FIX="${LIVE_MARKETING_ROOT%/}/fixpreise/index.html"
  [[ -f "$L_FIX" ]] || err "Live-Webroot: fehlt $L_FIX — /fixpreise liefert sonst die Startseite (try_files)"
  grep -qF 'id="fixpreis-page-title"' "$L_FIX" || err "Live fixpreise/index.html: Inhalt unplausibel"
  echo "verify-onroda-marketing-partner-status-repo: OK (LIVE_MARKETING_ROOT=${LIVE_MARKETING_ROOT})"
fi
