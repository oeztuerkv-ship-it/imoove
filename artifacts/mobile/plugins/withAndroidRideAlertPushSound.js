const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const RIDE_ALERT_BASENAME = "ride_alert";

/**
 * iOS: ride_alert.caf via expo-notifications `sounds`.
 * Android: CAF in res/raw wird nicht zuverlässig abgespielt → durch ride_alert.wav ersetzen.
 *
 * Muss als erstes Config-Plugin registriert sein (app.config.js prepend), damit der
 * dangerousMod nach expo-notifications läuft (Expo wendet Plugins rückwärts an).
 */
function removeConflictingRideAlertRawFiles(rawDir) {
  if (!fs.existsSync(rawDir)) {
    return;
  }

  for (const entry of fs.readdirSync(rawDir)) {
    const parsed = path.parse(entry);
    if (parsed.name !== RIDE_ALERT_BASENAME) {
      continue;
    }
    if (parsed.ext.toLowerCase() === ".wav") {
      continue;
    }
    fs.unlinkSync(path.resolve(rawDir, entry));
  }
}

function withAndroidRideAlertPushSound(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const wavSource = path.resolve(projectRoot, "assets/ride_alert.wav");
      const rawDir = path.resolve(projectRoot, "android/app/src/main/res/raw");
      const wavDest = path.resolve(rawDir, "ride_alert.wav");

      if (!fs.existsSync(wavSource)) {
        throw new Error(
          "[withAndroidRideAlertPushSound] assets/ride_alert.wav fehlt — Custom-Sound für Fahrer-Push.",
        );
      }

      fs.mkdirSync(rawDir, { recursive: true });
      removeConflictingRideAlertRawFiles(rawDir);
      fs.copyFileSync(wavSource, wavDest);
      return config;
    },
  ]);
}

module.exports = withAndroidRideAlertPushSound;
