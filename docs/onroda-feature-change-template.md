# ONRODA Feature/Change Template (verbindlich)

Ziel: Jede größere ONRODA-Änderung wird nicht nur technisch, sondern auch betrieblich, rollenbasiert und end-to-end bewertet.

Verwendung:
- Für größere Features, Sprints, API-/DB-/Flow-Änderungen.
- Als Pflichtblock in Plan, PR-Beschreibung oder Sprint-Übergabe.
- Knapp ausfüllen: `ja` / `nein` / `n. a.` plus 1 Satz.

---

## 1) Ziel des Features

- Problem/Nutzen:
- Betroffene Hauptrolle(n):
- Erfolgskriterium im Betrieb:

## 2) Betroffene Bereiche

- Mobile:
- Driver:
- API:
- DB:
- Admin:
- Partner:
- Finance:
- Medical:
- Dispatch:
- Notifications:
- OCR/Extraction:
- Sonstige:

## 3) Datenfluss (E2E)

Input -> Validation -> API -> Speicherung -> Domain Mapping -> Customer View -> Driver View -> Admin View -> Partner View -> Finance/Audit

- Input:
- Validation:
- API:
- Speicherung:
- Domain Mapping:
- Customer View:
- Driver View:
- Admin View:
- Partner View:
- Finance/Audit:

## 4) Rollen / Rechte

- Wer darf lesen?
- Wer darf erstellen?
- Wer darf ändern?
- Wer darf stornieren/freigeben?
- Welche Route/Auth-Schicht setzt das durch?

## 5) Persistenz

- Wo gespeichert (Tabelle/Feld/JSON)?
- Überlebt Reload/Reconnect?
- Multi-Device/Multi-Session konsistent?
- Retry/Rollback bedacht?

## 6) Betriebslogik

- Reservierung:
- Fahrerwechsel:
- Storno:
- Dispatch:
- Offline/schlechte Verbindung:
- Race Conditions:
- Idempotenz:

## 7) Finance / Audit / Support

- Auswirkungen auf Billing/Settlement:
- Support-Nachvollziehbarkeit:
- Audit-/Timeline-Event nötig?
- Spätere OCR/Medical/Billing-Folgen:

## 8) Regression-Risiko

- Welche bestehenden Flows könnten brechen?
- Gegen welche Baseline geprüft? (z. B. `docs/onroda-stable-reference-baseline-2026-05-07.md`)
- Rückbau-/Fallback-Strategie:

## 9) Teststatus

- Lokal:
- API:
- Mobile:
- Driver:
- Admin/Partner:
- End-to-End:
- Edge Cases:

## 10) Auswirkungen (Kurzblock, Pflicht)

- API/DB betroffen?
- Admin betroffen?
- Partner betroffen?
- Fahrer betroffen?
- Kunde betroffen?
- Finance betroffen?
- Migration nötig?
- Deploy-Reihenfolge relevant?
- Breaking Change?

---

## Definition "Fertig" (ONRODA)

Ein Feature ist erst "fertig", wenn:
- Daten korrekt und persistent gespeichert sind,
- Rollenrechte sauber greifen,
- betroffene Oberflächen dieselbe Wahrheit sehen,
- Reload/Reconnect und relevante Betriebsfälle funktionieren,
- keine kritischen Folgebrüche in Support/Finance/Audit entstehen.
