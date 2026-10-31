# ONRODA iOS 1.0.4 (48) — Production-Kandidat, nicht veröffentlicht

## 1. Ziel / Freigabe
Reguläres Update der bestehenden App Store-App ONRODA, Apple-ID 6773487513, Bundle-ID com.vedat.mobile. Google-Navigation bleibt in derselben App. Vedat verlangt Vorbereitung/Tests, aber keine App-Store-Veröffentlichung vor ausdrücklicher Freigabe. Kein Submit, Review oder Release automatisch ausführen. Vorbereitete Draft-Metadaten sind keine Veröffentlichung.

## 2. Betroffene Bereiche
Mobile/Fahrer und OTA-Konfiguration; kein API-/DB-/Admin-/Partner-/Dispatch-/Finance-/Medical-/Benachrichtigungs-Deploy. Vorhandene fremde Änderung deployRevision.generated.ts bleibt unangetastet.

## 3. App-Identität / Datenfluss
Apple Lookup und App Store Connect bestätigt: bestehende App 1.0.3, Store-Build 46. TestFlight zeigt 46 als neuesten vorhandenen Build, noch keine Version 1.0.4. Interner SDK-Build 47 war ad hoc, kein Store-Kandidat.
Kandidat: 1.0.4 (48), distribution=store, Release, developmentClient=false, simulator=false, environment=production, channel=production. Apple-ID/Bundle-ID/Scheme/EAS-Projekt/Backend-Host unverändert. Normales App-Store-Update nach späterer Apple-Freigabe.

## 4. Native Navigation / Berechtigungen
GoogleNavigation 10.13.0 und RN-Wrapper 0.16.3 bereits im internen IPA kompiliert/verlinkt und im Paket nachgewiesen. Production-Store-IPA ist inzwischen erfolgreich gebaut und geprüft (Nachweis unten). Native iOS-Schlüsselvariable für development und production verfügbar, Wert unverändert und nicht ausgegeben. Nur der iOS-Worker benötigt den iOS-Key; kein Android-Key für iOS verlangt.
Google-SDK erfordert iOS 16.0+, die bestehende Store-App unterstützt 15.1+. iOS-15-Geräte erhalten diesen Kandidaten nicht und behalten die vorhandene App. Keine erzwungene Mindestversion im Backend setzen.

## 5. Persistenz / Rollen
Bundle-ID und bestehende Session-/Storage-Schlüssel bleiben erhalten. Keine neue App anlegen. Fahrer-Bearer und zugewiesene Fahrt bleiben Rechtebasis. Kunde bleibt im Kundenscreen, Navigation bleibt Fahrerfunktion. Keine Preis-, PIN-, Storno- oder Fahrtstatus-Handler ändern.

## 6. OTA / Betriebslogik
Production-Channel zeigt bisher auf Branch nav-diag-runtime; Zuordnung nicht umstellen, um ältere 1.0.3-Nutzer weiter zu versorgen. Runtime des Kandidaten: onroda-google-nav-prod-1. Interner Test: onroda-google-nav-1. Alt: 1.0.3. Exakte Runtime-Auswahl verhindert das Vermischen der drei Binaries. Kein Production-OTA während der Vorbereitung veröffentlichen.
Reine JS-Updates erst nach Freigabe über den dokumentierten iOS-Production-OTA-Helfer. Native SDK-/Berechtigungs-/ABI-Änderungen brauchen einen neuen Store-Build und gegebenenfalls eine neue Runtime. Build-Profil-env wird bei normalem eas update nicht automatisch übernommen.

## 7. Backend / Kunden-Tracking / Auswirkungen
SDK nutzt dieselben Standort-/Route-Endpunkte, dieselbe Authentifizierung und denselben Payload-Vertrag. Backend/DB bleiben unverändert. Bestehende Geschäfts-Handler und Kunden-Tracking gegen Quellbaseline vergleichen; Servergesundheit nur lesend prüfen. Keine echten Marktaufträge, Zahlungen oder Statuswechsel zum Test erzeugen.
Google-Cloud-Freischaltung/Key-Restriktionen und zum Abrechnungskonto passende Bedingungen/Standort-Aufbewahrung vor allgemeiner Freigabe prüfen. Native Kompilierung beweist keine gültige Navigation-SDK-Lizenz am Gerät.

