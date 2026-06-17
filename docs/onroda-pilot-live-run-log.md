# ONRODA Pilot — Live-Abnahmeprotokoll

**Datum:** 2026-06-17  
**Tester:** Vedo + eingeladene Pilot-Tester  
**Deploy-Stand:** `146d0c00` (`origin/main`, nach `./scripts/deploy-onroda-production.sh`)  
**Mobile Build:** iOS **buildNumber 25** (`artifacts/mobile/app.json`)  
**API:** https://api.onroda.de/api/healthz → ok

### Enthaltene Commits (Stand Deploy)

| Commit | Inhalt |
|--------|--------|
| `a9a98a66` | Apple Pay SetupIntent-Fix |
| `5cbcc080` | Tab-Navigation Mobile (Fahrer) |
| `67e4ac27` | Quittung Option B: Mandant + MwSt auf Kundenquittung (TEST-056) |
| `760a2540` | Quick-Onboarding Mandant + Partner-Login |
| `146d0c00` | Unternehmensart änderbar, Archivieren, Admin-only Stammdaten (Konzession/Steuer/Bank) |

**Verifikation Server:** `cd /root/imoove && git rev-parse HEAD` → `146d0c00…`

---

## Session-Vorbereitung (vor LIVE-001)

### Team & Geräte

| Rolle | Wer | Gerät / Zugang |
|-------|-----|----------------|
| Kunde | | iPhone/Android, Expo Go oder TestFlight Build **25** |
| Fahrer | | Zweites Gerät, Testfahrer **ONLINE** |
| Operator | | `admin.onroda.de/partners/` (Bearer) |
| Partner (LIVE-009) | | `panel.onroda.de`, Freigabecode anlegen |
| Zahlung (LIVE-005) | | Stripe Dashboard (Live/Test je nach Umgebung) |

### Deploy & Build (Pflicht vor Start)

- [x] Lokal: `main` enthält `146d0c00` (Governance) inkl. `67e4ac27` (Quittung), `760a2540` (Quick-Onboarding), `a9a98a66` (Apple Pay), `5cbcc080` (Navigation)
- [ ] Server: `cd /root/imoove && ./scripts/deploy-onroda-production.sh` erfolgreich
- [ ] API: `curl -sS https://api.onroda.de/api/healthz` → HTTP 200, `ok`
- [ ] Mobile: iOS `buildNumber` **25** auf beiden Testgeräten
- [ ] Fahrer: Standort **Immer** erlaubt, Schalter **ONLINE**
- [ ] Kunde: Google-Login + ggf. Karte/Apple Pay hinterlegt

### Schnell-Check (5 Min.)

Siehe auch `docs/onroda-pilot-abnahme-checkliste.md` (30-Minuten-Flow Bar + Karte).

| # | Check | Erwartung | ☐ |
|---|-------|-----------|---|
| P1 | Kunde Login | Profil zeigt Name, kein JSON-Parse-Fehler | |
| P2 | Fahrer Markt | Dashboard lädt, ONLINE aktiv | |
| P3 | Admin Fahrtenliste | Letzte Testfahrten sichtbar | |
| P4 | Partner (nur LIVE-009) | Access-Code Modul, aktiver Code | |

### Empfohlene Testreihenfolge

1. **LIVE-002** — Basis: Annahme (vor Storno/Karte)
2. **LIVE-001** — Kein Fahrer (alle OFFLINE)
3. **LIVE-006** — Bar (einfacher Abschluss + Quittung)
4. **LIVE-005** — Karte/Apple Pay + Stripe Capture
5. **LIVE-004** — Storno nach Annahme
6. **LIVE-007** — Reservierung (nur wenn Pilot Mandant Reservierungen nutzt)
7. **LIVE-009** — Freigabecode (nur wenn Partner/Hotel im Pilot)

### Nachweise ablegen

Ordner z. B. `pilot-live-YYYY-MM-DD/` mit Unterordnern `kunde/`, `fahrer/`, `admin/`, `stripe/`.

### Offene Produktentscheidung / QA-Matrix (nicht Pilot-blockierend)

