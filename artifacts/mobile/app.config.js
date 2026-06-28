/**
 * Expo-Konfiguration (ergänzt app.json — Werte kommen über `config`).
 * Push: `extra.eas.projectId` ist für getExpoPushTokenAsync ab SDK 48+ Pflicht.
 * Setzen via `EXPO_PUBLIC_EAS_PROJECT_ID` oder in app.json → extra.eas.projectId.
 */
const withGoogleMapsEarlyInit = require("./plugins/withGoogleMapsEarlyInit");
const withAndroidRideAlertPushSound = require("./plugins/withAndroidRideAlertPushSound");

/** Maps-SDK (nicht Places): landet per EAS-Prebuild in AppDelegate + Info.plist GMSApiKey. */
module.exports = ({ config }) => {
  const easProjectId =
    (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim() ||
    (config.extra?.eas?.projectId || "").trim() ||
    "";

  const iosGoogleMapsApiKey =
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
    (config.ios?.config?.googleMapsApiKey || "").trim();
  const androidGoogleMapsApiKey =
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
    (config.android?.config?.googleMaps?.apiKey || "").trim();

  return {
    ...config,
    plugins: [
      // Läuft als letztes (Expo-Plugins rückwärts): CAF nach expo-notifications entfernen.
      withAndroidRideAlertPushSound,
      ...(config.plugins || []),
      withGoogleMapsEarlyInit,
    ],
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config || {}),
        ...(iosGoogleMapsApiKey ? { googleMapsApiKey: iosGoogleMapsApiKey } : {}),
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps || {}),
          ...(androidGoogleMapsApiKey ? { apiKey: androidGoogleMapsApiKey } : {}),
        },
      },
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...(config.extra?.eas || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
  };
};
