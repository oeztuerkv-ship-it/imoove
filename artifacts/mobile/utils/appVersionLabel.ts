import Constants from "expo-constants";
import { Platform } from "react-native";

/** Marketing-Version (z. B. 1.0.1) — native Binary, sonst Expo-Config. */
export function getAppVersionName(): string {
  const native = Constants.nativeApplicationVersion?.trim();
  if (native) return native;
  const fromConfig = Constants.expoConfig?.version?.trim();
  return fromConfig || "—";
}

/** iOS Build-Number / Android versionCode. */
export function getAppBuildNumber(): string {
  const native = Constants.nativeBuildVersion?.trim();
  if (native) return native;
  if (Platform.OS === "ios") {
    return Constants.expoConfig?.ios?.buildNumber?.trim() || "—";
  }
  if (Platform.OS === "android") {
    const code = Constants.expoConfig?.android?.versionCode;
    return code != null ? String(code) : "—";
  }
  return "—";
}

/** z. B. „Version 1.0.1 (Build 40)“ — Profil/Einstellungen. */
export function formatAppVersionLabel(): string {
  return `Version ${getAppVersionName()} (Build ${getAppBuildNumber()})`;
}
