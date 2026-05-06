# ONRODA — Systemanalyse (Ist-Stand)

**Datum der Erhebung:** 2026-05-06  
**Repo-Pfad:** `imoove` (Monorepo)  
**Methode:** direkte Ableitung aus implementiertem Code, Schema und nummerierten SQL-Migrationen — keine Annahmen ohne Referenz.

---

## Executive Summary

ONRODA ist eine **mehrschichtige Plattform**: öffentliche Marketing-Seite (`onroda.de`), zentrale **REST-API** (`artifacts/api-server`, typisch Host `api.onroda.de`), **Admin-Operator-Konsole** (`artifacts/admin-panel`, Base `/partners/`), **Partner-Unternehmensportal** (`artifacts/partner-panel`), **Mobile Kunden-App** und **Taxi-Fahrer-Workflow** über **`artifacts/mobile`** und Fleet-APIs. Kernobjekt ist die **Fahrt (`rides`)** mit Historie (`ride_events`), optionalem Tarif-Freeze (`tariff_snapshot_json`) und kaufmännischem Snapshot (`ride_financials`).

**Go/No-Go (hoch aggregiert):** Als **technische Plattform für Buchung, Dispatch-Matching nach Policy, Mandantentrennung und Finanz-Snapshots** ist der Stand **weit implementiert**. Offene Punkte betreffen vor allem **Betriebsreife** (z. B. Support-Tickets nur In-Memory), **öffentliche Endpunkte ohne Session**, und **End-to-End-Prozesse** (Abrechnung/Invoicing über alle Pfade) — siehe Abschnitt 14–16.

---

## 1. Architektur-Schichten und Domains

| Schicht | Rolle | Beleg im Code |
|--------|--------|----------------|
| Marketing / CMS-Static | Öffentliche Startseite, Partner-Statusseite | `artifacts/api-server/src/app.ts` (Static `staticRoot`, Routes `/`, `/partner/anfrage-status`), `artifacts/api-server/static/` |
| API-Host | REST, OAuth-Callbacks, JWT-Sessions | `app.use("/api", router)` und `app.use(router)` — **doppeltes Mount** ermöglicht dieselben Pfade mit und ohne `/api`-Prefix (`artifacts/api-server/src/app.ts`) |
| Admin-Panel SPA | Plattform-Operator | `artifacts/admin-panel`, Auslieferung unter Host `admin.onroda.de` → `/partners/` (`app.ts`) |
| Partner-Panel SPA | Mandanten-Arbeitsplatz | `artifacts/partner-panel`, Host `panel.onroda.de` (`app.ts`) |
| Mobile | Kunde + Fahrer-Flows | `artifacts/mobile` |

**Produktarchitektur (Rollen):** `.cursor/rules/imoove-product-architecture.mdc`, `AGENTS.md` — Admin vs Partner vs Kunde vs Fahrer **nicht vermischen**.

---

## 2. API-Routing (Zusammenführung)

Zentrale Router-Kette: `artifacts/api-server/src/routes/index.ts` — Reihenfolge u. a. `health`, `appConfigApi`, `auth`, `panelAuth`, `fleetAuth`, `fleetDriverApi`, `panelApi`, `adminApi`, `customerApi`, **`ridesRouter` zuletzt**.

**Kanonische Präfixe (Auswahl):**

| Bereich | Beispiel-Pfade | Datei |
|---------|----------------|--------|
| Health | `GET /healthz`, `GET /api/healthz` | `routes/health.ts` + Mount in `app.ts` |
| App-Config (öffentlich) | `GET /app/config`, `GET /app/pricing`, `GET /app/news`, `GET /app/sponsors` | `routes/appConfigApi.ts` → effektiv `/api/app/...` **oder** `/app/...` je nach Mount |
| Kunde (Session-JWT) | `GET /api/customer/v1/rides`, `GET /api/customer/v1/rides/:id` | `routes/customerApi.ts` |
| Taxi-Fahrer (Fleet-JWT) | `GET /api/fleet-driver/v1/me`, `GET /api/fleet-driver/v1/market-rides`, `GET /api/fleet-driver/v1/scheduled-rides` | `routes/fleetDriverApi.ts` |
| Partner | `GET /api/panel/v1/rides`, `POST /api/panel/v1/rides`, … | `routes/panelApi.ts` |
| Admin (JSON-Teil) | Unter `router.use("/admin", adminJson)` mit Bearer — siehe `adminApi.ts` | `routes/adminApi.ts` |
| Fahrten (öffentliche Teilmenge) | `POST /rides`, `PATCH /rides/:id/status`, `GET /rides/:rideId/receipt`, … | `routes/rides.ts` |

