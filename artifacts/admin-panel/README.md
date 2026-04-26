# Onroda Admin Panel

Web-Admin für Betrieb/Backoffice. **Offizieller Ort im Monorepo:** `artifacts/admin-panel/`.

**Visuelle Marke:** Farben, Typografie und Komponenten-Abstände folgen der ONRODA-Homepage. Die gemeinsame Datei ist **`artifacts/api-server/static/onroda-brand.css`** (wird vom Admin-Panel per `@import` eingebunden und von der Marketing-`index.html` per `<link>` geladen).

**Konsistenz im Admin-Panel (Plattform-Konsole):** Zukünftige Seiten richten sich an der **Mandantenzentrale** und `src/admin-ui.css` aus — Karten, Buttons, Abstände, Status-Badges. Verbindliche Kurzregeln und Klassenliste: **`docs/admin-ui-reference.md`**. (Cursor: `imoove-admin-panel-ui-reference.mdc` bei Änderungen unter `artifacts/admin-panel/`.)

## Antworten auf die Repo-/Server-Fragen

1. **Wo liegt der echte Source des live laufenden Panels?**  
   Bisher nur auf dem Server unter **`/root/imoove/artifacts/admin-panel`** — dieser Tree war **nicht** in `imoove` auf `main` versioniert.  
   Im `imoove`-Repo gibt es dafür **keinen** weiteren Klon: nur die minimale HTML-Route **`GET /admin`** in `artifacts/api-server/src/routes/admin.ts` und ein **Stub** unter `artifacts/mobile/app/admin/index.tsx` („Admin Panel Aktiv“) — das ist **nicht** dieselbe App wie das PM2-Panel.

2. **Soll dieser Stand ins Haupt-Repo?**  
   **Ja (Option A):** Eine Quelle der Wahrheit — API und Admin im selben Repo, Deploy nur noch `git pull` + Build.

3. **Wie kommt der Server-Stand hierher?**  
   Einmalig synchronisieren (siehe unten), danach `./scripts/verify-admin-panel-source.sh`, **vom Repo-Root** `pnpm install --frozen-lockfile` und `pnpm --filter admin-panel run build` (im **Root** verbietet `package.json` → `preinstall` bewusst `npm install` mit „Use pnpm instead“), dann `git add` / `commit` / `push`.

4. **Einzige Quelle künftig:**  
   **`artifacts/admin-panel/` im Git-Repo** (lokal + `main`). Der Server-Pfad ist nur **Deployment-Ziel**, keine zweite Entwicklungsquelle.

## Einmaliger Import (vom Server oder lokalen Spiegel)

**Hinweis für Cursor/CI:** Der Pfad `/root/imoove/...` existiert nur auf **deinem VPS**. Ohne SSH von dieser Umgebung zum Server kann der Agent die Dateien **nicht** selbst ziehen — der Import läuft auf einem Rechner mit Zugriff (dein Mac, Bastion, …).

### Variante A — SSH (empfohlen)

Im **Repo-Root** `imoove`:

```bash
cp .env.deploy.example .env.deploy   # optional: ADMIN_SERVER=root@… eintragen
ADMIN_SERVER=root@DEIN_HOST ./scripts/import-admin-panel-from-server.sh
./scripts/verify-admin-panel-source.sh
pnpm install --frozen-lockfile
pnpm --filter admin-panel run build
git add artifacts/admin-panel
git status   # .env / node_modules dürfen nicht dabei sein
git commit -m "chore(admin-panel): import live source from server"
git push origin main
```

### Variante B — Ordner liegt schon lokal

(z. B. nach `scp -r root@host:/root/imoove/artifacts/admin-panel ~/admin-panel-src`)

```bash
ADMIN_LOCAL_PATH=~/admin-panel-src ./scripts/import-admin-panel-from-server.sh
./scripts/verify-admin-panel-source.sh
# … wie oben pnpm install --frozen-lockfile, pnpm --filter admin-panel run build, commit
```

Das Import-Skript **lässt Build-Ordner weg** (`dist`, `build`, `out`, `.next`, `node_modules`), damit nur **Source + Configs** ins Repo kommen; der Build entsteht lokal/auf dem Server neu.

**Hinweis:** Liegt auf dem Server praktisch nur `dist/` ohne `src/`, ist das **kein** importierbarer Source — dann Backup oder anderes Verzeichnis klären.

## Plattform-Admin: Login per Session/JWT (Produktion)

Das Admin-Panel nutzt nur noch **Benutzername/Passwort → `/api/admin/auth/login` → Session-JWT**.
Ein statischer Build-Bearer im Frontend wird nicht mehr verwendet.

1. Optional: **`VITE_API_BASE_URL=https://api.onroda.de/api`** — wenn nicht gesetzt, nutzt die App genau diese Produktions-URL (`src/lib/apiBase.js`).
2. Produktion immer mit expliziter Env-Datei (`.env.production`) bauen.
3. Nach Deploy immer Health/Auth prüfen:

   ```bash
   curl -i https://api.onroda.de/api/health
   curl -i -H "Authorization: Bearer <SESSION_JWT>" https://api.onroda.de/api/admin/stats
   ```

   Für den zweiten Check zuerst via `/api/admin/auth/login` einloggen und den zurückgegebenen JWT einsetzen.

