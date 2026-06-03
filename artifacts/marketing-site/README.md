# ONRODA Marketing-Site (`onroda.de`)

Kanoniche Quelle für die öffentliche Homepage und Marketing-Static.

## Inhalt

| Datei | Zweck |
|-------|--------|
| `index.html` | Startseite |
| `impressum.html`, `datenschutz.html` | Rechtstexte (Nginx: `/impressum`, `/datenschutz`) |
| `partner-status.html` | Partner-Anfrage-Status (`/partner/anfrage-status`) |
| `style.css`, `script.js` | Layout & Partner-Formular |
| `onroda-logo-transparent.png` | **Einziges Produkt-Logo** (Header/Footer) — siehe `.cursor/rules/imoove-onroda-brand-logo.mdc` |
| `onroda-brand.css` | Marken-Tokens (auch Admin/Partner-Panel) |

## Live (Nginx)

Produktion: Nginx `root /var/www/onroda` — **nicht** automatisch durch `git pull`.

Deploy synchronisiert dieses Verzeichnis:

```bash
cd /root/imoove && ./scripts/deploy-onroda-production.sh
# nur Homepage-Static:
./scripts/deploy-home.sh
```

Standard: `rsync artifacts/marketing-site/` → `/var/www/onroda` (alle HTML/CSS/JS/Assets — nicht nur drei Dateien)  
Override: `ONRODA_RSYNC_MARKETING_STATIC_TO` in `scripts/onroda-deploy.env`  
Überspringen (lokal): `ONRODA_SKIP_MARKETING_RSYNC=1`

## API-Fallback

`artifacts/api-server/src/app.ts` liefert dieselben Dateien, wenn Anfragen an die API mit Host `onroda.de` / `www.onroda.de` gehen (Nginx zeigt in Produktion direkt auf `/var/www/onroda`).

## Lokal prüfen

```bash
./scripts/verify-onroda-marketing-partner-status-repo.sh
```
