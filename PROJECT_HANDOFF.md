# Onroda / imo — Projekthandoff (Codebase-Analyse)

**Zweck:** Ein externes Team oder eine KI soll dieses Dokument lesen und das Repo ohne Rückfragen navigieren können.  
**Scope:** Monorepo-Root + **`artifacts/api-server`** + **`artifacts/mobile`**. Kein vollständiges Web-App-Produkt unter `artifacts/`; Marketing-HTML wird vom API-Server ausgeliefert.

---

## 1. Tech-Stack & Umgebung

### Workspace & Pakete
| Aspekt | Details |
|--------|---------|
| Paketmanager | **pnpm** (Root `package.json` verweigert npm/yarn) |
| Definition | `pnpm-workspace.yaml`: u. a. `artifacts/*`, geplante `lib/*`, `scripts` |
| Sicherheit | `minimumReleaseAge: 1440` (1 Tag seit npm-Publish); Allowlist z. B. `@replit/*` |
| Versionen | **pnpm catalog** in `pnpm-workspace.yaml`: u. a. `react`/`react-dom` **19.1.0**, `zod`, `drizzle-orm`, `vite` 7, `tailwindcss` 4, `@tanstack/react-query` |

### `artifacts/api-server` (`@workspace/api-server`)
| Bereich | Technologie |
|--------|-------------|
| Sprache | **TypeScript**, **ESM** (`"type": "module"`) |
| HTTP | **Express 5** |
| Build | **esbuild** (`build.mjs` → `dist/index.mjs`) |
| Prozessstart | `node --enable-source-maps ./dist/index.mjs` (**`PORT` Pflicht**) |
| Logging | **pino**, **pino-http** |
| Echtzeit | **`ws`** — in `src/index.ts` wird ein **WebSocketServer** an **`path: "/ws"`** an denselben HTTP-Server gehängt |
| API-Shapes | **zod** (z. B. Health-Response) |
| Abh. (Hinweis) | **`drizzle-orm`** und **`socket.io`** sind in `package.json`; **Routen nutzen weder DB noch socket.io** — Persistenz der Rides = In-Memory, Echtzeit = `ws` |
| Sonstiges | `cors`, `cookie-parser` |

### `artifacts/mobile` (`@workspace/mobile`)
| Bereich | Technologie |
|--------|-------------|
| Framework | **Expo SDK ~54**, **React Native 0.81.x** |
| Router | **expo-router ~6** (file-based; in Logs typ. `expo-router@6.0.x`) |
| React | **19.x** (Workspace-Catalog) |
| Karten | **react-native-maps**; Google Maps Keys in **`app.json`** (`ios.config` / `android.config`) |
| State | **React Context:** `User`, `Driver`, `Ride`, `RideRequest` |
| Server-State | **@tanstack/react-query** installiert (QueryClient in Root-Layout) |
| Lokal speichern | **AsyncStorage** |
| Auth-UI | Google über Backend-OAuth + **expo-web-browser** |
| Audio | **expo-av** in `utils/notifications.ts` — **SDK 54 warnt: deprecated**, Migration auf `expo-audio` empfohlen |
| Build/Tooling | **React Compiler** (`babel-plugin-react-compiler`, `app.json` `experiments.reactCompiler`); **typed routes** (`experiments.typedRoutes`) |

### Umgebungsvariablen (relevant)
| Variable | Wo | Rolle |
|----------|-----|--------|
| `EXPO_PUBLIC_API_URL` | `artifacts/mobile/.env` | Basis-URL; `utils/apiBase.ts` ergänzt ggf. `/api` |
| `PORT` | API-Server | Bindung des HTTP+WS-Servers |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | API | `/api/auth/google/*` |
| `BACKEND_URL` | API | OAuth-Callback-Konstruktion in `auth.ts` |

---

## 2. Projektstruktur & Architektur (wesentliche Pfade)

### Repository-Root
```
imoove/
├── package.json              # Root-Scripts: typecheck über artifacts/scripts
├── pnpm-workspace.yaml
├── tsconfig.json             # Project references auf lib/* — siehe Schulden
└── artifacts/
    ├── api-server/           # Backend + statische Marketing-Seite
    └── mobile/               # Expo-App
```

**Bewusst ausgelassen:** `node_modules`, `dist`-Artefakte, `.expo`-Caches — übliches Generated.

