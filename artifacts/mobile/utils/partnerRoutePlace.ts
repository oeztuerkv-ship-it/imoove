import {
  shortPartnerAddressLabel,
  validatePartnerRouteAddress,
  type PartnerRouteAddressField,
} from "@/utils/partnerRouteAddress";
import type { GeoLocation } from "@/utils/routing";

export type PartnerRoutePlace = {
  label: string;
  full: string;
  lat: number;
  lon: number;
};

function plzFromDisplay(parts: string[]): string {
  return parts.find((p) => /^\d{5}$/.test(p)) ?? "";
}

function cityFromDisplay(parts: string[], plz: string): string {
  if (plz) {
    const idx = parts.findIndex((p) => p === plz);
    const next = idx >= 0 ? parts[idx + 1] : "";
    if (next && !/deutschland|baden-württemberg|landkreis|region/i.test(next)) return next;
  }
  return (
    parts.find(
      (p, i) =>
        i > 0 &&
        !/^\d{5}$/.test(p) &&
        !/\d/.test(p) &&
        !/deutschland|baden-württemberg|landkreis|region/i.test(p),
    ) ?? ""
  );
}

/** Photon/Nominatim → Partner-API-Adresszeile (fromFull/toFull). */
export function geoLocationToPartnerRoutePlace(loc: GeoLocation): PartnerRoutePlace {
  const parts = loc.displayName.split(",").map((p) => p.trim()).filter(Boolean);
  const street = loc.street?.trim() ?? "";
  const house = loc.housenumber?.trim() ?? "";
  const plz = loc.postcode?.trim() || plzFromDisplay(parts);
  const city = loc.city?.trim() || cityFromDisplay(parts, plz);

  let line1 = street ? (house ? `${street} ${house}` : street) : (parts[0] ?? loc.displayName).trim();
  if (!street && parts[0]) line1 = parts[0];

  let full = loc.displayName.trim();
  if (line1 && plz) {
    full = city ? `${line1}, ${plz} ${city}` : `${line1}, ${plz}`;
  }

  return {
    label: shortPartnerAddressLabel(full),
    full,
    lat: loc.lat,
    lon: loc.lon,
  };
}

export function validatePartnerRoutePlace(
  place: PartnerRoutePlace,
  field: PartnerRouteAddressField,
): { ok: false; message: string } | { ok: true } {
  return validatePartnerRouteAddress(place.full, field);
}
