# Google-Navigation: Integration und Abnahme (31.10.2026)

## 1. Ziel
Fahrer erhält Googles native Fahransicht, Sprachführung und Rerouting statt eigener Kamera-/Heading-/Abbiege-Steuerung. Vedat hat die eingebettete Integration beauftragt. Erfolg: stabile Abholung → bestätigter Fahrtbeginn → Zielnavigation auf echtem Gerät, Kunde bleibt in ONRODA.

## 2. Bereiche
Mobile/Fahrer betroffen. API, DB, Admin, Partner, Finance, Medical, Dispatch, Notifications und OCR unverändert. SDK 0.16.3 bleibt gepinnt; keine Dependency-Migration.

## 3. Datenfluss
Eigene bestätigte Fahrt → bestehende ONRODA-Navi → native Capability-Prüfung → Google-Bedingungen/Berechtigung/init → neuestes Ziel → Guidance. Kamera folgt ausdrücklich TILTED; native Karte erhält Platz über dem ONRODA-Sheet. Audio-Schalter steuert Googles Ansagen einschließlich Bluetooth. Hintergrundfreigabe richtet sich nach erteilter Berechtigung.
Google-Standort und ETA → bestehende authentifizierte Standort-Endpunkte; tatsächliche SDK-Routengeometrie → bestehender driver-nav-route-Kanal → Kundenansicht. Keine künstliche gerade Route. Bei Neuberechnung alte ETA verwerfen. Originale Kunden-Binaries bleiben eine gesonderte E2E-Abnahme.

## 4. Rollen/Rechte
Bisheriger Fahrer-Bearer/zugewiesene Fahrt gelten unverändert. Google-Ankunft meldet keinen ONRODA-Fahrtstatus und startet keine Fahrt. PIN, Start, Storno, Abschluss und Preis bleiben in vorhandenen Handlern. Private Merkliste sendet weiterhin keine Fahrt-Daten.

## 5. Persistenz/Restore
Bestehende Fahrt und Phase werden wiederhergestellt. Pro Navigator-Lebensdauer eine native Sitzung; konstante Provider-Optionen verhindern Reinitialisierung bei GPS-Rendern. Zielwechsel werden serialisiert; überholte Antworten starten keine Guidance. Cleanup wartet laufende native Arbeit ab. Keine neue Persistenz oder Migration.

## 6. Betriebslogik
Abholnavigation pausiert bei bestehendem hasArrived; bestätigter in_progress-Wechsel setzt das Ziel im gleichen Screen. Standort-Erstberechtigung und Google-Bedingungen werden ausdrücklich geprüft. Fehler meldet sichtbaren Fallback auf bestehende Navigation. Deren bekannte Ankunft-/No-Show-/PIN-Probleme werden hier nicht umgeschrieben.

## 7. Finance/Audit/Support
Keine neue Preis- oder Gebührenlogik. Diagnosen enthalten feste Fehlercodes, keine Schlüssel. Vor allgemeinem Rollout Cloud-SDK-Freischaltung und zum Abrechnungskonto passende Google-Nutzungsbedingungen prüfen: EEA und globale Regeln unterscheiden sich bei Nicht-Google-Karten. SDK-Koordinaten unterliegen 30 Tagen Caching; bestehende serverseitige Aufbewahrung vor Rollout abnehmen. Test-Build ist keine allgemeine Produktionsfreigabe.

## 8. Regression und Fallback
Nur native Capability und googleNavigationEnabled aktivieren das SDK. Diagnose-Route hat keinen statischen SDK-Import mehr. Legacy-GPS/Route/Turn-Ansagen bleiben bei aktivem Google getrennt. Nur für echten SDK-Fehler sichtbarer Legacy-Fallback. Original-App-Zweig bleibt unverändert.
Neuer interner Build: Profil google-navigation, Channel google-navigation, App 1.0.4, iOS 47 / Android 7, Runtime onroda-google-nav-1. Keine OTA-Verteilung an Original-Runtime 1.0.3 und keine Änderung ihres Production-Channels.

## 9. Tests/Abnahme
Lokal: Queue-Tests, gemockter View-Lebenszyklus und Build-Konfiguration; 18 bestehende Übergangsfälle und 14 Navi-Selbsttests. Native JS-Bundles iOS/Android. Typecheck hat drei vorhandene Fehler in Legacy-Kamera/source/selftest; keine neuen SDK-Typfehler. Native Cloud-Build und echte Gerätefahrt stehen bei Erstellung dieser Notiz aus.
Gerätefälle: Kaltstart/erste Berechtigung, geneigter Follow im Stand/bei Fahrt, Pan/Recenter, Ton aus/an/Bluetooth, absichtlich falsch abbiegen, GPS/Netz weg/zurück, Zielwechsel während Neuberechnung, Hintergrund/Display aus, Annahme/Ankunft/PIN/Start/Ziel/Ende, Storno/Restore, Kunde auf Original-App. Kein echter Marktauftrag ohne Vedats gezielten Testauftrag.

## 10. Auswirkungen
1. API/DB: nein, bestehende Verträge.
2. Admin: nein.
3. Partner: nein.
4. Fahrer-App: ja, native Navigation; Kunden-Tracking benötigt Geräteabnahme.
5. Homepage/Onboarding: nein.
6. Timeline/Audit: bestehende Statushistorie, keine neue Buchungsaktion.
7. E-Mail/Benachrichtigung: nein.
8. Rechte/Module: unverändert, nativer Build mit eigenen Navi-Schlüsseln.
Nächster Schritt: installierbarer interner Build und Geräteabnahme, danach gesonderte Produktionsveröffentlichung.