## 8. Regression / bestätigte Typfehler
Bestehende Diagnostik-Typen an bereits gesendete Felder/Quelle recenter angepasst. Ungültiger Kamera-Selftest erhält gültige Session-/Generationsmetadaten, damit gezielt NaN geprüft wird. Initiale Legacy-Karte explizit vollständig typisiert: Norden entspricht dem bisherigen MKMapCamera-Default; dies fließt weder als GPS-Kurs noch als Fahrer-Heading in die NavigationState ein. Live-Follow bleibt ausschließlich bei CameraEngine bzw. Google-SDK. Keine falsche Heading-Quelle einführen.

## 9. Prüfstatus / verbleibende Abnahme
Automatisiert: Typecheck, SDK-Sitzung/Ankunft/Zielwechsel, Kamera/Padding/Ton, Konfiguration, Gradle-Plugin, bestehende Navi-/GPS-/Restore-/Status-Selftests, iOS-Export und nativer Store-Build. Ergebnisse nach tatsächlichem Lauf ergänzen.
Offen bleibt echte Geräte-Abnahme: Annahme/Ankunft/PIN/Start/Ziel/Ende, Kunde+Fahrer, Kamera/GPS/Netz/Bluetooth, falsches Abbiegen, Hintergrund/Restore, Push, Login und Zahlungen. Lokaler Simulator/Handyzugriff derzeit nicht verfügbar. Bestehende No-Show-/optimistische-Ankunft-/PIN-Themen aus Fahrtablauf-Backlog werden durch diesen Release nicht pauschal als behoben behauptet.

## 10. Auswirkungen (Pflicht)
1. API/DB: nein; keine neue Migration, bestehende Verträge.
2. Admin: nein.
3. Partner: nein.
4. Fahrer/Kunde: native Google-Navigation im regulären iOS-App-Update; Kunden-Tracking mit bestehendem Vertrag.
5. Marketing/Onboarding: keine Änderung; App-Store-Entwurf vorbereiten.
6. Audit: Versions-, Build- und Paketprüfungen dokumentieren; bestehende Fahrt-Historie.
7. E-Mail/Benachrichtigungen: keine neue Kommunikation, Push-Konfiguration abgleichen.
8. Rechte/Module: gleicher Bundle-/Team-Kontext; iOS-16-Mindestversion als Auswirkung.

## OTA-Kommandos für den neuen iOS-Store-Build
Aus artifacts/mobile mit Node 20:
- node scripts/ios-production-ota.cjs --check: nur Konfiguration/Identität prüfen.
- node scripts/ios-production-ota.cjs --prepare: Production-Umgebung laden, Profil-env übernehmen, sauberes/gepushtes main prüfen und iOS-Bundle + Plan erzeugen; veröffentlicht nichts.
- node scripts/ios-production-ota.cjs --publish: nur nach ausdrücklicher Freigabe; verteilt ausschließlich iOS mit Runtime onroda-google-nav-prod-1 an production. Kein App-Store-Submit.
Der alte Production-Channel bleibt auf seiner bisherigen Branch-Zuordnung; die native Runtime filtert kompatible Binaries. Keine automatische Umleitung von alten 1.0.3-Nutzern auf SDK-JS.

