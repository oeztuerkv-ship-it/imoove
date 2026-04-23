# Architektur: Anfragen (chat-basiert, zentral)

Ziel: einfaches Partner↔Plattform-Nachrichtensystem (Thread + Nachrichten), **ohne** Tickets, Prioritäten, Eskalation oder Live-Sockets (Polling). **Ein** Feature für alle Mandanten-Arten (Taxi, Hotel, Medical, …), klar von Taxi-Fachlogik getrennt.

---

## 1. UI-Struktur

### 1.1 Partner-Panel (`artifacts/partner-panel`)

**Gemeinsames Modul** (nicht nur Taxi-Shell):

| Kontext | Einbindung |
|---------|------------|
| **Taxi-Unternehmer** | `TaxiEntrepreneurShell.jsx`: neuer Nav-Punkt „Anfragen“ (wie andere Module; Sichtbarkeit über `panel_modules` + ggf. Permission). |
| **Andere Mandanten-Shells** | Später: `PanelShell.jsx` / weitere `*MasterPanel`-Layouts — dieselbe Route-Komponente mounten. |
| **Wiederverwendbare Bausteine** | Vorgeschlagener Ordner (an Repo-Konvention angepasst): `artifacts/partner-panel/src/support/` |

**Komponenten (Vorschlag)**

| Datei | Rolle |
|-------|--------|
| `SupportShell.jsx` | Zweispaltiges Layout: links Liste, rechts Detail; lädt Thread-Liste, verwaltet `selectedThreadId`, Polling-Intervall. |
| `SupportList.jsx` | Liste: Titel, Snippet (letzte Nachricht), `last_message_at`, Status-Badge (4 Werte). |
| `SupportThread.jsx` | Rechts: Nachrichten chronologisch, Absender Partner/Admin, Eingabe + Senden, optional Anhang-UI. |
| `SupportNewThreadModal.jsx` | „Neue Anfrage“: Kategorie, Titel, erste Nachricht, optional Datei. |

**Styling:** bestehende Partner-Klassen (`partner-workspace.css`, ggf. ergänzende BEM-artige Präfixe `partner-support-*`), kein zweites Design-System.

**Deep-Link / Integration** (Stammdaten, Dokumente):

- Einheitlicher Mechanismus, z. B. **Query-String** `?supportNew=1&category=stammdaten&body=…` (Body nur kurz URL-encoded) **oder** React-`location.state` beim Navigieren von `TaxiStammdatenPage` / `TaxiDocumentsPage` zur Shell mit aktivem Modul `anfragen` + Props an `SupportShell`.
- Taxi: `TaxiEntrepreneurShell` erweitert `taxiModule`- oder Hash-Logik analog zu `taxiModule=stammdaten`, damit Einstieg reproduzierbar bleibt.

### 1.2 Admin-Panel (`artifacts/admin-panel`)

| Bereich | Inhalt |
|---------|--------|
| **Neue Seite** | z. B. `SupportInboxPage.jsx` (oder unter bestehendem Nav-Item „Support“ / „Anfragen“). |
| **Layout** | Gleiche Zweiteilung: Liste (alle Mandanten) + Detail (Chat). |
| **Filter** | Status, `company_id` / Firmenname, Kategorie; einfache Volltextsuche über `title` + optional Snippet aus letzter Nachricht (serverseitig oder clientseitig nach geladenem Datensatz — für MVP reicht serverseitige Suche auf `title` + `company_id`). |
| **Aktionen** | Nachricht senden; Status per Dropdown/PATCH: `in_progress`, `closed` (und implizit durch Antwort → `answered`). |

**Auth:** unverändert Admin-Bearer / Admin-Session wie bestehende Admin-Routen (`docs/access-control.md`).

---

## 2. Datenfluss

### 2.1 Partner

1. **Liste:** `GET …/support/threads` → liefert Threads **nur** `WHERE company_id = JWT.company_id`, sortiert nach `last_message_at DESC`.
2. **Detail:** `GET …/support/threads/:id` → 404 wenn Thread nicht zu `company_id`; inkl. Nachrichten (paginiert oder letzte N, MVP: alle bis Limit z. B. 200).
3. **Neu:** `POST …/support/threads` → erzeugt Thread (`status = open`), erste Nachricht in `support_messages`, setzt `last_message_at`.
4. **Nachricht:** `POST …/support/threads/:id/messages` → Append; **Status-Regel:** wenn aktueller Status `answered` und Sender `partner` → Thread auf `open` setzen (siehe 3.2).
5. **Polling:** Partner-UI alle 15–30 s Liste + offenes Detail refreshen (konfigurierbar); kein WebSocket.

### 2.2 Admin

1. **Liste:** `GET …/admin/support/threads?status=&companyId=&category=&q=` → alle Mandanten (mit Limit/Offset).
2. **Detail:** `GET …/admin/support/threads/:id` → inkl. Messages.
3. **Nachricht:** `POST …/admin/support/threads/:id/messages` → `sender_type = admin`, `sender_id = admin_auth_users.id` (oder Username-String, konsistent mit Audit-Log-Pattern).
4. **Status:** `PATCH …/admin/support/threads/:id` mit `{ status }` → manuell `in_progress` oder `closed`; Antwort-POST kann zusätzlich automatisch `answered` setzen (siehe 3.2).

