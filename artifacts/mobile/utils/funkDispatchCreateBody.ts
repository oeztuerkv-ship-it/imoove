import type { SelectedAddress } from "@/components/booking/selectedAddress";
import { selectedAddressHasCoords } from "@/components/driver/DriverSheetAddressField";

export type FunkDispatchCreateBody = {
  customerName: string;
  customerPhone?: string;
  note?: string;
  from: string;
  fromFull: string;
  to: string;
  toFull: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
};

/**
 * Funk-Create-Body nur mit echten Places-Koordinaten.
 * Ohne lat/lon → null (Client darf nicht absenden).
 */
export function buildFunkDispatchCreateBody(input: {
  customerName: string;
  customerPhone?: string;
  note?: string;
  from: SelectedAddress;
  to: SelectedAddress;
}): FunkDispatchCreateBody | null {
  if (!selectedAddressHasCoords(input.from) || !selectedAddressHasCoords(input.to)) {
    return null;
  }
  const fromFull = (input.from.fullName || input.from.name).trim();
  const toFull = (input.to.fullName || input.to.name).trim();
  if (!fromFull || !toFull) return null;
  const phone = (input.customerPhone ?? "").trim();
  const note = (input.note ?? "").trim();
  return {
    customerName: (input.customerName ?? "").trim() || "Telefonkunde",
    ...(phone ? { customerPhone: phone } : {}),
    ...(note ? { note } : {}),
    from: fromFull.split(",")[0]?.trim() || fromFull,
    fromFull,
    to: toFull.split(",")[0]?.trim() || toFull,
    toFull,
    fromLat: input.from.lat,
    fromLon: input.from.lon,
    toLat: input.to.lat,
    toLon: input.to.lon,
  };
}
