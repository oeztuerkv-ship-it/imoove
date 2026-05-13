# imoove / ONRODA – Claude Projektnotes
Stand: 11.05.2026 04:00

## Projekt-Übersicht
- **App:** imoove / ONRODA – Taxi-App (Fahrer + Kunde)
- **Repo:** https://github.com/oeztuerkv-ship-it/imoove
- **Lokaler Pfad:** /Users/vedo/Downloads/imoove
- **Server:** root@ubuntu-8gb-nbg1-2 (SSH)
- **Live:** https://api.onroda.de, https://admin.onroda.de, https://partner.onroda.de

## Stack
- React Native + Expo v54 (Mobile)
- Node.js + Express + PostgreSQL (API)
- Vite + React (Admin Panel, Partner Panel)
- pnpm Monorepo

## Wichtige Pfade
- Mobile App: artifacts/mobile/app/
- Fahrer Dashboard: artifacts/mobile/app/driver/dashboard.tsx
- Kunden Profil: artifacts/mobile/app/profile.tsx
- API Routes: artifacts/api-server/src/routes/
- Partner Panel: artifacts/partner-panel/src/
- Admin Panel: artifacts/admin-panel/src/

## Deploy-Ablauf (IMMER SO!)
### Mac → Server
1. Mac: testen, typecheck, build
2. Mac: git add (selektiv!) → commit → push
3. SSH: cd /root/imoove && git reset --hard && git pull --ff-only origin main
4. SSH: ./scripts/deploy-onroda-production.sh
5. SSH: curl -i https://api.onroda.de/api/healthz

### Wichtige Befehle
- Mobile Dev: cd /Users/vedo/Downloads/imoove/artifacts/mobile && npx expo start --port 8081 --clear --lan --go
- Typecheck: pnpm --filter @workspace/mobile run typecheck
- API Build: pnpm --filter @workspace/api-server run build
- Port killen: kill -9 $(lsof -t -i :8081) 2>/dev/null || true
- PM2 logs: pm2 logs onroda-api

## Fonts (NUR DIESE 4 in Mobile!)
- Inter_400Regular
- Inter_500Medium
- Inter_600SemiBold
- Inter_700Bold

## Design System (Apple-Style)
- Primärfarbe: #EF1D26 (imoove Rot)
- Header BG: #F2F2F7
- Tab aktiv: #EF1D26 (rot), inaktiv: #8E8E93 (grau)
- Toggle Container: #E5E5EA
- Toggle aktiv: #FFFFFF + roter Text
- Border: #C6C6C8
- Text schwarz: #000000
- Text grau: #8E8E93

## Fahrer Dashboard (dashboard.tsx) – Wichtige Zeilenbereiche
- Header View: ~2589
- Tab-Buttons (Anfragen/Angenommene/Code): ~2682
- modernDriverHeader Style: ~3149
- driverNameModern Style: ~3192
- driverPlateModern Style: ~3198
- segmentSwitch Style: ~3220
- tabScroll Style: ~3270
- mapStatusChip Style: ~3398

## Fahrer Dashboard – Design
- Header: #F2F2F7, borderRadius 20, kein Shadow
- Name: #000000, fontSize 22, Inter_400Regular, letterSpacing -0.5
- Kennzeichen: #6B6B6B, fontSize 13, Inter_400Regular
- Toggle BG: #E5E5EA, aktiv: #22C55E grün
- Tab Container: #E5E5EA, borderRadius 12, padding 3
- Tab aktiv: #FFFFFF + #EF1D26 rot, Inter_700Bold, fontSize 14
- Tab inaktiv: transparent + #8E8E93 grau, Inter_500Medium

## Kunden Account (profile.tsx)
- Avatar zentriert: 80x80, #EF1D26, Initiale weiß
- ZAHLUNG & ABRECHNUNG zusammen in einer SectionCard
- BillingModal: Privat / Firma / Kasse
- hideChevron prop bei Abmelden
- UserProfile hat: billingType, companyName, companyAddress, companyCity, vatNumber, costCenter, billingEmail

## Billing/Kostenstelle Flow
1. Kunde → Profil → Abrechnung → Firma wählen + Kostenstelle eingeben
2. Bei Buchung → billingReference automatisch mitgeschickt
3. Server speichert in billing_reference Spalte
4. Partner Panel / Admin Panel sieht Kostenstelle bei Fahrt

## API Endpunkte (neu heute)
- GET /api/fleet-driver/v1/completed-rides → Fahrer-History vom Server
- GET /api/panel/v1/rides/:id/invoice-pdf → PDF Download (auth: Bearer oder ?token=)
- POST /api/panel/v1/rides/:id/create-invoice → Rechnung erstellen

