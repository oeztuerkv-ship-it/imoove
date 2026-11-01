# Kardi 2.0 – Umsetzung und Abnahme, 01.11.2026

Sichtbarer Name auf Vedats Folgeauftrag: **Kardi**. Bestehende kardelen-* Modulnamen bleiben technisch erhalten.

## 1) Ziel des Features
Die vorhandene Kardi wird zur geführten digitalen Kundenberatung erweitert. Benutzer können frei tippen, Informationsfragen stellen, Fahrtdaten sammeln/korrigieren, einen bestehenden Preis prüfen und zur App oder persönlichen Beratung wechseln. Keine neue Buchungs-, Tarif-, Dispatch- oder Stornierungslogik. Keine Produktionseinspielung in diesem Auftrag.

Kardi bleibt eine lokale regelbasierte Assistentin, kein Sprachmodell. 120 kuratierte Muster in DE/EN/TR, gewichtete Wort-/Phrasenähnlichkeit, Synonyme und begrenzte Tippfehlertoleranz verbessern bekannte Szenarien. Beliebige Sprachen und beliebig freie Formulierungen sind damit nicht zuverlässig abgedeckt. Bei Unsicherheit Rückfrage bzw. persönliche Hilfe, keine erfundene Antwort.

## 2) Betroffene Bereiche / Bestandsaufnahme
- Marketing: vorhandener onroda-help-Einstieg, Chat-CSS und neun HTML-Dokumente erweitert. Bestehende Navigation, Preisformular, Kontakt und Fachformulare erhalten.
- API: ausschließlich vorhandenes GET `/api/public/fixed-price-quote`, siehe `artifacts/api-server/src/routes/publicHomepageApi.ts`; serverseitig `buildFixedPriceQuote` → bestehende Tarif-/Festpreisprüfung. Kein neuer Endpunkt, keine geänderte Berechnung.
- Buchung: POST `/api/rides` verlangt `requireCustomerSession` und Kundenprüfung in `routes/rides.ts`. Kein öffentlicher Buchungsschreibzugriff aus dem Chat. Keine zweite Preis-/Buchungslogik.
- Support: Fahrtbezogener Support in `routes/rides.ts` verlangt Kundensitzung. Kein Zugriff auf Fahrtstatus, Fahrerposition, Buchungsnummern oder Kontodaten aus Kardi.
- App: vorhandener iOS-Link `https://apps.apple.com/de/app/onroda/id6773487513`, HTTP 200 beim lesenden Check. Android auf der bestehenden Homepage als „folgt“ markiert; kein Link geraten. App-Schema `onroda` vorhanden, aber kein verifizierter Vertrag für öffentliches Prefill/Booking-Deep-Linking. Daher keine erfundenen Deep-Link-Parameter.
- Onlinebuchung: Marketing verweist auf die App; keine verifizierte öffentliche Web-Buchungsstrecke. Statt irreführendem „online gebucht“ Anzeige „App / Buchungswege ansehen“.
- Admin, Partner, Mobile/Fahrer, DB, Finance, Dispatch, Notifications, OCR: kein Code geändert.

## 3) Datenfluss und Module
- `kardelen-knowledge.js`: versionierte 120 Fragen/Absichten mit DE/EN/TR-Texten und überprüften Antwortbausteinen; eigenständig pflegbar.
- `kardelen-engine.js`: Sprachwahl, gewichtete Intent-Suche, strukturierte Extraktion, Gedächtnis, Korrektur/Bestätigung, Rückfragen, Eskalation, Zusammenfassung, vorbereiteter WhatsApp-Text.
- `kardelen-integrations.js`: sichere vorhandene Links, Konfiguration aus bestehendem DOM, ausschließlich lesender Preis-Adapter.
- `onroda-help.js`: bestehender Widget-Einstieg als View, explizite Aktionen, Vorschau, Formular, Tastatur und barrierearme Ausgabe.
- `onroda-help.css`: erweitert um Avatar mit Initiale, Aktionsbuttons, Fahrtenkarte, Formular-/Preisanzeige, mobile Themenleiste und dezente abschaltbare Animation.

Eingabe → lokale Erkennung/Extraktion → Antwort und passende Rückfrage → Zusammenfassung. Nur Preis-Button sendet Start/Ziel/Fahrzeugklasse an die bestehende öffentliche API. Erst nach Prüfung der vom System aufgelösten Orte wird ein vorhandener Festpreis gezeigt. Keine selbst berechnete Zahl, keine ungeprüfte Schätzung. `eligible:false`, unpassender Modus, ungültige Daten, Fehler und Timeout führen ohne Preiszusage zur persönlichen Anfrage. Gleiche laufende Preisprüfung wird nicht doppelt abgesendet; veraltete Antworten werden nach Datenänderung verworfen.

