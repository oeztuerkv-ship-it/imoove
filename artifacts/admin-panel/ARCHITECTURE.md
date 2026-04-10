# Onroda System Architecture

## Ziel
Onroda wird als getrenntes, rollenbasiertes System aufgebaut:

- **Homepage** = öffentliche Website
- **Mobile App** = Kunden und Fahrer
- **Admin Panel** = Super-Admin / interne Verwaltung
- **Partner Portal** = Hotels, Krankenkassen, Praxen, Firmen, Gutscheinpartner
- **Unternehmer Portal** = Taxi-Unternehmen / Partnerbetriebe
- **API + Datenbank** = zentrale Logik und Datenquelle

Wichtiger Grundsatz:
**Preise, Tarife, Regeln, Partnerdaten und Freigaben dürfen nicht fest in der App stehen.**
Sie werden zentral über API und Datenbank gesteuert.

---

## Hauptsysteme

### 1. Homepage
Domain:
- `onroda.de`

Zweck:
- öffentliche Informationen
- Landingpage
- Kontakt
- Registrierung / Anfragen
- spätere Unternehmensinformationen

Keine direkten Admin-Funktionen.

---

### 2. Mobile App
Zweck:
- Kunden-App
- Fahrer-App
- Live-Fahrten
- Status
- Auftragsannahme
- Code-Prüfung
- Navigation
- Fahrtabschluss

Die Mobile App darf nicht die zentrale Verwaltungsoberfläche sein.

---

### 3. Admin Panel
Geplante Domain:
- `panel.onroda.de`

Zweck:
- zentrale Verwaltung durch Super Admin
- vollständige Systemkontrolle
- Tarife
- Regeln
- Partner
- Unternehmer
- Fahrer
- Fahrten
- Abrechnung
- Rollen
- Logs
- Systemeinstellungen

---

### 4. Partner Portal
Zweck:
- Hotels
- Krankenkassen
- Praxen / Kliniken
- Firmenkunden
- Bahn-/Gutscheinpartner

Funktionen:
- Fahrten anlegen
- Serienfahrten anlegen
- Codes erzeugen / sehen
- Status verfolgen
- Rechnungen / Abrechnungen sehen
- eigene Mitarbeiter verwalten

---

### 5. Unternehmer Portal
Zweck:
- Taxi-Unternehmen / Partnerbetriebe

Funktionen:
- eigene Fahrer verwalten
- eigene Fahrzeuge verwalten
- zugewiesene Fahrten sehen
- Fahrten bestätigen / bearbeiten
- Abrechnungen / Umsätze sehen
- Dokumente verwalten

---

### 6. API + Datenbank
Zweck:
- zentrale Quelle der Wahrheit
- alle Portale und Apps greifen auf dieselben Daten zu

Hier werden gespeichert:
- Tarife
- Fahrten
- Partner
- Unternehmer
- Fahrer
- Rollen
- Berechtigungen
- Rechnungen
- Dokumente
- Codes
- Systemregeln

---

## Rollenmodell

### Super Admin
Das ist der Hauptbetreiber.

Rechte:
- alles sehen
- alles ändern
- Tarife verwalten
- Partner freischalten / sperren
- Unternehmer freischalten / sperren
- Fahrer freischalten / sperren
- Rollen zuweisen
- Fahrten verwalten
- Abrechnungen verwalten
- Einstellungen ändern
- Logs sehen

---

### Admin Staff
Interne Mitarbeiter.

Rechte:
- nur freigegebene Bereiche
- z. B. Support, Fahrten, Freigaben
- keine vollständige Systemkontrolle
- kein Zugriff auf alles

---

### Partner Hotel
Rechte:
- Hotelkonto verwalten
- Mitarbeiter des Hotels verwalten
- Fahrten anlegen
- Fahrtenstatus sehen
- Codes sehen
- Rechnungen sehen
- keine globalen Systemrechte

Eigene Oberfläche:
- Gastname
- Abholort
- Ziel
- Kostenübernahme
- Buchungscode
- vergangene Buchungen

---

### Partner Krankenkasse
Rechte:
- medizinische Fahrten anlegen
- Serienfahrten anlegen
- Referenzen verwalten
- Status verfolgen
- Abrechnungen sehen

Eigene Oberfläche:
- Patient
- Behandlung / Fahrtgrund
- Genehmigungsnummer
- Serienfahrt
- Rollstuhl / Begleitperson
- Abrechnungsreferenz

