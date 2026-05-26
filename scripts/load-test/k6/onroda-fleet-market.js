/**
 * k6 — Fahrer Markt-Poll (nur Staging/Test mit LOAD_TEST-Fahrer!).
 * Requires: BASE_URL, FLEET_TOKEN (from POST /api/fleet-auth/login)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const base = __ENV.BASE_URL;
const token = __ENV.FLEET_TOKEN;
const marketDur = new Trend("market_rides_duration", true);
const failRate = new Rate("failed_requests");

if (!base || !token) {
  throw new Error("Set BASE_URL and FLEET_TOKEN");
}

export const options = {
  scenarios: {
    driver_poll: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 40),
      duration: __ENV.DURATION || "2m",
    },
  },
  thresholds: {
    market_rides_duration: ["p(95)<1500", "p(99)<3000"],
    failed_requests: ["rate<0.05"],
  },
};

export default function () {
  const res = http.get(`${base}/api/fleet-driver/v1/market-rides`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  marketDur.add(res.timings.duration);
  const ok = check(res, { status_200: (r) => r.status === 200 });
  failRate.add(!ok);
  sleep(2.5);
}
