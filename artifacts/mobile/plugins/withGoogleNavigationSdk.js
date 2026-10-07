/**
 * EXPERIMENTELL — Google Navigation SDK (@googlemaps/react-native-navigation-sdk).
 * Nur aktiv, wenn EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1 gesetzt ist (siehe app.config.js).
 * Ohne diesen Flag: keine Wirkung auf den Build (dev/preview/production unveraendert).
 *
 * Native Voraussetzungen laut Paket-README (Version 0.16.3, getestet mit RN 0.81.5):
 *  - iOS: NSMotionUsageDescription + UIBackgroundModes "audio" (Sprachansagen im Hintergrund)
 *  - Android: Jetifier, Core Library Desugaring, minSdkVersion >= 24
 * API-Key-Init (GMSServices.provideAPIKey) laeuft bereits frueh via withGoogleMapsEarlyInit.
 *
 * UNGETESTET: In dieser Umgebung kann kein echter iOS/Android-Build ausgefuehrt werden
 * (kein Xcode/Android-Studio-Toolchain hier). Muss vor Nutzung mit einem echten
 * EAS-Dev-Build verifiziert werden.
 */
const { withInfoPlist, withGradleProperties, withAppBuildGradle } = require("expo/config-plugins");

const DESUGAR_DEP = "coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.0.4'";

function withIosGoogleNavPlist(config) {
  return withInfoPlist(config, (modConfig) => {
    const plist = modConfig.modResults;
    if (!plist.NSMotionUsageDescription) {
      plist.NSMotionUsageDescription =
        "ONRODA nutzt Bewegungsdaten fuer eine praezisere Navi-Fuehrung waehrend der Fahrt.";
    }
    const modes = Array.isArray(plist.UIBackgroundModes) ? plist.UIBackgroundModes : [];
    if (!modes.includes("audio")) {
      modes.push("audio");
    }
    plist.UIBackgroundModes = modes;
    return modConfig;
  });
}

function withAndroidGoogleNavGradleProperties(config) {
  return withGradleProperties(config, (modConfig) => {
    const props = modConfig.modResults;
    const setBool = (key, value) => {
      const existing = props.find((p) => p.type === "property" && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: "property", key, value });
      }
    };
    setBool("android.enableJetifier", "true");
    return modConfig;
  });
}

function withAndroidGoogleNavDesugaring(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes("coreLibraryDesugaringEnabled")) {
      if (/compileOptions\s*\{/.test(contents)) {
        // Vorhandener compileOptions-Block (aeltere Expo-Prebuild-Vorlagen) — Flag dort einfuegen.
        contents = contents.replace(
          /compileOptions\s*\{/,
          `compileOptions {\n        coreLibraryDesugaringEnabled true`,
        );
      } else if (/^android\s*\{/m.test(contents)) {
        // Aktuelle Expo-Prebuild-Vorlage (SDK 54) hat keinen compileOptions-Block in
        // app/build.gradle mehr — ohne diesen Zweig wuerde nur die Dependency unten
        // hinzugefuegt, OHNE dass Desugaring tatsaechlich aktiviert ist (stiller Bug,
        // beim echten Android-Build mit dem Nav-SDK gefunden). Block direkt nach der
        // `android {`-Oeffnung neu anlegen.
        contents = contents.replace(
          /^android\s*\{/m,
          `android {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }`,
        );
      } else {
        throw new Error(
          "[withGoogleNavigationSdk] android/app/build.gradle: weder 'compileOptions {' noch " +
            "'android {' gefunden — Core-Library-Desugaring konnte nicht aktiviert werden.",
        );
      }
    }
    if (!contents.includes(DESUGAR_DEP)) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${DESUGAR_DEP}`,
      );
    }
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withGoogleNavigationSdk(config) {
  let next = withIosGoogleNavPlist(config);
  next = withAndroidGoogleNavGradleProperties(next);
  next = withAndroidGoogleNavDesugaring(next);
  return next;
}

module.exports = withGoogleNavigationSdk;
