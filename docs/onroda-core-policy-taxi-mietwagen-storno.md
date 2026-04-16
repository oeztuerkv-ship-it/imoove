# ONRODA – CORE POLICY (Taxi / Mietwagen / Storno)

## 1. Pricing Mode (verbindlich)

Für jede Fahrt MUSS ein eindeutiger `pricing_mode` gesetzt sein.

### Zuordnung

* `Taxi` → `pricing_mode = taxi_tariff`
* `Mietwagen` → `pricing_mode = fixed_price`
* `Konzession Auto` → `pricing_mode = fixed_price`

### Regel

* `pricing_mode` ist fachlich **Pflicht**
* kein Ride darf ohne klaren Preis-Modus ins Matching gehen

---

## 2. Matching-Regeln (hart, ohne Fallback)

### Taxi

* `pricing_mode = taxi_tariff`
* nur Fahrzeuge mit:

  * `vehicle_legal_type = taxi`

### Mietwagen / Festpreis

* `pricing_mode = fixed_price`
* nur Fahrzeuge mit:

  * `vehicle_legal_type = rental_car`

### Fahrzeugklassen zusätzlich

* `XL` → nur `vehicle_class = xl`
* `Rollstuhl` → nur `vehicle_class = wheelchair`

### Sicherheitsregel

* kein Match → KEIN Fallback
* stattdessen:

  * Fehler: `no_matching_vehicle_available`
  * Meldung: „Aktuell kein passendes Fahrzeug verfügbar“

---

## 3. Produktdefinition (verbindlich)

### `Konzession Auto`

* gehört zur **Mietwagen-/Festpreis-Schiene**
* behandelt wie:

  * `pricing_mode = fixed_price`
  * `vehicle_legal_type = rental_car`

Keine Mischlogik mit Taxi.

---

## 4. Storno-Flow (Kundensicht – verpflichtend)

Zustand: **„Fahrer wird gesucht“**

### Verhalten beim Klick auf „Fahrt stornieren“

Sofort:

* kein Popup
* kein Pflichtfeld
* Suchscreen endet sofort
* Navigation zurück zur Startseite

Im Hintergrund:

* API-Cancel läuft weiter
* Ride wird serverseitig storniert

Danach:

* Ride erscheint nur noch in:

  * Verlauf / Storniert
* NICHT mehr als aktiv / suchend

---

## 5. UX-Prinzip (übergreifend)

Bei kritischen Aktionen gilt immer:

### UI zuerst

* sofort sichtbare Reaktion

### Backend danach

* API / Sync / Refresh im Hintergrund

NICHT:

* UI auf API warten lassen

---

## 6. QA-Abnahme (Pflichttests)

Vor Release MUSS geprüft werden:

* Taxi-Fahrt → nur Taxi-Fahrer sehen sie
* Mietwagen-Fahrt → nur Mietwagen sehen sie
* XL → nur XL-Fahrzeuge
* Rollstuhl → nur Wheelchair-Fahrzeuge
* falsche Annahme → wird mit 409 geblockt
* kein Fahrzeug → saubere Fehlermeldung
* Storno während Suche → sofortiger Abbruch + korrekt in Verlauf

---

## 7. Ziel

* keine Vermischung von Taxi und Mietwagen
* klare Preislogik
* rechtssicheres Verhalten
* sofort verständliche UX für den Nutzer
