# Admin Auth: Persistenter DB-Flow

## Ziel

- Source of Truth fuer Admin-Logins ist `public.admin_auth_users`.
- `.env` (`ADMIN_PANEL_USERNAME`/`ADMIN_PANEL_PASSWORD`) dient nur als Bootstrap/Recovery.
- Sobald ein User in `admin_auth_users` existiert, gilt die DB fuer Login und Passwortwechsel.

## API-Endpunkte

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/change-password` (Session erforderlich)
- `GET /api/admin/auth/users` (nur Rolle `admin`)
- `POST /api/admin/auth/users` (nur Rolle `admin`)
- `PATCH /api/admin/auth/users/:id` (nur Rolle `admin`)

## Pflichtfaelle (A-D)

- **A Erstlogin ueber .env**
  - Falls DB-User fehlt, erfolgreicher Login ueber `.env` wird als gehashter User in DB persistiert.
  - Response enthaelt `authSource: "env_bootstrap"` beim Bootstrap-Fall.
- **B Passwortaenderung**
  - `change-password` schreibt neuen Hash in DB und aktualisiert `updated_at`.
  - Neues Passwort funktioniert, altes Passwort liefert `401 invalid_credentials`.
- **C Neuer Admin**
  - Anlage via `POST /admin/auth/users` erzeugt vollen Datensatz (`username`, `password_hash`, `role`, `is_active`, `created_at`, `updated_at`).
  - Direkter Login mit neuem User funktioniert sofort.
- **D Deaktivierter User**
  - Nach `is_active=false` liefert Login fuer diesen User `401 invalid_credentials`.

## Automatischer Smoke-Test

Script: `artifacts/api-server/scripts/test-admin-auth-flow.mjs`

Ausfuehrung:

```bash
cd artifacts/api-server
ADMIN_AUTH_BOOTSTRAP_USERNAME='...' \
ADMIN_AUTH_BOOTSTRAP_PASSWORD='...' \
npm run test:admin-auth
```

Optional:

- `ADMIN_AUTH_TEST_USERNAME`
- `ADMIN_AUTH_TEST_PASSWORD`
- `ADMIN_AUTH_TEST_PASSWORD_NEXT`
- `ADMIN_AUTH_TEST_API_BASE` (Default `http://127.0.0.1:3000/api`)
