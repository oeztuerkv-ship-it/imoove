# Zugriffskontrolle (Onroda API)

Kurzüberblick über **drei getrennte Identitäten**: Plattform-Admin, Partner-Panel-Nutzer, Mobile-Fahrer-App.

## 1. Plattform-Admin (Operator-Konsole)

- **Pfade:** JSON unter `/api/admin/*` (siehe `src/routes/adminApi.ts`).
- **Auth:** `Authorization: Bearer <ADMIN_API_BEARER_TOKEN>` — Middleware `src/middleware/requireAdminApiBearer.ts`.
- **Rechte:** Vollzugriff auf alle in diesen Routen implementierten Operationen (Mandanten, globale Fahrten, Partner-Zugänge, …). Kein `panel_users.role`-Bezug.
- **Partner-Zugänge anlegen:** Jede gültige `PanelRole` (`owner`, `manager`, `staff`, `readonly`) ist erlaubt — unabhängig von Partner-internen Zuweisungsregeln.
- **Admin-DB-Zugänge:** `GET/POST/PATCH/DELETE /api/admin/auth/users` nur mit Rolle **`admin`** im JWT (nicht `service`). `DELETE` verweigert Selbstlöschung und Löschen des letzten **aktiven** `admin`-Kontos (`cannot_delete_self`, `last_active_admin`).

## 2. Partner-Panel (Unternehmen)

- **Pfade:** `/panel/v1/*` — `src/routes/panelApi.ts`.
- **Auth:** `Authorization: Bearer <Panel-JWT>` nach Login — `requirePanelAuth`, danach **DB-abgestimmtes** Profil via `findActivePanelUserProfileById` (`assertActivePanelProfile` in `panelApi.ts`). `POST /api/panel-auth/login` akzeptiert **Benutzername** oder (wenn eindeutig) **geschäftliche E-Mail** (`panel_users.email`).
- **Effektive Rolle:** kommt aus der **Datenbank** (`panel_users.role`), nicht allein aus dem JWT — bei Rollenänderung gilt nach erneutem Login das neue Token.
- **Berechtigungen:** zentrale Matrix in `src/lib/panelPermissions.ts` (`PanelPermission`, `panelCan`, `permissionsForRole`).
- **HTTP-403:** zentral über `denyUnlessPanelPermission` in `src/middleware/panelAccess.ts` (gleiche Semantik wie zuvor inline in `panelApi`).

### Rollen → Permissions (Kurz)

| Rolle    | Typische Nutzung |
|----------|------------------|
| `owner`  | Volle Partner-Rechte inkl. Nutzerverwaltung und Owner-Rolle vergeben. |
| `manager`| Wie Owner außer: **kein** weiterer `owner`, keine Änderung zu `owner`. |
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

## Verifikation nach Deploy

1. **Admin:** `curl -H "Authorization: Bearer …" https://api…/api/admin/health` (oder ein bekannter Admin-GET) → 200.
2. **Partner:** Login `POST /api/panel-auth/login`, dann z. B. `GET /panel/v1/me` mit Bearer → 200; mit `staff`-User `PATCH /panel/v1/users/…` → 403.
3. **Matrix:** In `panelPermissions.ts` eine Permission testweise entfernen, Build, erwarten 403 auf betroffener Route (Rollback vor Commit).
4. **Taxi-Fahrer:** `POST /api/fleet-auth/login` mit Testnutzer aus `fleet_drivers`, dann `GET /api/fleet-driver/v1/me` mit Bearer → 200; nach Sperren im Panel erneut `GET …/me` → 401/`token_revoked`.
