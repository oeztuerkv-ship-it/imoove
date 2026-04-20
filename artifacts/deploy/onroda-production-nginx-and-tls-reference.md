# Onroda Produktion: Nginx / TLS / Domain-Trennung (Referenzstand)

Diese Datei hält den **bestätigt funktionierenden Live-Stand** fest (Routing, TLS, Admin vs. Partner), damit spätere Änderungen nicht wieder in dieselben Fallen laufen. Sie ersetzt **nicht** die eigentliche Server-Datei; sie dokumentiert nur, was auf dem Produktionsserver gilt.

**Beispiel-Snippets im Repo:** `artifacts/deploy/nginx-onroda.example.conf`  
**Architektur-Regeln:** `.cursor/rules/imoove-product-architecture.mdc`, `.cursor/rules/imoove-server-infrastructure-onroda.mdc`

---

## 1. Aktive Nginx-Konfiguration (Produktion)

- **Wirksam ist nur, was unter `sites-enabled` symlinkt** — nicht nur Dateien in `sites-available`.
- **Produktiv aktiv:** `/etc/nginx/sites-enabled/final-try`

Änderungen an Routing/TLS: immer **`final-try`** (bzw. den tatsächlich symlinkten Dateinamen) bearbeiten, `nginx -t`, dann reload.

---

## 2. Pflicht: eigene `server`-Blöcke pro Host

In `final-try` müssen **explizite** `server { … }` mit passendem `server_name` existieren für:

| Host | Rolle |
|------|--------|
| `panel.onroda.de` | Partner-SPA (`/`), Proxy auf Node |
| `admin.onroda.de` | Admin-SPA unter `/partners/`, Proxy auf Node |
| `api.onroda.de` | REST unter `/api/…`, Proxy auf Node |

Ohne saubere Trennung pro Host drohen falsche Zertifikate (SNI), falsche `proxy_pass`-Ziele oder Vermischung von SPAs.

---

## 3. Partner-Host: `/partners` darf niemals Admin sein

**Invariante:** `https://panel.onroda.de/partners/` darf **niemals** die Admin-SPA rendern.

**Funktionierender Edge-Fix in Nginx** (zusätzlich zur App-Logik in `artifacts/api-server/src/app.ts`):

```nginx
location ^~ /partners {
    return 302 /;
}
```

im `server`-Block für `panel.onroda.de`.

---

## 4. Typischer „Login geht nicht“-Fall: TLS auf `api.onroda.de`, nicht Auth

- Admin-Login im Browser geht gegen **`https://api.onroda.de/api/admin/auth/login`** (CORS + TLS).
- Wenn `api.onroda.de` ein Zertifikat **ohne** `api.onroda.de` in der **SAN** ausliefert (z. B. fälschlich nur `panel.onroda.de`), **scheitert der Browser** — während ein direkter API-Test mit `-k` oder ein anderer Pfad „Auth ok“ vortäuschen kann.
- **Symptom:** `curl` ohne `-k` meldet z. B. *no alternative certificate subject name matches target host name 'api.onroda.de'*.

Ursache: falscher `ssl_certificate` im `api.onroda.de`-Block, falscher `default_server`, oder doppelte/widersprüchliche `server_name`-Dateien.

---

## 5. Verifizierter API-Block (Live): Upstream + Zertifikat

Nach erfolgreichem Fix nutzt der produktive API-`server`-Block u. a.:

- **Upstream:** `proxy_pass http://127.0.0.1:3000;` (einheitlich mit PM2 / Repo-Regel Port **3000**)
- **Zertifikat (Let’s Encrypt, Multi-SAN / Certbot-Pfad auf dem Server):**
  - `ssl_certificate     /etc/letsencrypt/live/onroda.de-0001/fullchain.pem;`
  - `ssl_certificate_key /etc/letsencrypt/live/onroda.de-0001/privkey.pem;`

**Hinweis:** Der genaue Certbot-Ordner (`onroda.de-0001` vs. `api.onroda.de` etc.) kann sich nach Erneuerung ändern — immer mit `openssl`/Certbot-Liste prüfen. Entscheidend ist: **SAN enthält `api.onroda.de`**.

---

## 6. Verifikation nach TLS-/Nginx-Änderung

```bash
# SAN für SNI-Host api prüfen
openssl s_client -connect api.onroda.de:443 -servername api.onroda.de </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

# HTTP (TLS muss ohne -k funktionieren)
curl -sI https://api.onroda.de/api/healthz
# Erwartung: HTTP/2 200 (o. ä.) ohne Zertifikatfehler
```

---

## Checkliste bei „Admin-Login kaputt“ / „API spinnt“

1. `curl -sI https://api.onroda.de/api/healthz` **ohne** `-k` — wenn hier TLS bricht, zuerst Nginx/Zertifikat, nicht Node-Auth.
2. Welche Datei ist in `sites-enabled` aktiv (`final-try`)?
3. Im `api.onroda.de`-Block: `ssl_certificate` wirklich Zert mit SAN `api.onroda.de`?
4. `panel.onroda.de`: Redirect `/partners` → `/` noch gesetzt?
5. `nginx -t` und reload nur nach grünem Test.
