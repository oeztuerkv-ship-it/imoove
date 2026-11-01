# Kardi: Frage-Antwort-Zuordnung und Sprachwechsel – 01.11.2026

## Ziel und bestätigte Befunde
Vedat meldete unpassende Zahlungsantworten bei Vorausbuchung, fehlenden Wechsel bei „englisch“ und unlogische Antworten auf Sauberkeitsfragen in verschiedenen Sprachen. Reproduziert im bisherigen Stand:

- „Wie lange vorher muss ich buchen?“ → Abbuchungs-/Zahlungstext. „vorher“ genügte dem ungesicherten Ähnlichkeitsranking als vermeintlicher Zahlungsbezug.
- „Kann ich im Voraus buchen?“ / „vorausbuchen“ → nicht verstanden.
- „deutsch“ → „englisch“ → weiterhin deutsche Bestätigung. Die alte Sprachbestätigungsantwort änderte den Zustand nicht; der Sprachdetektor erfasste nicht alle deutschen Sprachbezeichnungen.
- „Kannst du Türkisch?“ wechselte teilweise den Sprachzustand, lief aber anschließend in die Unbekannt-Eskalation statt in eine passende Sprachbestätigung.
- Allgemeine Sachfragen ohne Fragezeichen konnten bei erwarteter Abholadresse als Ortsangabe gespeichert werden.
- Zweite Absicht innerhalb einer Planungsfrage konnte verloren gehen. Nach vollständiger Fahrtplanung verdeckte eine wiederholt angehängte Zusammenfassung kurze Sachantworten.

## Umgesetzte Korrektur
Kernfunktionen und Integrationen bleiben erhalten. Änderungen in der lokalen Gesprächslogik und Wissensbasis:

1. Zahlungsantworten benötigen einen tatsächlichen Zahlungsbezug; „vorher“, „buchen“, „Fahrt“ oder ein gemeinsames Füllwort allein reichen nicht. „Karte“ als Orts-/Fahrerkarte ist kein Zahlungsnachweis.
2. Vorausbuchung/Reservierung, Vorlaufzeit, Reservierungszusatzkosten, Zahlungsart und Zahlungszeitpunkt werden getrennt behandelt. Keine erfundene Vorlaufzeit, kostenlose Reservierung oder automatische Abbuchung zugesagt.
3. Bestätigte Muster haben eindeutige Zuordnung; freie Formulierungen nutzen zusätzlich Domänenbelege, Synonyme, begrenzte Fehlertoleranz und abgesicherte Ähnlichkeit. Unklares bleibt eine Rückfrage.
4. Mehrfachanliegen wie „morgen vorbestellen und bar zahlen“ werden beide beantwortet. Die Vorbereitung fragt danach nur das nächste fehlende Detail ab.
5. Sachantworten ohne Satzzeichen ersetzen keine Adresse. Bekannte Fahrtdaten, Korrekturen und Preis-API-Grenzen bleiben erhalten.
6. Sprachwechsel als eigene Kontrollabsicht: „englisch“, „Türkisch bitte“, „Kannst du Englisch?“, „Speak English“ usw. setzen tatsächlich den Zielzustand und bestätigen direkt in dieser Sprache.
7. Bewusst gewählte Sprache bleibt bis zum nächsten ausdrücklichen Wechsel aktiv. Im Standard-Automatikmodus folgt Kardi der erkannten Nachrichtensprache. „Sprache automatisch“ aktiviert diesen Modus erneut. Gleichzeitige Auswahl mehrerer Sprachen wird geklärt statt geraten.
8. „Sprechen eure Fahrer Englisch?“ bleibt eine Servicefrage und kein Befehl, Kardi umzuschalten. Notfälle werden auch zusammen mit einem Sprachwunsch zuerst behandelt.
9. Wechsel mitten in der Planung behält Start/Ziel, Datum/Uhrzeit, Personen, Gepäck, Flugnummer und offenen Gesprächsschritt. Keine Neuabfrage bereits bekannter Angaben nur wegen eines Sprachwechsels.
10. Nach abgeschlossener Vorbereitung erhalten kurze Sachfragen kurze Antworten ohne erneute vollständige Fahrtenkarte. Zusammenfassung bleibt beim Abschluss, über Weiter/Bearbeiten und auf Nachfrage verfügbar. Die Fahrtdaten werden nicht gelöscht.

## Bestätigte Serviceinhalte in DE/EN/TR
Vedats Vorgabe wird in den drei unterstützten Sprachen gleichwertig abgebildet:

Deutsch: „Ja, wir legen großen Wert auf Sauberkeit und gepflegte Premiumfahrzeuge. Unsere Fahrzeuge sind sauber und rauchfrei.“

Englisch: „Yes, we place great importance on cleanliness and well-kept premium vehicles. Our vehicles are clean and smoke-free.“

