# ONRODA Stable Reference Baseline (2026-05-07)

Dieser Stand gilt als stabile Ausgangsbasis der ONRODA-Plattform.

## Zweck

- Referenz-/Restore-Basis für kommende Änderungen.
- Neue Arbeiten müssen gegen diesen Stand auf Regressionen geprüft werden.
- Keine schnellen Fixes, die bestehende funktionierende Flows in anderen Bereichen brechen.

## Abgedeckte Systembereiche

- Mobile App (Customer)
- Fahrer-App
- API/Backend
- PostgreSQL-Schema
- Admin-Panel
- Partner-Panel
- Auth/Identity
- Dispatch/Matching
- Pricing/Tariflogik
- Reservierungen
- Krankenfahrt-/Medical-Flow
- Finance-/Settlement-Logik
- Homepage/CMS
- Nginx/Deploy-Struktur

## Stabiler Ist-Stand (funktionierend)

### Infrastruktur

- `onroda.de` = Website
- `admin.onroda.de` = Admin
- `panel.onroda.de` = Partner
- `api.onroda.de` = API
- PM2 + Nginx + Deploy-Flow stabil
- Healthchecks ok

### Mobile / Customer

- Reservierungsflow funktioniert end-to-end
- strukturierte Adressen
- passengerId-Sync auf Google-Identity
- `Meine Fahrten` korrekt
- Start/Ziel-Parsing vereinheitlicht
- Tauschen-Button korrekt
- estimate/distance/address-Probleme behoben

### Backend / API

- `/api/rides` deutlich gehärtet
- serverseitige Distanz-Fallbacks
- robustere Address-/POI-Validation
- estimate mismatch handling verbessert
- customer ride listing stabilisiert

### Admin / Partner

- Rollen-/Panelstruktur vorhanden
- Taxi-Unternehmer-Flow vorhanden
- Fleet-/Dokumenten-/Approval-Flow vorhanden
- CMS/Homepage-Module vorhanden

### Finance

- settlement hardening vorhanden
- double-booking protections vorhanden
- idempotency-Absicherung vorhanden

### Medical

- QR-/Transportdokument-/Billing-Foundation vorhanden
- OCR-/Muster4-Richtung vorbereitet

## Verbindliche Arbeitsweise ab diesem Referenzpunkt

Bei neuen Änderungen:

- immer gegen diesen Zustand testen
- keine alten Bugs wieder einführen
- keine schnellen Fixes, die andere Flows brechen
- Cross-Effekte auf Mobile/Admin/Partner/API/DB mitdenken

Vor größeren Änderungen zwingend:

1. betroffene Bereiche nennen
2. Risiko für bestehende Flows prüfen
3. bestehende stabile Flows nicht regressieren lassen

## Auswirkungen

1. API/DB betroffen? nein (nur Referenz-Dokumentation)
2. Admin-Panel betroffen? nein
3. Partner-Panel betroffen? nein
4. Fahrer-App betroffen? nein
5. Homepage/Onboarding betroffen? nein
6. Timeline/Audit nötig oder sinnvoll? n. a.
7. E-Mail/Benachrichtigung nötig? nein
8. Rechte-/Modul-Auswirkungen? nein