## Partner Panel – Was vorhanden ist
### Taxi
- Fahrerverwaltung, Fahrzeuge, Tarife ✅
- Krankenfahrten + Abrechnungsstatus ✅
- "Rechnung erstellen" Button ✅ (heute gebaut)
- "PDF ↓" Download-Link ✅ (heute gebaut)

### Krankenkasse
- Dashboard (offen/aktiv/abgeschlossen) ✅
- Fahrtenübersicht mit Kostenstellen ✅
- Serien-Buchung ✅
- Kostenstellen anlegen ✅

### Hotel/Agentur
- Gast-Buchung ✅
- Gutschein-Buchung ✅

## TODO (nächste Sessions)
- [ ] Transportschein-OCR mit Claude API (Foto → Daten → Rechnung an Kasse)
- [ ] Gutschein-Generator QR+PDF für Hotel
- [ ] Live-Tracking für Hotel-Rezeption
- [ ] Krankenkasse Abrechnungs-Dashboard (Kosten pro Patient/Kostenstelle)
- [ ] E-Mail Versand Rechnung
- [ ] PayPal Integration (braucht Zugangsdaten)
- [ ] Stripe/Kreditkarte (braucht Zugangsdaten)
- [ ] Datenschutzerklärung Seite
- [ ] Encoding-Bug Umlaute bei Google Login (Datenproblem, neu einloggen)

## PM2 Prozesse (Server)
- onroda-api (id: 0) → Port 3000
- onroda-partner (id: 4)

## Wichtige URLs
- API Health: https://api.onroda.de/api/healthz
- Admin: https://admin.onroda.de
- Partner: https://partner.onroda.de

## TODO - Homepage Deploy Fix
- CSS Änderungen (style.css) sind im Repo korrekt
- Aber onroda.de zeigt noch alte Version
- Problem: rsync von artifacts/api-server/static/ → Webroot fehlt
- Fragen an Entwickler gesendet (Webroot, rsync-Pfad, CDN, Cache-Purge)
- Sobald Antwort: ONRODA_RSYNC_MARKETING_STATIC_TO in .env setzen
- Dann: style.css Änderungen live → warmes Beige #F5F0EB sichtbar

## Server-Struktur (WICHTIG!)
- Homepage live: /var/www/onroda/ (index.html, style.css, onroda-brand.css, script.js)
- Deploy-Script: /root/deploy-home.sh → kopiert von /root/imoove/artifacts/api-server/static/ nach /var/www/onroda/
- Nginx Config: /etc/nginx/sites-enabled/final-try.bak.2026-04-21-174118
- API läuft via PM2: onroda-api (Port 3000)
- Partner Panel: onroda-partner (PM2 id: 4)
- Nach CSS-Änderungen: bash /root/deploy-home.sh auf Server ausführen

## TODO - Vollständige Prioritätenliste (Stand 14.05.2026)

### 🔴 KRITISCH (sofort)
- [ ] WebSocket Security: JWT-Check beim "join" einbauen (Datenschutz!)
- [ ] Push-Notifications: Expo Notifications einrichten (Fahrer verpasst Aufträge!)
- [ ] SMTP einrichten: PARTNER_REGISTRATION_SMTP_URL in .env setzen

### 🟡 WICHTIG (kurzfristig)
- [ ] Provision pro Firma: "Pro Firma" JSON-Feld in Admin durch echte UI ersetzen (kein JSON tippen)
- [ ] Transportschein OCR: Claude API → Foto → Muster 4 Daten → Rechnung → Kasse
- [ ] Navigation-Bug: Google Maps durchscheinen fixen (Entwickler hat Lösung)
- [ ] Encoding-Bug: Umlaute bei Google Login (Datenproblem)

### 🟢 MEHRWERT (mittelfristig)
- [ ] PayPal/Stripe Integration (braucht API-Keys)
- [ ] Gutschein-Generator QR+PDF für Hotel
- [ ] Krankenkasse Abrechnungs-Dashboard (Kosten pro Patient/Kostenstelle)
- [ ] Live-Tracking für Hotel-Rezeption
- [ ] Datenschutzerklärung Seite

### 💡 ZUKUNFT
- [ ] Google Places API: Arztpraxen Stuttgart exportieren
- [ ] Sammel-Rufnummer für Praxen
- [ ] Auto-Kennzeichen/Dokument-Erkennung
- [ ] Claude Project "imoove ONRODA" anlegen mit CLAUDE_NOTES.md

### ✅ BEREITS VORHANDEN (nicht nochmal bauen!)
- Provision Admin Panel: Standard%, pro Fahrtart, pro Region, pro Firma ✅
- Tarife Admin Panel: Grundgebühr, km-Preis, Nachtzuschlag, Feiertag ✅
- WebSocket: GPS-Tracking, Chat, Auto-Reconnect ✅
- Partner Freigabe-Flow ✅
- PDF Rechnungen ✅
- Kostenstellen-Flow ✅
- fare-estimate API ✅
