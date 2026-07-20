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
[[ -f "${STATIC}/agb.html" ]] || err "Fehlt: ${STATIC}/agb.html"
grep -qF "Widerrufsrecht" "${STATIC}/agb.html" || err "agb.html: erwarteter Marker §9 Widerrufsrecht fehlt"
[[ -f "${STATIC}/ueber-onroda.html" ]] || err "Fehlt: ${STATIC}/ueber-onroda.html"
[[ -f "${STATIC}/fixpreise.html" ]] || err "Fehlt: ${STATIC}/fixpreise.html"
[[ -f "${STATIC}/fixpreise/index.html" ]] || err "Fehlt: ${STATIC}/fixpreise/index.html (Nginx try_files /fixpreise)"

grep -qF 'id="fixpreis-page-title"' "${STATIC}/fixpreise/index.html" || err "fixpreise/index.html: erwarteter Seiten-Marker fehlt"
[[ -f "${STATIC}/konto-loeschen.html" ]] || err "Fehlt: ${STATIC}/konto-loeschen.html"
grep -qF "Konto löschen" "${STATIC}/konto-loeschen.html" || err "konto-loeschen.html: erwarteter Titel fehlt"
grep -qF "14 Tagen" "${STATIC}/konto-loeschen.html" || err "konto-loeschen.html: Bearbeitungsdauer fehlt"

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
  L_AGB="${LIVE_MARKETING_ROOT%/}/agb.html"
  [[ -f "$L_AGB" ]] || err "Live-Webroot: fehlt $L_AGB — rsync aus artifacts/marketing-site/ ausführen"
  grep -qF "Widerrufsrecht" "$L_AGB" || err "Live agb.html: Inhalt unplausibel (Marker Widerrufsrecht fehlt)"
  L_DELETE="${LIVE_MARKETING_ROOT%/}/konto-loeschen.html"
  [[ -f "$L_DELETE" ]] || err "Live-Webroot: fehlt $L_DELETE — rsync aus artifacts/marketing-site/ ausführen"
  grep -qF "Konto löschen" "$L_DELETE" || err "Live konto-loeschen.html: Inhalt unplausibel"
  echo "verify-onroda-marketing-partner-status-repo: OK (LIVE_MARKETING_ROOT=${LIVE_MARKETING_ROOT})"
fi
