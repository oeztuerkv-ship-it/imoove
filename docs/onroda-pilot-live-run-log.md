# ONRODA Pilot — Live-Abnahmeprotokoll

**Datum:** _______________  
**Tester:** _______________  
**Deploy-Stand:** `git rev-parse HEAD` = _______________  
**Mobile Build:** iOS buildNumber **25** (Commit `a9a98a66` oder neuer)  
**API:** https://api.onroda.de/api/healthz → ok

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

- [ ] Lokal: `main` enthält mindestens `a9a98a66` (Apple Pay) und `5cbcc080` (Tab-Navigation)
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

### Offene Produktentscheidung

**TEST-056 (Quittung MwSt):** Option B bestätigt als Zielbild — **noch nicht live**. Bis Umsetzung: Quittung zeigt nur ONRODA + Brutto (kein MwSt-Ausweis).

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
| Deploy + Mobile Build aktuell | ☐ Ja ☐ Nein |
| TEST-056 entschieden (A oder B) | ☐ Ja ☐ Nein |

**Pilotfreigabe:** ☐ GO ☐ NO-GO  
**Unterschrift / Datum:** _______________