## Deploy auf dem Server (nur noch)

**Nach jedem Push auf `main`:** im Server-Clone nur noch pullen, bauen, PM2 neu starten — keinen Source mehr direkt auf dem VPS editieren.

```bash
cd /root/imoove
git pull origin main
pnpm install --frozen-lockfile
export VITE_ADMIN_API_BEARER_TOKEN='…'   # identisch mit ADMIN_API_BEARER_TOKEN der API
pnpm --filter @workspace/api-server run build
pnpm --filter admin-panel run build
pm2 restart <api-prozess>
```

**Verbindlich für volle Deploy-Kette (Migrationen, Schema-Check, Partner-Panel):** `./scripts/deploy-onroda-production.sh` im Repo-Root — nutzt ebenfalls **pnpm** für API- und Panel-Builds (kein `npm ci` in den Panel-Ordnern).

Das Admin-Panel wird unter **`/partners/`** ausgeliefert (`vite` mit `base: /partners/`). Der API-Server liest den Build aus **`artifacts/admin-panel/dist`** (siehe `resolvePublicRoot` in `app.ts`). Root-URLs nicht-API-Hosts (z. B. Admin-Subdomain) leiten nach **`/partners/`** um.

(Abhängigkeiten und Lockfile: **Repo-Root** `pnpm-lock.yaml` — keine `package-lock.json` in den Panel-Ordnern.)

### Optional: eigenes PM2-App (Vite Preview auf Port 3001)

Wenn Nginx `admin.*` direkt auf einen Node-Prozess legen soll (statt statisch über die API): nach `pnpm --filter admin-panel run build` **`ecosystem.config.cjs`** nutzen — App **`onroda-admin-panel`** führt **`pnpm run preview:prod`** aus (**127.0.0.1:3001**, `base` `/partners/`). Start: `pm2 start ecosystem.config.cjs --only onroda-admin-panel` (siehe Kommentare in der Datei).

## Verifikation `/partners/` (Build + HTTP)

Nach `pnpm --filter admin-panel run build` (und API-Build):

```bash
# Nur prüfen, ob dist/index.html und /partners/assets/* auf der Platte existieren:
./scripts/verify-admin-partners-routes.sh

# Zusätzlich gegen laufende API (PORT anpassen):
./scripts/verify-admin-partners-routes.sh http://127.0.0.1:8080
```

Im Browser: gleiche Origin öffnen, z. B. `https://api.example.com/partners/` — DevTools → **Network**: `index.html`, JS und CSS müssen **200** haben; weiße Seite bei **404** auf `/partners/assets/…` deutet auf falschen Vite-`base` oder veralteten Build.

## Nginx → Vite (nur Entwicklung / Diagnose)

Wenn `admin.onroda.de` per DNS auf den Server zeigt und Nginx auf **`vite` oder `vite preview`** (z. B. Port **5174**) proxied, **muss** der ursprüngliche Host ankommen — sonst blockiert Vite trotz `allowedHosts`:

```nginx
location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Prüfen: `curl -sI https://admin.onroda.de | grep -i ^host` ist irrelevant; besser im **Vite-Terminal** loggen oder mit `curl -H 'Host: admin.onroda.de' http://127.0.0.1:5174/` vom Server aus.

**Häufige Ursache:** `proxy_set_header Host` fehlt oder ist auf den Upstream-Namen gesetzt → Vite sieht `127.0.0.1:5174`, nicht `admin.onroda.de`.

**Hinweis:** Öffentlich sollte später **Express + gebautes Admin** (`/partners/`) laufen, nicht der Vite-Dev-Server (Sicherheit, Performance).

## Optional: eigene Subdomain `admin.onroda.de`

Separates DNS/Nginx-Thema; die App bleibt unter **`/partners/`** auf demselben Express-Prozess wie die API (oder hinter einem Reverse-Proxy).

1. **DNS:** A-Record (oder AAAA) `admin.onroda.de` → Server-IP.
2. **Nginx:** `server_name admin.onroda.de;` → `proxy_pass` auf den Node-Port (derselbe wie für die API, falls ein Host).
3. **SSL:** z. B. `certbot --nginx -d admin.onroda.de`.
4. **Verhalten:** Entweder nur `location / { proxy_pass http://127.0.0.1:PORT; }` (Express liefert wie heute `/`, JSON auf API-Host, Redirect auf `/partners/` für andere Hosts laut `app.ts`) oder explizit `return 302 https://admin.onroda.de/partners/;` nur für `location = /`.

`resolvePublicRoot()` zeigt standardmäßig auf **`artifacts/admin-panel/dist`** relativ zu `api-server/dist/index.mjs`. Abweichende Pfade: **`ADMIN_STATIC_ROOT`** in `.env` setzen.

## Layout / UI

Erst **nach** erfolgreichem Import und grünem Build wieder gezielt an Layout und UI arbeiten — damit Repo und Live nicht auseinanderlaufen.
