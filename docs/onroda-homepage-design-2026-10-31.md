# ONRODA Homepage – optischer Entwurf umgesetzt, Deployment ausstehend

## 1. Ziel
Vedats freigegebenes Bildkonzept als echte responsive Startseite umsetzen: schwarze aktuelle E-Klasse Kombi, Stuttgart/Esslingen/ganz Baden-Württemberg, Flughafentransfer zum Pauschalpreis und Geschäftsreisen. Letzte Einschränkung: ausschließlich Optik/Texte, keine Geschäftslogik oder API ändern. Online-Schaltung ist vom Nutzer beauftragt.

## 2. Bereiche
Nur artifacts/marketing-site/index.html, zusätzliches home-2026.css und zwei neue JPEG-Bilddateien. Mobile, API, DB, Admin-/Partner-Code, Finance, Dispatch und Notifications unverändert. Vorhandene fremde Änderung deployRevision.generated.ts nicht aufnehmen.

## 3. Datenfluss
Neue Einstiegskarten verlinken auf vorhandene Ziele: #jetzt-buchen, /fixpreise/, #unternehmen und #care. Kein neuer Web-Buchungsprozess, keine neuen Eingabefelder, keine neuen Requests. Bestehendes Partnerformular einschließlich Validierungsmarkup und alle eingebundenen/Inline-Skripte byte-identisch zur Quellbaseline 4e5c2112.

## 4. Rollen/Rechte
Öffentliche Marketing-Darstellung. Bestehender Partner-Login-Gate bleibt erhalten; keine Berechtigungsänderung. Admin- und Kunden-/Fahrer-Funktionen bleiben getrennt.

## 5. Persistenz/CMS
Keine DB-Schreiboperationen oder Migrationen. Der neue Hero, die Regionsleiste und die drei Anlass-Karten stehen im statischen HTML. Bisherige CMS-Felder heroHeadline/heroSubline/cta1/cta2 und die ersetzten Trust-/Manifest-/Servicekarten sind in dieser neuen Darstellung nicht mehr angebunden; keine CMS-Daten gelöscht. CMS für die erhaltenen Abschnitte (Zielgruppen, FAQ, Logo etc.) und die Festpreisseite bleibt unverändert. Alte Hero-Inhalte enthalten die doppelte Ortsnennung, überschreiben aber den neuen Einstieg nicht mehr. Eine spätere CMS-Erweiterung für die neue Darstellung wäre ein separater Auftrag.

## 6. Betriebslogik
Buchung/Reservierung, Preise und Verfügbarkeit werden weiterhin von den bestehenden App-/Festpreis-Funktionen bestimmt. Marketingtext verspricht keine garantierte flächendeckende Fahrer-Verfügbarkeit und keine feste Fahrzeugzusage. Keine Fahrerzuweisung, Livefahrt, Zahlung oder echte Partneranfrage im Test ausgelöst.

## 7. Finance/Audit/Support
Keine erfundenen Europreise, Bewertungen, Fahrtenzahlen oder exklusiven Flottenzusagen. Generierte Fahrzeug-/Servicebilder sind Illustrationen. Hauptmotiv als „Illustration · Fahrzeug nach Verfügbarkeit“ beschriftet. Original-ONRODA-Logo beibehalten. Leinfelden-Echterdingen als ein Ort, kein separates zweites Echterdingen.

## 8. Regression/Fallback
Neues CSS ist auf .hp-home-v2 und neue ride-Elemente begrenzt; bestehende style.css bleibt unverändert. Rechtstexte, Festpreisrechner und Partner-Statusseite unverändert. Leistungsanker #services weiterhin vorhanden. Abschnitte unterhalb des fixierten Headers mit Scroll-Abstand. Mobil steht WhatsApp am Seitenende, damit es Buchungsbuttons nicht verdeckt. Rückbau durch Rücknahme des Marketing-Commits, ohne DB-Rückbau.

