# QA-Runbook: Wochenlauf Negativsaldo + Geräte-Stichproben

**Zweck:** Ihr führt die Abnahme selbst auf Server/Gerät aus — **keine Tokens nach außen**.  
**Commit-Stand:** nach Deploy von `dd9a5ff0` (Push/Fleet/Homepage) bzw. neuerem `main`.

---

## 1. Wochenlauf mit echtem Negativsaldo (Server)

**Schnellweg (nach `git pull`):** Token nur aus Server-`.env`, nie echo’en.

```bash
cd /root/imoove
export COMPANY_ID='…'   # aktives taxi
./scripts/runbooks/run-weekly-commission-qa.sh dry    # Seed + dryRun
./scripts/runbooks/run-weekly-commission-qa.sh live   # Seed + dryRun:false
# Skip Seed beim zweiten Lauf: SKIP_SEED=1 ./scripts/runbooks/run-weekly-commission-qa.sh live
```

Dann UI §1.6–1.7.


### 1.1 Vorbereitung

```bash
cd /root/imoove   # Repo-Pfad ggf. anpassen
git rev-parse --short HEAD
git status -sb
```

Wählt ein **aktives Taxi-Unternehmen** (Partner-Login bekannt), z. B.:

```bash
# DATABASE_URL aus API-.env (nicht echo’en)
set -a
# shellcheck source=/dev/null
source artifacts/api-server/.env
set +a

psql "$DATABASE_URL" -c "
SELECT id, name, company_kind, is_active
FROM admin_companies
WHERE lower(trim(company_kind)) = 'taxi' AND is_active = true
ORDER BY name
LIMIT 20;
"
```

Notiert `COMPANY_ID=…` (z. B. `co-demo-1`).

### 1.2 Periode = letzte abgeschlossene Kalenderwoche (Mo–So Berlin)

```bash
# Zuverlässig per SQL (Berlin-Montag der Vorwoche = weeksAgo=1):
psql "$DATABASE_URL" -At -c "
WITH b AS (
  SELECT (now() AT TIME ZONE 'Europe/Berlin')::date AS d
)
SELECT
  (date_trunc('week', d)::date - 7)::text AS period_start,
  (date_trunc('week', d)::date - 1)::text AS period_end
FROM b;
"
```

PostgreSQL `date_trunc('week', …)` ist **Montag-basiert** (ISO) — passt zur API.

Exportiert:

```bash
export COMPANY_ID='…'          # aus 1.1
export PERIOD_START='YYYY-MM-DD'
export PERIOD_END='YYYY-MM-DD'
```

### 1.3 Seed: Bar-Fahrten mit negativem `operator_payout_amount`

Skript (idempotent über feste Ride-IDs):

```bash
export SEED_TAG="netting-qa-$(date +%Y%m%d)"
psql "$DATABASE_URL" \
  -v company_id="$COMPANY_ID" \
  -v period_start="$PERIOD_START" \
  -v period_end="$PERIOD_END" \
  -v seed_tag="$SEED_TAG" \
  -f scripts/runbooks/sql/seed-taxi-cash-negativsaldo-week.sql
```

Erwartung der Verifikation im SQL-Output:

- 3× `completed` + `payment_method=cash`
- Summe `operator_payout_amount` **&lt; 0** (typisch ca. **−24 €** bei 3× 8 € Provision)

### 1.3b `company_code` prüfen (nach Fix: Auto-Ensure + Migration 137)

Leerer `company_code` führte früher zu `company_code_required` beim Wochenlauf. Ab Fix: Nummervergabe setzt fehlende Codes nach; Deploy inkl. Migration **137** backfüllt Bestandsfirmen.

```bash
psql "$DATABASE_URL" -c "
SELECT
  count(*) FILTER (WHERE trim(coalesce(company_code, '')) = '') AS missing_company_code,
  count(*) AS total_companies
FROM admin_companies;
"
```

Erwartung nach Deploy/Migration: `missing_company_code = 0` (oder der Live-Lauf setzt den Code beim ersten Debt-Invoice).

### 1.4 Dry-Run (sollte `created_debt_invoice` vorschlagen)

Token **nur lokal auf dem Server** aus `.env` — nicht kopieren/chatten:

