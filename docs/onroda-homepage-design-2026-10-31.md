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