## 9. Prüfstatus / Deployment
- Lokaler HTTP-Server, Startseite, CSS und Bilder erfolgreich ausgeliefert.
- Tatsächliche Firefox-Desktop- und Responsive-390px-Vorschau geprüft; Original-Logo, E-Klasse, Überschrift und Handlungslinks sichtbar. Mobiles Menü geöffnet; Fahrten-Link erreicht #jetzt-buchen und schließt Menü.
- HTML-Prüfung: genau eine H1, 138 eindeutige IDs, 57 Links ohne fehlende interne Anker, 17 lokale Assets vorhanden. Partnerformular, Script-Tags und bestehende JS-/Festpreis-/Status-/Rechtstextdateien byte-identisch.
- verify-onroda-marketing-partner-status-repo.sh und git diff --check erfolgreich.
- Bekannter globaler Invariantenfehler durch doppelte Backend-Migration 097 stammt aus der Baseline. Keine Migration geändert/ausgeführt.
- NICHT LIVE: onroda-codex ist nur leseberechtigt; /root/imoove/.git und /var/www/onroda sind root-owned und nicht beschreibbar. sudo -n -l: „sudo: a password is required“. Root mit demselben Schlüssel: „Permission denied (publickey,password).“ Kein weiteres Passwort probiert, kein Zugang geändert.
- Serverrevision bei Prüfung weiterhin 6edca151ea925e820764be0a5f2fab87ef6f4e6b; lokale Serveränderungen nicht angefasst. Kein Pull, rsync, Restart oder vollständiger Backend-Deploy erfolgt. Für die freigegebene Veröffentlichung ist ein schreibberechtigter Deployment-Zugang erforderlich. Keinen vollständigen Backend-/Migrations-Rollout allein für dieses Design improvisieren; Repo-Deployment-Regeln beachten.

## 10. Auswirkungen
1. API/DB: nein, keine Änderungen oder Migration.
2. Admin: kein Code geändert; neue statische Hero-/Anlass-Texte sind nicht an die alten CMS-Felder gekoppelt (siehe 5).
3. Partner: Code/Formular/Status/Login-Gate unverändert.
4. Fahrer/Kunde Mobile: keine App-Änderung, kein OTA.
5. Homepage/Onboarding: ja, Darstellung/Navigation/Bilder/Texte; vorhandene Einstiege bleiben.
6. Audit: Quellstand, Browserprüfung und fehlende Deployment-Rechte hier dokumentiert.
7. E-Mail/Benachrichtigungen: nein, kein Versand getestet oder geändert.
8. Rechte/Module: nein, keine neue Freigabe oder Rolle; vorhandener SSH-Zugang bleibt lesend.


## Folgeauftrag: alle öffentlichen Unterseiten (31.10.2026)
Vedat meldet altes Menü beim Wechsel, insbesondere Krankenfahrten; weiterhin reine Darstellung, keine API-/Geschäftslogik ändern.

**Bestätigter Befund:** Die Startseite mit Quellstand c7816b38 ist inzwischen öffentlich ausgeliefert und auch im Server-Repo vorhanden (nicht von diesem Agenten deployed). Die Festpreisseite sowie die übrigen Dokument-/Statusseiten hatten noch eigene alte oder reduzierte Kopfbereiche. /fixpreise und /fixpreise/ sind getrennte HTML-Dateien und müssen identisch bleiben. Krankenfahrten ist kein separates Dokument, sondern /#care.

**Umsetzung:** Gemeinsamer Header und Footer für index.html, fixpreise.html, fixpreise/index.html, ueber-onroda.html, partner-status.html, impressum.html, datenschutz.html, agb.html und konto-loeschen.html. Gemeinsame site-2026.css und site-navigation.js (ausschließlich Menübedienung: keine Requests/Storage/Accounts). Einheitliche Typografie, Karten, Formularoptik, Abstände und Links, Original-Logo. Festpreise/Über-ONRODA mit demselben illustrativen Kombi-Motiv. Motion-Demos und Admin-/Partner-Portale sind eigenständige Oberflächen und wurden nicht umgestaltet.

**Zusätzlicher bestätigter Darstellungsfehler:** script.js hat beim load immer scrollTo(0,0) aufgerufen und dadurch seitenübergreifende Fragmentlinks wie /#care überschrieben. Einzige Änderung am bestehenden Skript: nur ohne location.hash nach oben scrollen. Übriger Dateiinhalt ist exakt zur Baseline identisch. Script/CSS-Versionen in allen betroffenen Dokumenten aktualisiert. Nicht als Änderung von Buchung, Dispatch, Preisen, Auth oder API zu verstehen.

**Prüfungen:** Alle 9 lokalen Routen liefern HTTP 200 und denselben Menü-/Footerstand. Alle IDs eindeutig, genau eine H1 pro Dokument, alle lokalen Assets und Fragmentziele vorhanden, beide Festpreis-Dateien identisch. Formulare und Inline-Skripte exakt unverändert. Hauptinhalt von Festpreisen, Partnerstatus und sämtlichen Rechts-/Kontoinformationsseiten exakt unverändert; About ersetzt lediglich den dekorativen alten Textlogo-Block durch eine kleine Markenzeile. analytics.js unverändert, keine neue Analytics-Einbindung auf Rechtsseiten. JS-Syntax, Menü-Checks (Link, Escape/Fokus, Außenklick, Größenwechsel, Hashwechsel), gezielter Load-/Hash-Regressionscheck sowie Marketing-Invarianten und git diff --check bestanden.

