/**
 * E2E-Smoke: Freigabe-/Gutscheincode → POST /api/rides akzeptiert Einlösung.
 * Läuft mit In-Memory-DB (kein DATABASE_URL) — ideal für CI/lokal nach `npm run build`.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.TEST_API_PORT || "19876");
const base = `http://127.0.0.1:${PORT}`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODE = "E2E-GUTSCHEIN-TEST";
const adminBearer = (process.env.ADMIN_API_BEARER_TOKEN ?? "").trim();

async function waitForHealth(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const r = await fetch(`${base}/api/healthz`);
      if (r.ok) return;
    } catch {
      /* noch nicht oben */
    }
    await delay(100);
  }
  throw new Error("API wurde nicht gesund innerhalb des Timeouts");
}

async function main() {
  const env = { ...process.env, NODE_ENV: "development", PORT: String(PORT) };
  delete env.DATABASE_URL;

  const proc = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (c) => {
    stderr += String(c);
  });

  try {
    await waitForHealth();

    const adminHeaders = { "Content-Type": "application/json" };
    if (adminBearer) adminHeaders.Authorization = `Bearer ${adminBearer}`;

    let res = await fetch(`${base}/api/admin/access-codes`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        code: CODE,
        codeType: "voucher",
        label: "Automated access-code booking test",
      }),
    });
    const createdCode = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          "Access-Code anlegen fehlgeschlagen: 401 unauthorized. " +
          "Setze ADMIN_API_BEARER_TOKEN und starte erneut, z. B. " +
          "ADMIN_API_BEARER_TOKEN=... npm run test:access-code",
        );
      }
      throw new Error(`Access-Code anlegen fehlgeschlagen: ${res.status} ${JSON.stringify(createdCode)}`);
    }

    const ridePayload = {
      customerName: "Test Kunde",
      passengerId: "pass-e2e-access-code",
      from: "Teststraße 1",
      fromFull: "Teststraße 1, Stuttgart",
      fromLat: 48.78,
      fromLon: 9.18,
      to: "Hbf",
      toFull: "Hauptbahnhof, Stuttgart",
      toLat: 48.78,
      toLon: 9.18,
      distanceKm: 5,
      durationMinutes: 15,
      estimatedFare: 25,
      paymentMethod: "Gutschein / Freigabe (Code)",
      vehicle: "Standard",
      accessCode: CODE,
    };

    res = await fetch(`${base}/api/rides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ridePayload),
    });
    const ride = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Fahrt mit Code fehlgeschlagen: ${res.status} ${JSON.stringify(ride)}`);
    }
    if (ride.authorizationSource !== "access_code") {
      throw new Error(
        `Erwartet authorizationSource "access_code", erhalten: ${JSON.stringify(ride.authorizationSource)}`,
      );
    }
    if (!ride.accessCodeId) {
      throw new Error("Erwartet accessCodeId auf der angelegten Fahrt");
    }
    if (ride.payerKind !== "third_party" && ride.payerKind !== "company") {
      throw new Error(`Unerwarteter payerKind nach Code: ${ride.payerKind}`);
    }

    console.log(
      "OK: Gutschein-/Freigabe-Code wurde akzeptiert — Fahrt",
      ride.id,
      "| authorizationSource:",
      ride.authorizationSource,
      "| payerKind:",
      ride.payerKind,
    );
  } finally {
    proc.kill("SIGTERM");
    await delay(200);
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
