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

## Passwort-vergessen (E-Mail-Link)

- `POST /api/admin/auth/password-reset/request`: Nutzer per **Benutzername oder E-Mail** (`identity`) auflösen, Token erzeugen, **Reset-Link** an die in der DB hinterlegte **E-Mail** senden (`sendMail` / Nodemailer). Die JSON-Antwort enthält **keinen** Token.
- SMTP/Absender: `ADMIN_AUTH_MAIL_SMTP_URL` + `ADMIN_AUTH_MAIL_FROM`, sonst Fallback `PARTNER_REGISTRATION_SMTP_URL` + `PARTNER_REGISTRATION_MAIL_FROM`. Ohne Konfiguration: kein Versand (Log), Antwort trotzdem neutral.
- Reset-Seiten-URL: `ADMIN_AUTH_PASSWORD_RESET_PAGE_URL` (Default `https://admin.onroda.de/partners/password-reset`).
- Mechanik:
  - Tabelle `admin_auth_password_resets` (gehashte Tokens, expires_at, used_at)
  - Audit in `admin_auth_audit_log` (u. a. `mailSent`, bei Fehlschlag `mailFailureReason`)
  - `session_version`-basierte Session-Invalidierung nach Passwortwechsel/Reset

## Verbindliche Produktions-Baseline (Admin-Passwort-Reset)

Verhalten und E-Mail-Versand sind in `artifacts/api-server/src/routes/adminApi.ts` und `src/lib/adminPasswordResetMail.ts` umgesetzt. Aenderungen nur bewusst, mit Security-Review und erneuter Live-Abnahme.

### `POST /api/admin/auth/password-reset/request`

- **HTTP 200** sowohl bei bekannter als auch bei unbekannter Identitaet (kein User-Existenz-Leak ueber Statuscode).
- **Identische** Außen-`message` in allen Faellen (bekannt/unbekannt, fehlende Nutzer-E-Mail, SMTP nicht konfiguriert).
- **Antwort-JSON** ausschliesslich `{ "ok": true, "message": "<fester Hinweistext>" }` — **keine** zusaetzlichen Keys, **niemals** Reset-Token oder Ablaufzeit in der Response (auch nicht in Entwicklung).

### Reset-Flow (Live abgenommene Eigenschaften)

- Bei gueltigem Nutzer mit hinterlegter E-Mail: Token in DB, Versandversuch, Audit (`mailSent` / `mailFailureReason`); **keine Enumeration** nach aussen (siehe oben). Ohne Nutzer-E-Mail: kein Token, nur Audit `password_reset_requested_no_recipient_email`.
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