### 2.3 Anhänge (MVP)

- **Option A (empfohlen):** eigener Upload-`POST` (Partner/Admin) → speichert Datei in bestehendem Blob-/Storage-Pattern (wie Compliance-PDFs), Referenz als JSON in `support_messages.attachments` `[{ storageKey, filename, mime, size }]`.
- **Option B:** nur Metadaten + Link, Datei per Mail — nicht nötig für MVP.

---

## 3. API-Struktur (kanonische Pfade)

Basis wie heute: API unter **`/api`**, Panel-Routen in `panelApi.ts` typisch **`/panel/v1/...`**, vollständig **`/api/panel/v1/...`** (siehe Deploy-Doku / `API_BASE` im Partner-Panel).

### 3.1 Partner (JWT, Mandant aus Profil)

| Methode | Pfad | Zweck |
|---------|------|--------|
| `GET` | `/api/panel/v1/support/threads` | Liste (gefiltert auf `company_id`) |
| `POST` | `/api/panel/v1/support/threads` | Neue Anfrage + erste Nachricht |
| `GET` | `/api/panel/v1/support/threads/:id` | Thread + Nachrichten |
| `POST` | `/api/panel/v1/support/threads/:id/messages` | Weitere Nachricht (multipart wenn Anhang) |

**Guards:** `requirePanelAuth`, `assertActivePanelProfile`, neues Panel-Modul z. B. **`support`** (oder `requests`) in `panelModules.ts` + optionale Permission **`support.read`** / **`support.write`** (MVP: ein Modul reicht, Schreiben für alle aktiven Panel-User mit Modul — später verfeinern).

### 3.2 Admin

| Methode | Pfad | Zweck |
|---------|------|--------|
| `GET` | `/api/admin/support/threads` | Liste + Filter |
| `GET` | `/api/admin/support/threads/:id` | Detail + Messages |
| `POST` | `/api/admin/support/threads/:id/messages` | Antwort |
| `PATCH` | `/api/admin/support/threads/:id` | Status (`in_progress`, `closed`; optional auch `answered` manuell, falls gewünscht) |

**Guards:** Admin-Bearer + Rolle wie bei anderen schreibenden Admin-Endpunkten.

---

## 4. Status-Logik (verbindlich, 4 Zustände)

Interne Codes (DB/API, englisch/snake_case): `open` | `in_progress` | `answered` | `closed`  
UI-Labels (DE): offen | in Bearbeitung | beantwortet | geschlossen

| Ereignis | Neuer Status |
|----------|----------------|
| Partner erstellt Thread | `open` |
| Admin sendet Nachricht (POST message) | mindestens `answered` (wenn vorher `open`/`in_progress`; wenn schon `closed`, Policy festlegen: entweder verweigern oder wieder öffnen — **Empfehlung:** geschlossene Threads nicht per Nachricht wieder öffnen; Partner muss neuen Thread erstellen) |
| Admin setzt manuell (PATCH) | `in_progress` oder `closed` |
| Partner schreibt bei Status `answered` | zurück auf **`open`** |

Keine weiteren Statuswerte in DB-Check oder API-Enums.

---

## 5. Kategorien

DB: `TEXT` mit Check-Constraint oder Enum-Typ in PostgreSQL:

`stammdaten` | `documents` | `billing` | `technical` | `other`  

API/UI: deutsche Labels (Stammdaten, Dokumente, Abrechnung, Technisch, Sonstiges).

---

## 6. DB-Migration (Tabellen)

**Neue nummerierte Migration** unter `artifacts/api-server/src/db/migrations/` (nächste freie Nummer laut Repo-Invariante), plus Eintrag in **`scripts/verify-onroda-db-schema.sql`** (erwartete Tabellen/Indizes).

### 6.1 `support_threads`

| Spalte | Typ | Notizen |
|--------|-----|---------|
| `id` | `TEXT` PK (UUID string) | wie andere IDs im Projekt |
| `company_id` | `TEXT` NOT NULL FK → `admin_companies(id)` | genau ein Mandant |
| `created_by_panel_user_id` | `TEXT` NOT NULL FK → `panel_users(id)` | wer im Partner-Panel angelegt hat |
| `category` | `TEXT` NOT NULL | siehe Kategorien |
| `title` | `TEXT` NOT NULL | kurz, max. Länge in API validieren (z. B. 200) |
| `status` | `TEXT` NOT NULL | CHECK auf 4 Werte |
| `last_message_at` | `timestamptz` NOT NULL | für Sortierung/Snippet |
| `created_at` / `updated_at` | `timestamptz` | Standard |

**Indizes:** `(company_id, last_message_at DESC)`; Admin-Liste: `(status, last_message_at DESC)`; optional `(category)`.

### 6.2 `support_messages`

