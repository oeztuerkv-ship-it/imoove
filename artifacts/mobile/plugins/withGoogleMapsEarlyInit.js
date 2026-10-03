/**
 * GMSServices.provideAPIKey muss vor startReactNative laufen — sonst graue Kacheln
 * in TestFlight/EAS, während Polylines (OSRM) sichtbar bleiben.
 * Expo-Prebuild setzt den Key standardmäßig danach; dieses Plugin korrigiert die Reihenfolge.
 */
const { withAppDelegate } = require("expo/config-plugins");

function resolveIosGoogleMapsApiKey(config) {
  // Einzige Quelle der Wahrheit: app.config.js hat den tatsächlich zu verwendenden
  // Key (normaler Maps-Key, oder GOOGLE_NAV_IOS_API_KEY wenn
  // EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1) bereits aufgelöst und in
  // config.ios.config.googleMapsApiKey abgelegt, bevor dieses Plugin läuft.
  // Hier bewusst NICHT unabhängig aus process.env neu ableiten — sonst könnte bei
  // aktiviertem Google-Nav-Flag versehentlich wieder der falsche (nicht für
  // Navigation freigegebene) Key für GMSServices.provideAPIKey verwendet werden.
  return String(config.ios?.config?.googleMapsApiKey ?? "").trim();
}

function withGoogleMapsEarlyInit(config) {
  const apiKey = resolveIosGoogleMapsApiKey(config);
  if (!apiKey) return config;

  return withAppDelegate(config, (modConfig) => {
    let contents = modConfig.modResults.contents;

    // Späten Expo-Block entfernen (Key wird früh gesetzt).
    contents = contents.replace(
      /\n?\/\/ @generated begin react-native-maps-init[\s\S]*?\/\/ @generated end react-native-maps-init\n?/,
      "\n",
    );

    const earlyBlock = [
      "// @generated begin onroda-google-maps-early-init",
      "#if canImport(GoogleMaps)",
      `GMSServices.provideAPIKey("${apiKey}")`,
      "#endif",
      "// @generated end onroda-google-maps-early-init",
      "",
    ].join("\n");

    const fnNeedle = "didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n  ) -> Bool {";
    if (contents.includes("onroda-google-maps-early-init")) {
      modConfig.modResults.contents = contents;
      return modConfig;
    }
    if (!contents.includes(fnNeedle)) {
      throw new Error(
        "[withGoogleMapsEarlyInit] AppDelegate didFinishLaunchingWithOptions-Signatur nicht gefunden.",
      );
    }
    contents = contents.replace(fnNeedle, `${fnNeedle}\n${earlyBlock}`);
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = withGoogleMapsEarlyInit;
