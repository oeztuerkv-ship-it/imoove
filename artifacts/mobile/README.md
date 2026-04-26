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

## Expo Go oder Simulator?

| Weg | Wann | Befehl (nach `cd` ins Repo-Root) |
|-----|------|-----------------------------------|
| **Expo Go** (echtes Gerät, QR) | Schnelles Testen auf dem Handy; Gerät und Mac im **selben WLAN** | `pnpm --filter @workspace/mobile run dev` — QR in der Konsole scannen |
| **„Go“ direkt öffnen** (wenn Expo CLI das kann) | Optional | `pnpm --filter @workspace/mobile run dev:go` |
| **iOS Simulator** | Stabiler als WLAN/QR, gut für UI-Flows | `pnpm --filter @workspace/mobile run dev:ios` (Xcode + Simulator müssen installiert sein) |
| **Nur Loopback** (z. B. Simulator ohne LAN-QR) | Kein LAN nötig | `pnpm --filter @workspace/mobile run dev:localhost` |

## QR / LAN instabil?

Typisch: Firmen-WLAN, Client-Isolation, VPN. **Alternative:** Tunnel (langsamer, dafür oft zuverlässiger):

```bash
pnpm --filter @workspace/mobile run dev:tunnel
```

Danach den in der CLI angezeigten Link bzw. QR nutzen. **Port-Regel:** Weiterhin **8081** für Metro; der Tunnel betrifft die Erreichbarkeit nach außen.

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