## 4) Rollen / Rechte
Öffentliche allgemeine Beratung ohne Login. Keine Zugangsdaten im Frontend. Preisprüfung ist der bereits öffentliche Leseweg. Authentifizierte Buchungen, Änderungen, Stornos und Support bleiben in der App bzw. beim zuständigen Team. „Vorbereitet“ ist keine Buchung, kein Fahrerfund und keine Fahrzeugzusage. Notfälle haben Vorrang: 112 bei medizinischem Notfall, 110 bei akuter Gefahr. Kein bloßer WhatsApp-Abschluss für akute Gefahr.

## 5) Gesprächsgedächtnis und Persistenz
Nur RAM dieses Tabs, kein Verlauf in Cookie/localStorage/sessionStorage. Reload oder neues Gespräch löscht den Zustand. Nachrichtenansicht auf 48 Bubbles begrenzt; strukturierte Daten unabhängig von abgeschnittenen alten Bubbles.

Felder: Start, Ziel, Datum, Abholzeit, Flugnummer und getrennte Flugzeit, Personen, Gepäckanzahl/-art, Fahrzeug-/Zahlungswunsch, Kindersitz/Alter soweit erkannt, Mobilitätsbedarf, Kinderwagen, Fahrrad, Tiermitnahme und Rückfahrt mit eigenem Datum/Uhrzeit. Fehlende Angaben werden nacheinander abgefragt. Bekannte Felder werden nicht neu erfragt; direkte Detailfragen können aus dem Zustand beantwortet werden. Explizite Korrekturen aktualisieren, Widersprüche fragen vor Ersetzen nach. „Wir sind jetzt fünf“ ändert nicht die Uhrzeit auf sofort. Unbestimmter Flughafen wird nicht still als Stuttgart aufgelöst. „Morgen“ basiert auf Europe/Berlin. Unbestimmte Datums-/Ortsangaben können eine erneute Präzisierung erfordern; es gibt keinen universellen natürlichsprachlichen Parser.

## 6) Betriebslogik / Abschlüsse
- Fahrt/Reservierung: fehlende Daten sammeln → Zusammenfassung → App, Preisprüfung oder WhatsApp. Kein Schreibrequest, daher keine doppelte Buchung.
- Preis/Festpreis: Streckendaten erfassen, eigene Adresseingaben im Preisformular prüfen, ausdrücklicher Aufruf bestehender API. Stadt allein genügt im Chat-Preisformular nicht; Straße mit Nummer oder benannter Verkehrs-Knotenpunkt erforderlich. Aufgelöste Orte müssen zusätzlich bestätigt werden. Keine Kilometerformel.
- Angebot/Verhandlung: persönliche Anfrage, kein Rabatt-/Rechts-/Verfügbarkeitsversprechen.
- Große Gruppe/viel Gepäck, Barrierefreiheit, Beschwerde, Fundsache, Erstattung, Vertragsfragen oder unklare Technik: persönliche Abstimmung statt ungeprüfter Sofortbuchung.
- Informationsgespräch: kurze Antwort, Gespräch kann frei weitergehen; keine Pflichtinstallation oder erzwungene Buchung.
- Unbekannt: erste Klärung → einfache Auswahl → persönliche Hilfe. Eingaben können Regeln und Fakten nicht überschreiben.
- Sprachwechsel DE/EN/TR im Gespräch; einfache formelle deutsche Ansprache berücksichtigt. Andere Sprachen werden nicht als zuverlässig unterstützt behauptet.
- Preis-Ladeanzeige nur während tatsächlichem Request. Offline/Fehler: kein Preis, alternative Kontaktwege. Kein automatischer Retry oder Nachrichtversand.

## 7) Finance / Audit / Support / Datenschutz
Bar- und Kreditkartenzahlung sowie Team-Prüfung von Flugnummern/Verspätungen wurden von Vedat bestätigt. Apple Pay, automatisches Flight-Tracking, garantierte Modelle, Kapazitäten, Kindersitze, Zuschläge, Erstattung und konkrete Mitarbeiter-Reaktionszeiten bleiben unbestätigt. Solche Muster wurden entsprechend angepasst.

