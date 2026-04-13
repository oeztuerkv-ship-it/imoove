const GOOGLE_MATRIX_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json";

const BASE_FARE = 5;
const RATE_FIRST = 2.4;
const RATE_AFTER = 2.0;
const THRESHOLD_KM = 10;
const SERVICE_FEE = 2;

export function estimateSystemFare(distanceKm) {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d <= 0) return 0;
  const distanceCharge =
    d <= THRESHOLD_KM
      ? d * RATE_FIRST
      : THRESHOLD_KM * RATE_FIRST + (d - THRESHOLD_KM) * RATE_AFTER;
  const total = BASE_FARE + distanceCharge + SERVICE_FEE;
  return Math.round(total * 100) / 100;
}

export function toIsoFromDatetimeLocal(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function fromIsoToDatetimeLocal(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

export async function fetchDistanceMatrixByAddress(fromFull, toFull) {
  const key = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) {
    throw new Error("missing_google_maps_key");
  }
  const from = String(fromFull || "").trim();
  const to = String(toFull || "").trim();
  if (!from || !to) {
    throw new Error("route_fields_required");
  }
  const url =
    `${GOOGLE_MATRIX_BASE}?origins=${encodeURIComponent(from)}` +
    `&destinations=${encodeURIComponent(to)}` +
    `&mode=driving&language=de&units=metric&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status !== "OK") throw new Error("matrix_failed");
  const el = data?.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK") throw new Error("matrix_no_route");
  const distanceMeters = Number(el.distance?.value ?? 0);
  const durationSeconds = Number(el.duration?.value ?? 0);
  const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    distanceKm,
    durationMinutes,
    estimatedFare: estimateSystemFare(distanceKm),
  };
}
