import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PM2 startet Node oft ohne automatisches Einlesen von `.env`.
 * Reihenfolge: zuerst `artifacts/api-server/.env` (neben `dist/`), dann Repo-Root — beide mit
 * `override: false`, damit bereits gesetzte PM2-Variablen gewinnen, aber API-Secrets aus
 * api-server/.env nicht durch eine frühere `break`-Logik ignoriert werden.
 */
const apiServerEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const cwdEnv = path.join(process.cwd(), ".env");
const loadedEnvPaths = new Set<string>();

for (const envPath of [apiServerEnv, cwdEnv]) {
  if (!existsSync(envPath)) continue;
  const resolved = path.resolve(envPath);
  if (loadedEnvPaths.has(resolved)) continue;
  loadedEnvPaths.add(resolved);
  config({ path: resolved, override: false });
}
