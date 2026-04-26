# Onroda Mobile (`artifacts/mobile`)

Expo SDK 54 · Monorepo mit **pnpm** (Root: `imoove/`).

## Wie starte ich Mobile?

Vom **Repo-Root**:

```bash
pnpm install
pnpm --filter @workspace/mobile run dev
```

Oder im Ordner `artifacts/mobile`:

```bash
pnpm install   # einmal im Monorepo-Root
pnpm run dev
```

Metro lauscht **immer auf Port 8081**. Vor dem Start prüft ein kleines Skript, ob **8081 frei** ist — sonst Abbruch mit Hinweis (kein automatischer Wechsel auf 8082).

## Expo Go vs. Development Build (dev client)

Das Projekt hat **`expo-dev-client`** in den **Dependencies** (sinnvoll für spätere eigene Native-Builds und `expo run:*`).

**Wichtig:** Wenn `expo-dev-client` installiert ist, wählt `npx expo start` **ohne** Zusatzflag standardmäßig den **Development-Build**-Modus: Terminal zeigt z. B. „Using development build“, der QR-Code enthält oft ein **`exp+://expo-development-client/…`**-Schema. Das öffnet die **installierte Dev-App**, nicht zuverlässig **Expo Go** — daher wirkt ein neuer QR „kaputt“, während eine **alte gespeicherte Verbindung** in Expo Go weiterhin über **`exp://…`** funktioniert.

| Modus | Wann | Befehl (nach `cd` ins Repo-Root) |
|--------|------|-----------------------------------|
| **Expo Go** (Standard hier) | Schnelles Testen auf dem Gerät; QR soll **Expo Go** öffnen | `pnpm --filter @workspace/mobile run dev` — gleichbedeutend mit `… run dev:go` (**`--go`** erzwingt Expo Go) |
| **Development Build** | Du hast ein **eigenes** Dev-Client-IPA/APK installiert (`expo run:ios` / `eas build` …) | `pnpm --filter @workspace/mobile run dev:dev-client` (**`--dev-client`**) |

In der **Terminal-UI** von Expo kannst du mit **`s`** zwischen Expo Go und Development Build wechseln (siehe [Expo CLI](https://docs.expo.dev/more/expo-cli/)). Unsere Skripte setzen das Ziel fest, damit der QR-Code beim Start **vorhersehbar** ist.

Optional: Umgebungsvariable **`EXPO_NO_REDIRECT_PAGE=1`** vermeidet die Zwischenseite zur App-Auswahl (nur falls du ohne festes Flag arbeitest); für dieses Repo reichen **`dev`** / **`dev:dev-client`**.

## Expo Go oder Simulator?

| Weg | Wann | Befehl (nach `cd` ins Repo-Root) |
|-----|------|-----------------------------------|
| **Expo Go** (echtes Gerät, QR) | Schnelles Testen auf dem Handy; Gerät und Mac im **selben WLAN** | `pnpm --filter @workspace/mobile run dev` oder `… run dev:go` — QR in der Konsole scannen |
| **iOS Simulator** | Stabiler als WLAN/QR, gut für UI-Flows | `pnpm --filter @workspace/mobile run dev:ios` (Xcode + Simulator müssen installiert sein) |
| **Nur Loopback** (z. B. Simulator ohne LAN-QR) | Kein LAN nötig | `pnpm --filter @workspace/mobile run dev:localhost` |

## QR / LAN instabil?

Typisch: Firmen-WLAN, Client-Isolation, VPN. **Alternative:** Tunnel (langsamer, dafür oft zuverlässiger):

```bash
pnpm --filter @workspace/mobile run dev:tunnel
```

Danach den in der CLI angezeigten Link bzw. QR nutzen (weiterhin **Expo Go** über **`--go`**). **Port-Regel:** Weiterhin **8081** für Metro; der Tunnel betrifft die Erreichbarkeit nach außen.

## Was tun, wenn Port 8081 belegt ist?

1. Anzeigen, wer lauscht:

   ```bash
   lsof -i :8081
   ```

2. Prozess prüfen (nur beenden, wenn klar **Expo/Metro** aus diesem Projekt):

   ```bash
   ps -p <PID> -o args=
   ```

3. Beenden und neu starten:

   ```bash
   kill <PID>
   pnpm --filter @workspace/mobile run dev
   ```

## Sonstiges

- **Node:** laut `package.json` `engines` idealerweise **Node 20 LTS** (wie im Team vereinbart).
- **Abhängigkeiten:** Expo-Pakete mit `npx expo install <paket>`; Details in `.cursor/rules/imoove-mobile-expo-pnpm-workflow.mdc`.
- **Plausibilität:** `npx expo install --check` im Ordner `artifacts/mobile`.