WhatsApp-Nummer wird aus dem bestehenden `.hp-whatsapp-fab` gelesen und validiert. Keine neue Nummer. Zusammenfassung wird vorab in editierbarem Textfeld angezeigt; ein HTTPS-Link öffnet WhatsApp nur per bewusstem Klick. Nachricht wird erst dort durch den Kunden versendet. Offizielle Telefon-/E-Mail-Kontakte aus dem Impressum stehen auch als Alternative bereit, z. B. ohne WhatsApp-App. Kundendaten werden weder automatisch gepostet noch in Analytics-Payloads geschrieben.

Keine automatische Übernahme sensibler Gesundheitsdetails. Mobilitäts-/Kindersitz-Anforderungsflags werden nicht ungefragt in den WhatsApp-Text übernommen. Erkennbare Diagnosen werden abgefangen, Passwörter/Token/Kartendaten redigiert bzw. vor Übergabe blockiert. Es handelt sich um begrenzte Musterfilter, keine Garantie gegen beliebige persönliche oder medizinische Freitextangaben; deshalb keine Diagnosen/Dokumente anfordern und Vorschau beibehalten. Bei bewusst vom Kunden eingegebenen Geheimnissen nicht serverseitig loggen. Alle sichtbaren Nutzerdaten per textContent, keine HTML-Injektion.

Preisprüfung nutzt bestehende serverseitige Karten-/Geocoding-Anbieter und kann deren vorhandene Betriebskosten auslösen. Kein externer KI-Dienst, keine KI-Gebühr pro Nachricht. Preis-API ist ein bestehender öffentlicher Endpunkt mit vorhandenem Server-Schutz; UI-Doppelklickschutz ist kein Ersatz für serverseitige Limits. Keine Änderung am Rate-Limit-/Auth-System.

Nur flüchtige Zähler im Tab: Nachrichten, unbekannte Anliegen, vorbereitete Anfragen, Eskalationen und WhatsApp-Klicks. Keine dauerhafte serverseitige Statistik, kein neuer Tracking-Endpunkt, keine Übertragung von Adresse/Chattext an Analytics. Für aggregierte Produktionskennzahlen wäre ein separat geprüfter Datensparsamkeits-/Einwilligungs-/Retention-Entwurf nötig.

## 8) Regression-Risiko / Rückbau / offene Integrationen
Baseline: 91d1e14e. Änderungen nur Marketing, Tests und Dokumentation; bestehende fremde Änderung an `deployRevision.generated.ts` bleibt unangetastet. Module mit derselben Assetversion 20261101-2 auf allen neun Dokumenten; beide Festpreis-Aliase identisch. Bei fehlendem Modul startet Kardi nicht; der unabhängige statische WhatsApp-Kontakt bleibt bestehen. Rückbau über vorherigen Marketing-Commit und statische Veröffentlichung, keine DB-Migration.

Offen: echte authentifizierte Web-Buchung, Übernahme der Fahrtdaten in die App, bestätigter Android-Link, Live-Flugdaten, Buchungsstatus in Kardi, Fahrzeug-Verfügbarkeitsabfrage, automatische Supportticket-Erstellung, universelles Sprachverständnis und dauerhafte anonyme Kennzahlen. Es wird keine vorhandene geschützte Schnittstelle umgangen. Die App-Installation ist keine Voraussetzung für WhatsApp-Anfragen. Keine App-/OTA-/App-Store-Veröffentlichung.

## 9) Teststatus und Sprachmodell-Empfehlung
`node --test scripts/test-kardelen.cjs`: 56 Tests bestanden. Darin alle 120 Muster in DE/EN/TR (360 Retrieval-Prüfungen), Preis-/Synonym-/Tippfehlersuche, Gepäck/Gruppen, Reservierung, Berlin-Datum, Feldkorrekturen, widersprüchliche Werte, Zwischenfragen, bekannte Angaben, Eskalation, Notfälle, Zahlung/Rechnung, Unsicherheit, Preisfehler/-schema, fehlende WhatsApp-/App-Links, Sprachwechsel, Injection, Mehrfachklicks, ungültige Daten, Datenschutz und Rückfahrt.

