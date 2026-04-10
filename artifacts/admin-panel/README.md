# Onroda Admin Panel

Web-Admin für Betrieb/Backoffice. **Offizieller Ort im Monorepo:** `artifacts/admin-panel/`.

## Antworten auf die Repo-/Server-Fragen

1. **Wo liegt der echte Source des live laufenden Panels?**  
   Bisher nur auf dem Server unter **`/root/imoove/artifacts/admin-panel`** — dieser Tree war **nicht** in `imoove` auf `main` versioniert.  
   Im `imoove`-Repo gibt es dafür **keinen** weiteren Klon: nur die minimale HTML-Route **`GET /admin`** in `artifacts/api-server/src/routes/admin.ts` und ein **Stub** unter `artifacts/mobile/app/admin/index.tsx` („Admin Panel Aktiv“) — das ist **nicht** dieselbe App wie das PM2-Panel.

2. **Soll dieser Stand ins Haupt-Repo?**  
   **Ja (Option A):** Eine Quelle der Wahrheit — API und Admin im selben Repo, Deploy nur noch `git pull` + Build.

3. **Wie kommt der Server-Stand hierher?**  
   Einmalig vom Server nach untenstehendem Befehl synchronisieren (von einem Rechner mit SSH-Zugang), dann `git add` / `commit` / `push`. Siehe auch `scripts/import-admin-panel-from-server.sh` im Repo-Root.

4. **Einzige Quelle künftig:**  
   **`artifacts/admin-panel/` im Git-Repo** (lokal + `main`). Der Server-Pfad ist nur **Deployment-Ziel**, keine zweite Entwicklungsquelle.

## Einmaliger Import vom Server

Auf deinem Mac (oder CI mit SSH), im **Repo-Root** von `imoove`:

```bash
export ADMIN_SERVER="root@DEIN_HOST"
rsync -avz \
  --exclude node_modules \
  --exclude .next \
  --exclude dist \
  --exclude build \
  --exclude out \
  --exclude .env \
  --exclude '.env.*' \
  "${ADMIN_SERVER}:/root/imoove/artifacts/admin-panel/" \
  "./artifacts/admin-panel/"
```

Danach:

```bash
cd artifacts/admin-panel
# Abhängigkeiten wie auf dem Server üblich:
npm ci   # oder npm install / pnpm install — dem vorhandenen package-lock folgen
git status
git add .
git commit -m "chore(admin-panel): import live source from server into repo"
git push origin main
```

**Hinweis:** Liegen auf dem Server nur gebaute Artefakte ohne sinnvollen Source, vor dem Import klären (z. B. nur `dist/` → dann Source aus Backup/anderem Ort holen).

## Deploy auf dem Server (nur noch)

```bash
cd /root/imoove
git pull origin main
cd artifacts/admin-panel
npm ci
npm run build
pm2 restart onroda-admin
```

(Paketmanager/Script-Namen anpassen, falls ihr `pnpm` o. Ä. nutzt.)

## Layout / UI

Erst **nach** erfolgreichem Import und grünem Build wieder gezielt an Layout und UI arbeiten — damit Repo und Live nicht auseinanderlaufen.