**Browser:** Neue Header/Links auf Impressum und Festpreisseite über tatsächlichen AX-Inhalt nachgewiesen. Parallele Benutzerbedienung wechselte während Screenshots mehrfach auf andere Seiten, deshalb keine vollständige pixelgenaue Desktop-/Mobil-Abnahme aller 9 Seiten behaupten. Der Quell-/HTTP-Vergleich aller Seiten und die gezielten Menüchecks sind davon unabhängig bestanden. Live-Hash-/Mobil-Abnahme nach Deployment ergänzen.

**Auswirkungen:** API/DB nein; Admin-Code nein; Partner-Fachflows/Formular nein; Mobile/OTA nein; Marketing ja (alle öffentlichen Dokumente); Audit ja (Prüfnachweis); E-Mail/Push nein; Rollen/Rechte nein. Keine Migration oder Backend-Neustart nötig. Der neue Unterseitenstand ist erst nach separat bestätigtem Server-Deploy öffentlich; vorhandener SSH-Zugang war bislang nur lesend. Die bereits live befindliche Startseite beweist nicht, dass diese Folgeänderungen ebenfalls live sind.


## Korrektur: Zielbereich Krankenfahrten selbst gestalten
- Erneute Meldung: Beim Klick auf Krankenfahrten von /fixpreise/ wirkt das Ziel weiterhin alt. Öffentliche Menüprüfung bestätigt korrektes href=/#care; neuer gemeinsamer Header und CSS sind inzwischen live. Ursache diesmal: Der Inhaltsbereich #care selbst hatte noch das alte Layout. Keine Cache-Ursache dafür behaupten.
- #care und der zugehörige Vorab-Unterlagen-Abschnitt jetzt rein gestalterisch angeglichen: kompakte Überschrift, illustratives Motiv aus dem vorhandenen Service-Bild, neutrale Karten/Ränder, einheitliche Typografie und Buttons, weniger dekorative Farben/Emojis. Leistungsinformationen, Ablaufschritte und Buchungs-/Motion-Hooks erhalten. home-2026.css mit neuem Cache-Key.
- Unverändert: script.js, site-navigation.js, Formulare, App, API, Preise und Rechte. Care-Anker eindeutig, bestehender Link #jetzt-buchen und Motion-Attribut erhalten; Marketing-Invarianten und git diff --check grün. Browser-Sichtprüfung durch wiederholte parallele Bedienung/Guard-Abbrüche nicht abgeschlossen; keine erfolgreiche vollständige Geräte-/Browserabnahme behaupten.
- Auswirkungen: nur Homepage-Präsentation; keine API/DB-/Admin-/Partner-/Mobile-/E-Mail-/Rollenänderung. Neue Korrektur erst nach separat überprüftem Deployment live.


## Gezielter Folgeauftrag: Flughafentransfer /fixpreise/
- Vedat stellt klar: Gemeint ist der Flughafentransfer-Menüpunkt selbst, nicht Krankenfahrten. Die öffentliche /fixpreise/-Antwort und site-2026.css entsprachen vor dieser Änderung exakt dem Repo-Stand und enthielten site-primary-nav mit dem neuen Menü. Der auf Vedats Gerät gesehene alte Menüstand ist damit nicht erklärt; keinen Cache-Root-Cause behaupten.
- Tatsächlich unvollständig war die Inhaltsgestaltung der Preis-/Flughafentransfer-Seite. Diese ist jetzt als eigene Landingpage gestaltet: kompletter E-Klasse-Kombi-/Flughafen-Einstieg mit eigenem H1, drei knappe Planungsschritte, CMS-Erklärung links und vorhandener Rechner rechts; mobil untereinander. Bestehender dünner Bildstreifen ersetzt. Neue airport-2026.css nur auf beiden Festpreis-Dokumenten. Aktiver Flughafentransfer-Menüpunkt sichtbar hervorgehoben.
- Preisformular einschließlich Feldnamen/IDs/Fahrzeugoptionen byte-identisch. Alle bestehenden Skripte, Header/Footer und CMS-IDs erhalten; bisheriger CMS-H1 ist nun H2 unter dem neuen Landingpage-H1. Kein Preiswert erfunden und keine Buchung erzeugt. Formulare/API/Dispatch/App unverändert.
- Prüfungen: identische Festpreis-Aliase, genau eine H1, eindeutige IDs, alle bisherigen CMS-/Funktions-IDs erhalten, lokale Assets/Anker vorhanden, JS-/Formular-/Header-/Footer-Vergleich und Marketing-Invarianten sowie git diff --check bestanden. Native Browserverbindung meldete zunächst „Sky Computer Use native pipe closed before response“; keine erfolgreiche visuelle Browserabnahme dieser neuen Seite behaupten.
- Auswirkungen: API/DB nein; Admin-Code nein (bestehende CMS-Felder erhalten); Partner-Fachflows nein; Mobile/OTA nein; Marketing ja (Flughafentransfer); Audit dokumentiert; E-Mail/Push nein; Rechte unverändert. Online-Status separat prüfen, Git-Push ist kein Deployment. Der vorhandene Serverzugang war bisher nur lesend.