---

### Partner Praxis / Klinik
Rechte:
- Patientenfahrten anlegen
- wiederkehrende Fahrten anlegen
- Fahrtstatus sehen
- Rechnungen sehen

---

### Partner Firma / Business
Rechte:
- Mitarbeiterfahrten anlegen
- Geschäftskundenfahrten sehen
- Rechnungen / Sammelabrechnung sehen

---

### Partner Bahn / Gutscheinpartner
Rechte:
- Gutschein- oder Referenzfahrten anlegen
- Codes erzeugen / prüfen
- Status und Abrechnung sehen

---

### Unternehmer
Rechte:
- eigene Firma verwalten
- eigene Fahrer verwalten
- eigene Fahrzeuge verwalten
- zugewiesene Fahrten sehen
- Status ändern
- Abrechnungsdaten sehen

Keine Rechte:
- keine globalen Tarife ändern
- keine anderen Unternehmer sehen
- keine Partnerdaten anderer sehen

---

### Fahrer
Rechte:
- eigene Fahrten sehen
- Aufträge annehmen
- Codes prüfen
- Fahrt starten
- Fahrt abschließen
- Status setzen

Keine Rechte:
- keine globalen Daten
- keine Verwaltung anderer Nutzer
- keine Tarifbearbeitung

---

## Rechteprinzip

Es gibt 2 Ebenen:

### 1. Portal-/Kontotyp
Beispiele:
- `super_admin`
- `admin_staff`
- `partner_hotel`
- `partner_health_insurance`
- `partner_clinic`
- `partner_business`
- `partner_rail`
- `taxi_company`
- `driver`

### 2. Feinrechte
Beispiele:
- `rides.create`
- `rides.view_own`
- `rides.view_all`
- `rides.assign`
- `rides.cancel`
- `fares.view`
- `fares.edit`
- `partners.manage`
- `companies.manage`
- `drivers.manage`
- `invoices.view`
- `invoices.export`
- `settings.edit`
- `users.manage`
- `logs.view`

Wichtig:
Nicht nur Menüs ausblenden.
Auch das Backend muss diese Rechte prüfen.

---

## Fahrtenlogik

Jede Fahrt soll mindestens diese Informationen haben:

- eindeutige Auftragsnummer
- Fahrtstatus
- wer die Fahrt angelegt hat
- Partnertyp
- Partner-ID
- Kunde / Fahrgast
- Abholort
- Ziel
- geplante Zeit
- Tarifregel
- Unternehmer / Fahrer-Zuweisung
- Code / Referenz
- Zahlungs- / Abrechnungsart
- Provisionsregel
- Historie / Zeitstempel

---

## Statusmodell für Fahrten

Empfohlene Status:

- `draft`
- `requested`
- `accepted`
- `assigned`
- `driver_arriving`
- `driver_waiting`
- `in_progress`
- `completed`
- `cancelled`
- `disputed`
- `billed`

---

## Code-System

Das System soll digitale Codes unterstützen.

### Typen
- Buchungscode
- Bestätigungscode
- Abschlusscode
- Partnerreferenz
- Abrechnungsreferenz

### Ziele
- Auftrag eindeutig zuordnen
- Fahrer absichern
- Partner absichern
- papierlose Abwicklung
- Missbrauch reduzieren

---

## Tarifsystem

Tarife dürfen nicht fest in der App stehen.

Das Tarifsystem soll später mindestens unterstützen:

- Grundpreis
- Kilometerpreis
- Zeit-/Wartepreis
- Nachtzuschlag
- Feiertagszuschlag
- Flughafenzuschlag
- Regionszuschlag
- Festpreis
- Sonderpreis
- Partnerpreis
- Krankenfahrtregel
- Serienfahrtenregel
- Stornoregel
- Provisionsregel

Tarife müssen zentral im Admin Panel gepflegt werden.

---

## Abrechnungssystem

Das System soll papierlose Abrechnung ermöglichen.

Mögliche Abrechnungsarten:
- Kunde zahlt direkt
- Partner zahlt gesammelt
- Krankenkasse / Institution zahlt
- Gutschein / Referenzbasiert
- Unternehmerabrechnung
- Provisionsabrechnung

Zu speichern:
- Rechnungsstatus
- Zahlungseingang
- offene Beträge
- Partnerabrechnung
- Unternehmerabrechnung
- Provisionen
- Korrekturen