## Bisher tatsächlich ausgeführte Vorprüfungen
- App Store Connect angemeldet lesend geprüft: ONRODA / 6773487513 / Version 1.0.3 (46); TestFlight neuester vorhandener Build 46. Keine vorhandene 1.0.4 sichtbar.
- Google Cloud imoove-492321: ONRODA Navigation SDK Key ist auf iOS-App com.vedat.mobile sowie Maps SDK for iOS und Navigation SDK eingeschränkt; keine Schlüsselwerte ausgegeben. Maps SDK for iOS und Navigation SDK sind in der Liste aktivierter APIs vorhanden. Tatsächliche SDK-Initialisierung am Gerät bleibt separat zu prüfen.
- Aufgelöstes EAS-Production-Profil bestätigt store, production, developmentClient=false und 1.0.4 (48) / com.vedat.mobile / onroda-google-nav-prod-1. SDK-54-Buildimage und Node 20.20.2 explizit. Bereits verifiziertes internes IPA wurde mit Xcode 26 / iOS SDK 26.0 gebaut; neuen Store-Kandidaten erneut darauf prüfen. Apple verlangt seit 28.04.2026 Xcode 26+ / iOS SDK 26+.
- Mobile Typecheck nach den Typvertragskorrekturen grün. Expo-Abhängigkeitscheck: Dependencies are up to date. SDK-/Gradle-/Konfigurations-Selbsttests, 18 Übergangsfälle und 14 Navi-Selbsttests grün.
- 9 zentrale Fahrtaktions-Handler sowohl gegen 9efbb4b3 als auch gegen den tatsächlich ausgelieferten OTA-Stand 5712b145 AST-identisch; status.tsx, RideRequestContext.tsx und socket.ts unverändert. 17 isolierte Fahrt-Szenarien liefern erwartete Ergebnisse, einschließlich bereits dokumentierter Fehlerfälle; keine Geräte-/Livefahrt-Abnahme daraus ableiten.
- Produktives Backend: GET /api/healthz und /api/app/config liefern 200; Read-only-SSH bestätigt weiterhin Revision 6edca151ea925e820764be0a5f2fab87ef6f4e6b. Kein Backend-Deploy, kein Restart und keine Migration.
- Globaler Repo-Invariantencheck scheitert an bereits in 9efbb4b3 vorhandener doppelter Migration 097 (homepage_analytics / homepage_hero_subline_regional). Nicht durch den iOS-Kandidaten verursacht; keine Migration umnummerieren oder ausführen. Vor einem späteren Backend-Deploy separat klären.

Quellen: https://developer.apple.com/news/upcoming-requirements/ ; https://docs.expo.dev/build-reference/infrastructure/ ; https://developers.google.com/maps/documentation/navigation/ios-sdk/release-notes .

## Abschließender Nachweis vom 31.10.2026
- EAS-Store-Build erfolgreich: https://expo.dev/accounts/oeztuerkv-ship-it/projects/mobile/builds/33dce504-19f2-477b-ac20-1f3188af075e . Binärquellstand 791a249097152d3ed821f6f90e07912aa7ee90f4, Version 1.0.4, Build 48, Bundle-ID com.vedat.mobile.
- Tatsächlich heruntergeladenes IPA geprüft: Store-Provisionierung ohne registrierte Geräte/Entwicklungs-Debugrecht, Team passt zur bestehenden App, codesign --verify --deep --strict erfolgreich. Google-NavModule/GoogleNavigation im ausführbaren Programm und Google-Privacy-Manifest vorhanden. Xcode 26.0 / iPhoneOS SDK 26.0; Mindest-iOS 16.0.
- Signierte Entitlements: Push production; bestehende Apple-Pay- und Sign-in-with-Apple-Konfiguration erhalten.
- IPA-SHA256: 304a32d34b7a4df7804d3bd73366f1286db28f704fbb3f530d8fe7c126224e11.
- Production-iOS-Export und OTA-Helfer --prepare erfolgreich: Runtime onroda-google-nav-prod-1, Channel production, published=false. Das bisherige Production-OTA für Runtime 1.0.3 wurde abschließend erneut anhand Endpoint und Bundle-Hash unverändert bestätigt.
- Kein Upload zu App Store Connect, kein Submit, kein Review/Release, kein Production-OTA. Release-Texte liegen in artifacts/mobile/store-release-notes-de.txt. Ein neuer App-Store-Connect-Versionsentwurf wurde nicht gespeichert: parallele Browsernutzung unterbrach die UI-Bearbeitung. Dies beeinträchtigt den fertigen Store-Build nicht.
- Offene Freigabepunkte: echte iPhone-/Kunden-Fahrer-Abnahme wie oben; Google-Konto-/Lizenzbedingungen und Aufbewahrung Google-abgeleiteter Standortdaten. Der bestehende Standortpfad schreibt auch Fahrtverlauf; eine hinreichende 30-Tage-Bereinigung ist bislang nicht nachgewiesen. Keine Daten gelöscht und keine Backend-Aufbewahrung verändert. Dies ist kein Nachweis einer bereits feststehenden Verletzung, sondern ein offener Prüfpunkt vor allgemeinem Rollout.
- Die bekannten Geschäftslogik-Themen im Fahrtablauf-Backlog sowie die doppelte Backend-Migration 097 bleiben separat offen. Erfolgreicher Build und Quellvergleich ersetzen keine Livefahrt-Abnahme.