## Homepage straffen und Menümaße vereinheitlichen
Vedat beauftragt die vollständige optische Vereinheitlichung; echte Fotos folgen später. Keine neuen Fotos/Assets erzeugt, vorhandene Illustrationen behalten.

- Homepage-Abfolge: Einstieg → Regionen/Anlässe → Krankenfahrten → Geschäftsreisen → App → fünf Schritte → optionale Zielgruppen → Partner → FAQ. Doppelte Krankenfahrten-Erklärung zusammengeführt; ursprünglicher #krankenfahrten-usp-Link bleibt als platzloser Alias im #care-Bereich erhalten. Geschäftskunden-Angebot von sieben auf drei konkrete Vorteile verdichtet. Wiederholter Vision-/Manifestotext neben FAQ entfernt.
- App: dekorative Handys mit Beispielpreis/Beispielbewertung durch eine kompakte Funktionsübersicht ersetzt. Vorhandene Tabs und ihre data-Attribute behalten. Partnerformular bleibt byte-identisch, jetzt in einem nativen details-Element aufklappbar. Die CMS-Zielgruppenkarten bleiben ebenfalls aufklappbar erhalten; keine CMS-Daten gelöscht. Alle fünf vorhandenen Prozessschritte erhalten.
- Zusatzhinweis Vedat: Größe/Schrift/Abstand der Navigation unterscheiden sich. Bestätigte Ursache im CSS: airport-2026.css setzte für den aktiven Tab zusätzlich padding:9px 11px; home-2026.css enthielt parallele Menümaße. Beide Sonderquellen entfernt. Einzige neue Menü-Geometriequelle ist site-2026.css: Desktop 13px / mobil 14px, font-weight 600, explizite Zeilenhöhe, gleiche Innenabstände, Mindestklickhöhe 44px. Aktiver Tab verändert nur Farbe/Hintergrund. Menüzusammenklappen einheitlich bis 1050px; bestehender Menü-Resize-Handler passend auf 1051px angepasst. Alle neun Dokumente verwenden dieselben neuen CSS-/Menü-Versionen; beide Festpreis-Aliase identisch.
- Unverändert: Formularmarkup, Header/Footer-Markup, script.js, analytics.js, API, Mobile, Preisberechnung, Dispatch, Rollen und Benachrichtigungen. site-navigation.js unterscheidet sich nur durch den UI-Breakpoint. Keine Speicherung, Migration, echte Anfrage oder Nachricht im Test ausgelöst.
- Prüfungen: CSS-Syntax mit zwei vorhandenen Parsern geprüft; einheitlicher Seitenrahmen und Versionen über neun Dokumente; keine Menümaß-Regeln mehr in den seitenspezifischen CSS-Dateien; aktiver Tab ohne Geometrieänderung; Formulare und Fachskripte verglichen; native Details, eindeutige IDs, eine H1, lokale Bilder/Assets und Anker geprüft; lokale Seiten/Assets HTTP 200; Menü-/Escape-/Hashchecks, Marketing-Invarianten und git diff --check bestanden. Finale Browser-/Geräte-Sichtprüfung noch offen; in-app Browser für lokale Vorschau nicht verfügbar.
- Öffentliche FAQ-API hat derzeit nur die ersten drei FAQ-Einträge; Verfügbarkeitsantwort 7 bleibt HTML-Fallback und nennt nun Baden-Württemberg. Keine FAQ-API oder Datenbank geändert.
- Deployment: Root-Anmeldung auch mit vorhandenen Agent-Identitäten erneut mit Permission denied (publickey,password) abgelehnt. Keine Rechte geändert und kein Server-Deploy durchgeführt. Git-Push und Live-Stand weiterhin getrennt ausweisen.

Auswirkungen: 1 API/DB nein; 2 Admin-Code nein (CMS-Karten erhalten); 3 Partner-Fachflow nein (nur Formular aufklappbar); 4 Mobile nein; 5 Marketing ja (Inhalt/Layout/Menümaße); 6 Audit dokumentiert; 7 E-Mail/Push nein; 8 Rechte nein. Keine Migration, App-OTA oder Backend-Neustart nötig.
