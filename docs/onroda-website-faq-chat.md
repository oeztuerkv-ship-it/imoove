# Website: selbstgehostete FAQ-Hilfe (31.10.2026)

## 1) Ziel des Features
Allgemeine Kundenfragen direkt neben WhatsApp beantworten, ohne externen KI-Dienst oder Gebühren je Antwort. Bestehendes Hosting bleibt erforderlich. Keine Buchung im Chat.

## 2) Betroffene Bereiche
Nur Marketing: zwei statische Assets und Einbindung in neun HTML-Dokumente. Mobile, Driver, API, DB, Admin, Partner, Finance, Medical, Dispatch, Notifications und OCR bleiben unverändert.

## 3) Datenfluss (E2E)
Texteingabe (maximal 400 Zeichen) → lokale Schlüsselwortsuche → höchstens zwei hinterlegte Antworten und passende Links. Keine API-Anfrage, Speicherung, Analytics-Erfassung des Chattexts oder Buchungsaktion. Nutzertexte werden ausschließlich mit textContent gerendert.

15 Themen: Kosten, Flugnummer/Verspätung, VIP/E-Klasse, Flughafen, Taxibestellung, Personen/Gepäck, Kindersitz, Vorbestellung, Region, Krankenfahrten, Geschäftsreisen, Zahlung, Storno, Fahrerstatus und Kontakt. Kosten verlinken den bestehenden Preisrechner. Flugüberwachung, VIP-Tarif, konkretes Fahrzeug und Kindersitz werden nicht zugesagt; persönliche Abstimmung über WhatsApp. Unbekannte Fragen werden ausdrücklich nicht beantwortet und an WhatsApp verwiesen.

## 4) Rollen / Rechte
Öffentlich lesbare allgemeine Informationen. Keine individuellen Fahrt-, Standort- oder Kundendaten, keine Änderung, Stornierung oder Freigabe. Keine neue Auth-Schicht erforderlich.

## 5) Persistenz
Nur flüchtiger Browserzustand, maximal 32 Nachrichten. Kein Cookie, localStorage oder sessionStorage. Reload/Seitenwechsel setzt den Verlauf zurück. Keine Multi-Device-Synchronisation.

## 6) Betriebslogik
Reservierung, Fahrerwechsel, Storno und Dispatch werden nicht ausgeführt. Nach Laden der Assets funktioniert die FAQ ohne Netzwerkanfragen; externe Links benötigen eine Verbindung. Initialisierung gegen doppelte Widgets abgesichert. Bei Scriptfehler bleibt der separate statische WhatsApp-Link erhalten.

## 7) Finance / Audit / Support
Keine Billing-, Settlement-, OCR- oder Medical-Auswirkung. Kein Audit-Event: reine Informationsanzeige ohne Fachaktion. Chattexte werden nicht als Supportticket übertragen; WhatsApp wird nur nach bewusstem Linkklick geöffnet.

## 8) Regression-Risiko
Baseline: 252cb541. Bestehende Formulare und Skripte erhalten; ausschließlich zusätzliche Assetreferenzen. Overlay könnte auf kleinen Geräten Inhalte verdecken: schließbar, Safe-Area-Abstände, scrollbarer Verlauf und kurze Viewport-Regeln vorgesehen. Browser-/Geräte-Sichtprüfung steht noch aus. Rückbau durch Entfernen der zwei Assetreferenzen; WhatsApp bleibt eigenständig.

## 9) Teststatus
Bestanden: JS-Syntax, 14 FAQ-Szenarien, unbekannte Fragen, DOM-Öffnen/Absenden/Themenwahl/Escape/Außenklick, Fokusabsicht, sichere Textausgabe, Nachrichtenlimit, doppelte Initialisierung, keine Netzwerk-/Storage-Nutzung. Marketing-Repo-Invarianten bestehen. DOM-Emulation ersetzt keinen echten Browser-/iPhone-Test. Kein Backend-, App- oder Production-End-to-End-Test durch diese statische Änderung.

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
