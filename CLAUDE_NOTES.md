# imoove – Claude Projektnotes
Stand: 10.05.2026

## Stack
- React Native + Expo v54
- Expo Router, TypeScript
- pnpm Monorepo
- Pfad: /Users/vedo/Downloads/imoove
- Mobile: /artifacts/mobile/app/driver/dashboard.tsx

## Dev Befehle
cd /Users/vedo/Downloads/imoove/artifacts/mobile && npx expo start --port 8081 --clear --lan --go
pnpm --filter @workspace/mobile run typecheck

## Fonts (nur diese 4 geladen in _layout.tsx)
- Inter_400Regular
- Inter_500Medium
- Inter_600SemiBold
- Inter_700Bold

## Header Style (modernDriverHeader)
- backgroundColor: #F2F2F7
- borderRadius: 0 (oben eckig, unten rund kommt noch)
- Name: #000000, fontSize 22, Inter_400Regular, letterSpacing -0.5
- Kennzeichen: #6B6B6B, fontSize 13, Inter_400Regular
- Toggle BG: #E5E5EA
- Toggle aktiv: #22C55E (Online) grün
- Tab Container: #E5E5EA, borderRadius 12
- Tab aktiv: weiss + #EF1D26 rot
- Tab inaktiv: transparent + #8E8E93 grau

## Design Prinzip
- Apple Style: hell, clean, SF-feel mit Inter
- Rot: #EF1D26 (imoove Markenfarbe)
- Aktive Tabs/Buttons: rot, inaktiv: grau
- Keine Schatten, keine dunklen Hintergründe

## Bekannte Screens
- driver/dashboard.tsx – Hauptscreen Fahrer
  - Tab: Übersicht (Karte)
  - Tab: Aufträge (Anfragen / Angenommene / Code)
  - Tab: Meine Fahrten (Heute / Woche / Alle)
  - Tab: Geldbeutel
  - Tab: Profil

## Offene TODOs
- Meine Fahrten Filter auf Aufträge-Style bringen (gerade in Arbeit)
- Bereit für Aufträge Pill in Header integrieren
- Alle Tabs auf gleiches Design bringen

## Update 10.05.2026 22:20

### Aufträge Tab - Segment Control
- Container: backgroundColor #E5E5EA, borderRadius 12, padding 3
- Anfragen/Angenommene: flex 1, borderRadius 10, paddingVertical 10
- Aktiv: backgroundColor #FFFFFF, Text #EF1D26, Inter_700Bold, fontSize 14
- Inaktiv: transparent, Text #8E8E93, Inter_500Medium, fontSize 14
- Code Button: gleiche Logik, paddingHorizontal 12, Feather Plus Icon färbt sich mit

### Meine Fahrten Tab - Filter
- filterRow: backgroundColor #E5E5EA, borderRadius 12, padding 3, marginBottom 18
- filterBtn: flex 1, paddingVertical 10, borderRadius 10
- filterBtnActive: backgroundColor #FFFFFF, borderRadius 9
- Text aktiv: #EF1D26, Inter_700Bold, fontSize 14
- Text inaktiv: #8E8E93, Inter_500Medium, fontSize 14

### Fonts - NUR DIESE 4 verwenden!
- Inter_400Regular
- Inter_500Medium  
- Inter_600SemiBold
- Inter_700Bold

## Profil Tab - Stand 11.05.2026 01:02
- Avatar: 72x72, borderRadius 36, backgroundColor #EF1D26, Buchstabe weiß 28px
- Name: #000, fontSize 20, Inter_700Bold
- Kennzeichen: #8E8E93, fontSize 13, Inter_400Regular
- Fahrzeug Card: profilCard style, colors.card background
- Exklusive Angebote: profilCard style, onPress → /sponsors
- Abmelden: profilLogoutBtn style, rot

## Update 11.05.2026 01:15 - Datenbereinigung
- MOCK_RIDES entfernt - nur echte Fahrten aus RideContext.history
- RideEntry Type definiert (id, date, time, from, to, km, duration, amount, payment)
- allRides nutzt jetzt createdAt für echtes Datum
- Wochen-Filter: echter 7-Tage-Filter statt slice(0,12)
- TabFahrten + TabGeldbeutel: typeof MOCK_RIDES → RideEntry[]
- Performance Stats (acceptanceRate etc.) noch hardcoded - TODO echte API

