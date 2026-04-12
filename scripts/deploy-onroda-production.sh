#!/usr/bin/env bash
# Onroda Produktions-Deploy: Pull → DB-Migrationen (nachverfolgt) → API-Build → Panel-Builds → PM2 (+ optional rsync / Nginx).
# Voraussetzung: Repo-Root (imoove), pnpm (Workspace), npm (Panels), psql, pm2;
# DATABASE_URL in der Umgebung oder in artifacts/api-server/.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="${ROOT}/artifacts/api-server/src/db/migrations"
API_DIR="${ROOT}/artifacts/api-server"
ADMIN_DIR="${ROOT}/artifacts/admin-panel"
PARTNER_DIR="${ROOT}/artifacts/partner-panel"
TRACKER_TABLE="onroda_deploy_migrations"

# Optional: lokale Overrides (gitignored), siehe scripts/onroda-deploy.example.env
if [[ -f "${ROOT}/scripts/onroda-deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT}/scripts/onroda-deploy.env"
fi

DRY_RUN=0
SKIP_GIT_PULL=0
SKIP_MIGRATIONS=0
ONLY_MIGRATIONS=0
SEED_TRACKER=0
LIST_MIGRATIONS=0
VERIFY_SCHEMA_ONLY=0

usage() {
  cat <<'EOF'
deploy-onroda-production.sh — fester Deploy-Pfad (Pull, Migrationen, Builds, PM2).

Optionen:
  --help                 Diese Hilfe
  --dry-run              Nur Schritte ausgeben
  --skip-git-pull        Kein git pull
  --skip-migrations      Keine SQL-Migrationen
  --only-migrations      Nur Migrationen (kein Build, kein PM2)
  --seed-migration-tracker  Nur Tracker-Einträge für alle Repo-Migrationen (kein SQL).
                            GEFÄHRLICH: kann „applied“ ohne echtes Schema erzeugen.
                            Nur mit ONRODA_CONFIRM_SEED_MIGRATION_TRACKER=1 (siehe onroda-deploy.example.env).
  --list-migrations      Pending / angewendete Migrationen anzeigen
  --verify-schema        Nur DB-Schema gegen scripts/verify-onroda-db-schema.sql prüfen (Exit ≠0 bei Mismatch)

Umgebung (Auswahl):
  DATABASE_URL              PostgreSQL (sonst aus artifacts/api-server/.env)
  GIT_REMOTE_BRANCH         Default: origin/main
  ONRODA_PM2_APPS           Leerzeichen-getrennt, Default: onroda-api
  ONRODA_RSYNC_ADMIN_DIST_TO    Optional: rsync admin-panel/dist/ dorthin (--delete)
  ONRODA_RSYNC_PARTNER_DIST_TO  Optional: rsync partner-panel/dist/
  ONRODA_RELOAD_NGINX       Wenn 1: nginx -t && systemctl reload nginx
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-git-pull) SKIP_GIT_PULL=1; shift ;;
    --skip-migrations) SKIP_MIGRATIONS=1; shift ;;
    --only-migrations) ONLY_MIGRATIONS=1; shift ;;
    --seed-migration-tracker) SEED_TRACKER=1; shift ;;
    --list-migrations) LIST_MIGRATIONS=1; shift ;;
    --verify-schema) VERIFY_SCHEMA_ONLY=1; shift ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

GIT_REMOTE_BRANCH="${GIT_REMOTE_BRANCH:-origin/main}"
ONRODA_PM2_APPS="${ONRODA_PM2_APPS:-onroda-api}"

log() { echo "[deploy-onroda] $*"; }

# SQL-String literal für psql -c (einfaches Quoting)
sql_lit() {
  local s="$1"
  s="${s//\'/\'\'}"
  printf "'%s'" "$s"
}

load_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL
    return 0
  fi
  local env_file="${API_DIR}/.env"
  [[ -f "$env_file" ]] || return 1
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    if [[ "$line" =~ ^DATABASE_URL=(.*)$ ]]; then
      DATABASE_URL="${BASH_REMATCH[1]}"
      DATABASE_URL="${DATABASE_URL#\"}"
      DATABASE_URL="${DATABASE_URL%\"}"
      DATABASE_URL="${DATABASE_URL#\'}"
      DATABASE_URL="${DATABASE_URL%\'}"
      export DATABASE_URL
      return 0
    fi
  done <"$env_file"
  return 1
}

ensure_database_url() {
  if load_database_url; then
    return 0
  fi
  echo "[deploy-onroda] DATABASE_URL fehlt (Umgebung oder ${API_DIR}/.env)." >&2
  exit 1
}