```bash
set -a
# shellcheck source=/dev/null
source artifacts/api-server/.env
set +a
# ADMIN_API_BEARER_TOKEN muss gesetzt sein

curl -sS -X POST "https://api.onroda.de/api/admin/finance/settlements/weekly-commission-run" \
  -H "Authorization: Bearer ${ADMIN_API_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":true,\"periodStart\":\"${PERIOD_START}\",\"periodEnd\":\"${PERIOD_END}\"}" \
  | tee /tmp/weekly-netting-dry.json | python3 -m json.tool | head -80
```

In `results[]` die Zeile zu `COMPANY_ID` prüfen:

- erwartetes `outcome`: **`created_debt_invoice`** (oder `skipped_existing` wenn schon gelaufen)
- `payoutAmount` negativ
- bei Dry-Run: noch keine persistente Invoice (oder nur Simulation laut Response)

### 1.5 Echter Lauf (`dryRun: false`)

```bash
curl -sS -X POST "https://api.onroda.de/api/admin/finance/settlements/weekly-commission-run" \
  -H "Authorization: Bearer ${ADMIN_API_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":false,\"periodStart\":\"${PERIOD_START}\",\"periodEnd\":\"${PERIOD_END}\"}" \
  | tee /tmp/weekly-netting-live.json | python3 -m json.tool | head -100
```

Notiert aus der Firmen-Zeile: `invoiceId`, `invoiceNumber`, `settlementId`.

DB-Check:

```bash
psql "$DATABASE_URL" -c "
SELECT i.id, i.invoice_number, i.status, i.total_gross, i.due_date,
       i.metadata_json->>'source' AS source
FROM invoices i
WHERE i.company_id = '${COMPANY_ID}'
  AND coalesce(i.metadata_json->>'source','') = 'cash_card_netting_weekly_commission'
ORDER BY i.created_at DESC
LIMIT 5;

SELECT s.id, s.settlement_number, s.direction, s.payout_amount, s.commission_invoice_id, s.status
FROM settlements s
WHERE s.company_id = '${COMPANY_ID}'
  AND s.period_start = '${PERIOD_START}'::date
ORDER BY s.created_at DESC
LIMIT 5;
"
```

### 1.6 Partner-Banner

1. Login **Partner-Panel** des Test-Unternehmens (`panel.onroda.de`).
2. Modul **Dashboard** (Taxi-Cockpit).
3. Erwartung: orangefarbenes Banner **„Sie schulden ONRODA: …“** + Rechnungsnummer.
4. Button **„Offene Rechnung anzeigen →“** → Finanzen / Rechnungen, Fokus auf die Invoice.
5. **Screenshot** Dashboard + Finanzen-Tab.

### 1.7 Admin: Reminder + mark-paid

1. Admin → **Wochen- / Monatsabrechnung** oder **Finanzen · Invoices**.
2. Filter Quelle **„Wochen-Provision (Netting)“** bzw. Deep-Link „Provisionsrechnungen öffnen“.
3. Invoice öffnen → **Zahlungserinnerung** senden (SMTP muss greifen; bei Fehler Code notieren).
4. Danach **Als bezahlt markieren**.
5. Partner-Dashboard neu laden: Banner sollte **weg** sein (keine offene Provisionsrechnung mehr).
6. **Screenshots** Admin-Detail vor/nach Paid + Partner nach Paid.

### 1.8 Aufräumen (empfohlen nach Abnahme)

```bash
psql "$DATABASE_URL" \
  -v company_id="$COMPANY_ID" \
  -v seed_tag="$SEED_TAG" \
  -f scripts/runbooks/sql/cleanup-taxi-cash-negativsaldo-week.sql
```

Settlement/Invoice der Testperiode nur löschen, wenn ihr sie nicht für Buchhaltung behalten wollt (manuell im Admin stornieren/mark-paid belassen — **kein** blindes DELETE auf `invoices` in Produktion ohne Absprache).

### 1.9 Was ihr zurückmeldet

- `outcome` + `invoiceNumber` / `settlementId` aus `/tmp/weekly-netting-live.json` (ohne Bearer)
- Screenshots: Partner-Banner, Admin Reminder/Paid
- Ob Banner nach Paid verschwunden ist

---

