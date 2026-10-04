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
  //
  // WICHTIG: app.config.js wird ZWEIMAL ausgewertet — einmal LOKAL (eas-cli auf dem
  // Entwickler-Rechner, u. a. für Fingerprint/Upload vor `eas build`), und erneut AUF
  // DEM ECHTEN EAS-BUILDER (Cloud oder `eas build --local`), wo Prebuild/native Config
  // tatsächlich generiert wird. EAS-Secrets (GOOGLE_NAV_IOS_API_KEY/GOOGLE_NAV_ANDROID_API_KEY)
  // sind ABSICHTLICH nur auf dem Builder als echte Env-Vars verfügbar, nie lokal. `EAS_BUILD`
  // ist die von EAS selbst gesetzte, dokumentierte Kennung für genau diesen Unterschied:
  // "true" nur während einer echten EAS-Build-Auswertung, nie bei einer lokalen Config-Auswertung.
  const isEasBuildWorker = (process.env.EAS_BUILD || "").trim() === "true";

  function resolveGoogleMapsApiKey(platform) {
    if (enableGoogleNav) {
      const envVarName = platform === "ios" ? "GOOGLE_NAV_IOS_API_KEY" : "GOOGLE_NAV_ANDROID_API_KEY";
      const key = (process.env[envVarName] || "").trim();
      if (key) return key;

      if (isEasBuildWorker) {
        // Auf dem echten Builder MUSS das Secret vorhanden sein — hartes, aber
        // Key-wert-freies Abbrechen, damit nie unbemerkt ohne Nav-Key gebaut wird.
        throw new Error(
          `[app.config.js] EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1, aber ${envVarName} ist auf dem EAS-Builder ` +
            "nicht gesetzt. Bitte als EAS-Secret-Umgebungsvariable anlegen und dem Build-Profil " +
            "zuordnen (z. B. `eas env:create` + `eas env:list`), bevor dieser Build erneut läuft.",
        );
      }

      // Lokale Config-Auswertung (z. B. `eas build` auf dem Entwickler-Rechner, bevor der
      // Job an den Builder geht): EAS-Secrets sind hier erwartungsgemäß nicht verfügbar.
      // NICHT abbrechen und NICHT auf EXPO_PUBLIC_GOOGLE_MAPS_API_KEY zurückfallen (das wäre
      // der falsche, nicht für Navigation freigegebene Key) — einfach ohne Key weiterlaufen.
      // Der eigentliche Build wertet app.config.js auf dem Builder erneut aus, dann MIT
      // Secret, und validiert dort hart (siehe oben).
      return "";
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
