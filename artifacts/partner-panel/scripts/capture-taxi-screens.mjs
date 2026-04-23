/**
 * Echte Full-Page-Screenshots des Partner-Panels (Taxi-Workspace) — kein Mock.
 *
 * Voraussetzungen:
 *   - `pnpm run dev` im Ordner partner-panel (Standard: http://127.0.0.1:5175)
 *   - Gültiges Panel-JWT
 *
 * Token aus dem Browser: Application → Local Storage → `onrodaPanelJwt`
 *
 *   export PANEL_JWT='…'
 *   pnpm run capture:screens
 *
 * Ausgabe (gitignored): ./screenshots/taxi-cockpit.png, taxi-stammdaten.png, taxi-dokumente.png, taxi-flotte.png
 */

import { mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "screenshots");
const BASE = (process.env.PANEL_BASE_URL || "http://127.0.0.1:5175").replace(/\/$/, "");
const JWT = process.env.PANEL_JWT;

if (!JWT) {
  console.error(
    "Fehlendes PANEL_JWT. Wert von localStorage['onrodaPanelJwt'] exportieren, z. B.: export PANEL_JWT='…'",
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const SHOTS = [
  {
    key: "dashboard",
    file: "taxi-cockpit.png",
    waitSelector: "h1.partner-page-title",
    textIncludes: "Guten Tag",
  },
  {
    key: "stammdaten",
    file: "taxi-stammdaten.png",
    waitSelector: "h1.partner-page-title",
    textIncludes: "Stammdaten",
  },
  {
    key: "dokumente",
    file: "taxi-dokumente.png",
    waitSelector: "h1.partner-page-title",
    textIncludes: "Dokumente",
  },
  {
    key: "flotte",
    file: "taxi-flotte.png",
    waitSelector: "h1.partner-page-title",
    textIncludes: "Fahrer",
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.addInitScript((token) => {
  localStorage.setItem("onrodaPanelJwt", token);
}, JWT);

async function waitTaxiShell() {
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return !t.includes("System startet");
    },
    { timeout: 120_000 },
  );
  await page.waitForSelector(".partner-shell__header", { timeout: 60_000 });
}

for (const shot of SHOTS) {
  const url = `${BASE}/?taxiModule=${encodeURIComponent(shot.key)}`;
  await page.goto(url, { waitUntil: "load" });
  await waitTaxiShell();

  await page.waitForSelector(shot.waitSelector, { timeout: 120_000 });
  await page.waitForFunction(
    ({ sel, needle }) => {
      const el = document.querySelector(sel);
      return el && (el.textContent || "").includes(needle);
    },
    { sel: shot.waitSelector, needle: shot.textIncludes },
    { timeout: 60_000 },
  );

  // Cockpit: Dashboard lädt asynchron Firmen-/Flottendaten
  if (shot.key === "dashboard") {
    await page.waitForFunction(
      () => !document.body?.innerText?.includes("Daten werden geladen"),
      { timeout: 120_000 },
    );
    await page.waitForSelector(".partner-kpi-grid", { timeout: 120_000 });
  }

  const outPath = join(OUT_DIR, shot.file);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log("OK", outPath, existsSync(outPath) ? `(${statSync(outPath).size} bytes)` : "");
}

await browser.close();
