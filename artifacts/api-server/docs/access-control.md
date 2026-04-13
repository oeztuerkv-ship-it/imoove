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
- **Auth:** `Authorization: Bearer <Panel-JWT>` nach Login — `requirePanelAuth`, danach **DB-abgestimmtes** Profil via `findActivePanelUserProfileById` (`assertActivePanelProfile` in `panelApi.ts`).
- **Effektive Rolle:** kommt aus der **Datenbank** (`panel_users.role`), nicht allein aus dem JWT — bei Rollenänderung gilt nach erneutem Login das neue Token.
- **Berechtigungen:** zentrale Matrix in `src/lib/panelPermissions.ts` (`PanelPermission`, `panelCan`, `permissionsForRole`).
- **HTTP-403:** zentral über `denyUnlessPanelPermission` in `src/middleware/panelAccess.ts` (gleiche Semantik wie zuvor inline in `panelApi`).

### Rollen → Permissions (Kurz)

| Rolle    | Typische Nutzung |
|----------|------------------|
| `owner`  | Volle Partner-Rechte inkl. Nutzerverwaltung und Owner-Rolle vergeben. |
| `manager`| Wie Owner außer: **kein** weiterer `owner`, keine Änderung zu `owner`. |
| `staff`  | Fahrten & Lesen, kein Nutzermanagement / keine Firmen-Stammdaten-Änderung. |
| `readonly` | Nur Lesen + Passwort ändern. |

Details: Konstante `ROLE_MATRIX` in `panelPermissions.ts`.

### Partner-intern: Rolle zuweisen

`canPartnerAssignPanelRole(actor, target)` in `panelPermissions.ts`:

- **owner** → darf jede Zielrolle setzen.
- **manager** → nur `manager`, `staff`, `readonly`.
- **staff** / **readonly** → dürfen keine Nutzer anlegen/rollen ändern (zusätzlich blockiert durch fehlendes `users.manage`).

## 3. Mobile / Fahrer

- **Kein** Partner-Panel-JWT und **kein** Admin-Bearer.
- Eigener OAuth-/Session-Flow und App-Endpunkte — nicht über `panelPermissions` abgebildet.

## Verifikation nach Deploy

1. **Admin:** `curl -H "Authorization: Bearer …" https://api…/api/admin/health` (oder ein bekannter Admin-GET) → 200.
2. **Partner:** Login `POST /api/panel-auth/login`, dann z. B. `GET /panel/v1/me` mit Bearer → 200; mit `staff`-User `PATCH /panel/v1/users/…` → 403.
3. **Matrix:** In `panelPermissions.ts` eine Permission testweise entfernen, Build, erwarten 403 auf betroffener Route (Rollback vor Commit).