---

## 3. Datenmodell Fahrt — Rekonstruktion „end-to-end“

### 3.1 Tabelle `rides`

**Definition:** `artifacts/api-server/src/db/schema.ts` — `ridesTable` (Auszug der zentralen Felder):

- Identität / Mandant: `id`, `company_id`, `created_by_panel_user_id`
- Zeit: `created_at`, `scheduled_at`, `status`
- Teilnehmer: `customer_name`, `passenger_id`, `driver_id`
- Route: `from_*` / `to_*` (Label, Full-Text, Lat/Lon), `distance_km`, `duration_minutes`
- Preis: `estimated_fare`, `final_fare`, `payment_method`, `vehicle`, `pricing_mode`, `rejected_by`
- Abrechnungsprofil: `ride_kind`, `payer_kind`, `voucher_code`, `billing_reference`, `authorization_source`, `access_code_id`, `access_code_normalized_snapshot`, `customer_phone`
- Partner-Hotel/Medizin-Meta (nicht für öffentliche Pools): `partner_booking_meta`
- **Tarif-Freeze:** `tariff_snapshot_json`
- Barrierefreiheit: `accessibility_options_json`

**Insert & erstes Event:** `insertRide` in `artifacts/api-server/src/db/ridesData.ts` schreibt Zeile in `rides` und **`ride_events` mit `event_type: "ride_created"`**.

### 3.2 Tabelle `ride_events`

**Definition:** `ride_eventsTable` in `schema.ts` — pro Eintrag: `event_type`, `from_status`, `to_status`, `actor_type`, `actor_id`, `payload`, `created_at`.

**Statuswechsel:** `updateRide` in `ridesData.ts` erzeugt bei `status`-Änderung ein Event **`ride_status_changed`**. Zusätzliche Events: u. a. **`ride_reassigned`**, **`driver_offered`**, Release **`ride_released`** (Kommentar in `listAdminRideEventsByRideId`).

**Admin-Fahrtakte:** `listAdminRideEventsByRideId` — chronologische Liste für Operator-Sicht.

### 3.3 Finanzen: `ride_financials`, Rechnungen, Abrechnungen

**Definition:** `rideFinancialsTable` in `schema.ts` — `gross_amount`, `net_amount`, VAT, `commission_*`, `operator_payout_amount`, `billing_status`, `settlement_status`, `locked_at`, `calculation_metadata_json`, …

**Anlage bei Buchung:** Nach `POST /rides` wird `upsertRideFinancialSnapshot` aufgerufen (`rides.ts` nach `insertRideWithOptionalAccessCode`).

Weitere Tabellen (Auszug): `invoices`, `invoice_items`, `settlements` — siehe `schema.ts`.

### 3.4 Migrationen

Unter `artifacts/api-server/src/db/migrations/` liegen **58 nummerierte `.sql`-Dateien** (Stand Repo: `001_…` bis `058_…`), u. a.:

- `024_ride_events_status_history.sql`
- `027_fleet_legal_type_and_ride_pricing_mode.sql`
- `028_financial_core_tables.sql`
- `029_ride_financials_epic2_locking_and_statuses.sql`
- `051_rides_tariff_snapshot_json.sql`
- `053_rides_accessibility_options.sql`
- `049_app_operational_mvp.sql`

Deploy-Reihenfolge und Schema-Check: `AGENTS.md`, `scripts/verify-onroda-db-schema.sql`.

---

## 4. Buchungsweg Kunde — `POST /rides`

**Implementierung:** `artifacts/api-server/src/routes/rides.ts` (`router.post("/rides", …)`).