Türkisch: „Evet, temizliğe ve bakımlı premium araçlara büyük önem veriyoruz. Araçlarımız temiz ve dumansızdır.“

Varianten Auto/Fahrzeug/Taxi, Hygiene, Sauberkeit, gepflegt sowie relevante türkische Wortformen und typische Tippfehler geprüft. Tatsächliche Beschwerden bleiben persönliche Supportfälle. Kein eigenständiger Premium-Tarif, Fahrzeugmodell oder Termin als verfügbar garantiert.

## Sprachgrenzen und Daten
Die drei gepflegten Sprachen sind Deutsch, Englisch und Türkisch. Regelbasierte Erkennung, kein frei antwortendes Sprachmodell und keine Garantie für beliebige Sprachen/Umgangssprache. Die Spracherkennung nutzt kurze Marker und eindeutiges Vokabular aus den ohnehin lokal ausgelieferten geprüften Texten; gemeinsame Namen/Wörter wählen nicht allein eine Sprache. Kein Lernen aus Kundenverläufen, kein externer KI-Dienst und keine neue Speicherung/Übertragung.

## Prüfungen
Befehl: `node --test scripts/test-kardelen.cjs scripts/test-kardelen-dialogs.cjs`

547 automatische Prüfungen bestanden:

- 63 bisherige Szenario-/Sicherheits-/Integrationsprüfungen, einschließlich Retrieval der bestehenden 124 Muster in drei Sprachen.
- 52 zusätzliche freie Frageformulierungen für Zuordnung und Abgrenzung.
- 22 Sauberkeits-/Pflegefragen in DE/EN/TR.
- 17 explizite Sprachwahlformulierungen.
- 372 tatsächlich erzeugte Antworten aus 124 Mustern × drei Sprachen: richtige Antwortsprache, nicht leer, keine kaputten Objekt-/undefined-Ausgaben.
- 21 zusätzliche Kreuzdialog-/Gedächtnis-/Sicherheits-/Timing-/Darstellungsfälle.

Die Zahl bedeutet nicht 547 unabhängige natürliche Dialoge und belegt keine universelle Sprachkompetenz. Fixtures sind erwartete Kundenformulierungen, nicht aus den Erkennungsregeln erzeugte Spiegeltests.

Browser: `scripts/test-kardelen-cross-language-browser.cjs` prüft tatsächliche Vorausbuchungsantworten ohne falsche Kartenzahlung, Zahlungs-Zwischenfrage, DE→EN→TR→DE, Serviceantworten, UI-Sprache, vollständige Fahrtdaten/Flugnummer nach Wechsel und lokalisierte bearbeitbare WhatsApp-Zusammenfassung. Kein Preisaufruf ohne Klick und keine JS-Seitenfehler. Lokale Screenshots von EN/TR geprüft.

Bestehende Browserregression für Desktop/Mobil, Preisfreigabe, doppelte Klicks, Netzausfall, veraltete Ergebnisse, sichere Textausgabe sowie nativer Chromium-Touch-Test weiterhin bestanden. Kein echter iPhone-/Safari-/Screenreader-Test und kein automatischer Produktionsdialogtest. Keine echten Buchungen oder Stornos ausgelöst.

## Dateien und Bereitstellung
- `artifacts/marketing-site/kardelen-engine.js`: Zuordnung, Sprachkontrolle, Kontext und Antwortumfang.
- `artifacts/marketing-site/kardelen-knowledge.js`: gleichwertige Service- und Buchungsantworten, keine neuen Kostenversprechen.
- `artifacts/marketing-site/onroda-help.js`: vorhandener Telefonkontakt als expliziter Link bei telefonischer Anfrage.
- `scripts/fixtures/kardi-dialog-cases.cjs`: gepflegte Paraphrasen mit erwarteter Bedeutung.
- `scripts/test-kardelen-dialogs.cjs`, `scripts/test-kardelen-cross-language-browser.cjs`: neue Regressionen.
- Alle neun öffentlichen HTML-Dokumente: gemeinsame Assetversion 20261101-7, identische Festpreis-Aliase.

Kein Production-Deploy durch diese Arbeiten. Git-Push ist kein Live-Nachweis; öffentliche Assetversion getrennt prüfen. Übergeordneter Bestands-/Datenschutz-/Integrationsbericht: [Kardi 2.0](kardelen-2.0.md).

## Auswirkungen (Pflicht)
- API/DB: unverändert; vorhandener lesender Preisadapter, keine Migration.
- Admin: unverändert.
- Partner: unverändert.
- Mobile-App/Fahrer-App: unverändert; nur Website-Chat.
- Marketing/Kunde: passendere Themen-/Sprachsteuerung und klarere Antworten.
- Audit/Finance: keine neue Speicherung oder Fachaktion.
- E-Mail/Benachrichtigungen: kein automatischer Versand; bestehende Kontakte.
- Rechte/Module: unverändert; keine Kunden-Auth umgangen, keine neuen externen Provider.
