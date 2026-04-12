# Onroda / imoove — Arbeitsregeln für Entwickler und Agents

Ziel: **keine stillen Abweichungen** zwischen **Code**, **PostgreSQL-Schema** und **Server-Build**. Änderungen immer als **Commit + Migration + dokumentierter Deploy-Schritt**, nicht als dauerhafte Sonderlogik nur auf dem Server.

**Verbindlich — so arbeiten wir (Mensch & Agent):**

- **Deploybar** ist nur, was auf **`main` committed** und nach **`origin/main` gepusht** ist. **Untracked** oder nur **lokal geändert** (ohne Push) zählt **nicht**.
- **Produktionsserver:** dort wird **nicht entwickelt** und **nicht committed**; **keine manuellen** Deploy-Abweichungen (kein eigenes Pull+Build+Restart-Puzzle statt des Skripts).
- **Einziger Weg live:** lokal **commit + push `main`** → auf dem Server **`cd /root/imoove && ./scripts/deploy-onroda-production.sh`** (Repo-Pfad bei euch wie vereinbart).

## Pflichtlektüre (Cursor Rules, immer aktiv)

- `.cursor/rules/imoove-git-deployment-workflow.mdc` — Git, Deploy-Reihenfolge, Admin- und Partner-Builds
- `.cursor/rules/imoove-server-infrastructure-onroda.mdc` — Domains, Port 3000, Nginx, **Panel-Postmortem** (scrypt `maxmem`, `rides.company_id` TEXT, serverseitiger API-Build)
- `.cursor/rules/imoove-product-architecture.mdc` — Schichten Marketing / API / Mobile / Panel
- `.cursor/rules/imoove-panel-ux-separation.mdc` — **Admin = Plattform-Konsole**, **Partner = Unternehmens-Panel** (Sprache, Farben, Navigation, kein UI-Mix)

## Datenbank

- **Quelle der Wahrheit (Schema):** `artifacts/api-server/src/db/init-onroda.sql` und `artifacts/api-server/src/db/schema.ts` müssen zusammenpassen.
- **Bestehende Instanzen:** jede Schemaänderung braucht eine **nummerierte Migration** unter `artifacts/api-server/src/db/migrations/` und **Einspielen auf der DB vor** oder **mit** dem API-Deploy, das die Spalten nutzt.
- **Mandanten-IDs:** `admin_companies.id`, `panel_users.company_id` und **`rides.company_id`** sind **TEXT** (z. B. `co-demo-1`). Kein Mix mit INTEGER auf `rides` — siehe Migration `006_rides_legacy_schema_repair.sql`.

## API & Builds

- **`artifacts/api-server`:** nach relevanten Änderungen **auf dem Zielsystem** bauen (`pnpm run build` / `node ./build.mjs`), PM2/Prozess neu starten. Kein blindes Vertrauen in mitgeliefertes `dist` von fremden Maschinen (Pfade in Bundles).
- **Panel-Passwörter:** `artifacts/api-server/src/lib/password.ts` — `scrypt`-Option **`maxmem: 64 * 1024 * 1024`**. Nicht verkleinern; sonst schlägt `verifyPassword` fehl und der Panel-Login wirkt kaputt.

## Frontends

- **`admin.onroda.de`:** `artifacts/admin-panel` (Base `/partners/`).
- **`panel.onroda.de`:** `artifacts/partner-panel` — **eigenes** Build (`npm ci && npm run build`), unabhängig vom Admin-Panel. Nicht mit Admin-Shell vermischen.

**Dauerhafte UX-Linie (verbindlich):** Admin wirkt immer wie **Operator- / Plattform-Konsole** (global, alle Mandanten, Control-Chrome). Partner wirkt immer wie **eigenes Unternehmens-Panel** (Ihr/Mein, nur eigener Mandant, Arbeitsplatz-Chrome). Neue Seiten und Features müssen diese Trennung in **Sprache, Navigation, Einstieg und Farbwelt** fortsetzen — **keine** gemeinsamen Panel-Komponenten und kein „Vereinheitlichen“ der beiden Oberflächen. Details: **`imoove-panel-ux-separation.mdc`**.

## Deploy-Checkliste (Kurz)

**Standard (verbindlich):** Auf dem Zielserver:

```bash
cd /root/imoove && ./scripts/deploy-onroda-production.sh
```

Voraussetzungen: `pnpm`, `npm`, `psql`, `pm2`; `DATABASE_URL` in `artifacts/api-server/.env` (oder in der Shell). Optional: `scripts/onroda-deploy.env` aus `scripts/onroda-deploy.example.env` anlegen (PM2-Namen, rsync-Ziele, Nginx-Reload).

- **Erste Nutzung auf einer DB, die schon manuell alle Migrationen hatte:** einmalig Tracker füllen, sonst würde das Skript `001_…` erneut ausführen:

  ```bash
  ./scripts/deploy-onroda-production.sh --seed-migration-tracker
  ```

- **Trockenlauf (ohne DB, ohne echte Builds):** `./scripts/deploy-onroda-production.sh --dry-run --skip-git-pull`
- **Nur ausstehende Migrationen:** `./scripts/deploy-onroda-production.sh --only-migrations`
- **Status:** `./scripts/deploy-onroda-production.sh --list-migrations`

Ablauf im Skript: `git pull` → fehlende SQL-Migrationen (Tabelle `onroda_deploy_migrations` im gleichen PostgreSQL) → `pnpm install --frozen-lockfile` + API-Build → `npm ci` + Build für **admin-panel** und **partner-panel** → optional rsync → `pm2 restart` (Default: `onroda-api`).

**Live-Pfad der Panel-Assets:** Die API liest standardmäßig die gebauten Ordner `artifacts/admin-panel/dist` und `artifacts/partner-panel/dist` relativ zum API-`dist` (siehe `artifacts/api-server/src/app.ts`). Es ist **kein** separates PM2-Frontend nötig, solange Nginx auf **eine** Node-Instanz (Port **3000**) proxyt und keine veralteten Kopien unter `/var/www/…` ausliefert. Wenn eure Nginx-Konfiguration doch auf statische Verzeichnisse zeigt, nach dem Build `ONRODA_RSYNC_*` setzen oder die Pfade anpassen.

Deploy **ohne** dieses Skript ist **kein** unterstützter Ablauf mehr — bitte nicht wieder einführen.

## Automatische Repo-Prüfung

Lokal oder in **GitHub Actions** (Workflow `repo-invariants.yml` auf **push/PR → `main`**):

| Prüfung | Was passiert bei Verstoß |
|--------|---------------------------|
| **`scripts/verify-onroda-repo-invariants.sh`** | `maxmem`, kein `integer("company_id")`, `init`+`schema`, **lückenlose** Migrationen `001_…sql`–`00N_…sql`, exakte **Build-Skripte** (API `node ./build.mjs`, Partner `vite build`, Admin mit `--base /partners/`), `panelApi` enthält `/panel/v1/rides` |
| **ESLint** | `artifacts/partner-panel` und `artifacts/admin-panel` jeweils `npm ci && npm run lint` |
| **API-Build** | `pnpm install --frozen-lockfile` + `pnpm --filter @workspace/api-server run build` — fängt kaputte Bundles/Imports früh |

Lokal nur das Skript:

```bash
./scripts/verify-onroda-repo-invariants.sh
```

**Neue Migration:** Datei **`007_beschreibung.sql`** (drei Ziffern, Unterstrich, keine Lücken, keine doppelte Nummer). Das Skript prüft die Kette automatisch — keine manuelle Liste mehr pflegen.
