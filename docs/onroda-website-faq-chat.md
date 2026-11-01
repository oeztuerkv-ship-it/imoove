# Website: selbstgehostete FAQ-Hilfe (31.10.2026)

Historischer Stand. Aktuelle Erweiterung und Grenzen: [Kardelen 2.0](kardelen-2.0.md), 01.11.2026. Insbesondere die neue ausdrückliche Preis-API-Abfrage ersetzt die frühere Aussage „keine Netzwerkanfragen“.

## 1) Ziel des Features
Allgemeine Kundenfragen direkt neben WhatsApp beantworten, ohne externen KI-Dienst oder Gebühren je Antwort. Bestehendes Hosting bleibt erforderlich. Keine Buchung im Chat.

## 2) Betroffene Bereiche
Nur Marketing: zwei statische Assets und Einbindung in neun HTML-Dokumente. Mobile, Driver, API, DB, Admin, Partner, Finance, Medical, Dispatch, Notifications und OCR bleiben unverändert.

## 3) Datenfluss (E2E)
Texteingabe (maximal 400 Zeichen) → lokale Schlüsselwortsuche → höchstens zwei hinterlegte Antworten und passende Links. Keine API-Anfrage, Speicherung, Analytics-Erfassung des Chattexts oder Buchungsaktion. Nutzertexte werden ausschließlich mit textContent gerendert.

15 Themen: Kosten, Flugnummer/Verspätung, VIP/E-Klasse, Flughafen, Taxibestellung, Personen/Gepäck, Kindersitz, Vorbestellung, Region, Krankenfahrten, Geschäftsreisen, Zahlung, Storno, Fahrerstatus und Kontakt. Kosten verlinken den bestehenden Preisrechner. Vedat bestätigt am 31.10.: Bar- und Kreditkartenzahlung möglich; das Team prüft Flugnummern und Verspätungen. Diese Serviceangaben sind hinterlegt. Keine automatische Live-Flugabfrage durch den Chat, keine Fahrzeug-/Kapazitätsgarantie. Persönliche Abstimmung über WhatsApp. Unbekannte Fragen werden ausdrücklich nicht beantwortet und an WhatsApp verwiesen.

## 4) Rollen / Rechte
Öffentlich lesbare allgemeine Informationen. Keine individuellen Fahrt-, Standort- oder Kundendaten, keine Änderung, Stornierung oder Freigabe. Keine neue Auth-Schicht erforderlich.

## 5) Persistenz
Nur flüchtiger Browserzustand, maximal 32 Nachrichten. Kein Cookie, localStorage oder sessionStorage. Reload/Seitenwechsel setzt den Verlauf zurück. Keine Multi-Device-Synchronisation.

## 6) Betriebslogik
Reservierung, Fahrerwechsel, Storno und Dispatch werden nicht ausgeführt. Nach Laden der Assets funktioniert die FAQ ohne Netzwerkanfragen; externe Links benötigen eine Verbindung. Initialisierung gegen doppelte Widgets abgesichert. Bei Scriptfehler bleibt der separate statische WhatsApp-Link erhalten.

## 7) Finance / Audit / Support
Keine Billing-, Settlement-, OCR- oder Medical-Auswirkung. Kein Audit-Event: reine Informationsanzeige ohne Fachaktion. Chattexte werden nicht als Supportticket übertragen; WhatsApp wird nur nach bewusstem Linkklick geöffnet.

## 8) Regression-Risiko
Baseline: 252cb541. Bestehende Formulare und Skripte erhalten; ausschließlich zusätzliche Assetreferenzen. Overlay könnte auf kleinen Geräten Inhalte verdecken: schließbar, Safe-Area-Abstände, scrollbarer Verlauf und kurze Viewport-Regeln vorgesehen. Chromium-Sichtprüfung lokal auf Desktop-/Mobilbreiten erfolgt; echter iPhone-/Safari-Test steht aus. Rückbau durch Entfernen der zwei Assetreferenzen; WhatsApp bleibt eigenständig.

