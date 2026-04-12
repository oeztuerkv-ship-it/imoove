# Onroda / imoove — Arbeitsregeln für Entwickler und Agents

Ziel: **keine stillen Abweichungen** zwischen **Code**, **PostgreSQL-Schema** und **Server-Build**. Änderungen immer als **Commit + Migration + dokumentierter Deploy-Schritt**, nicht als dauerhafte Sonderlogik nur auf dem Server.

## Pflichtlektüre (Cursor Rules, immer aktiv)

- `.cursor/rules/imoove-git-deployment-workflow.mdc` — Git, Deploy-Reihenfolge, Admin- und Partner-Builds
- `.cursor/rules/imoove-server-infrastructure-onroda.mdc` — Domains, Port 3000, Nginx, **Panel-Postmortem** (scrypt `maxmem`, `rides.company_id` TEXT, serverseitiger API-Build)
- `.cursor/rules/imoove-product-architecture.mdc` — Schichten Marketing / API / Mobile / Panel

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

## Deploy-Checkliste (Kurz)

1. `git pull` auf dem Server (sauberer Stand).
2. **Migrationen** nacheinander einspielen, soweit noch nicht geschehen.
3. API **lokal auf dem Server** bauen und API-Prozess neu starten.
4. **partner-panel** (und bei Bedarf admin-panel) bauen.
5. Stichprobe: Panel-Login, `GET /api/panel/v1/me`, `GET /api/panel/v1/rides`, Fahrten-UI, CSV.

## Automatische Repo-Prüfung

Vor größeren Änderungen oder im CI:

```bash
./scripts/verify-onroda-repo-invariants.sh
```

Scheitert das Skript, erst beheben, dann deployen oder mergen.

**Neue DB-Migration `007_…`:** dieselbe Nummerierung im Skript `scripts/verify-onroda-repo-invariants.sh` ergänzen (Schleife `for n in …`), damit die Reihenfolge nicht vergessen wird.
