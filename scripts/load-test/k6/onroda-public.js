/**
 * k6 — öffentliche Endpunkte (kein Ride-Schreiben).
 * Usage: k6 run -e BASE_URL=http://127.0.0.1:29876 scripts/load-test/k6/onroda-public.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const base = __ENV.BASE_URL || "http://127.0.0.1:29876";
const healthDur = new Trend("healthz_duration", true);
const configDur = new Trend("app_config_duration", true);
const failRate = new Rate("failed_requests");

export const options = {
  scenarios: {
    public_read: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 30 },
        { duration: "60s", target: 80 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    healthz_duration: ["p(95)<200", "p(99)<500"],
    app_config_duration: ["p(95)<800", "p(99)<1500"],
    failed_requests: ["rate<0.02"],
  },
};

export default function () {
  const h = http.get(`${base}/api/healthz`);
  healthDur.add(h.timings.duration);
  const c = http.get(`${base}/api/app/config`);
  configDur.add(c.timings.duration);
  const ok = check(h, { health_ok: (r) => r.status === 200 }) && check(c, { config_ok: (r) => r.status === 200 });
  failRate.add(!ok);
  sleep(0.1);
}