---

## Wichtige Module im Admin Panel

Geplante Hauptmenüs:

1. Dashboard
2. Fahrten
3. Partner
4. Unternehmer
5. Fahrer
6. Tarife
7. Codes / Referenzen
8. Abrechnung
9. Einstellungen
10. Admin-Benutzer
11. Logs / Historie

---

## Wichtige Module im Partner Portal

Geplante Hauptmenüs:

1. Dashboard
2. Neue Fahrt
3. Serienfahrten
4. Aktive Fahrten
5. Historie
6. Rechnungen
7. Mitarbeiter
8. Konto / Stammdaten

---

## Wichtige Module im Unternehmer Portal

Geplante Hauptmenüs:

1. Dashboard
2. Offene Fahrten
3. Zugewiesene Fahrten
4. Fahrer
5. Fahrzeuge
6. Umsätze / Abrechnung
7. Dokumente
8. Einstellungen

---

## Grundsatz für die Entwicklung

Ab jetzt gilt:

- Mobile App bleibt für operative Nutzung
- Homepage bleibt öffentlich
- Admin Panel wird separat gebaut
- Partner- und Unternehmerzugänge werden separat gedacht
- zentrale Daten liegen nur in API + Datenbank
- keine wichtigen Geschäftsregeln fest in der App codieren
## Gebiete & Tarifregeln

Das System soll deutschlandweit nutzbar sein, aber lokale Regeln berücksichtigen.

### Grundsatz
Nicht ein globaler Tarif für alle Fahrten, sondern:
- bundesweites Kernsystem
- lokale Tarifgebiete / Pflichtfahrgebiete
- Vertragslogiken für Partner
- regelbasierte Preisermittlung

### Gebietseinheit
Jedes Gebiet soll separat verwaltet werden können, z. B.:
- Stadt
- Landkreis
- Pflichtfahrgebiet
- Verbund / Tarifraum
- Sonderzone (z. B. Flughafen)

### Pro Gebiet speicherbare Daten
- Gebietsname
- Bundesland
- Typ des Gebiets
- zuständige Behörde
- Pflichtfahrgebiet ja/nein
- Tarifordnung / Verordnung
- gültig ab
- gültig bis
- Festpreis zulässig ja/nein
- freie Preisvereinbarung außerhalb Gebiet ja/nein
- Sondervereinbarungen zulässig ja/nein
- Zuschlagsregeln
- Notizen / Rechtsgrundlage

### Tarifregel-Typen
Das System soll mindestens diese Regeltypen unterstützen:
- `official_metered_tariff`
- `official_fixed_price`
- `tariff_corridor`
- `free_price_outside_area`
- `health_contract_rate`
- `partner_contract_rate`
- `special_manual_rule`

### Prioritätslogik
Bei jeder Fahrt soll das System die Preisregel in folgender Reihenfolge prüfen:

1. Vertragstarif für exakten Partner
2. Vertragstarif für Partnertyp
3. Gebietsspezifische Sonderregel
4. offizieller Gebietstarif
5. freie Preisvereinbarung außerhalb des Gebiets
6. globaler Fallback nur, wenn rechtlich zulässig

### Preis-Engine
Die Preis-Engine soll nicht nur nach Kilometern entscheiden, sondern nach:
- Startgebiet
- Zielgebiet
- Fahrtart
- Partnertyp
- Vertragslage
- Pflichtfahrgebiet
- zulässiger Preisart
- Gültigkeitsdatum

### Ziel
Das System soll automatisch erkennen können:
- ob Tarifpflicht gilt
- ob Festpreis zulässig ist
- ob freie Preisvereinbarung möglich ist
- ob Vertragstarif greift
- welcher Tarif dem Fahrer / Unternehmer / Partner zugeordnet werden muss
---

## Nächste Schritte

1. Grundlayout und Navigation für Admin Panel bauen
2. Rollen und Menüs im Frontend vorbereiten
3. Datenmodell für Benutzer, Rollen, Partner, Unternehmer, Fahrer festlegen
4. Datenbanktabellen für Tarife und Systemsettings planen
5. Login / Auth für Admin Panel bauen
6. erstes Tarifmodul bauen
7. Partnerverwaltung bauen
8. Unternehmerverwaltung bauen
9. Fahrtenmodul und Code-Logik anbinden
10. Abrechnungsmodul vorbereiten
