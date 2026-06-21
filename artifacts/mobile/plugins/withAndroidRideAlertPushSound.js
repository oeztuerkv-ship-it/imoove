const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * iOS: ride_alert.caf via expo-notifications `sounds`.
 * Android: CAF in res/raw wird nicht zuverlässig abgespielt → durch ride_alert.wav ersetzen.
 */
function withAndroidRideAlertPushSound(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const wavSource = path.resolve(projectRoot, "assets/ride_alert.wav");
      const rawDir = path.resolve(projectRoot, "android/app/src/main/res/raw");
      const cafDest = path.resolve(rawDir, "ride_alert.caf");
      const wavDest = path.resolve(rawDir, "ride_alert.wav");

      if (!fs.existsSync(wavSource)) {
        throw new Error(
          "[withAndroidRideAlertPushSound] assets/ride_alert.wav fehlt — Custom-Sound für Fahrer-Push.",
        );
      }

      fs.mkdirSync(rawDir, { recursive: true });
      if (fs.existsSync(cafDest)) {
        fs.unlinkSync(cafDest);
      }
      fs.copyFileSync(wavSource, wavDest);
      return config;
    },
  ]);
}

module.exports = withAndroidRideAlertPushSound;
