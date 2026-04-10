#!/usr/bin/env bash
# Prüft, ob artifacts/admin-panel echter App-Source ist (nicht nur Build-Artefakte).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
P="${ROOT}/artifacts/admin-panel"

err() { echo "verify-admin-panel-source: $*" >&2; exit 1; }

[[ -d "$P" ]] || err "Ordner fehlt: $P"
[[ -f "$P/package.json" ]] || err "Kein package.json — kein Node-Projekt."

[[ -d "$P/src" || -d "$P/app" ]] || err "Weder src/ noch app/ — vermutlich kein vollständiger Framework-Source."

node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('${P}/package.json', 'utf8'));
const s = p.scripts || {};
if (!s.build) {
  console.error('package.json: scripts.build fehlt.');
  process.exit(1);
}
console.log('OK: scripts.build →', s.build);
" || err "package.json ungültig oder kein build-Script."

has_src=0
for sub in src app; do
  if [[ -d "$P/$sub" ]] && find "$P/$sub" -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.vue" \) 2>/dev/null | head -1 | grep -q .; then
    has_src=1
    break
  fi
done
[[ "$has_src" -eq 1 ]] || err "Unter src/ oder app/ keine .ts/.tsx/.js/.vue-Dateien gefunden."

echo "verify-admin-panel-source: OK — sieht nach echtem Source aus."
echo "Top-Level:"
ls -la "$P" | head -30