### Backend (`artifacts/api-server`)
| Datei / Ordner | Aufgabe |
|----------------|---------|
| `src/index.ts` | `http.createServer(app)`; **WebSocketServer `/ws`**; Ride-Räume; Broadcast GPS (`location:driver` / `location:customer`) |
| `src/app.ts` | Express-App: **Host-basiertes Routing** (Marketing vs API vs optional `dist/public`), Mount `/api`, Logging, CORS, JSON |
| `src/routes/index.ts` | Aggregator unter **`/api`**: health, auth, rides |
| `src/routes/health.ts` | `/api/healthz`, `/api/v1/health` |
| `src/routes/auth.ts` | Google OAuth (PKCE, state, in-memory pending/profiles), Endpoints für Mobile-Flow |
| `src/routes/rides.ts` | **In-Memory** `RideRequest[]`, CRUD-artige Routen, GPS REST, reject/driver-cancel, `DELETE /rides/demo` |
| `src/routes/admin.ts` | Minimal-HTML `/admin` |
| `src/lib/logger.ts` | pino-Logger |
| `static/index.html` | Landing für Hosts `onroda.de` / `www.onroda.de` (siehe `app.ts`) |

### Mobile (`artifacts/mobile`)
| Pfad | Aufgabe |
|------|---------|
| `app/_layout.tsx` | Fonts, Splash, **Provider-Reihenfolge:** User → Driver → RideRequest → Ride → Stack; **Stack.Screen**-Liste |
| `app/index.tsx` | Hauptkunde: Karte, Buchung/Onboarding, tiefe Home-Logik |
| `app/ride.tsx` | Buchungsflow |
| `app/status.tsx` | Live-Status / Karten / WS+HTTP |
| `app/profile.tsx`, `personal-info.tsx`, `wallet.tsx`, `my-rides.tsx` | Konto & Historie |
| `app/reserve-ride.tsx`, `fahrt-reservieren.tsx` | Reservierung (Modals im Stack) |
| `app/driver/login.tsx` | Fahrer-Login (gegen **Mock** in `DriverContext`) |
| `app/driver/dashboard.tsx` | Fahrer-Operationscenter (Aufträge, Tabs, Karte) |
| `app/driver/navigation.tsx` | Navigation zur laufenden Fahrt |
| `app/vendor/login.tsx`, `app/admin/index.tsx` | Zusätzliche Einstiege |
| `app/help.tsx`, `impressum.tsx` | Hilfe / Impressum |
| `app/(tabs)/` | Redirect-Konstrukt (`Redirect` zu `/`) — kein aktiver Tab-Navigator als Haupt-UI |
| `context/*.tsx` | Domänenlogik & Persistenz-Schlüssel (siehe Abschnitt 3) |
| `utils/apiBase.ts`, `utils/socket.ts`, `utils/routing.ts`, `utils/fareCalculator.ts`, `utils/notifications.ts` | API-URL, WS-Client, Geo, Preise, Sounds |
| `components/RealMapView.*` | Native/Web-Kartenabstraktion |

---

## 3. Datenfluss & Verknüpfungen

### REST (Mobile → API)
1. Basis: `getApiBaseUrl()` — normalisiert Host so, dass Pfade wie **`/rides`** unter **`…/api`** liegen, wenn nur der Host gesetzt ist.
2. **RideRequestContext** synchronisiert Liste und Status mit **`GET /rides`**, **`POST /rides`**, Patches/Actions je nach Implementierung (siehe `RideRequestContext.tsx` + `rides.ts`).
3. **Buchung** erfordert serverseitig u. a. `customerName` + **`passengerId`** (`POST /rides` Validierung in `rides.ts`).

### OAuth (Mobile)
- Start: App ruft **`/api/auth/google/start?returnUrl=…`** → `authUrl` → **WebBrowser** → Callback serverseitig → Profilübernahme in App via **`/api/auth/google/profile?result=…`** (Details in `auth.ts`).

### WebSocket (Live-GPS)
- Client: `utils/socket.ts` — URL aus API-Basis: **HTTPS → `wss://…/ws`** (Suffix `/api` wird für Host abgeschnitten).
- Server: `src/index.ts` — Nachrichten u. a. **`join`**, **`location:driver`**, **`location:customer`**; Broadcast **`location:driver:update`** / **`location:customer:update`** an andere Clients im Raum.
- REST-Fallback: `rides.ts` Endpoints `…/driver-location`, `…/customer-location`.

### Lokale Persistenz (Gerät)
| Key / Konzept | Inhalt |
|---------------|--------|
| `@taxi24_user_profile` | Kundenprofil inkl. `isLoggedIn` (`UserContext`) |
| `@Onroda_driver_session` | Fahrerprofil (`DriverContext`) |
| `@Onroda_passenger_id` | Stabile ID für API als Passagier (`RideRequestContext`) |

