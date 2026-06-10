/**
 * GMSServices.provideAPIKey muss vor startReactNative laufen — sonst graue Kacheln
 * in TestFlight/EAS, während Polylines (OSRM) sichtbar bleiben.
 * Expo-Prebuild setzt den Key standardmäßig danach; dieses Plugin korrigiert die Reihenfolge.
 */
const { withAppDelegate } = require("expo/config-plugins");

function resolveIosGoogleMapsApiKey(config) {
  const fromIos = String(config.ios?.config?.googleMapsApiKey ?? "").trim();
  if (fromIos) return fromIos;
  const fromEnv = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
  return fromEnv;
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
