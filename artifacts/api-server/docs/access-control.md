# Zugriffskontrolle (Onroda API)

Kurzüberblick über **drei getrennte Identitäten**: Plattform-Admin, Partner-Panel-Nutzer, Mobile-Fahrer-App.

## 1. Plattform-Admin (Operator-Konsole)

- **Pfade:** JSON unter `/api/admin/*` (siehe `src/routes/adminApi.ts`).
- **Auth:** `Authorization: Bearer <ADMIN_API_BEARER_TOKEN>` — Middleware `src/middleware/requireAdminApiBearer.ts`.
- **Krankenkassen-Modus (Phase 1):** `GET/POST` unter `/api/admin/insurance/*` — `src/routes/adminInsuranceApi.ts` (kein Mix mit `/api/panel/v1/*`). Zusätzliche Durchsetzung: `canAccessInsurerAdminApi` in `src/lib/adminConsoleRoles.ts` (**admin**, **service**, **insurance**). Antworten sind **Whitelist-DTOs** (kein vollständiges `rides`-Rohobjekt, keine Koordinaten/ Klarnamen in der Kassen-Projektion).
- **Rechte:** Vollzugriff auf alle in diesen Routen implementierten Operationen (Mandanten, globale Fahrten, Partner-Zugänge, …) richtet sich nach den jeweiligen Handler-Prüfungen. Kein `panel_users.role`-Bezug.
- **Partner-Zugänge anlegen:** Jede gültige `PanelRole` (`owner`, `manager`, `staff`, `readonly`) ist erlaubt — unabhängig von Partner-internen Zuweisungsregeln.
- **Admin-DB-Zugänge:** `GET/POST/PATCH/DELETE /api/admin/auth/users` nur mit Rolle **`admin`** im JWT (nicht `service`). `DELETE` verweigert Selbstlöschung und Löschen des letzten **aktiven** `admin`-Kontos (`cannot_delete_self`, `last_active_admin`).
- **App-Neuigkeiten (Mobile-CMS):** `GET/POST/PATCH/DELETE /api/admin/app-news` — `src/routes/adminAppNewsRouter.ts`. Rechte wie Homepage-Hinweise: `canMutateAdminCompanies` (**admin**, **service**). Öffentlicher Lese-Endpunkt für die App: `GET /api/app/news` (ohne Bearer) unter `src/routes/appConfigApi.ts`.
- **App-Konfiguration / Tarife (öffentlich):** `GET /api/app/config` und `GET /api/app/pricing` (ohne Bearer) — `src/routes/appConfigApi.ts`. Keine Geheimnisse; finale Fahrtpreise weiterhin nur über serverseitige Buchung/Snapshot.

## 2. Partner-Panel (Unternehmen)

- **Pfade:** `/panel/v1/*` — `src/routes/panelApi.ts`.
- **Auth:** `Authorization: Bearer <Panel-JWT>` nach Login — `requirePanelAuth`, danach **DB-abgestimmtes** Profil via `findActivePanelUserProfileById` (`assertActivePanelProfile` in `panelApi.ts`). `POST /api/panel-auth/login` akzeptiert **Benutzername** oder (wenn eindeutig) **geschäftliche E-Mail** (`panel_users.email`).
- **Effektive Rolle:** kommt aus der **Datenbank** (`panel_users.role`), nicht allein aus dem JWT — bei Rollenänderung gilt nach erneutem Login das neue Token.
- **Berechtigungen:** zentrale Matrix in `src/lib/panelPermissions.ts` (`PanelPermission`, `panelCan`, `permissionsForRole`).
- **HTTP-403:** zentral über `denyUnlessPanelPermission` in `src/middleware/panelAccess.ts` (gleiche Semantik wie zuvor inline in `panelApi`).

### Rollen → Permissions (Kurz)

