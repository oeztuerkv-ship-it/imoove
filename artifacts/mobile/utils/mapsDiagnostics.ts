import Constants from "expo-constants";
import { Platform } from "react-native";

import { probeGoogleMapsApiKey } from "@/utils/driverNavigationDiagnostics";

const LOG_TAG = "[MapsDiag]";

let loggedOnce = false;

/** Einmal pro App-Start: Maps-Key-Quelle und Runtime (TestFlight vs Expo Go). */
export function logMapsRuntimeDiagnosticsOnce(context: string): void {
  if (loggedOnce) return;
  loggedOnce = true;
  const keyProbe = probeGoogleMapsApiKey();
  console.log(LOG_TAG, "runtime", {
    context,
    platform: Platform.OS,
    appOwnership: Constants.appOwnership ?? "unknown",
    executionEnvironment: Constants.executionEnvironment ?? "unknown",
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? "",
    buildNumber: Constants.expoConfig?.ios?.buildNumber ?? "",
    googleMapsApiKey: keyProbe,
    note:
      "Native GMSServices/AppDelegate wird beim EAS-Prebuild aus app.json ios.config.googleMapsApiKey gesetzt; Expo Go nutzt einen anderen Key.",
    xcodeFilter: "GMSServices OR Google Maps SDK OR API key not valid",
  });
}
