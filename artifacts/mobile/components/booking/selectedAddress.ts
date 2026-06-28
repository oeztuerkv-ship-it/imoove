import { isCompleteStreetAddressForBooking, MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE } from "@/lib/appOperationalConfig";
import type { GeoLocation } from "@/utils/routing";

export type SelectedAddress = {
  name: string;
  subline: string;
  fullName: string;
  /** Geocoding-Stadt (Photon city/town/village) — für Festpreis-Eligibility. */
  city: string;
  lat: number;
  lon: number;
  isStreetAddress: boolean;
  isPoiAddress: boolean;
};

export const EMPTY_SELECTED_ADDRESS: SelectedAddress = {
  name: "",
  subline: "",
  fullName: "",
  city: "",
  lat: 0,
  lon: 0,
  isStreetAddress: false,
  isPoiAddress: false,
};

function sublineCityFromPlzLine(subline: string): string {
  const parts = subline.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]?.trim() || "";
  return parts.slice(1).join(" ").trim();
}

function plzCitySubline(loc: GeoLocation, displayParts: string[]): string {
  const plz =
    loc.postcode?.trim() ||
    displayParts.find((p) => /^\d{5}$/.test(p)) ||
    "";
  const city =
    loc.city?.trim() ||
    displayParts.find(
      (p, i) =>
        i > 0 &&
        !/^\d{5}$/.test(p) &&
        !/\d/.test(p) &&
        !/deutschland|germany|baden-württemberg|landkreis|region/i.test(p),
    ) ||
    "";
  return [plz, city].filter(Boolean).join(" ");
}

export function geoLocationToSelectedAddress(loc: GeoLocation): SelectedAddress {
  const parts = loc.displayName.split(",").map((p) => p.trim()).filter(Boolean);
  const street = loc.street?.trim() ?? "";
  const house = loc.housenumber?.trim() ?? "";
  let name = (parts[0] ?? loc.displayName).trim();
  if (street) {
    name = house ? `${street} ${house}` : street;
  }
  const subline = plzCitySubline(loc, parts) || parts.slice(1, 3).join(", ").trim();
  const fullName = subline ? `${name}, ${subline}` : loc.displayName;
  const hasHouse =
    Boolean(house) || /\b\d{1,5}[a-z]?(?:\s*[-/]\s*\d{1,5}[a-z]?)?\b/i.test(name);
  const hasCity = Boolean(loc.city?.trim() || subline);
  const isPoiAddress = !hasHouse || !hasCity;
  const cityFromSubline = sublineCityFromPlzLine(subline);
  const city = loc.city?.trim() || cityFromSubline || parts.find(
    (p, i) =>
      i > 0 &&
      !/^\d{5}$/.test(p) &&
      !/\d/.test(p) &&
      !/deutschland|germany|baden-württemberg|^landkreis|region/i.test(p),
  )?.trim() || "";
  return {
    name,
    subline,
    fullName,
    city,
    lat: loc.lat,
    lon: loc.lon,
    isStreetAddress: !isPoiAddress,
    isPoiAddress,
  };
}

export function selectedAddressToGeoLocation(addr: SelectedAddress): GeoLocation {
  return {
    displayName: addr.fullName || addr.name,
    lat: addr.lat,
    lon: addr.lon,
  };
}

export function selectedAddressIsComplete(addr: SelectedAddress): boolean {
  return addr.name.trim().length > 0 && Number.isFinite(addr.lat) && Number.isFinite(addr.lon);
}

export function selectedAddressIsBookingComplete(addr: SelectedAddress): boolean {
  return isCompleteStreetAddressForBooking({
    fullName: addr.fullName || addr.name,
    subline: addr.subline,
    isPoiAddress: addr.isPoiAddress,
  });
}

export function defaultAddressPickValidation(
  selection: SelectedAddress,
): { ok: true } | { ok: false; message: string } {
  if (selectedAddressIsBookingComplete(selection)) return { ok: true };
  return { ok: false, message: MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE };
}