`scripts/test-kardelen-browser.cjs` mit extern bereitgestelltem Playwright/Test-Chromium: 320/390/768/1440px, vollständiger Dialog/Korrekturen, kein Horizontalüberlauf, Fokus/Escape, acht logische Seitenvarianten, kurzer 390px-Viewport, explizite Preisfreigabe, Doppelklick, Festpreisart, Ortsbestätigung, Netzausfall, veraltete Antwort, WhatsApp-Vorschau/Telefon/E-Mail, EN/TR, HTML-Injektionsversuch und 112-Link bestanden; keine JavaScript-Seitenfehler. Preis-Erfolg/Fehler/Stale-Szenarien sind kontrollierte Mocks, keine echten Buchungen. Lokale Screenshots geprüft; echter iPhone-/Safari- und Screenreader-Test weiterhin offen.

Realer lesender Test: Preis-Endpunkt HTTP 200; Teststrecke lieferte `eligible:false`, Grund `both_in_mandatory_area`. Kein Festpreis erfunden. iOS-App-Store-Link HTTP 200. Marketing-Repo-Invarianten und Syntax-/CSS-/Alias-/Assetprüfungen bestanden. Bekannter unabhängiger globaler Invariantenfehler doppelte Migration 097 wird nicht in diesem Marketingauftrag verändert.

Späteres echtes Sprachmodell ist für freie Sprache und breite Mehrsprachigkeit sinnvoll, aber nur optional hinter einem serverseitigen Adapter: ausschließlich Intent-/Entitätenvorschläge und freigegebene Wissensbausteine, validiertes Ausgabeformat, Werkzeug-Allowlist, Preise ausschließlich bestehende Preis-API, Schreibaktionen nur authentifiziert und ausdrücklich bestätigt. Vor Aktivierung Anbieter-/Kostenfreigabe, Datenverarbeitung/Retention, konkrete Modell-Evaluation, Abuse-/Rate-/Budget-Limits und Redaktionsregeln klären. Keine Provider-/Modellauswahl oder Datenweitergabe in diesem Auftrag, keine Frontend-Secrets. Ein Modell macht Tarifregeln und Buchungsbestätigungen nicht entbehrlich.

## 10) Auswirkungen (Kurzblock, Pflicht) / Bereitstellung
- API/DB: kein Code/Schema geändert, bestehender öffentlicher Preis-Leseweg wiederverwendet; keine Migration.
- Admin: unverändert.
- Partner: unverändert; bestehender Anfrage-Abschnitt verlinkt.
- Mobile/Fahrer: unverändert; App-Link statt erfundenem Deep Link, kein OTA.
- Marketing/Kunde: Wissensbasis, Dialog, Zusammenfassung, Preisprüfung und Übergaben auf allen öffentlichen Dokumenten.
- Audit/Finance: keine Fachaktion/Abrechnung; nur flüchtige lokale Zähler, kein Audit-Schreibevent.
- E-Mail/Benachrichtigungen: kein automatischer Versand; vorhandene Kontakte.
- Rechte/Module: öffentliche Beratung bleibt öffentlich; geschützte Kundenaktionen bleiben geschützt.

Assets und HTML gemeinsam aus demselben Git-Stand veröffentlichen. Noch kein Production-Deploy in diesem Auftrag. Standard-Runbook und Freigabe beachten; SSH-Lesezugang erlaubt keinen Webroot-Schreibzugriff. Git-Push allein ist kein Live-Nachweis.

## Chatbox: mehr Verlauf (Folgeauftrag 01.11.2026)
Kompakter Kopf mit „Kardi / ONRODA · digital“, Themenmenü als natives details/summary-Overlay, Neustart als beschriftetes Icon. Themen stehen nicht dauerhaft unter dem Verlauf. Auswahl schließt das Menü; Escape schließt zunächst das offene Menü, danach die Chatbox. Mobile fast volle sichtbare Bildschirmhöhe mit Safe-Area-Abständen; Desktop breiter/höher. Lesbare Nachrichtenschrift 16px und 44px Bedienelemente erhalten. Wissensbasis, Dialogzustand, Preis-/Buchungswege unverändert.

Browservergleich bei 390×844: Kopf 105→61px, sichtbarer Verlauf 321→658px. Mehr Verlauf auch bei 320/768/1440px; Themenwahl, Tastatur/Escape, Fokus und kein seitlicher Überlauf geprüft. Bestehende Browser-Regression inkl. Dialog, Preisprüfung, WhatsApp und Sprachwechsel grün. Keine echte iPhone-Tastaturprüfung. Assetversion einheitlich 20261101-3 auf neun Dokumenten; Preis-Aliase identisch. Auswirkungen: nur Marketing-Darstellung; API/DB, Admin, Partner, Mobile, Audit, E-Mail und Rechte unverändert. Keine Produktionseinspielung.
