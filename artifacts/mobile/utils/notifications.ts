import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { Platform, Vibration } from "react-native";

let _sound: Audio.Sound | null = null;
let _vibrating = false;
let _ringStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Max. Dauer des Alarmtons — verhindert endloses Klingeln ohne sichtbaren Auftrag. */
const RING_MAX_MS = 45_000;

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });
  } catch (_) {}
  return true;
}

export async function stopRideSound(): Promise<void> {
  if (_ringStopTimer) {
    clearTimeout(_ringStopTimer);
    _ringStopTimer = null;
  }
  _vibrating = false;
  Vibration.cancel();
  if (_sound) {
    try { await _sound.stopAsync(); } catch (_) {}
    try { await _sound.unloadAsync(); } catch (_) {}
    _sound = null;
  }
}

export async function sendNewRideNotification(_opts: {
  customerName: string;
  fromAddress: string;
  distanceKm: number | null;
  estimatedFare: number;
}) {
  if (Platform.OS === "web") return;

  // 1. Haptics
  try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}

  // 2. Repeating vibration loop (ring-ring pattern)
  _vibrating = true;
  const ringVibrate = () => {
    if (!_vibrating) return;
    Vibration.vibrate([0, 700, 300, 700, 2000]);
    setTimeout(() => { if (_vibrating) ringVibrate(); }, 3700);
  };
  ringVibrate();

  // 3. Looping ringtone via expo-av
  try {
    await stopRideSound();
    _vibrating = true; // restore after stopRideSound resets it
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/ride_alert.wav"),
      { shouldPlay: true, volume: 1.0, isLooping: true }
    );
    _sound = sound;
    if (_ringStopTimer) clearTimeout(_ringStopTimer);
    _ringStopTimer = setTimeout(() => {
      _ringStopTimer = null;
      void stopRideSound();
    }, RING_MAX_MS);
  } catch (_) {}
}