## Update 11.05.2026 01:45 - Server-History
- Neuer DB-Endpunkt: listRidesForDriver(driverId) in ridesData.ts
- Neuer API-Endpunkt: GET /fleet-driver/v1/completed-rides
- Mobile: allRides lädt jetzt vom Server (driver.authToken Bearer)
- Fallback: lokale appRides wenn Server leer
- API-Server Build: ✅ erfolgreich
- Mobile Typecheck: ✅ sauber

## App Struktur - Mobile
Eine App, zwei Ansichten:
- Kunde: /app/index.tsx, my-rides.tsx, wallet.tsx, profile.tsx, reserve-ride.tsx, booking-medical.tsx
- Fahrer: /app/driver/dashboard.tsx (unser Hauptfile)
- Admin: /app/admin/
- Shared: booking-center.tsx, ride-select.tsx, new-booking.tsx

## Kunden-App Design (Stand 11.05.2026)
- Tab-Bar: abgerundet, moderner Stil
- Mitte: grüner "Buchen" Button
- Karte im Hintergrund
- Suchleiste: "Ziel eingeben"
- Buttons: Reservieren (rot) + Krankenfahrt (grün)

## Update 11.05.2026 02:10 - Billing/Rechnungsadresse
- UserProfile erweitert: billingType, companyName, companyAddress, companyCity, vatNumber, costCenter, billingEmail
- BillingModal Component in profile.tsx erstellt
- 3 Typen: Privat / Firma / Kasse
- Firma: Firmenname, Adresse, USt-ID, Kostenstelle, Rechnungs-Email
- Kasse: zeigt Krankenkasse+Versichertennr aus Patientenprofil (readonly)
- Profil-Screen: neue ABRECHNUNG Section zwischen ZAHLUNG und PROFIL
- TODO: Billing-Daten bei Buchung an API senden
- TODO: Admin-Panel Rechnungsversand

## Update 11.05.2026 02:30 - wallet.tsx Billing
- wallet.tsx: useUser updateProfile hinzugefügt
- billingSublabel kommt jetzt aus UserContext (billingType/companyName/krankenkasse)
- BillingModal onClose speichert in UserContext statt lokalem State
- Alter BillingModal in wallet.tsx bleibt (Name/Straße/PLZ) - TODO später durch neuen ersetzen

## Update 11.05.2026 02:40
- wallet.tsx: Rechnungsadresse Section entfernt
- Rechnungsadresse nur noch in Profil → Abrechnung (BillingModal)
- Geldbörse zeigt nur: Bar, PayPal, Kreditkarte, Gutschein, Sicherheit

## Update 11.05.2026 03:00 - Kostenstelle & Account Screen
- new-booking.tsx: billingReference wird automatisch mitgeschickt wenn billingType === "company" und costCenter gesetzt
- profile.tsx: Avatar zentriert, ZAHLUNG & ABRECHNUNG zusammengefasst, hideChevron bei Abmelden
- BillingModal in profile.tsx: Privat/Firma/Kasse Auswahl
- Kostenstelle Flow: Kunde setzt Kostenstelle in Profil → Abrechnung → wird automatisch bei jeder Firmenbuchung mitgeschickt
- TODO: Admin Panel zeigt billingReference in Fahrtenübersicht

## Update 11.05.2026 03:45 - Invoice/PDF System
- API: GET /panel/v1/rides/:id/invoice-pdf → PDF Download
- API: requirePanelAuth unterstützt jetzt auch ?token= Query-Parameter (für PDF-Links)
- Partner Panel TaxiKrankenfahrtenPage: "Rechnung erstellen" Button + "PDF ↓" Download-Link
- Build: ✅ erfolgreich

## TODO (Zahlung fehlen Zugangsdaten)
- PayPal Integration
- Stripe/Kreditkarte Integration

## TODO (nächste Schritte)
- Transportschein-OCR mit Claude API (Foto → Daten → Rechnung an Kasse)
- Gutschein-Generator QR+PDF für Hotel
- Live-Tracking für Hotel-Rezeption
- Krankenkasse Abrechnungs-Dashboard (Kosten pro Patient/Kostenstelle)
- E-Mail Versand Rechnung
