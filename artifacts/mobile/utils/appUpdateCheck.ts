import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";

const STORE_SNOOZE_KEY = "@onroda/store_update_snooze_until_v1";
const STORE_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type MobileAppPlatformConfig = {
  recommendedVersion?: string | null;
  minVersion?: string | null;
  storeUrl?: string | null;
};

export type MobileAppConfig = {
  ios?: MobileAppPlatformConfig;
  android?: MobileAppPlatformConfig;
};

/** Semver-ähnlich: "1.0.3" → [1,0,3]. Ungültig → []. */
export function parseAppVersionParts(raw: string | null | undefined): number[] {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return [];
  const core = s.replace(/[^0-9.]/g, "");
  if (!core) return [];
  return core
    .split(".")
    .filter((p) => p.length > 0)
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })
    .slice(0, 4);
}

/** Negativ wenn a < b, 0 gleich, positiv wenn a > b. */
export function compareAppVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseAppVersionParts(a);
  const pb = parseAppVersionParts(b);
  if (pa.length === 0 && pb.length === 0) return 0;
  if (pa.length === 0) return -1;
  if (pb.length === 0) return 1;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function getInstalledAppVersion(): string {
  const native = Constants.nativeAppVersion?.trim();
  if (native) return native;
  const fromExpo = Constants.expoConfig?.version?.trim();
  if (fromExpo) return fromExpo;
  return "0.0.0";
}

function platformMobileConfig(mobileApp: MobileAppConfig | null | undefined): MobileAppPlatformConfig | null {
  if (!mobileApp || typeof mobileApp !== "object") return null;
  const plat = Platform.OS === "ios" ? mobileApp.ios : Platform.OS === "android" ? mobileApp.android : null;
  return plat && typeof plat === "object" ? plat : null;
}

function readMobileAppFromSystem(system: Record<string, unknown> | null | undefined): MobileAppConfig | null {
  if (!system || typeof system !== "object") return null;
  const raw = system.mobileApp;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as MobileAppConfig;
}

async function isStorePromptSnoozed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORE_SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

async function snoozeStorePrompt(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_SNOOZE_KEY, String(Date.now() + STORE_SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

async function openStoreUrl(url: string): Promise<void> {
  const u = url.trim();
  if (!u) return;
  try {
    const can = await Linking.canOpenURL(u);
    if (can) await Linking.openURL(u);
    else await Linking.openURL(u);
  } catch {
    /* ignore */
  }
}

/**
 * OTA: prüft Expo Updates, lädt herunter, kurzer Hinweis, dann Reload.
 * Dev / Expo Go / disabled → no-op.
 * @returns true wenn Reload ausgelöst wird (Aufrufer soll Store-Check skippen).
 */
export async function runOtaUpdateCheck(): Promise<boolean> {
  if (__DEV__) return false;
  try {
    const Updates = await import("expo-updates");
    if (!Updates.isEnabled) return false;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    await new Promise<void>((resolve) => {
      Alert.alert(
        "Update installiert",
        "Ein Update wurde heruntergeladen. Die App wird neu geladen.",
        [
          {
            text: "OK",
            onPress: () => resolve(),
          },
        ],
        { cancelable: false },
      );
    });
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

/**
 * Store-Version vs. `system.mobileApp` (recommended / min).
 * Soft: Update / Später. Hart (minVersion): nur Update, nicht abweisbar.
 */
export async function runStoreVersionCheck(system: Record<string, unknown> | null | undefined): Promise<void> {
  if (__DEV__) return;
  const installed = getInstalledAppVersion();
  const mobileApp = readMobileAppFromSystem(system);
  const plat = platformMobileConfig(mobileApp);
  const recommended =
    (typeof plat?.recommendedVersion === "string" && plat.recommendedVersion.trim()) ||
    (typeof system?.minAppVersionHint === "string" && String(system.minAppVersionHint).trim()) ||
    "";
  const minRaw = typeof plat?.minVersion === "string" ? plat.minVersion.trim() : "";
  const storeUrl = typeof plat?.storeUrl === "string" ? plat.storeUrl.trim() : "";

  const belowMin = minRaw.length > 0 && compareAppVersions(installed, minRaw) < 0;
  const belowRecommended = recommended.length > 0 && compareAppVersions(installed, recommended) < 0;

  if (!belowMin && !belowRecommended) return;
  if (!belowMin && (await isStorePromptSnoozed())) return;

  const latestLabel = belowMin ? minRaw : recommended;

  if (belowMin) {
    await new Promise<void>((resolve) => {
      Alert.alert(
        "Update erforderlich",
        `Deine App-Version (${installed}) ist veraltet. Bitte aktualisiere auf mindestens ${latestLabel} im Store.`,
        [
          {
            text: "Im Store aktualisieren",
            onPress: () => {
              void openStoreUrl(storeUrl).finally(() => resolve());
            },
          },
        ],
        { cancelable: false },
      );
    });
    return;
  }

  await new Promise<void>((resolve) => {
    Alert.alert(
      "Update verfügbar",
      `Eine neue Version (${latestLabel}) ist im Store verfügbar. Du nutzt ${installed}.`,
      [
        {
          text: "Später",
          style: "cancel",
          onPress: () => {
            void snoozeStorePrompt().finally(() => resolve());
          },
        },
        {
          text: "Aktualisieren",
          onPress: () => {
            void openStoreUrl(storeUrl).finally(() => resolve());
          },
        },
      ],
      { cancelable: true },
    );
  });
}
