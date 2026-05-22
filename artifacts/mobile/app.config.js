/**
 * Expo-Konfiguration (überschreibt/ergänzt app.json).
 * Push: `extra.eas.projectId` ist für getExpoPushTokenAsync ab SDK 48+ Pflicht.
 * Setzen via `EXPO_PUBLIC_EAS_PROJECT_ID` oder nach `npx eas init` in app.json → extra.eas.projectId.
 */
const appJson = require("./app.json");

const easProjectId =
  (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim() ||
  (appJson.expo?.extra?.eas?.projectId || "").trim() ||
  "";

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...(appJson.expo.extra?.eas || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
  },
};
