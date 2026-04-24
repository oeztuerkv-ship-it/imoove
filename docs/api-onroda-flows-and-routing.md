# Onroda API: Flows, Routen, Trennung (Homepage-Registrierung vs. Partner-Support)

Dieses Dokument fasst die **kanonischen HTTP-Pfade** und **Zuständigkeiten** zusammen, damit Registrierung, Support, Admin und Fahrer-API nicht vermischt werden.

**Basis:** Der Node-Prozess hängt den zentralen Router unter `GET/POST /api/...` ein (`artifacts/api-server/src/app.ts` → `app.use("/api", router)`). Darin sitzen u. a. `panelAuth`, `panelApi`, `adminApi`, `fleetAuth`, `fleetDriverApi` (`artifacts/api-server/src/routes/index.ts`).

Viele Routen-Dateien definieren Pfade, die **bereits** mit `panel-auth`, `panel/v1`, `admin`, `fleet-auth`, `fleet-driver` beginnen. Die vollständige URL ist dann:

`https://api.onroda.de/api` + `/<route-aus-der-Datei>`.

---

## 1. Öffentliche Homepage: Partnerbewerbung / Registrierungsanfrage

| Schritt | Ort im Repo / Pfad |
|--------|---------------------|
| Absenden des Formulars | `artifacts/api-server/static/script.js` (Partner-Formular), URL: `publicApiBase() + "/panel-auth/registration-request"` |
| `publicApiBase()` | Liefert u. a. `https://api.onroda.de/api` (siehe Meta `onroda-public-api-base` oder Default in `script.js`) |
| **Kanonische API-URL** | **`POST /api/panel-auth/registration-request`** |
| Handler | `artifacts/api-server/src/routes/panelAuth.ts` → `router.post("/panel-auth/registration-request", ...)` |
| Einbindung | `artifacts/api-server/src/routes/index.ts` → `router.use(panelAuthRouter)` unter dem Mount `app.use("/api", router)` → ergibt `/api/panel-auth/...` |
| Speicherung | `createPartnerRegistrationRequest` in `artifacts/api-server/src/db/partnerRegistrationRequestsData.ts` |
| Admin-Ansicht / Freigabe | Admin-API: **`GET/POST/PATCH /api/admin/...`** (siehe unten) — z. B. `GET /api/admin/company-registration-requests`, `POST .../approve` in `artifacts/api-server/src/routes/adminApi.ts` (Router `adminJson` unter `/admin`) |

**Status-Seite (ohne Login):** `GET /api/panel-auth/registration-request-status?email=&requestId=` — ebenfalls in `panelAuth.ts`; Marketing-HTML `artifacts/api-server/static/partner-status.html` ruft das so auf.

---

## 2. Partner-Panel: Support / „Anfragen“ (eingeloggter Mandant)

| Schritt | Ort / Pfad |
|--------|------------|
| UI | `artifacts/partner-panel/src/support/SupportShell.jsx` |
| **Kanonische API-URL** | **`GET/POST /api/panel/v1/support/threads`** (Detail/Messages: `/api/panel/v1/support/threads/:id`, `.../messages`) |
| Handler | `artifacts/api-server/src/routes/panelApi.ts` — `requirePanelAuth`, Mandanten-Filter über JWT |
| Admin-Antwort / Moderation | **`GET/POST/PATCH /api/admin/support/threads...`** in `adminApi.ts` (Bearer, Plattform-Scope) |

**Wichtig:** Das ist **nicht** `panel-auth/registration-request`. Support läuft nur mit **Panel-JWT** (`Authorization: Bearer` nach `POST /api/panel-auth/login` im Partner-Panel).

---

## 3. Router-Struktur (kurz)

