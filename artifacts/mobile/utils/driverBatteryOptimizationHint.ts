import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";

const HINT_SHOWN_KEY = "@Onroda_driver_battery_opt_hint_shown_v1";

const BODY_GENERIC =
  "Damit du auch nach längerer Zeit Auftrags-Pushs erhältst, deaktiviere die Akku-Optimierung für ONRODA.\n\n" +
  "Samsung: Einstellungen → Apps → ONRODA → Akku → Uneingeschränkt\n" +
  "Xiaomi/MIUI: Einstellungen → Apps → ONRODA → Akku sparen → Keine Einschränkungen\n" +
  "Pixel: Einstellungen → Apps → ONRODA → Akku → Uneingeschränkt";

/**
 * Einmaliger Hinweis (Samsung/Xiaomi/Pixel-relevant) — kein Blocker für ONLINE.
 */
export async function maybeShowDriverBatteryOptimizationHint(opts?: {
  reason?: "first_online" | "fgs_failed";
  force?: boolean;
}): Promise<void> {
  if (Platform.OS !== "android") return;

  if (!opts?.force) {
    const shown = await AsyncStorage.getItem(HINT_SHOWN_KEY);
    if (shown === "1") return;
  }

  const title =
    opts?.reason === "fgs_failed"
      ? "Online-Dienst konnte nicht starten"
      : "Akku-Optimierung prüfen";

  const body =
    opts?.reason === "fgs_failed"
      ? `${BODY_GENERIC}\n\nOhne diese Einstellung kann Android den Hintergrunddienst beenden — Pushs können trotzdem ankommen, die Standort-Aktualisierung für den Markt aber ausbleiben.`
      : BODY_GENERIC;

  return new Promise((resolve) => {
    Alert.alert(title, body, [
      {
        text: "Später",
        style: "cancel",
        onPress: () => {
          void AsyncStorage.setItem(HINT_SHOWN_KEY, "1");
          resolve();
        },
      },
      {
        text: "Einstellungen öffnen",
        onPress: () => {
          void AsyncStorage.setItem(HINT_SHOWN_KEY, "1");
          void Linking.openSettings();
          resolve();
        },
      },
    ]);
  });
}
