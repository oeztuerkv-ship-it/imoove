# Onroda – E2E-Testplan (Homepage + App + Matching + Storno)

Ziel: kompletter manueller Team-Durchlauf mit Kunde + Fahrer parallel, inklusive API-Prüfpunkten.

## Voraussetzungen (einmalig)

- Geräte:
  - Kunde-App (Gerät A)
  - Fahrer-App Taxi (Gerät B)
  - Fahrer-App Mietwagen (Gerät C)
  - optional Fahrer XL/Rollstuhl (Gerät D/E)
- Backend/API erreichbar
- Fahrerprofile/Fahrzeuge korrekt gepflegt:
  - `vehicle_legal_type` (`taxi` / `rental_car`)
  - `vehicle_class` (`standard` / `xl` / `wheelchair`)
- Logs offen halten (API + App-Konsole)

---

## Testfälle (10 Pflichtfälle)

### TC01 – Homepage Smoke + Responsive

**Schritte**
- Homepage auf Handy öffnen (kleiner + normaler Screen).

**Erwartete UI**
- Services sichtbar: `Taxi`, `Mietwagen`, `XL`, `Rollstuhl`
- Keine Debug-Texte sichtbar (z. B. `DEBUG TARIF-ENTSCHEIDUNG`)
- Layout ohne Überlappungen/Abschneiden

**Erwartete API**
- Keine speziellen Fehler bei Initial-Calls

**Fehler**
- Fehlende Services, Debug-Ausgaben, Layout-Probleme

---

### TC02 – Tarifgebiet-Hinweis (Taxi, innerhalb Gebiet)

**Schritte**
- Kunde: Start/Ziel im Tarifgebiet setzen.
- `Taxi` auswählen.

**Erwartete UI**
- Tarif-Hinweistext (Taxitarif)
- Kein Festpreis-Hinweis

**Erwartete API**
- Ride enthält `pricing_mode = taxi_tariff`

**Fehler**
- Festpreis-Hinweis im Tarifgebiet
- `pricing_mode` fehlt/falsch

---

### TC03 – Festpreis-Hinweis (Mietwagen)

**Schritte**
- Kunde: `Mietwagen` auswählen.
- Strecke setzen (innerhalb oder außerhalb, je Produktlogik prüfen).

**Erwartete UI**
- Festpreis-/vorab vereinbart-Hinweis

**Erwartete API**
- Ride enthält `pricing_mode = fixed_price`

**Fehler**
- Tarif-Hinweis statt Festpreis-Hinweis
- `pricing_mode` fehlt/falsch

---

### TC04 – Matching Standard: Taxi sichtbar nur für Taxi-Fahrer

**Schritte**
- Kunde erstellt Standard-Taxi-Anfrage.
- Fahrer B (Taxi) und Fahrer C (Mietwagen) beobachten parallel.

**Erwartete UI**
- Anfrage nur bei Taxi-Fahrer sichtbar

**Erwartete API**
- Nur kompatibler Feed enthält Ride

**Fehler**
- Mietwagen-Fahrer sieht Taxi-Anfrage

---

### TC05 – Matching Standard: Mietwagen sichtbar nur für Mietwagen-Fahrer

**Schritte**
- Kunde erstellt Standard-Mietwagen-Anfrage.
- Fahrer B/C parallel beobachten.

**Erwartete UI**
- Anfrage nur bei Mietwagen-Fahrer sichtbar

**Erwartete API**
- Nur kompatibler Feed enthält Ride

**Fehler**
- Taxi-Fahrer sieht Mietwagen-Anfrage

---

### TC06 – XL-Filter greift zusätzlich

**Schritte**
- Kunde erstellt XL-Anfrage.
- Passende und unpassende Fahrerklassen beobachten.

**Erwartete UI**
- Nur `vehicle_class = xl` sieht Anfrage

**Erwartete API**
- XL-Fahrt wird nur XL-kompatibel gematcht

**Fehler**
- Standard-Fahrzeug bekommt XL-Anfrage

---

### TC07 – Rollstuhl-Filter greift zusätzlich

