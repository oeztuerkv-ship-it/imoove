/**
 * Expo-Konfiguration (überschreibt/ergänzt app.json).
 * Push: `extra.eas.projectId` ist für getExpoPushTokenAsync ab SDK 48+ Pflicht.
 * Setzen via `EXPO_PUBLIC_EAS_PROJECT_ID` oder nach `npx eas init` in app.json → extra.eas.projectId.
 */
const appJson = require("./app.json");
const withGoogleMapsEarlyInit = require("./plugins/withGoogleMapsEarlyInit");

const easProjectId =
  (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim() ||
  (appJson.expo?.extra?.eas?.projectId || "").trim() ||
  "";

/** Maps-SDK (nicht Places): landet per EAS-Prebuild in AppDelegate + Info.plist GMSApiKey. */
const iosGoogleMapsApiKey =
  (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
  (appJson.expo?.ios?.config?.googleMapsApiKey || "").trim();
const androidGoogleMapsApiKey =
  (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
  (appJson.expo?.android?.config?.googleMaps?.apiKey || "").trim();

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [...(appJson.expo.plugins || []), withGoogleMapsEarlyInit],
    ios: {
      ...appJson.expo.ios,
      config: {
        ...(appJson.expo.ios?.config || {}),
        ...(iosGoogleMapsApiKey ? { googleMapsApiKey: iosGoogleMapsApiKey } : {}),
      },
    },
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        googleMaps: {
          ...(appJson.expo.android?.config?.googleMaps || {}),
          ...(androidGoogleMapsApiKey ? { apiKey: androidGoogleMapsApiKey } : {}),
        },
      },
    },
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...(appJson.expo.extra?.eas || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
  },
};