## 2. Google-Login Mobile (Gerät)

**Ziel:** Server-OAuth → Deep Link zurück in die App mit Session.

### Schritte

1. App mit aktuellem Build/Expo Go starten (`EXPO_PUBLIC_API_URL` = `https://api.onroda.de/api`).
2. Kunden-Bereich → **Mit Google anmelden** (nicht Fahrer-Login).
3. Browser/WebView öffnet Google-Consent.
4. Account wählen / bestätigen.
5. App springt zurück (Scheme `onroda://…/login-success` bzw. Expo-Go-`exp://…/--/login-success`).
6. Erwartung: eingeloggt (Name/E-Mail sichtbar), Startseite nutzbar, **kein** roter Fehler / kein Hängen auf leerer WebView.

### Worauf achten / typische Fehler

| Symptom | Wahrscheinliche Ursache |
|---------|-------------------------|
| 404 Login-Route | `EXPO_PUBLIC_API_URL` ohne `/api` |
| Redirect mismatch | Google Console Redirect = `https://api.onroda.de/api/auth/google/callback` |
| Zurück in App, aber kein Login | `returnUrl`/Scheme `onroda` in `app.json` |
| „Ungültiges Session-Token“ | API JWT / Callback-Fehler |

### Zurückmelden

- Gerät + iOS/Android + Expo Go vs. Dev/Store-Build  
- Screenshot Erfolg **oder** exakter Fehlertext  
- Ob Redirect zurück in die App geklappt hat (ja/nein)

---

## 3. Stichproben 4 / 6 / 7 / 8

### 3a — Punkt 4: WebSocket JWT beim Room-Join

**Server (ohne Token teilen):**

```bash
cd /root/imoove
pnpm --filter @workspace/api-server exec node --enable-source-maps ./dist/scripts/wsRideJoinAuthSelftest.mjs
```

Erwartung: Selftest **grün** (Exit 0).

**Optional Gerät:** Während einer aktiven Fahrt Kunden-`/status` offen lassen — Karte/Status aktualisiert sich; ohne gültige Session kein Join auf fremde `rideId` (schwer manuell zu missbrauchen; Selftest reicht).

### 3b — Punkt 6: kein Admin-PM2

```bash
pm2 list
# Erwartung: onroda-api (und ggf. onroda-partner-panel) — KEIN onroda-admin-panel

grep -n "name:" /root/imoove/ecosystem.config.cjs
```

### 3c — Punkt 7: Apple Pay UI (Kunde, iOS mit Wallet)

1. Buchung bis **Fahrt bestätigen** (`ride` / Fahrzeug gewählt).
2. Zahlung **Apple Pay** wählen.
3. Erwartung:
   - Hinweisbox **„Abrechnung nach Taxameter …“** (grün und/oder blaue Wallet-Box).
   - Beim Karten hinterlegen (Setup): PassKit-Label **„ONRODA – Karte hinterlegen, keine Abbuchung“**, Betrag **0,00 €**.
4. Screenshot Bestätigungsbildschirm + PassKit-Sheet (falls Setup greift).

Ohne Apple-Pay-fähigem Gerät: Screenshot nur der Taxameter-/Wallet-Boxen auf dem Bestätigungsscreen reicht als Teilergebnis.

### 3d — Punkt 8: Fahrer Netto nach Abschluss

1. Fahrer-App → ONLINE → Testfahrt bis **Fahrt beenden** (oder Historie einer abgeschlossenen Fahrt).
2. Erwartung: Modal/Overlay mit **Brutto**, **ONRODA-Provision**, **Dein Anteil / Ihr Anteil** (Netto = Brutto − Provision; Tip separat falls vorhanden).
3. Screenshot Modal.

---

## Kurz-Checkliste Rückmeldung an uns

- [ ] Wochenlauf live: `outcome` + Invoice-Nr.  
- [ ] Partner-Banner Screenshot  
- [ ] Admin Reminder + mark-paid Screenshots  
- [ ] Google-Login: ok / Fehlertext  
- [ ] WS-Selftest Exit-Code  
- [ ] `pm2 list` ohne Admin-App  
- [ ] Apple-Pay / Taxameter Screenshot  
- [ ] Fahrer-Earnings Screenshot  