**Schritte**
- Kunde erstellt Rollstuhl-Anfrage.
- Passende und unpassende Fahrerklassen beobachten.

**Erwartete UI**
- Nur `vehicle_class = wheelchair` sieht Anfrage

**Erwartete API**
- Rollstuhl-Fahrt wird nur Wheelchair-kompatibel gematcht

**Fehler**
- Nicht-Wheelchair-Fahrzeug bekommt Anfrage

---

### TC08 – Falsche Annahme aktiv provozieren (409)

**Schritte**
- Inkompatibler Fahrer versucht Ride anzunehmen.

**Erwartete UI**
- Annahme wird abgelehnt

**Erwartete API**
- `409`
- `error = no_matching_vehicle_available`
- Meldung: `Aktuell kein passendes Fahrzeug verfügbar`

**Fehler**
- Inkompatible Annahme wird akzeptiert

---

### TC09 – Storno während „Fahrer wird gesucht“

**Schritte**
- Kunde startet Anfrage (noch nicht angenommen).
- Klick auf `Fahrt stornieren`.

**Erwartete UI**
- Sofort zurück zur Startseite
- Kein Popup
- Kein Pflichtgrund
- Kein sichtbares Weiterlaufen der Suche

**Erwartete API**
- Cancel wird im Hintergrund verarbeitet
- Status wird auf storniert gesetzt

**Fehler**
- UI blockiert, Popup-Pflicht, Ride bleibt aktiv/suchend

---

### TC10 – Kein Fahrzeug verfügbar + Fahrtenlisten-Konsistenz

**Schritte**
- Anfrage erzeugen, für die aktuell kein passender Fahrer online ist.
- Danach aktive Fahrten + Verlauf prüfen.

**Erwartete UI**
- Klare Nicht-Verfügbarkeit/Fehlermeldung
- Kein Fallback auf falsche Fahrzeuge
- Stornierte Fahrt nur im Verlauf sichtbar

**Erwartete API**
- Kein falsches Matching
- Bei inkompatibler Annahme 409

**Fehler**
- Endlossuche ohne klaren Zustand
- falsche aktive/stornierte Listenzuordnung

---

## Zusätzliche Pflichtprüfungen

### A) `pricing_mode` wirklich gesetzt (Taxi/Mietwagen)

Pro Taxi- und Mietwagen-Buchung verifizieren:
- Request-Payload enthält `pricing_mode`
- Taxi: `taxi_tariff`
- Mietwagen: `fixed_price`

Als Fehler gilt:
- Feld fehlt
- Feldwert vertauscht

### B) Reload-/Neustart-Test nach Storno / laufender Fahrt

1. Während aktiver Suche oder laufender Fahrt App schließen/neustarten.
2. App erneut öffnen.

Erwartung:
- Zustand wird konsistent wiederhergestellt
- stornierte Fahrt bleibt storniert (nicht wieder aktiv)
- laufende Fahrt zeigt korrekten aktuellen Status

Als Fehler gilt:
- Ghost-Status (wieder suchend/aktiv trotz Storno)
- Statussprung in falschen Zustand

### C) Optional später: Fahrer mit Fahrzeugwechsel

Szenario (wenn aktive Fahrzeugauswahl umgesetzt ist):
- Fahrer wechselt von Standard auf XL (oder Rollstuhl)
- geht erneut online
- bekommt nur zur neuen Fahrzeugklasse passende Rides

Als Fehler gilt:
- alte Klasse wird weiter verwendet
- Mischzuweisung nach Fahrzeugwechsel

---

## Protokollvorlage (pro Testfall ausfüllen)

- `TC-ID`:
- Kunde-Aktion:
- Fahrer sichtbar auf Geräten:
- UI-Ergebnis:
- API-Response (Status + Kerndaten):
- Ride-ID:
- Ergebnis: `OK` / `FEHLER`
- Screenshot/Video (bei Fehler):

---

## Fehleranhang (bei Abweichung immer mitsenden)

- Zeitpunkt (Uhrzeit)
- Umgebung (Gerät/Build/Branch)
- Ride-ID
- API Status + Body
- relevante Logs (z. B. Storno-Trace)
- Screenshot/Screenrecord
