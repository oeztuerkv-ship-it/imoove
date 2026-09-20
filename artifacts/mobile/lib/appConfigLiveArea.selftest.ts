/**
 * Client: Live-Anfrage bundesweit, deaktivierte Regionen bleiben gesperrt, Reservierung prüft weiter.
 *   npx tsx artifacts/mobile/lib/appConfigLiveArea.selftest.ts
 */
import { clientCheckServiceArea, getDefaultAppConfig, isLiveBookingRequest } from "./appConfig";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const LEAD = 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 20, 12, 0, 0);

// Grenze exakt: < 60:00 Live, >= 60:00 Reservierung
assert(isLiveBookingRequest(null, now), "null = live");
assert(isLiveBookingRequest(new Date(now + LEAD - 1), now), "59:59.999 = live");
assert(!isLiveBookingRequest(new Date(now + LEAD), now), "60:00.000 = Reservierung");
assert(!isLiveBookingRequest(new Date(now + LEAD + 1), now), "60:00.001 = Reservierung");
assert(isLiveBookingRequest(new Date(now + LEAD - 1).toISOString(), now), "ISO 59:59.999 = live");
assert(!isLiveBookingRequest(new Date(now + LEAD).toISOString(), now), "ISO 60:00 = Reservierung");
assert(isLiveBookingRequest("kein-datum", now), "ungültig = live (wie Server)");

const base = getDefaultAppConfig();
const cfg = {
  ...base,
  serviceRegions: [
    { id: "a", label: "Stuttgart", matchTerms: ["stuttgart"], isActive: true, sortOrder: 1, matchMode: "substring" },
    { id: "b", label: "Sperrstadt", matchTerms: ["sperrstadt"], isActive: false, sortOrder: 2, matchMode: "substring" },
  ],
};

// Live: Berlin ohne Servicegebiet ok
assert(clientCheckServiceArea("Alexanderplatz 1, Berlin", "Stuttgart", cfg, null, { live: true }).ok, "live Berlin ok");
// Live: deaktivierte Region bleibt gesperrt
assert(!clientCheckServiceArea("Hauptstr. 1, Sperrstadt", "Stuttgart", cfg, null, { live: true }).ok, "live in deaktivierter Region gesperrt");
// Reservierung (kein live-Flag): Berlin weiter gesperrt, Stuttgart ok
assert(!clientCheckServiceArea("Alexanderplatz 1, Berlin", "Stuttgart", cfg, null).ok, "Reservierung Berlin gesperrt");
assert(clientCheckServiceArea("Königstr. 1, Stuttgart", "Berlin", cfg, null).ok, "Reservierung Stuttgart ok");
assert(!clientCheckServiceArea("Hauptstr. 1, Sperrstadt", "Stuttgart", cfg, null).ok, "Reservierung deaktivierte Region gesperrt");

console.log("appConfigLiveArea.selftest: OK");