**Wesentliche serverseitige Schritte (belegbar im selben Handler):**

1. **Authentifizierung:** `customerName` + `passengerId` Pflicht — sonst **401** (Mobil-OAuth-Session-Kontext auf Client-Seite; Server prüft die Felder).
2. **Validierung:** Adressen mit Hausnummer (`hasHouseNumberInFirstAddressPart`), optional Koordinaten-Pflicht je Region (`anyActiveRegionRequiresClientCoordinates`).
3. **Betriebs-Kill-Switch / Region:** `getOperationalConfigPayload`, `assertPlatformNewRideAllowed`, `assertCustomerFromFullInActiveServiceRegion`, `checkCustomerRideServiceArea`.
4. **Tarife aktiv:** u. a. `tariffs.active` Check.
5. **Preis:** `computeRideBookingPricing` → `assertClientEstimatedFareMatchesServer` (Client-Preis muss mit Server übereinstimmen).
6. **Persistenz:** `insertRideWithOptionalAccessCode` → `ride_events` `ride_created`.
7. **Finanz-Snapshot:** `upsertRideFinancialSnapshot` mit `reason: "ride_created"`.
8. **Antwort:** Partner-sensible Felder gestrippt (`stripPartnerOnlyRideFields`).

**Kundenliste:** `GET /api/customer/v1/rides` / `GET /api/customer/v1/rides/:id` mit `requireCustomerSession`, Filter pro Passagier (`findRideForPassenger`) — `customerApi.ts`.

---

## 5. Status & Dispatch — `PATCH /rides/:id/status`

**Implementierung:** `rides.ts` — `router.patch("/rides/:id/status", …)`.

**Steuerung wer darf:**

- `resolveRideMutateActor` / `authorizePatchRideStatusForActor` — `artifacts/api-server/src/lib/rideRouteAuth.ts`
- Reihenfolge der Identität: **Fleet-JWT** → **Kunden-Session-JWT** → **Admin-Bearer**
- Admin: voller Zugriff; Kunde nur **`cancelled_by_customer`** mit Passagier-Match; Fahrer: u. a. **Accept** nur mit `driverId` = eigener Fleet-ID und Readiness/Capability-Checks (`getFleetDriverReadinessById`, `getFleetDriverCapability`, `isRideCompatibleWithCapability`)

**Race bei „Accept“:** Kein explizites DB-„Claim“-Lock in diesem Abstract beschrieben — gleichzeitige Accept-Versuche sind ein bekanntes Review-Thema (betrifft Konkurrenz mehrerer Fahrer).

---

## 6. Taxi-Fahrer — Fleet-API

**Belege:** `fleetDriverApi.ts`

- `GET /fleet-driver/v1/market-rides` — Markt-Pool (gefiltert u. a. gegen `scheduled`)
- `GET /fleet-driver/v1/scheduled-rides` — nur `scheduled`
- Auth: `requireFleetDriverAuth`

Zusätzliche Fahrten-Routen in `rides.ts`: u. a. `POST /rides/:id/reject`, `driver-cancel`, `driver-hard-cancel`, `fleet-snapshot` mit Fleet-Auth bzw. gemischter Auth-Logik.

---

## 7. Partner-Panel

**Belege:** `panelApi.ts` — `requirePanelAuth`, mandantenbezogene Queries über Panel-Session / `company_id` (Details in den jeweiligen Handlern).

Beispiel-Endpunkte: `GET /panel/v1/rides`, `POST /panel/v1/rides`, `GET /panel/v1/company`, Support-Threads, Revenue-Export.

**UX-/Rollenregel:** `.cursor/rules/imoove-panel-ux-separation.mdc` — Sprache **„Ihr Unternehmen“**, nicht Operator-Plattform-Sprache.

---

## 8. Admin / Operator

**Zwei Aspekte:**

1. **Klassisches Admin-JSON** unter `/admin/…` mit Bearer — siehe `adminApi.ts`, `router.use("/admin", adminJson)`.
2. **Admin-Auth-User** (Login, Passwort, Userliste): Routen `POST /admin/auth/login`, `GET /admin/auth/me`, … — ebenfalls in `adminApi.ts`.