## 9) Teststatus
Bestanden: JS-Syntax, 14 FAQ-Szenarien, unbekannte Fragen, DOM-Öffnen/Absenden/Themenwahl/Escape/Außenklick, Fokusabsicht, sichere Textausgabe, Nachrichtenlimit, doppelte Initialisierung, keine Netzwerk-/Storage-Nutzung. Marketing-Repo-Invarianten bestehen. Zusätzlich Chromium-Browserprüfung: 320/390/768/1440px ohne horizontalen Überlauf, proportionale Bilder, Chat auf Flughafen-/Über-uns-/Rechts-/Statusseiten und kurzer 390px-Viewport bestanden; Screenshots lokal geprüft. Echter iPhone-/Safari-Test weiterhin offen. Kein Backend-, App- oder Production-End-to-End-Test durch diese statische Änderung.

## 10) Auswirkungen (Kurzblock, Pflicht)
- API/DB: unverändert; keine Migration.
- Admin: unverändert.
- Partner: Statusformular unverändert.
- Mobile/Fahrer: unverändert; kein OTA erforderlich.
- Marketing/Kunde: FAQ-Hilfe auf allen neun öffentlichen Dokumenten.
- Audit/Finance: keine Fachaktion oder Abrechnung.
- E-Mail: unverändert.
- Rechte: nur öffentliche Informationen; keine neuen Berechtigungen.

Keine Breaking Changes. Beide Assets und HTML gemeinsam statisch veröffentlichen. Git-Push allein ist kein Deployment; öffentlichen Stand separat prüfen. Der bekannte readonly-SSH-Zugang erlaubt kein Schreiben ins Webroot.

## Folgeauftrag: Kardelen und proportionale Bilder
Kardelen ist im Header ausdrücklich als digitale ONRODA-Assistentin erkennbar. Kürzere natürliche Antworten, Themenchips, getrennte Sprechblasen und sichtbar gestaltete Links; Mercedes-Antwort mit bestehender Fahrzeugillustration. Gepäckmengen in Ziffern oder Zahlwörtern werden aufgegriffen, ohne vier große Koffer als passend zu garantieren. Rückfrage nach Personen und Koffergrößen, einfache Folgefrage im Gepäckkontext möglich. Kein behaupteter Live-Mitarbeiter, keine vorgetäuschte Buchung.

Bestätigte Ursache der verzerrten Anlassbilder: Quelle 2172×724, drei quadratische Bildfelder; background-size:300% 100% streckte diese auf variable Kartenbreite und feste Höhe. Jetzt quadratische Bildflächen mit aspect-ratio:1 und background-size:300% auto auf Handy und Desktop. Care-Bild nutzt dasselbe Verhältnis. Keine neue Fotogenerierung. Assets FAQ v20261031-2 und Homepage v20261031-images-2.

### Lösungsorientierte Transferplanung
Button „Transfer planen“ führt durch Strecke, Termin, Flugnummer und Personen/Gepäck/Sonderbedarf. Zwischenfragen zu hinterlegten Themen werden beantwortet, danach wird die offene Planungsfrage wiederholt. Abbruch jederzeit über Button oder Text möglich. Abschluss erzeugt ausschließlich einen WhatsApp-Link mit vorbereiteter Zusammenfassung; kein Versand, keine Buchung oder Preiszusage. Erst bewusstes Öffnen des Links übergibt die Angaben an WhatsApp. Angaben bleiben bis dahin nur im Browser-Arbeitsspeicher. Kein allgemeines Sprachmodell: freie Fragen außerhalb der Themen können nicht beliebig verstanden werden.

Zusätzliche DOM-Prüfung bestanden: kompletter Planungsdialog, Zahlungs-Zwischenfrage ohne Schrittverlust, URL-kodierte Zusammenfassung, Hinweis auf ausstehende Bestätigung und Abbruch ohne Versand.
