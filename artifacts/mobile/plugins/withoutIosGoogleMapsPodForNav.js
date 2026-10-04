/**
 * NUR fuer den experimentellen Google-Nav-Testbuild (EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1).
 *
 * Root Cause (siehe Analyse): Expo haengt beim Prebuild automatisch den Pod
 * `react-native-google-maps` (aus react-native-maps) ins Podfile, sobald
 * `ios.config.googleMapsApiKey` gesetzt ist — unabhaengig davon, ob die App auf iOS
 * ueberhaupt Google Maps rendert. ONRODA nutzt auf iOS ausschliesslich Apple Maps
 * (siehe utils/nativeMapProvider.ts), der Pod wird dort nie benutzt. Sein hartes Pin
 * `GoogleMaps 8.4.0` kollidiert im Google-Nav-Testbuild mit dem ebenso hart gepinnten
 * `GoogleNavigation 10.13.0` aus @googlemaps/react-native-navigation-sdk
 * ("Compatible versions of some pods could not be resolved").
 *
 * Dieses Plugin entfernt NACH der Podfile-Generierung ausschliesslich den von Expo
 * selbst generierten react-native-maps-Block (der den react-native-google-maps-Pod
 * einbindet). Alles andere im Podfile bleibt unangetastet:
 *  - react-native-maps selbst (AirMaps/Apple-Maps-Teil) wird ganz normal ueber die
 *    Standard-Autolinking weiter eingebunden — Apple-Maps-Rendering ist nicht betroffen.
 *  - GoogleNavigation (ueber withGoogleNavigationSdk) wird NICHT veraendert.
 *  - GMSServices.provideAPIKey(...) (ueber withGoogleMapsEarlyInit) wird NICHT
 *    veraendert/entfernt — die Navigation-SDK braucht den Key-Init weiterhin.
 *  - Android: unberuehrt, dieses Plugin fasst nur ios/Podfile an.
 *
 * Idempotent: Laeuft `expo prebuild` mehrfach (z.B. ohne --clean), wird der Block beim
 * zweiten Mal bereits fehlen — das ist dann kein Fehler, sondern der Zielzustand.
 *
 * Guard: Aendert ein kuenftiges Expo-SDK-Update Form/Wortlaut des generierten Blocks,
 * wuerde dieses Plugin sonst unbemerkt wirkungslos und der Konflikt wieder auftreten.
 * Deshalb: Wenn WEDER der erwartete generierte Block NOCH unser eigener
 * "bereits entfernt"-Marker gefunden wird, bricht der Build mit einer klaren
 * Fehlermeldung ab, statt still weiterzulaufen.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const REMOVED_MARKER_TAG = "onroda-remove-ios-google-maps-pod";

// sync-<hash> ist Expos eigener Drift-Erkennungs-Hash fuer das Podfile-Template und
// aendert sich je nach Expo-SDK-Version — deshalb als Wildcard, Rest des Markers fix.
const GENERATED_BLOCK_RE =
  /# @generated begin react-native-maps - expo prebuild \(DO NOT MODIFY\) sync-[0-9a-f]+\n[\s\S]*?# @generated end react-native-maps\n?/;

// Reine, dateisystem-freie Transformationsfunktion — separat, damit sie ohne echten
// Expo-Prebuild/Dangerous-Mod-Kontext direkt getestet werden kann (siehe Selftest).
// identischer Pfad wird von withoutIosGoogleMapsPodForNav() unten fuer den echten
// Build verwendet.
function stripGoogleMapsPodBlock(contents, { podfilePathForError } = {}) {
  if (contents.includes(REMOVED_MARKER_TAG)) {
    // Idempotent: in einem frueheren prebuild-Lauf bereits entfernt.
    return { contents, changed: false, alreadyRemoved: true };
  }

  if (!GENERATED_BLOCK_RE.test(contents)) {
    throw new Error(
      "[withoutIosGoogleMapsPodForNav] Erwarteter generierter react-native-maps-Podfile-Block " +
        "('# @generated begin react-native-maps - expo prebuild ... sync-<hash>') wurde in " +
        (podfilePathForError || "<Podfile>") +
        " nicht gefunden (und auch kein eigener Entfernt-Marker). Vermutlich hat ein " +
        "Expo-SDK-Update das Podfile-Template geaendert — dieser Google-Nav-Testbuild-Fix ist " +
        "damit unter Umstaenden wirkungslos geworden und muss ueberprueft/angepasst werden, " +
        "bevor der Build fortgesetzt wird.",
    );
  }

  const replacement =
    `# @generated begin ${REMOVED_MARKER_TAG} (Google-Nav-Testbuild: react-native-google-maps/` +
    "GoogleMaps 8.4.0 entfernt — Konflikt mit GoogleNavigation 10.13.0, iOS nutzt ohnehin " +
    `Apple Maps)\n# @generated end ${REMOVED_MARKER_TAG}\n`;

  return { contents: contents.replace(GENERATED_BLOCK_RE, replacement), changed: true, alreadyRemoved: false };
}

function withoutIosGoogleMapsPodForNav(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      let contents;
      try {
        contents = fs.readFileSync(podfilePath, "utf8");
      } catch (err) {
        throw new Error(
          "[withoutIosGoogleMapsPodForNav] Podfile nicht gefunden unter " +
            podfilePath +
            " — dieses Plugin muss nach der Podfile-Erzeugung laufen (expo prebuild).",
        );
      }

      const result = stripGoogleMapsPodBlock(contents, { podfilePathForError: podfilePath });
      if (result.changed) {
        fs.writeFileSync(podfilePath, result.contents);
      }
      return modConfig;
    },
  ]);
}

withoutIosGoogleMapsPodForNav.stripGoogleMapsPodBlock = stripGoogleMapsPodBlock;
module.exports = withoutIosGoogleMapsPodForNav;