| Rolle    | Typische Nutzung |
|----------|------------------|
| `owner`  | Volle Partner-Rechte inkl. Nutzerverwaltung, Owner-Rolle vergeben und **`rides.funk_dispatch`** (Funk-Zuweisung an nächstgelegenen Fahrer, nur Taxi). |
| `manager`| Wie Owner außer: **kein** weiterer `owner`, keine Änderung zu `owner`, **kein** Funk-Dispatch. |
| `staff`  | Disponent: Fahrten lesen/erstellen, Flotte lesen, Freigabe-Codes lesen; **kein** Nutzer-Listing (`users.read`), **keine** Stammdaten-Änderung (`company.update`); Anfragen an die Plattform: `support.read` / `support.write`. |
| `readonly` | Lesen + Passwort ändern; Anfragen: `support.read` / `support.write`. |

Details: Konstante `ROLE_MATRIX` in `panelPermissions.ts`.

### Partner: Anfragen (Support-Threads)

- **Pfade:** `GET`/`POST` `/api/panel/v1/support/threads`, `GET` `/api/panel/v1/support/threads/:threadId`, `POST` `…/messages` — `src/routes/panelApi.ts`.
- **Modul:** `support` muss für den Mandanten aktiv sein (`panel_modules` / `company_kind`-Whitelist in `domain/panelModules.ts`).
- **Rechte:** `support.read` (Liste + Detail), `support.write` (neuer Thread + Nachricht). Daten strikt über `company_id` der Panel-Session.

### Admin: Partner-Anfragen (Inbox)

- **Pfade:** `GET` `/api/admin/support/threads`, `GET` `/api/admin/support/threads/:threadId`, `POST` `…/messages`, `PATCH` `…/:threadId` — `src/routes/adminApi.ts`.
- **Auth:** wie übrige geschützte Admin-JSON-Routen (`requireAdminApiBearer` + Admin-Session-JWT oder statischer Admin-Bearer).
- **Rechte:** `canMutateAdminCompanies` — derzeit **admin** und **service** (gleiche Linie wie z. B. Unternehmensanfragen / Stammdaten-Freigaben).

### Partner: Funk-Dispatch (Owner, Taxi)

- **Recht:** `rides.funk_dispatch` nur Rolle **`owner`** (`panelPermissions.ts`).
- **Create (Panel):** `POST /panel/v1/rides` mit `funkDispatch: true` (Sofortfahrt, `company_kind=taxi`).
- **Create (Mobile Owner):** `POST /fleet-driver/v1/rides/funk` — Fleet-JWT + `fleet_drivers.is_owner`; gleiche Assigner-Kette.
- **Verhalten:** exclusive Zuweisung an nächstgelegenen ONLINE-Fahrer (`dispatch_mode=funk`); Ablehnung/Timeout 45 s → Kette; Exhaustion → Status `no_driver` + `409 no_available_driver`.
- **Ohne Abrechnung:** kein PIN, kein Taxameter/`final_fare`, kein `ride_financials` / Provision (Telefon-Weiterleitung).
- **Verlauf:** `GET /panel/v1/rides/:rideId/funk-timeline` (Owner-Recht) bzw. `GET /fleet-driver/v1/rides/:rideId/funk-timeline` (Owner-Fleet).
- **Kein** Markt-Pool / Tier A/B / Broadcast-Push.

### Partner-intern: Rolle zuweisen

`canPartnerAssignPanelRole(actor, target)` in `panelPermissions.ts`:

- **owner** → darf jede Zielrolle setzen.
- **manager** → nur `manager`, `staff`, `readonly`.
- **staff** / **readonly** → dürfen keine Nutzer anlegen/rollen ändern (zusätzlich blockiert durch fehlendes `users.manage`).

## 3. Mobile / Fahrer (Kunde)

- **Kein** Partner-Panel-JWT und **kein** Admin-Bearer.
- Eigener OAuth-/Session-Flow und App-Endpunkte — nicht über `panelPermissions` abgebildet.

