import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";

const ONLINE_HINT_KEY = "@Onroda_driver_ios_push_hint_shown_v1";

/**
 * Einmaliger iOS-Hinweis beim ersten ONLINE — ehrliche Erwartung nach App-Kill.
 */
export async function maybeShowDriverIosOnlinePushHint(): Promise<void> {
  if (Platform.OS !== "ios") return;
  const shown = await AsyncStorage.getItem(ONLINE_HINT_KEY);
  if (shown === "1") return;

  return new Promise((resolve) => {
    Alert.alert(
      "Push für Fahrtanfragen",
      "Aktiviere Mitteilungen für ONRODA, damit du neue Aufträge auch bei gesperrtem Bildschirm erhältst.\n\n" +
        "Wenn du die App geschlossen hast: auf die Push-Nachricht tippen oder ONRODA öffnen — der Auftrag erscheint im Dashboard.",
      [
        {
          text: "Verstanden",
          onPress: () => {
            void AsyncStorage.setItem(ONLINE_HINT_KEY, "1");
            resolve();
          },
        },
        {
          text: "Einstellungen",
          onPress: () => {
            void AsyncStorage.setItem(ONLINE_HINT_KEY, "1");
            void Linking.openSettings();
            resolve();
          },
        },
      ],
    );
  });
}
