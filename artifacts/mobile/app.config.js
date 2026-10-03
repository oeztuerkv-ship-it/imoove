/**
 * Expo-Konfiguration (ergänzt app.json — Werte kommen über `config`).
 * Push: `extra.eas.projectId` ist für getExpoPushTokenAsync ab SDK 48+ Pflicht.
 * Setzen via `EXPO_PUBLIC_EAS_PROJECT_ID` oder in app.json → extra.eas.projectId.
 */
const withGoogleMapsEarlyInit = require("./plugins/withGoogleMapsEarlyInit");
const withAndroidRideAlertPushSound = require("./plugins/withAndroidRideAlertPushSound");
const withGoogleNavigationSdk = require("./plugins/withGoogleNavigationSdk");

/** Maps-SDK (nicht Places): landet per EAS-Prebuild in AppDelegate + Info.plist GMSApiKey. */
module.exports = ({ config }) => {
  const easProjectId =
    (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim() ||
    (config.extra?.eas?.projectId || "").trim() ||
    "";

  // EXPERIMENTELL, Standard aus (kein Effekt auf dev/preview/production ohne diesen Flag):
  // Google Navigation SDK — separates Google-Produkt, eigene Freischaltung/Abrechnung noetig.
  const enableGoogleNav = (process.env.EXPO_PUBLIC_ENABLE_GOOGLE_NAV || "").trim() === "1";

  // iOS (GMSServices.provideAPIKey) und Android (com.google.android.geo.API_KEY) haben
  // je Plattform NUR EINEN nativen Key-Slot, den sich Maps-SDK und Navigation-SDK teilen.
  // Ist Google Nav aktiv, muss deshalb zwingend der eigene, eingeschränkte Nav-Key
  // verwendet werden — niemals stillschweigend der normale Maps-Key, sonst würde die
  // Navigation ggf. mit einem dafür nicht freigegebenen Key laufen (oder umgekehrt).
  // Diese Keys kommen bewusst NICHT über EXPO_PUBLIC_* (würde sie ins JS-Bundle
  // inlinen) — app.config.js läuft nur zur Build-Zeit in Node, nie im Client.
  function resolveGoogleMapsApiKey(platform) {
    if (enableGoogleNav) {
      const envVarName = platform === "ios" ? "GOOGLE_NAV_IOS_API_KEY" : "GOOGLE_NAV_ANDROID_API_KEY";
      const key = (process.env[envVarName] || "").trim();
      if (!key) {
        // Abbruch mit klarer Meldung — der Key-WERT wird hier nie ausgegeben, nur der
        // Name der fehlenden Variable.
        throw new Error(
          `[app.config.js] EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1, aber ${envVarName} ist nicht gesetzt. ` +
            "Bitte vor einem Build mit aktiviertem Google-Nav-Flag als EAS-Secret-Umgebungsvariable " +
            "hinterlegen (z. B. `eas env:create`).",
        );
      }
      return key;
    }
    // Bestehendes Verhalten, unveraendert, wenn Google Nav nicht aktiviert ist.
    if (platform === "ios") {
      return (
        (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
        (config.ios?.config?.googleMapsApiKey || "").trim()
      );
    }
    return (
      (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim() ||
      (config.android?.config?.googleMaps?.apiKey || "").trim()
    );
  }

  const iosGoogleMapsApiKey = resolveGoogleMapsApiKey("ios");
  const androidGoogleMapsApiKey = resolveGoogleMapsApiKey("android");

  return {
    ...config,
    plugins: [
      // Läuft als letztes (Expo-Plugins rückwärts): CAF nach expo-notifications entfernen.
      withAndroidRideAlertPushSound,
      ...(config.plugins || []),
      withGoogleMapsEarlyInit,
      ...(enableGoogleNav ? [withGoogleNavigationSdk] : []),
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
