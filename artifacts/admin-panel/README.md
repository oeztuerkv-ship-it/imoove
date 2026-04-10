# Onroda Admin Panel

Web-Admin für Betrieb/Backoffice. **Offizieller Ort im Monorepo:** `artifacts/admin-panel/`.

**Visuelle Marke:** Farben, Typografie und Komponenten-Abstände folgen der ONRODA-Homepage. Die gemeinsame Datei ist **`artifacts/api-server/static/onroda-brand.css`** (wird vom Admin-Panel per `@import` eingebunden und von der Marketing-`index.html` per `<link>` geladen).

## Antworten auf die Repo-/Server-Fragen

1. **Wo liegt der echte Source des live laufenden Panels?**  
   Bisher nur auf dem Server unter **`/root/imoove/artifacts/admin-panel`** — dieser Tree war **nicht** in `imoove` auf `main` versioniert.  
   Im `imoove`-Repo gibt es dafür **keinen** weiteren Klon: nur die minimale HTML-Route **`GET /admin`** in `artifacts/api-server/src/routes/admin.ts` und ein **Stub** unter `artifacts/mobile/app/admin/index.tsx` („Admin Panel Aktiv“) — das ist **nicht** dieselbe App wie das PM2-Panel.

2. **Soll dieser Stand ins Haupt-Repo?**  
   **Ja (Option A):** Eine Quelle der Wahrheit — API und Admin im selben Repo, Deploy nur noch `git pull` + Build.

3. **Wie kommt der Server-Stand hierher?**  
   Einmalig synchronisieren (siehe unten), danach `./scripts/verify-admin-panel-source.sh`, `npm install` / `npm run build`, dann `git add` / `commit` / `push`.

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
cd artifacts/admin-panel
npm install
npm run build
cd ../..
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
# … wie oben npm install, build, commit
```

Das Import-Skript **lässt Build-Ordner weg** (`dist`, `build`, `out`, `.next`, `node_modules`), damit nur **Source + Configs** ins Repo kommen; der Build entsteht lokal/auf dem Server neu.

**Hinweis:** Liegt auf dem Server praktisch nur `dist/` ohne `src/`, ist das **kein** importierbarer Source — dann Backup oder anderes Verzeichnis klären.

## Deploy auf dem Server (nur noch)

**Nach jedem Push auf `main`:** im Server-Clone nur noch pullen, bauen, PM2 neu starten — keinen Source mehr direkt auf dem VPS editieren.

```bash
cd /root/imoove
git pull origin main
cd artifacts/admin-panel
npm ci
npm run build
pm2 restart onroda-admin
```

(`npm ci` setzt `package-lock.json` im Repo voraus. Paketmanager/PM2-Name bei Bedarf anpassen.)

## Layout / UI

Erst **nach** erfolgreichem Import und grünem Build wieder gezielt an Layout und UI arbeiten — damit Repo und Live nicht auseinanderlaufen.
