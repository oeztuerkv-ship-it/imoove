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
- `POST /api/admin/auth/password-reset/request` (neutral, ohne User-Leak)
- `POST /api/admin/auth/password-reset/confirm` (token + neues Passwort)
- `POST /api/admin/auth/password-reset/issue-link` (admin-only, Phase-A manuelle Zustellung)

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

## Passwort-vergessen (Phase A)

- Versandweg-Entscheidung: **E-Mail-Link**.
- Phase A liefert persistente Reset-Mechanik:
  - Tabelle `admin_auth_password_resets` (gehashte Tokens, expires_at, used_at)
  - Audit in `admin_auth_audit_log`
  - `session_version`-basierte Session-Invalidierung nach Passwortwechsel/Reset
- Phase B bindet den echten Mailversand an.

## Verbindliche Produktions-Baseline (Admin-Passwort-Reset)

Ab Release-Stand mit Fix **Enumeration-/Debug-Leak** (`password-reset/request` liefert in **Produktion** nie Debug-Felder; siehe `artifacts/api-server/src/routes/adminApi.ts`): Diese Zeile ist die **verbindliche Referenz** fuer Admin-Auth-Reset-Verhalten in Production. Aenderungen daran nur bewusst, mit Security-Review und erneuter Live-Abnahme.

### `POST /api/admin/auth/password-reset/request` (Production)

- **HTTP 200** sowohl bei bekannter als auch bei unbekannter Identitaet (kein User-Existenz-Leak ueber Statuscode).
- **Identische** Außen-`message` in beiden Faellen.
- **Antwort-JSON** ausschliesslich `{ "ok": true, "message": "<fester Hinweistext>" }` — **keine** zusaetzlichen Keys, insbesondere **kein** `debugResetToken`, **kein** `debugResetExpiresAt`.
- Debug-Token in der Response nur in **Nicht-Produktion** und nur bei gesetztem `ADMIN_AUTH_RESET_DEBUG_TOKEN_RESPONSE=1` (lokal/CI); **niemals** bei `NODE_ENV=production`, unabhaengig von anderen Env-Variablen.

### Reset-Flow (Live abgenommene Eigenschaften)

- Reset-Anfrage persistiert Token/Audit wie spezifiziert; **keine Enumeration** nach aussen (siehe oben).
- Reset mit **gueltigem** Token: Erfolg; **einmalige** Gueltigkeit des Tokens (`used_at`).
- **Abgelaufene/ungueltige** Tokens: erwarteter Fehlerpfad.
- Nach erfolgreichem Reset: **altes Passwort** ungueltig; **`session_version`** erhoeht — **bestehende JWTs** ungueltig.

### Regression

- Script: `npm run test:admin-password-reset` (inkl. gleicher JSON-Keys fuer Request-Responses wo anwendbar).
- Nach Deploy: kurzer Live-Check zwei Requests (bekannt/unbekannt) — gleiche `message`, gleiche Keys, keine Debug-Felder.

Reset-Test lokal/staging:

```bash
cd artifacts/api-server
ADMIN_AUTH_RESET_TEST_OLD_PASSWORD='...' npm run test:admin-password-reset
```
