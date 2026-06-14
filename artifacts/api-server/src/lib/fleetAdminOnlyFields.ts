import type { Response } from "express";

/** Felder, die Partner nicht per PATCH setzen dürfen (nur Admin). */
export const PARTNER_FLEET_DRIVER_PATCH_ADMIN_FIELDS = ["isActive"] as const;

export const PARTNER_FLEET_VEHICLE_PATCH_ADMIN_FIELDS = [
  "licensePlate",
  "konzessionNumber",
  "taxiOrderNumber",
  "vehicleType",
  "isActive",
] as const;

export const PARTNER_COMPANY_PATCH_ADMIN_FIELDS = ["concessionNumber", "taxId"] as const;

export function rejectPartnerAdminOnlyBodyFields(
  res: Response,
  body: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  for (const field of fields) {
    if (body[field] !== undefined) {
      res.status(403).json({ error: "admin_only_field", field });
      return true;
    }
  }
  if (body.vehicleType === "wheelchair") {
    res.status(403).json({ error: "admin_only_field", field: "vehicleType" });
    return true;
  }
  if (body.vehicleClass === "wheelchair") {
    res.status(403).json({ error: "admin_only_field", field: "vehicleClass" });
    return true;
  }
  return false;
}