| ID | Thema | Pilot | Aufwand (grobe Schätzung, falls vor breitem Start) |
|----|-------|-------|------------------------------------------------------|
| **TEST-056** | Quittung MwSt | **Option B live** (`67e4ac27`) — Mandant + MwSt auf Quittung | — |
| **TEST-053** | Quittung per E-Mail | Nicht nötig für Pilot | **Mittel** (~2–4 Tage): HTML-Quittung + SMTP existieren; fehlt Trigger/Button „Per E-Mail senden“, Kunden-E-Mail aus Profil |
| **TEST-106** | Push an alle Kunden | Nicht nötig für Pilot | **Klein–mittel** (~1–2 Tage MVP): Fahrer-Broadcast-Vorlage + `passenger_expo_push_tokens`; Admin-UI analog Fahrer-Nachrichten |
| **TEST-134** | Provisionsreport | Nicht nötig für Pilot | **Mittel** (~3–5 Tage): Rohdaten/CSV (`billing/rides.csv`, Provision in `ride_financials`); fehlt gebündelter Perioden-Report/PDF für Buchhaltung |
| **TEST-135** | Steuerreport | Nicht nötig für Pilot | **Mittel–hoch** (~1–2 Wochen): MwSt-Aggregation pro Mandant/Zeitraum, rechtssichere Ausweisung — abhängig von Steuerberater-Vorgaben |

---

## LIVE-001 — Kein Fahrer verfügbar

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Alle Fahrer OFFLINE → Kunde Sofortfahrt (Bar) → 60 s warten → Admin prüfen.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Stripe | n/a |

---

## LIVE-002 — Fahrer nimmt an

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Fahrer ONLINE → Kunde bucht → Fahrer „Annehmen“ → Kunde sieht Fahrer.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Stripe | n/a |

---

## LIVE-004 — Kunde storniert nach Annahme

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Storno-Gebühr (€)** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Bis `accepted` → Kunde storniert mit Grund → Fahrer + Admin prüfen.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Stripe | n/a |

---

## LIVE-005 — Kartenzahlung inkl. Stripe Capture

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Endpreis (€)** | |
| **Stripe PaymentIntent-ID** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Karte oder Apple Pay → Setup 0 € → Fahrt abschließen → Stripe Dashboard + Quittung.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Screenshot Stripe | |

---

## LIVE-006 — Barzahlung

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Endpreis (€)** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Bar wählen → Fahrt → Fahrer „Bar erhalten“ → Quittung Kunde.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Stripe | n/a |

---

## LIVE-007 — Reservierung komplett

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Reservierung >60 min → Annehmen → Aktivieren → Fahren → Abschluss.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde | |
| Screenshot Fahrer | |
| Screenshot Admin | |
| Stripe | optional |

---

## LIVE-009 — Partnerbuchung mit Freigabecode

| Feld | Wert |
|------|------|
| **Ride-ID** | |
| **Access-Code** | |
| **authorization_source** | |
| **Ride-Status (final)** | |
| **Payment-Status** | |
| **Ergebnis** | ☐ BESTANDEN ☐ NICHT BESTANDEN |
| **Auffälligkeiten** | |

**Schritte:** Partner Code anlegen → Buchung mit Code → Fahrt → Partner Finance.

| Nachweis | Datei / Pfad |
|----------|----------------|
| Screenshot Kunde / Partner | |
| Screenshot Fahrer | |
| Screenshot Admin / Partner | |
| Stripe | n/a |

---

## Gesamturteil Pilotfreigabe

| Kriterium | Status |
|-----------|--------|
| Alle 7 LIVE-Tests BESTANDEN | ☐ Ja ☐ Nein |
| Deploy + Mobile Build aktuell (`146d0c00`, Build 25) | ☐ Ja ☐ Nein |
| TEST-056 Option B live (Quittung Mandant+MwSt) | ☐ Ja ☐ Nein |

**Pilotfreigabe:** ☐ GO ☐ NO-GO  
**Unterschrift / Datum:** _______________
