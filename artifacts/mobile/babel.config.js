module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    /** Muss letztes Plugin bleiben (Reanimated / Worklets). */
    plugins: ["react-native-reanimated/plugin"],
  };
};