**Dokumentierter Historien-Fix:** Admin-Bearer darf **nicht** die gesamte App vor `GET /rides` legen — siehe `docs/onroda-operator-panel-and-api-risks.md`.

**Globale Fahrtenliste:** Früher Risiko `GET /rides` ohne Auth — laut interner Doku **behoben** durch Entfernung / Verlagerung auf `GET /api/admin/rides` mit Bearer (`docs/onroda-operator-panel-and-api-risks.md`). Im aktuellen `rides.ts` existiert **kein** `router.get("/rides"` mehr (Prüfung per Suche).

---

## 9. Öffentliche / halböffentliche Fahrten-Endpunkte (Review-Punkte)

| Route | Auth laut Handler | Risiko / Hinweis | Datei |
|-------|-------------------|------------------|-------|
| `GET /rides/:rideId/receipt` | **Keine** explizite Session in gezeigtem Handler — `findRide` + HTML | Jeder mit `rideId` kann HTML-Quittung abrufen | `rides.ts` |
| `POST /rides/:rideId/support` | **Keine** — In-Memory-Map `customerSupportTickets` | Keine Persistenz, kein Spam-Schutz auf DB-Ebene | `rides.ts` |
| `POST /rides` | Feld-Pflicht `passengerId` / `customerName`, aber kein Bearer in diesem Router | Missbrauchspotenzial wenn Client-Werte fälschen kann | `rides.ts` |

**PATCH /rides/:id/status:** unauthenticated Actor → `authorizePatchRideStatusForActor` verweigert (**401/403**) — `rideRouteAuth.ts`.

---

## 10. App-Konfiguration & Mobile-Zulieferung

**Routen:** `GET /app/config`, `/app/pricing`, `/app/news`, `/app/sponsors` — `appConfigApi.ts`, Daten u. a. `getAppConfigForPublic`, `listAppSponsorsPublic` (`db/appOperationalData.ts`, `db/appSponsorsData.ts`).

**Sponsoren:** Migration `058_app_sponsors.sql` (siehe Migrationsliste).

---

## 11. Kern-Policy (Taxi / Matching / Storno)

Verbindliche Produktregeln: `docs/onroda-core-policy-taxi-mietwagen-storno.md` — u. a. `pricing_mode`, Taxi-Match nur `vehicle_legal_type = taxi`, kein Fallback Fahrzeug, Storno-UX ab Status „Fahrer wird gesucht“.

Umsetzung im Code: u. a. `computeRideBookingPricing`, Fleet-Matching (`fleetMatchingData.ts`), Storno-Gebühren-Evaluation in `PATCH` für `cancelled_by_customer` (`evaluateCustomerCancellationFeeEur`).

---

## 12. Krankenfahrt / Medical (API-Teil)

Routen in `rides.ts` (Auswahl):

- `GET /rides/:id/medical/qr-payload` — `requireCustomerSession`
- `POST /rides/:id/medical/verify-qr` — `requireFleetDriverAuth`
- `POST /rides/:id/medical/transport-document` — `requireFleetDriverAuth`, großes JSON-Body-Limit in `app.ts`
- `POST /rides/:id/medical/signature` — `requireFleetDriverAuth`

---

## 13. Homepage / CMS

API: `publicHomepageApi.ts` (nicht vollständig zitiert in dieser Analyse — ergänzt Content-Module).  
Migrationen: u. a. `037_homepage_placeholders.sql`, `038_homepage_content_cms.sql`, `040_homepage_content_services_manifest.sql`.

Static: `artifacts/api-server/static/` — Auslieferung Host-abhängig in `app.ts`.

---

## 14. Ist-Zustand — Zusammenfassung

