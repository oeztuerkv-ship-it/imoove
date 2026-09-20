/**
 * Verdrahtungs-Guard: Die Follow-Kamera darf nirgends eine eigene (Meter/Pixel-)Altitude bauen.
 *   npx tsx artifacts/mobile/utils/navEngine/cameraAltitudeWiring.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nav = readFileSync(join(here, "../../app/driver/navigation.tsx"), "utf8");
const eng = readFileSync(join(here, "CameraEngine.ts"), "utf8");

function assert(c, m) {
  if (!c) {
    console.error("cameraAltitudeWiring FAIL:", m);
    process.exit(1);
  }
}

assert(!/156543/.test(nav), "navigation.tsx darf keine eigene Zoom→Altitude-Konstante enthalten");
assert(!/function\s+zoomLevelToAltitudeMeters/.test(nav), "navigation.tsx darf zoomLevelToAltitudeMeters nicht selbst definieren");
assert(/zoomLevelToAltitudeMeters,\s*\n\}\s*from "@\/utils\/navEngine"/.test(nav), "navigation.tsx importiert die Engine-Funktion");
assert((eng.match(/156543\.03392/g) ?? []).length === 1, "CameraEngine.ts: genau eine Umrechnungs-Konstante");
assert((eng.match(/altitude:\s*zoomLevelToAltitudeMeters\(/g) ?? []).length === 1, "genau eine Command-Altitude-Quelle");

const followCalls = nav.match(/tickFollowFromNav\(cameraEngineRef\.current, nav, \{[\s\S]*?\}\);/g) ?? [];
assert(followCalls.length === 1, "genau ein tickFollowFromNav-Aufruf");
assert(/viewportHeightPt:\s*Dimensions\.get\("window"\)\.height/.test(followCalls[0]), "tickFollowFromNav bekommt echte View-Höhe");
const pend = nav.match(/consumePendingCamera\(cameraEngineRef\.current[\s\S]*?\}\);/g) ?? [];
assert(pend.length === 1 && /viewportHeightPt/.test(pend[0]), "consumePendingCamera bekommt echte View-Höhe");
assert(/zoomLevelToAltitudeMeters\(zoom, lat, \{\s*viewportHeightPt: Dimensions\.get\("window"\)\.height,\s*pitchDeg: pitch,/.test(nav), "initialCamera nutzt Engine-Formel mit View-Höhe + Pitch");

console.log("cameraAltitudeWiring.selftest: OK");
