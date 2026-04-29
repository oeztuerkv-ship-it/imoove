# Operator-Panel, Partner-Portal und bewusste API-Risiken

Stand: interne Notiz für Architektur und Tests (nicht Kunden-Doku).

## 1. Admin-Panel = Operator-Panel (aktueller Stand)

- **Kein klassisches Login**, **kein Admin-User-Profil**: Zugriff auf die Admin-JSON-API über **`Authorization: Bearer`** (`ADMIN_API_BEARER_TOKEN` auf der API, `VITE_ADMIN_API_BEARER_TOKEN` im Admin-Panel-Build).
- **Einordnung:** bewusst als **Operator-Panel** (Deployment-/Betriebszugriff), nicht als mandantenfähiges Endnutzer-Login.
- **Spätere Entscheidung:** ob ein **eigener Admin-User-Flow** (Accounts, Passwort-Reset, Audit pro Operator) nötig ist — **getrennt** vom Partner-Firmenprofil halten.

## 2. Partner vs. Admin (Reifegrad)

- **Partner-Portal** ist im Nutzerfluss **weiter:** Login, JWT, Rollen/Rechte, Firmenprofil (`/api/panel/v1/…`, `company_id` aus dem Token).
- **Nicht vermischen:** Partner-Konzepte (Mandant, Panel-User) nicht in Admin-UI/API „nebenbei“ nutzen und umgekehrt keine globalen Admin-Stats in den Partner-Endpunkten anbieten.

## 3. Früheres Risiko `GET /rides` (behoben)

| Thema | Stand |
|--------|--------|
| **Früher** | `GET /rides` lieferte ohne Auth eine globale Liste (siehe Historie in Git). |
| **Jetzt** | Globale Listen-Auslieferung erfolgt nur noch über **`GET /api/admin/rides`** mit `requireAdminApiBearer` (`adminJson`). Die öffentliche `GET /rides`-Liste wurde entfernt. |
| **Hinweis** | Kundenfahrten weiterhin über **`GET /api/customer/v1/rides`** (Session-JWT); Taxi-Fahrer über **`GET /api/fleet-driver/v1/market-rides`** / **`scheduled-rides`** (Fleet-JWT). |

Weitere öffentliche Ride-Routen sollten weiterhin in Reviews (z. B. Schreibzugriffe auf `PATCH /rides/:id/status`) geprüft werden.

### Regression behoben (Admin-Bearer vs. `GET /rides`)

Wenn `requireAdminApiBearer` als `router.use()` auf **die gesamte** `adminApi`-Router-Instanz gelegt wird, läuft die Middleware für **jede** Anfrage, die diesen Router durchläuft — inkl. Pfade, die gar nicht unter `/admin` liegen, sobald die Router-Reihenfolge im Index `adminApi` vor `rides` mountet. Dann lieferte **`GET /rides` fälschlich 401**, sobald `ADMIN_API_BEARER_TOKEN` gesetzt war.

**Fix im Code:** Admin-JSON hängt unter einem **Unter-Router** `router.use("/admin", adminJson)` mit `adminJson.use(requireAdminApiBearer)` — Bearer gilt nur noch für **`/admin/*`**. **`GET /rides` bleibt ohne Bearer erreichbar** (weiterhin das dokumentierte öffentliche Risiko).

---

## Funktionstest-Checkliste (Admin / Partner / Trennung)

Voraussetzung: API mit **`DATABASE_URL`**, Migrationen, **`ADMIN_API_BEARER_TOKEN`** gesetzt, Admin-Panel mit passendem **`VITE_ADMIN_API_BEARER_TOKEN`** gebaut; **`PANEL_JWT_SECRET`** für Panel-Login.

### Admin (Operator)

- [ ] **`GET /api/admin/stats`** mit korrektem Bearer → `200`, `ok: true`, verschachtelte `stats`.
- [ ] **`GET /api/admin/stats`** ohne Bearer oder falscher Token → **`401`** (wenn Token auf der API gesetzt).
- [ ] **Produktion:** ohne `ADMIN_API_BEARER_TOKEN` → **`503`** auf `/admin/*`.
- [ ] Dashboard im Browser: Zahlen und Umsatz-Zeitraum wie erwartet.
- [ ] **Fahrtenliste:** lädt über **`GET /api/admin/rides`** mit Bearer; Inhalt gemäß Rolle/Scope.
- [ ] **Firmen:** `GET /api/admin/companies` mit Bearer; Suche/PRIO wie erwartet.

### Partner

- [ ] **`POST /api/panel-auth/login`** mit gültigem User → JWT.
- [ ] **`GET /api/panel/v1/rides`** → nur Fahrten mit **`company_id`** der Session.
- [ ] **Verlauf** (UI-Filter) mit mehreren Status sinnvoll prüfbar.
- [ ] **`GET/PATCH /api/panel/v1/company`:** Owner/Manager speichern; Staff → **403** auf PATCH, Formular read-only.

### Trennung

- [ ] Zwei Firmen: Partner A sieht **nicht** B; Admin sieht **beides** (Firmen + globale Fahrtenliste).
- [ ] Kein anonymer globaler Fahrten-Dump mehr (`GET /rides` entfernt); Kunden/Taxi-Fahrer nutzen die jeweiligen Session-/Fleet-Endpunkte.

### Admin-Profil

- [ ] Kein eigenes Admin-Operator-Profil in der App — **Einstellungen** sind Platzhalter; **Profil/Firma** existiert **nur** im Partner-Portal für **Mandanten-Stammdaten**.

---

## Automatisierter Smoke-Test (API, lokal)

Ohne `DATABASE_URL` (In-Memory), mit gesetztem **`ADMIN_API_BEARER_TOKEN`** (Stand Repo nach Admin-Router-Fix):

| Schritt | Erwartung |
|---------|-----------|
| `GET /api/admin/stats` ohne `Authorization` | **401** `unauthorized` |
| `GET /api/admin/stats` mit korrektem Bearer | **200**, `ok: true`, `stats` |
| `GET /rides` | **Entfernt** (kein globaler Dump mehr; Admin: `GET /api/admin/rides` mit Bearer). |

**Partner-Flows** (Login, `panel/v1/*`, Owner vs. Staff) erfordern **Postgres** + `PANEL_JWT_SECRET` und Testnutzer — bitte gegen Staging/DB manuell nach Checkliste oben.
