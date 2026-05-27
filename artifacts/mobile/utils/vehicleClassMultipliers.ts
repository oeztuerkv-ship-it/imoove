/** Fahrzeugklassen der Server-Tarif-Engine (Admin: `vehicleClassMultipliers`). */
export type VehicleClassId = "standard" | "xl" | "wheelchair" | "onroda";

/** Gleiche Defaults wie `operationalTariffEngine` / `DEFAULT_PAYLOAD.tariffs`. */
export const SERVER_DEFAULT_VEHICLE_CLASS_MULTIPLIERS: Record<VehicleClassId, number> = {
  standard: 1,
  xl: 1.2,
  wheelchair: 1.15,
  onroda: 1,
};

export function normalizeDriverVehicleClass(vehicle: string | null | undefined): VehicleClassId {
  const v = (vehicle ?? "").toLowerCase().trim();
  if (v === "xl" || v.includes("xl") || v.includes("van") || v.includes("6 person")) return "xl";
  if (v === "wheelchair" || v.includes("rollstuhl") || v.includes("wheelchair")) return "wheelchair";
  if (v === "onroda") return "onroda";
  return "standard";
}

/** Aus `GET /api/app/config` → `tariffs` (Admin-Quelle). */
export function vehicleClassMultipliersFromTariffs(
  tariffs: Record<string, unknown> | null | undefined,
): Record<VehicleClassId, number> {
  const out = { ...SERVER_DEFAULT_VEHICLE_CLASS_MULTIPLIERS };
  const raw = tariffs?.vehicleClassMultipliers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k !== "standard" && k !== "xl" && k !== "wheelchair" && k !== "onroda") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

export function formatMultiplierDe(multiplier: number): string {
  return multiplier.toFixed(1).replace(".", ",");
}
