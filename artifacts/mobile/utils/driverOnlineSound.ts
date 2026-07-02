import { Audio } from "expo-av";
import { Platform } from "react-native";

import { requestNotificationPermissions } from "./notifications";

let onlineSound: Audio.Sound | null = null;

/**
 * Pixabay #524745 — „UI App Notification“ by SoundShelfStudio.
 * https://pixabay.com/sound-effects/ui-app-notification-524745/
 * Pixabay Content License — ersetze `assets/driver_go_online.wav` durch den offiziellen Download.
 */
export async function playDriverGoingOnlineSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await requestNotificationPermissions();
    if (onlineSound) {
      try {
        await onlineSound.unloadAsync();
      } catch {
        /* ignore */
      }
      onlineSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/driver_go_online.wav"),
      { shouldPlay: true, volume: 0.85, isLooping: false },
    );
    onlineSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      void sound.unloadAsync().catch(() => undefined);
      if (onlineSound === sound) onlineSound = null;
    });
  } catch {
    /* ignore — Ton optional */
  }
}