| Spalte | Typ | Notizen |
|--------|-----|---------|
| `id` | `TEXT` PK | |
| `thread_id` | `TEXT` NOT NULL FK → `support_threads(id)` ON DELETE CASCADE | |
| `sender_type` | `TEXT` NOT NULL | `partner` \| `admin` |
| `sender_panel_user_id` | `TEXT` NULL FK → `panel_users` | gesetzt wenn `partner` |
| `sender_admin_user_id` | `TEXT` NULL FK → `admin_auth_users` | gesetzt wenn `admin` (Schema je nach Admin-User-Tabelle) |
| `body` | `TEXT` NOT NULL | Nachricht |
| `attachments` | `JSONB` NULL | Array kleiner Metadaten |
| `created_at` | `timestamptz` NOT NULL | |

**Check:** genau eine Sender-Referenz passend zu `sender_type` (optional als DB-Constraint oder nur API).

**Indizes:** `(thread_id, created_at ASC)` für Chat-Verlauf.

### 6.3 `drizzle` / `init-onroda.sql`

- `schema.ts` um Tabellen ergänzen (Quelle der Wahrheit laut `AGENTS.md`).
- `init-onroda.sql` für Greenfield-Deployments angleichen.

---

## 7. Betroffene Ordner / Dateien (Implementierung später)

### API / DB

| Pfad | Änderung |
|------|----------|
| `artifacts/api-server/src/db/migrations/0NN_support_threads.sql` | neue Tabellen + Constraints |
| `artifacts/api-server/src/db/schema.ts` | Drizzle-Definitionen |
| `artifacts/api-server/src/db/init-onroda.sql` | Referenz-DDL |
| `artifacts/api-server/src/db/supportThreadsData.ts` (neu) | Queries: list by company, get by id, insert thread, insert message, patch status, snippet |
| `artifacts/api-server/src/routes/panelApi.ts` | Partner-Routen unter `/panel/v1/support/…` |
| `artifacts/api-server/src/routes/adminApi.ts` | Admin-Routen unter `/api/admin/support/…` (Pfadkonvention wie bestehende Admin-API prüfen) |
| `artifacts/api-server/src/domain/panelModules.ts` | Modul-ID `support` + Whitelist pro `company_kind` |
| `artifacts/api-server/src/lib/panelPermissions.ts` | ggf. `support.read` / `support.write` (oder Modul-only MVP) |
| `scripts/verify-onroda-db-schema.sql` | Erwartung `support_threads`, `support_messages` |
| `docs/access-control.md` | kurzer Abschnitt Partner vs Admin für Support |

### Partner-Panel

| Pfad | Änderung |
|------|----------|
| `artifacts/partner-panel/src/support/*.jsx` | neue UI (Shell, List, Thread, Modal) |
| `artifacts/partner-panel/src/taxi/TaxiEntrepreneurShell.jsx` | Nav + Modul `anfragen` |
| `artifacts/partner-panel/src/layout/PanelShell.jsx` (später) | gleiches Modul für Nicht-Taxi |
| `artifacts/partner-panel/src/pages/taxi/TaxiStammdatenPage.jsx` | CTA „Änderung anfragen“ → Thread mit Kategorie + Prefill |
| `artifacts/partner-panel/src/pages/taxi/TaxiDocumentsPage.jsx` | bei abgelehnt → „Anfrage stellen“ |
| `artifacts/partner-panel/src/lib/panelNavigation.js` | falls generische Nav genutzt: Eintrag + `moduleId` |

### Admin-Panel

| Pfad | Änderung |
|------|----------|
| `artifacts/admin-panel/src/pages/SupportInboxPage.jsx` (neu) | Liste + Detail |
| `artifacts/admin-panel/src/App.jsx` oder Router | Route registrieren |
| `artifacts/admin-panel/src/config/adminNavConfig.js` | Menüpunkt |

### Tests / Invarianten

| Pfad | Änderung |
|------|----------|
| `scripts/verify-onroda-repo-invariants.sh` | nur falls neue harte Regeln (z. B. Migrationsnummer) |

---

## 8. Nicht-Ziele (MVP)

- Keine WebSockets / SSE.
- Keine Prioritäten, SLA, Eskalationsstufen.
- Keine Zuweisung an einzelne Admin-Benutzer (optional später: `assigned_to`).
- Keine Suche in Volltext aller Nachrichten (nur Titel/Mandant reicht zuerst).

---

## 9. Rollen- und Mandanten-Trennung (verbindlich)

- Partner sieht **nur** `company_id` aus JWT; alle Queries **parametrisiert**, nie optional weglassen.
- Admin sieht **global**; keine Panel-JWT-Mischung.
- Keine Logik in Taxi-spezifischen Routen — **nur** Integration (Buttons) in Taxi-Pages.

Dieses Dokument ist die **Planungsgrundlage**; Umsetzung in getrennten PRs: (1) Migration + API, (2) Partner-UI, (3) Admin-UI, (4) Deep-Links aus Stammdaten/Dokumente.