### Host-Routing (ein Server, mehrere Rollen)
- **`app.ts`** prüft Host (`x-forwarded-host` / `host`):
  - **onroda.de / www** → statische **Marketing**-`index.html`, keine Expo-Web-Auslieferung unter Wildcard auf dieser Domain.
  - **api.onroda.de + localhost** → API-JSON auf `/`, Routen unter **`/api`**.
  - Andere Hosts → optional **`dist/public`** static (z. B. getrennte App-Subdomain).

### Doppel-Mount Ride-Router
- `app.use("/api", router)` enthält **`rides` unter `/api/rides`**.
- Zusätzlich `app.use(ridesRouter)` **ohne `/api`-Präfix** — gleiche Handler auch unter **`/rides`**. Absicht vermutlich Legacy-Kompatibilität; bei neuen Clients konsolidieren.

### Expo-Einstiegspunkte
| Einstieg | Datei / Mechanismus |
|----------|---------------------|
| Mobile Runtime | `package.json` → `"main": "expo-router/entry"` |
| Erste UI-Logik | `app/_layout.tsx` → `app/index.tsx` |
| API-Prozess | `dist/index.mjs` |
| Declared Stack-Screens (Auszug) | `index`, `ride`, `status`, `profile`, `my-rides`, `help`, `wallet`, `reserve-ride`, `fahrt-reservieren`, **`driver/login`**, **`driver/dashboard`** |

**Hinweis:** Datei **`app/driver/navigation.tsx`** existiert; sie ist **nicht** in `Stack.Screen` in `_layout.tsx` aufgeführt — expo-router registriert Routen file-basiert; bei Navigationsfehlern expliziten Stack-Eintrag prüfen.

---

## 4. Zentrale Logik & Core-Features

### Domänenkern Mobile
- **RideContext:** aktuelle Fahrt (Origin/Destination, Fahrzeug, Zahlart, Routen-/Preisdaten).
- **RideRequestContext:** globale Auftragsliste, Übergänge (annehmen, ablehnen, abschließen, …), Abgleich mit Backend.
- **UserContext:** Profilfelder inkl. „Patienten“-Metadaten; Google-Login-Merge; lokale Registrierung mit Demo-SMS-Code.
- **DriverContext:** **Hardcodierte Demo-Accounts** (E-Mail/Passwort), Verfügbarkeit, 48h-Sperre nach Regelverletzung.
- **Dashboard (`driver/dashboard.tsx`):** Auftragskarten, Karte, Benachrichtigungen (`notifications.ts`), WebSocket+HTTP für Position.

### Domänenkern Backend
- **Rides:** reine RAM-Struktur — **kein DB-Durable State** für Buchungen.
- **Auth:** In-Memory Maps für OAuth-Pending und Profil-Cache (kein Long-Term User-Store).

### Preislogik
- **`utils/fareCalculator.ts`** + Einbindung in `RideContext` / UI (Fixpreis, Aufschläge, Zahlarten).

---

## 5. Auffälligkeiten, Schulden & operativ Wichtiges

1. **`lib/*` im Root-`tsconfig.json`:** referenziert u. a. `lib/db`, `lib/api-client-react` — in vielen Arbeitskopien **fehlt `lib/`** → Root-`pnpm run typecheck` kann scheitern; **pro Artifact** `tsc -p artifacts/mobile` bzw. `artifacts/api-server` nutzen.
2. **`drizzle-orm` / `socket.io`:** deklariert, **nicht** im aktiven Serverpfad — nur **`ws`** + In-Memory.
3. **Doppelte Ride-Route** (`/api/rides` und `/rides`) — Dokumentation für Clients oder Bereinigung.
4. **Fahrer-Auth:** nur **lokal/Mock**; Produktion braucht echtes Backend.
5. **`expo-av`:** Deprecation-Warnung unter SDK 54 — Nutzung nur in **`notifications.ts`**; Migration zu **`expo-audio`** planen.
6. **`.expo/types/router.d.ts`:** kann von echten `app/`-Routen abweichen — nach Strukturänderungen **`expo start`** / `npx expo customize tsconfig` prüfen.
7. **React Compiler + New Architecture** (`app.json`): können edge-case Layout/Crash-Probleme erzeugen.
8. **TODO im Code:** z. B. `app/ride.tsx` — „echte Pre-Auth API-Anfrage“.
9. **Geheimnisse:** Maps-Keys in `app.json`, Tokens in `.env` — nicht committen, Rotation bei Leak.

### Schnellstart
```bash
pnpm install
cd artifacts/api-server && pnpm run build && PORT=3000 node --enable-source-maps ./dist/index.mjs
cd artifacts/mobile && npx expo start --clear
```

---

*Dokument aus aktueller Baum-Analyse erzeugt; bei größeren Refactors dieses File mitpflegen oder neu generieren.*
