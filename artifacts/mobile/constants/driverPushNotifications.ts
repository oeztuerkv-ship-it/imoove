/** Custom notification sound — iOS: in App-Bundle als `.caf` (expo-notifications `sounds`). */
export const DRIVER_RIDE_OFFER_PUSH_SOUND = "ride_alert";

/**
 * Expo Push API (iOS): Custom-Sound inkl. Dateiendung, sonst oft nur kurzer System-Beep.
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */
export const DRIVER_RIDE_OFFER_PUSH_SOUND_IOS = "ride_alert.caf";

/**
 * Android 8+: Kanal-Sound/Importance sind nach Erstellung weitgehend fix.
 * Neuer ID-Stand, damit MAX + Custom-Sound greifen (v2 ggf. noch mit Default-Beep).
 */
export const DRIVER_RIDE_OFFER_CHANNEL_ID = "ride-offers-v3";

/** Android-Kanal-Anzeige (Systemeinstellungen). */
export const DRIVER_RIDE_OFFER_CHANNEL_NAME = "Neue Fahrtanfragen";

export const DRIVER_RIDE_OFFER_CHANNEL_DESCRIPTION =
  "Eingehende Sofortfahrten und Funk-Aufträge — bitte laut lassen.";