## 4. Taxi-Fahrer (Mandanten-Flotte)

- **Pfade:** `POST /api/fleet-auth/login`, `GET|POST /api/fleet-driver/v1/*` — siehe `src/routes/fleetAuth.ts`, `fleetDriverApi.ts`.
- **Auth:** eigenes HS256-JWT (`kind: fleet_driver`, Claim `sv` = `session_version` in `fleet_drivers`). Secret: `FLEET_DRIVER_JWT_SECRET` oder Fallback `PANEL_JWT_SECRET` / (nur Dev) `AUTH_JWT_SECRET`.
- **Mandant:** nur `admin_companies.company_kind = 'taxi'`; Login per E-Mail nur für aktive Zeilen (`access_status = active`, `is_active`).
- **Sperre:** Unternehmer setzt im Partner-Panel „Sperren“ → `session_version` wird erhöht; bestehende Tokens scheitern am nächsten API-Call mit `401 token_revoked` bzw. `403 driver_suspended`.
- **Verwaltung:** Partner-Routen unter `/api/panel/v1/fleet/*` — Rechte `fleet.read` / `fleet.manage` in `panelPermissions.ts`, Modul-Whitelist `taxi_fleet` (`domain/panelModules.ts`). **Kein** globaler Zugriff: alle Queries an `company_id` des Panel-JWT gebunden.

## 5. WebSocket Fahrt-Room (`/ws`)

- **Pfad:** `GET` Upgrade auf `/ws` (gleicher Host wie API, z. B. `wss://api.onroda.de/ws`).
- **Join:** Erste Nachricht muss `{ type: "join", rideId, token }` sein (alternativ `auth` statt `token`). **Ohne gültiges JWT kein Room-Join** — Fehlercodes `join_token_required`, `join_auth_invalid`, `join_forbidden`, `join_ride_id_required`, `join_ride_not_found`.
- **Akzeptierte Token:** Fleet-Fahrer-JWT (`kind: fleet_driver`, inkl. `access_status === active` wie HTTP), Kunden-Session-JWT (`googleId` = `rides.passenger_id`), Partner-Panel-JWT (`company_id` muss zur Fahrt passen).
- **Zuordnung:** `wsJoinPrincipalMatchesRide` in `src/lib/wsRideJoinAuth.ts` — Kunde nur eigene Fahrt, Fahrer nur zugewiesene Fahrt desselben Mandanten, Partner nur Fahrten des Mandanten.
- **Nach Join:** Location/Chat nur mit gebundener `rideId`; fremde `rideId` → `ride_id_mismatch`; ohne Join → `join_required`.
- **Idle:** Verbindung ohne Join innerhalb von 15 s → `join_timeout` + Close.
- **Status-Broadcast:** Cron und `PATCH /rides/:id/status` senden `ride:status:update` an den Room (`broadcastRideStatusChange` in `wsRideSocketHub.ts`).
- **Mobile:** `connectToRide` übergibt JWT via `readFleetJwtForWsJoin` / `readCustomerSessionJwtForWsJoin` (`artifacts/mobile/utils/wsJoinAuth.ts`).

## Verifikation nach Deploy

1. **Admin:** `curl -H "Authorization: Bearer …" https://api…/api/admin/health` (oder ein bekannter Admin-GET) → 200.
2. **Partner:** Login `POST /api/panel-auth/login`, dann z. B. `GET /panel/v1/me` mit Bearer → 200; mit `staff`-User `PATCH /panel/v1/users/…` → 403.
3. **Matrix:** In `panelPermissions.ts` eine Permission testweise entfernen, Build, erwarten 403 auf betroffener Route (Rollback vor Commit).
4. **Taxi-Fahrer:** `POST /api/fleet-auth/login` mit Testnutzer aus `fleet_drivers`, dann `GET /api/fleet-driver/v1/me` mit Bearer → 200; nach Sperren im Panel erneut `GET …/me` → 401/`token_revoked`.