| Bereich | Router-Datei | Typische Pfade in der Datei | Effektiv unter (Prod) |
|--------|----------------|----------------------------|------------------------|
| Panel-Auth & öffentliche Registrierung | `routes/panelAuth.ts` | `/panel-auth/login`, `/panel-auth/registration-request`, ... | `/api/panel-auth/...` |
| Partner-API (Mandant) | `routes/panelApi.ts` | `/panel/v1/...` | `/api/panel/v1/...` |
| Admin-JSON-API | `routes/adminApi.ts` | `adminJson` mit Pfaden `/stats`, `/companies`, `/support/...`, `/company-registration-requests/...` — eingebunden mit `router.use("/admin", adminJson)` | `/api/admin/...` |
| Fahrer-Auth | `routes/fleetAuth.ts` | `/fleet-auth/login` | `/api/fleet-auth/...` |
| Fahrer-API | `routes/fleetDriverApi.ts` | `/fleet-driver/v1/...` | `/api/fleet-driver/v1/...` |
| Flotte Partner | `routes/fleetPanelApi.ts` | u. a. `/panel/v1/fleet/...` | `/api/panel/v1/fleet/...` |

**Zentrale Registrierung aller API-Router:** `artifacts/api-server/src/routes/index.ts`  
**Express-App:** `artifacts/api-server/src/app.ts` — u. a. `app.use("/api", router)`.

**Hinweis:** Eine **zusätzliche** `app.use("/api/panel-auth", panelAuth)`-Zeile in `app.ts` war irreführend: Sie hätte nur Pfade der Form `/api/panel-auth/panel-auth/...` „bedient“ und gehört **nicht** zur kanonischen Struktur. Kanonisch ist ausschließlich die Einbindung über `routes/index.ts` unter `/api`.

---

## 4. Häufige Ursache von `404` auf korrekter URL

- **API-Prozess läuft noch mit altem Build** (Deploy/PM2 nicht neu; Server-`dist` nicht neu gebündelt) → Route im laufenden Prozess fehlt.
- **Falsche erwartete URL** (Doppel-Präfix, z. B. Annahme `/panel-auth/...` ohne `/api`, oder Verwechslung mit `/api/panel-auth/panel-auth/...`).
- **Nginx/Proxy** leitet nur Teilmenge an Node weiter (seltener, wenn Health und andere `/api/*` gehen).

---

## 5. Test (nach Deploy)

1. **Homepage-Partneranfrage**  
   `POST https://api.onroda.de/api/panel-auth/registration-request` mit JSON wie in `static/script.js`  
   → Erwartung: `201` + `{ ok: true, request: { id: "prr-..." } }`
2. **Admin-Liste**  
   Mit Admin-Bearer: `GET https://api.onroda.de/api/admin/company-registration-requests`  
   → Eintrag sichtbar.
3. **Support getrennt**  
   `POST https://api.onroda.de/api/panel/v1/support/threads` **nur** mit Panel-JWT  
   → nicht mit öffentlichem Registrierungs-Endpoint verwechseln.

---

## 6. System-Map (für weitere Zusammenarbeit)

```
Homepage (onroda.de, static)
  → POST /api/panel-auth/registration-request
  → DB: partner_registration_requests
  → Admin: GET/PATCH/POST /api/admin/company-registration-requests…
  → Approve: legt Mandanten/Panel-User an (Prozess in adminApi + DB-Layer)

Partner-Panel (panel.onroda.de)
  → POST /api/panel-auth/login → JWT
  → POST /api/panel/v1/support/threads → support_threads (Mandant)
  → Admin: /api/admin/support/threads… (Antwort/Moderation)

Admin-Panel (admin.onroda.de; SPA)
  → ruft /api/admin/* mit Admin-Bearer (kein Panel-JWT für globale Admin-Funktionen)

Fahrer-App
  → POST /api/fleet-auth/login
  → GET/POST /api/fleet-driver/v1/… (Fahrer-JWT, eigenes System)
```

---

*Letzte inhaltliche Ergänzung: doppelte `panel-auth`-Mount-Erklärung in `app.ts` und dieses Dokument.*