psql_exec() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

tracker_bootstrap_sql() {
  cat <<SQL
CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL
}

migration_files_sorted() {
  shopt -s nullglob
  local files=("$MIG_DIR"/[0-9][0-9][0-9]_*.sql)
  shopt -u nullglob
  printf '%s\n' "${files[@]:-}" | LC_ALL=C sort
}

is_migration_applied() {
  local base="$1"
  local q="SELECT 1 FROM ${TRACKER_TABLE} WHERE filename = $(sql_lit "$base") LIMIT 1"
  local st
  st="$(psql "$DATABASE_URL" -t -A -c "$q" 2>/dev/null | tr -d '[:space:]' || true)"
  [[ "$st" == "1" ]]
}

list_migrations() {
  ensure_database_url
  psql_exec -c "$(tracker_bootstrap_sql)" >/dev/null
  log "Migrationen in ${MIG_DIR}:"
  local f base
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    base=$(basename "$f")
    if is_migration_applied "$base"; then
      echo "  applied   $base"
    else
      echo "  PENDING   $base"
    fi
  done < <(migration_files_sorted)
}

verify_schema_against_repo() {
  if [[ "${ONRODA_SKIP_SCHEMA_VERIFY:-0}" == "1" ]]; then
    log "Schema-Verifikation übersprungen (ONRODA_SKIP_SCHEMA_VERIFY=1) — nur in Notfällen nutzen."
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] bash \"${ROOT}/scripts/verify-onroda-db-schema.sh\""
    return 0
  fi
  log "Prüfe DB-Schema gegen Migrations-Erwartung (verify-onroda-db-schema.sql)…"
  bash "${ROOT}/scripts/verify-onroda-db-schema.sh"
}

apply_migrations() {
  [[ -d "$MIG_DIR" ]] || { echo "[deploy-onroda] Fehlt: $MIG_DIR" >&2; exit 1; }
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Migrationen (dry-run, ohne DB): würden fehlende Dateien in Reihenfolge anwenden:"
    local f
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      echo "  - $(basename "$f")"
    done < <(migration_files_sorted)
    return 0
  fi
  ensure_database_url
  psql_exec -c "$(tracker_bootstrap_sql)" >/dev/null
  local f base ins
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    base=$(basename "$f")
    if is_migration_applied "$base"; then
      log "Migration übersprungen (bereits angewendet): $base"
      continue
    fi
    log "Wende Migration an: $base"
    psql_exec -f "$f"
    ins="INSERT INTO ${TRACKER_TABLE} (filename) VALUES ($(sql_lit "$base"))"
    psql_exec -c "$ins"
  done < <(migration_files_sorted)
}

seed_migration_tracker() {
  ensure_database_url
  psql_exec -c "$(tracker_bootstrap_sql)" >/dev/null
  local f base ins
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    base=$(basename "$f")
    log "Tracker-Seed (ohne SQL): $base"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] INSERT … ON CONFLICT DO NOTHING $base"
      continue
    fi
    ins="INSERT INTO ${TRACKER_TABLE} (filename) VALUES ($(sql_lit "$base")) ON CONFLICT (filename) DO NOTHING"
    psql_exec -c "$ins"
  done < <(migration_files_sorted)
}

do_git_pull() {
  if [[ "$SKIP_GIT_PULL" -eq 1 ]]; then
    log "git pull übersprungen"
    return 0
  fi
  local remote="${GIT_REMOTE_BRANCH%%/*}"
  local branch="${GIT_REMOTE_BRANCH#*/}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] git -C \"$ROOT\" fetch \"$remote\" && git -C \"$ROOT\" pull --ff-only \"$remote\" \"$branch\""
    return 0
  fi
  git -C "$ROOT" fetch "$remote"
  git -C "$ROOT" pull --ff-only "$remote" "$branch"
}

do_api_build() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] (cd \"$ROOT\" && pnpm install --frozen-lockfile)"
    echo "[dry-run] (cd \"$ROOT\" && pnpm --filter @workspace/api-server run build)"
    return 0
  fi
  (cd "$ROOT" && pnpm install --frozen-lockfile)
  (cd "$ROOT" && pnpm --filter @workspace/api-server run build)
}

do_panel_builds() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] (cd \"$ADMIN_DIR\" && npm ci && npm run build)"
    echo "[dry-run] (cd \"$PARTNER_DIR\" && npm ci && npm run build)"
    return 0
  fi
  (cd "$ADMIN_DIR" && npm ci && npm run build)
  (cd "$PARTNER_DIR" && npm ci && npm run build)
}

