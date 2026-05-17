# imoove / ONRODA – Claude Projektnotes
Stand: 17.05.2026

## Team
- **Vedat** — Produkt, Entscheidungen, Testing
- **Claude** — Analyse, Code-Review, Architektur, immer dabei
- **Entwickler (Cursor)** — Implementierung
- **Regel:** Claude analysiert Code SELBST bevor Fix angefordert wird. Kein "wahrscheinlich" — Ursache 100% verstehen, dann erst coden.

## Projekt
- **App:** imoove / ONRODA – Taxi-App (Fahrer + Kunde)
- **Repo:** https://github.com/oeztuerkv-ship-it/imoove
- **Lokal:** /Users/vedo/Downloads/imoove
- **Server:** root@ubuntu-8gb-nbg1-2
- **Live:** api.onroda.de, admin.onroda.de, partner.onroda.de

## Stack
- React Native + Expo v54 (Mobile)
- Node.js + Express + PostgreSQL (API)
- Vite + React (Admin/Partner Panel)
- pnpm Monorepo

## Arbeitsregeln
1. [MAC] oder [SSH] vor jedem Befehl
2. Einen Befehl, warten, dann weiter
3. Volle Pfade /Users/vedo/Downloads/imoove/...
4. Port killen vor Expo: kill -9 $(lsof -t -i :8081) 2>/dev/null || true
5. Entwickler-Aufgabe → warten auf Antwort, keine neuen Befehle
6. Entwickler-Antwort → Claude prüft zuerst, dann weitermachen

## Deploy
1. [MAC] build + typecheck
2. [MAC] git add → commit → push
3. [SSH] git reset --hard && git pull --ff-only origin main
4. [SSH] ./scripts/deploy-onroda-production.sh
5. [SSH] curl -i https://api.onroda.de/api/healthz

## Mobile Dev
kill -9 $(lsof -t -i :8081) 2>/dev/null || true && cd /Users/vedo/Downloads/imoove/artifacts/mobile && npx expo start --port 8081 --clear --lan --go

## Design System (Apple iOS Style)
- Background: #F2F2F7 / Card: #FFFFFF / Surface: #F2F2F7
- Primary: #EF1D26 / Border: #C6C6C8 / Success: #34C759
- Fonts: Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold

## Navigation-Regel (WICHTIG!)
Ziel von externem Screen → setPendingDestination(Ref) + router.replace("/") OHNE Params
NIEMALS URL-Params bei router.replace!
Nach Pending → router.push("/ride-select")

## Reservierungs-Ablauf
1. Kunde bucht → scheduled (scheduledAt > jetzt + 60min)
2. Fahrer nimmt an → scheduled_assigned
3. Storno bis 60min vor Fahrt
4. 45min vor Fahrt → Fahrer drückt Aktivieren → ready_for_dispatch → GPS
5. Nicht aktiviert → 24h Sperre + Fahrt frei
6. Kein Fahrer bis 10min → cancelled_by_system

## DB
psql postgres://onroda_user:onroda123@localhost:5432/onroda
66 Migrationen (zuletzt: 066_fleet_drivers_market_online)

## Ghost-Aufträge (Fahrer-App)

**Vollständiges Postmortem + Checkliste:** `.cursor/rules/imoove-mobile-driver-ghost-orders.mdc`  
(Ursachen: globaler `RideRequestProvider`, Kunden-Poll auf `/driver/login`, Notification-`prevPendingIds`/React-Timing, ONLINE-Flow, API `market-rides`/`rejectedBy`.)

## Offene Tasks
### 🔴 Kritisch
- [ ] Ghost-Auftrag: Abnahme-Checkliste in Rule `imoove-mobile-driver-ghost-orders.mdc` durchspielen
- [ ] Push Notifications (Expo)
- [ ] SMTP in .env

### 🟡 Wichtig  
- [ ] Orte-Screen: Hotel-Filter, Flughafen Flugnummer, Krankenhaus Unterfilter
- [ ] Reservieren Screen Redesign
- [ ] Abgeschlossen Tab: Monats-Filter

### ✅ Erledigt
- Cron Lifecycle (4 Jobs) ✅
- 24h Fahrersperre ✅
- Preis-Bug gefixt ✅
- Chat Reply + Keyboard ✅
- Fahrer Online/Offline DB-persistent ✅
- Ghost-Auftrag (Login/ONLINE/Baseline/Ref-Doku in Cursor-Rule) ✅
- Echte Fahrtdauer ✅
- Orte-Screen mit Google Places ✅
- GPS Entfernung sortiert ✅
- Taxi-Button via RideContext ✅
