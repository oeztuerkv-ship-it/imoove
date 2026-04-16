# ONRODA – E2E QUICK CHECK (1-SEITE, AUSGEFUELLT)

## Ziel

Schneller Team-Durchlauf vor Release (5–10 Minuten)

Status-Legende:
- `OK` = bestanden
- `FEHLER` = Abweichung
- `NICHT GETESTET` = noch offen

---

## 1. Homepage

- [ ] Taxi / Mietwagen / XL / Rollstuhl sichtbar - `NICHT GETESTET`
- [ ] Keine Debug-Texte - `NICHT GETESTET`
- [ ] Mobile Ansicht sauber (keine abgeschnittenen Elemente) - `NICHT GETESTET`
- [ ] Buttons funktionieren - `NICHT GETESTET`

---

## 2. Pricing / Auswahl

- [ ] Taxi -> `pricing_mode = taxi_tariff` - `NICHT GETESTET`
- [ ] Mietwagen -> `pricing_mode = fixed_price` - `NICHT GETESTET`
- [ ] Kein Ride ohne `pricing_mode` - `NICHT GETESTET`

---

## 3. Matching (Kernprüfung)

- [ ] Taxi -> nur Taxi-Fahrer sehen Anfrage - `NICHT GETESTET`
- [ ] Mietwagen -> nur Mietwagen-Fahrer sehen Anfrage - `NICHT GETESTET`
- [ ] XL -> nur XL-Fahrzeuge - `NICHT GETESTET`
- [ ] Rollstuhl -> nur Rollstuhl-Fahrzeuge - `NICHT GETESTET`

---

## 4. Fehlannahme

- [ ] Falscher Fahrer kann NICHT annehmen - `NICHT GETESTET`
- [ ] API gibt `409 no_matching_vehicle_available` - `NICHT GETESTET`

---

## 5. Storno (kritisch)

- [ ] Während Suche -> sofort zurück zur Startseite - `NICHT GETESTET`
- [ ] Kein Popup / kein Pflichtfeld - `NICHT GETESTET`
- [ ] Keine weitere Suche sichtbar - `NICHT GETESTET`

---

## 6. Kein Fahrzeug verfügbar

- [ ] Klare Meldung - `NICHT GETESTET`
- [ ] Keine Endlossuche - `NICHT GETESTET`
- [ ] Kein falsches Matching - `NICHT GETESTET`

---

## 7. Fahrtenliste

- [ ] Aktive Fahrten korrekt - `NICHT GETESTET`
- [ ] Stornierte Fahrten NICHT aktiv - `NICHT GETESTET`
- [ ] Stornierte Fahrten nur im Verlauf - `NICHT GETESTET`

---

## 8. Reload-Test

- [ ] App neu starten waehrend/ nach Fahrt - `NICHT GETESTET`
- [ ] Status bleibt korrekt - `NICHT GETESTET`
- [ ] Keine "Geister-Fahrten" - `NICHT GETESTET`

---

## 9. Logs (nur bei Fehlern)

- [ ] Ride-ID notiert - `NICHT GETESTET`
- [ ] API Status notiert - `NICHT GETESTET`
- [ ] Screenshot gemacht - `NICHT GETESTET`

---

## Freigabe

- [ ] Alle Punkte OK -> Release moeglich - `NICHT GETESTET`
- [ ] Mind. 1 Fehler -> kein Release - `NICHT GETESTET`

---

## Ergebnisblock (ausfuellen)

- Testdatum:
- Tester:
- Build/Commit:
- Gesamtstatus: `NICHT GETESTET`
- Anzahl `OK`:
- Anzahl `FEHLER`:
- Anzahl `NICHT GETESTET`:

## Fehlerdetails (nur falls FEHLER)

- Fehler-ID:
- Bereich (Homepage/Pricing/Matching/Storno/Reload):
- Ride-ID:
- API-Status:
- Kurzbeschreibung:
- Reproduzierbar (Ja/Nein):
- Screenshot/Video:
