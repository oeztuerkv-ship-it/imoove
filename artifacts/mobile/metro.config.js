const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileNodeModules = path.join(projectRoot, "node_modules");

/**
 * Eine physische React-Installation für Metro (pnpm-Workspace).
 * Ohne das landen `react` und `react/jsx-runtime` leicht in zwei Kopien → „Invalid hook call“.
 */
function resolvePkgDir(packageName) {
  try {
    return path.dirname(
      require.resolve(`${packageName}/package.json`, { paths: [projectRoot] }),
    );
  } catch {
    return null;
  }
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  path.join(workspaceRoot, "node_modules"),
];

/**
 * pnpm: Transitives unter `.pnpm/…/expo-router/node_modules/…` wäre mit `true` unsichtbar → Massen-„Unable to resolve“.
 * Doppel-React: weiter über `extraNodeModules` (react, react-dom, @expo/metro-runtime) erzwingen, nicht über Lookup abschalten.
 */
config.resolver.disableHierarchicalLookup = false;

const extra = {};
const reactDir = resolvePkgDir("react");
const reactDomDir = resolvePkgDir("react-dom");
const expoMetroRuntimeDir = resolvePkgDir("@expo/metro-runtime");
if (reactDir) extra.react = reactDir;
if (reactDomDir) extra["react-dom"] = reactDomDir;
if (expoMetroRuntimeDir) extra["@expo/metro-runtime"] = expoMetroRuntimeDir;

const schedulerDir = resolvePkgDir("scheduler");
if (schedulerDir) extra.scheduler = schedulerDir;

const useSyncDir = resolvePkgDir("use-sync-external-store");
if (useSyncDir) extra["use-sync-external-store"] = useSyncDir;


/** Subpath-Auflösung auf dieselbe `react`-Installation (zweite Kopie → Invalid hook call). */
function firstExistingFile(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolveReactRuntimeSourceFile(reactDir, moduleName) {
  if (!reactDir) return null;
  if (moduleName === "react/jsx-runtime") {
    return firstExistingFile([
      path.join(reactDir, "jsx-runtime.js"),
      path.join(reactDir, "cjs", "jsx-runtime.production.js"),
      path.join(reactDir, "cjs", "jsx-runtime.development.js"),
    ]);
  }
  if (moduleName === "react/jsx-dev-runtime") {
    return firstExistingFile([
      path.join(reactDir, "jsx-dev-runtime.js"),
      path.join(reactDir, "cjs", "jsx-dev-runtime.production.js"),
      path.join(reactDir, "cjs", "jsx-dev-runtime.development.js"),
    ]);
  }
  return null;
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...extra,
};

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return {
      filePath: path.join(projectRoot, "stubs", "react-native-maps.js"),
      type: "sourceFile",
    };
  }
  const jsxFile = resolveReactRuntimeSourceFile(reactDir, moduleName);
  if (jsxFile) {
    return { type: "sourceFile", filePath: jsxFile };
  }
  if (typeof upstreamResolveRequest === "function") {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
