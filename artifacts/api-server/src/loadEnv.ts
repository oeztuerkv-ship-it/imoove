import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PM2 startet Node oft ohne automatisches Einlesen von `.env`.
 * Wir probieren: aktuelles Arbeitsverzeichnis, dann Elternordner von `dist/` (bei gebündeltem Start).
 */
const candidates = [
  path.join(process.cwd(), ".env"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
];

for (const envPath of candidates) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
    break;
  }
}