do_pm2() {
  local app
  for app in $ONRODA_PM2_APPS; do
    [[ -z "$app" ]] && continue
    log "PM2 restart: $app"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] pm2 restart \"$app\" --update-env"
      continue
    fi
    pm2 restart "$app" --update-env
  done
}

do_optional_rsync() {
  if [[ -n "${ONRODA_RSYNC_ADMIN_DIST_TO:-}" ]]; then
    log "rsync admin-panel/dist → ${ONRODA_RSYNC_ADMIN_DIST_TO}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] rsync -a --delete \"${ADMIN_DIR}/dist/\" \"${ONRODA_RSYNC_ADMIN_DIST_TO}/\""
    else
      rsync -a --delete "${ADMIN_DIR}/dist/" "${ONRODA_RSYNC_ADMIN_DIST_TO}/"
    fi
  fi
  if [[ -n "${ONRODA_RSYNC_PARTNER_DIST_TO:-}" ]]; then
    log "rsync partner-panel/dist → ${ONRODA_RSYNC_PARTNER_DIST_TO}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] rsync -a --delete \"${PARTNER_DIR}/dist/\" \"${ONRODA_RSYNC_PARTNER_DIST_TO}/\""
    else
      rsync -a --delete "${PARTNER_DIR}/dist/" "${ONRODA_RSYNC_PARTNER_DIST_TO}/"
    fi
  fi
}

do_optional_nginx() {
  if [[ "${ONRODA_RELOAD_NGINX:-0}" == "1" ]]; then
    log "Nginx test + reload"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] nginx -t && systemctl reload nginx"
    else
      nginx -t && systemctl reload nginx
    fi
  fi
}

# --- main ---
if [[ "$LIST_MIGRATIONS" -eq 1 ]]; then
  command -v psql >/dev/null 2>&1 || { echo "[deploy-onroda] psql nicht im PATH" >&2; exit 1; }
  list_migrations
  exit 0
fi

if [[ "$SEED_TRACKER" -eq 1 ]]; then
  if [[ "${ONRODA_CONFIRM_SEED_MIGRATION_TRACKER:-}" != "1" ]]; then
    echo "[deploy-onroda] ABORT: --seed-migration-tracker markiert Migrationen als angewendet, ohne SQL auszuführen." >&2
    echo "           Das führt bei fehlenden ALTERs zu 500ern (wie fehlende access_code_normalized_snapshot)." >&2
    echo "           Wenn du das wirklich willst: ONRODA_CONFIRM_SEED_MIGRATION_TRACKER=1 $0 --seed-migration-tracker" >&2
    exit 1
  fi
  command -v psql >/dev/null 2>&1 || { echo "[deploy-onroda] psql nicht im PATH" >&2; exit 1; }
  seed_migration_tracker
  log "Tracker-Seed fertig."
  exit 0
fi

if [[ "$VERIFY_SCHEMA_ONLY" -eq 1 ]]; then
  command -v psql >/dev/null 2>&1 || { echo "[deploy-onroda] psql nicht im PATH" >&2; exit 1; }
  verify_schema_against_repo
  log "Schema-Verifikation: OK."
  exit 0
fi

migrations_will_execute=0
if [[ "$ONLY_MIGRATIONS" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  migrations_will_execute=1
fi
if [[ "$ONLY_MIGRATIONS" -eq 0 && "$SKIP_MIGRATIONS" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  migrations_will_execute=1
fi
if [[ "$migrations_will_execute" -eq 1 ]]; then
  command -v psql >/dev/null 2>&1 || { echo "[deploy-onroda] psql nicht im PATH" >&2; exit 1; }
fi

if [[ "$ONLY_MIGRATIONS" -eq 1 ]]; then
  if [[ "$SKIP_MIGRATIONS" -eq 1 ]]; then
    echo "[deploy-onroda] Widerspruch: --only-migrations und --skip-migrations" >&2
    exit 1
  fi
  apply_migrations
  verify_schema_against_repo
  log "Nur Migrationen: fertig."
  exit 0
fi

do_git_pull

if [[ "$SKIP_MIGRATIONS" -ne 1 ]]; then
  apply_migrations
else
  log "Migrationen übersprungen (--skip-migrations)"
fi

verify_schema_against_repo

do_api_build
do_panel_builds
do_optional_rsync
do_pm2
do_optional_nginx

log "Deploy fertig. Kurz prüfen: Panel-Login, GET /api/panel/v1/me, Admin /partners/."