| Thema | Bewertung | Beleg |
|-------|-----------|--------|
| Fahrt als DB-Objekt + Historie | **Stark** | `rides`, `ride_events` in `schema.ts`; `insertRide`, `updateRide` in `ridesData.ts` |
| Tarif-Snapshot bei Buchung | **Implementiert** | `tariff_snapshot_json`, `computeRideBookingPricing` |
| Finanz-Snapshot pro Fahrt | **Implementiert** | `ride_financials`, `upsertRideFinancialSnapshot` |
| Mandantentrennung Partner | **Stark** | `panelApi` + `company_id` |
| Admin-Globalsteuerung | **Stark** | `adminApi`, Bearer, getsonderte `/admin`-Mounts |
| Öffentliche Quittung / Support | **Lückenhaft / risikobehaftet** | `receipt`, `support` in `rides.ts` |
| Support-Tickets | **Nicht produktionsreif** | In-Memory Map in `rides.ts` |
| Vollständige Audit-Actors auf jedem Event | **Teilweise** — `updateRide` setzt `actor_type` teils `system`; detaillierte Actor-Persistenz pro Event bitte im Code vergleichen |

---

## 15. Lücken & Risiken (priorisiert)

### P0 — vor breitem Live-Gang klären

1. **Quittung & sensible Fahrtdaten:** `GET /rides/:rideId/receipt` ohne Auth — **Information Disclosure** per Rate/Enumeration (`rides.ts`).
2. **Support:** Nur RAM — bei API-Neustart **verlust** (`customerSupportTickets` in `rides.ts`).
3. **Race beim Dispatch** — parallele **Accept** — verifizieren ob DB-Constraint/Transaction ausreicht (Patch-Pfad `accepted`).

### P1 — Betrieb & Compliance

4. **End-to-End Finanz:** Rechnungs-/Settlement-Prozesse mit Panel-Actions (`create-invoice` etc.) gegen `ride_financials.lock*` und Storno-Pfade testen.
5. **Medical-Dokumente:** Ablage, Aufbewahrung, Löschkonzept — an Upload-Pfaden (`medical/transport-document`, `signature`) und Storage-Keys knüpfen.

### P2 — UX/Produkt

6. Mobile/Admin/Partner-Konsistenz der Statusbegriffe für Endnutzer.
7. Homepage/CMS-Redaktion: Workflow außerhalb API (Inhalte pflegen).

---

## 16. Go / No-Go

| Kriterium | Einschätzung |
|-----------|--------------|
| Kern Buchung + Dispatch nach Policy | **Go** (mit Review öffentlicher Endpunkte) |
| Datenschutz-sensible Belege öffentlich abrufbar | **No-Go** bis Token oder rate-limit / Authentisierung |
| Support als Nachweis für SLA | **No-Go** (In-Memory) |

**Gesamt:** **Go mit Auflagen** — P0-Punkte adressieren oder explizit als bekannte Restrisiken dokumentieren und kommunizieren.

---

## 17. Konkrete nächste Schritte

1. **Receipt:** Zugriff auf Session (Passagier) oder signiertes, kurzlebiges Token in der Mobile-App verknüpfen; alternativ minimale Daten ohne PII.
2. **Support:** Persistenz (Tabelle existiert/lieferbar machen — siehe Migration `047_ride_support_tickets.sql` im Repo) und Brücke zum CRM.
3. **Concurrent Accept:** DB- oder Application-Lock für Transition nach `accepted`.
4. **Smoke-Tests:** Checkliste in `docs/onroda-operator-panel-and-api-risks.md` ausführen.

---

## 18. Auswirkungen (Cross-Impact-Kurzblock)

1. **API/DB:** ja — beschreibt Ist-API und Tabellen.  
2. **Admin-Panel:** bezogen (Operator, Bearer).  
3. **Partner-Panel:** bezogen (Mandanten-API).  
4. **Fahrer-App / Mobile:** bezogen (Buchung, Fleet-Endpunkte).  
5. **Homepage:** bezogen (Static/CMS-Hinweis).  
6. **Timeline/Audit:** teils (`ride_events`).  
7. **E-Mail:** n. a. in dieser Analyse.  
8. **Rechte:** ja — `rideRouteAuth.ts`, Panel/Admin-Trennung.

---

*Diese Datei ersetzte eine frühere, nicht persistierte Entwurfsvariante und stellt den Analyse-Neuaufbau „von vorn“ dar.*
