#!/usr/bin/env bash
# Auf dem Produktionsserver (PM2-Logs) Auth-Fehler der letzten Zeit suchen.
# Usage: cd /root/imoove && ./scripts/grep-onroda-auth-logs.sh
set -euo pipefail

echo "=== Apple session failures ==="
pm2 logs onroda-api --lines 2000 --nostream 2>/dev/null | grep -E 'auth/apple/session|invalid_apple|appleid' || true

echo ""
echo "=== Google OAuth callback / state ==="
pm2 logs onroda-api --lines 2000 --nostream 2>/dev/null | grep -E 'auth/callback|INVALID STATE|token_exchange|session JWT|auth/start|google-auth' || true

echo ""
echo "=== Rate limit / too many requests ==="
pm2 logs onroda-api --lines 2000 --nostream 2>/dev/null | grep -Ei 'too_many_requests|Rate limit|429' || true

echo ""
echo "Fertig. Bei Bedarf: pm2 logs onroda-api --lines 5000 --nostream | less"
