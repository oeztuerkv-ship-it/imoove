import { formatPartnerAddressFull } from "./partnerAddressValidation.js";

export const PARTNER_ADDRESS_FAVORITES_STORAGE_PREFIX = "onroda_partner_address_favorites_v1";
export const MAX_PARTNER_ADDRESS_FAVORITES = 10;

/** @typedef {{ id: string, label: string, street: string, houseNo: string, plz: string, lat?: number | null, lon?: number | null }} PartnerAddressFavorite */

function storageKey(companyId) {
  const cid = String(companyId ?? "").trim();
  return cid ? `${PARTNER_ADDRESS_FAVORITES_STORAGE_PREFIX}_${cid}` : "";
}

function isFavorite(x) {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof x.id === "string" &&
    typeof x.label === "string" &&
    typeof x.street === "string" &&
    typeof x.houseNo === "string" &&
    typeof x.plz === "string"
  );
}

export function partnerAddressFavoriteKey(street, houseNo, plz) {
  return [street, houseNo, plz].map((v) => String(v ?? "").trim().toLowerCase()).join("|");
}

export function createPartnerAddressFavoriteId() {
  return `pfav-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {PartnerAddressFavorite[]} */
export function loadPartnerAddressFavorites(companyId) {
  const key = storageKey(companyId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavorite).slice(0, MAX_PARTNER_ADDRESS_FAVORITES);
  } catch {
    return [];
  }
}

/** @param {PartnerAddressFavorite[]} favorites */
export function savePartnerAddressFavorites(companyId, favorites) {
  const key = storageKey(companyId);
  if (!key) return [];
  const capped = favorites.filter(isFavorite).slice(0, MAX_PARTNER_ADDRESS_FAVORITES);
  try {
    localStorage.setItem(key, JSON.stringify(capped));
  } catch {
    /* ignore quota */
  }
  return capped;
}

/**
 * @param {{ label?: string, street: string, houseNo: string, plz: string, lat?: number | null, lon?: number | null }} input
 * @returns {{ ok: true, favorites: PartnerAddressFavorite[] } | { ok: false, error: "limit_reached" | "duplicate" | "invalid" }}
 */
export function addPartnerAddressFavorite(companyId, input) {
  const street = String(input.street ?? "").trim();
  const houseNo = String(input.houseNo ?? "").trim();
  const plz = String(input.plz ?? "").trim();
  if (!street || !houseNo || !/^\d{5}$/.test(plz)) {
    return { ok: false, error: "invalid" };
  }

  const existing = loadPartnerAddressFavorites(companyId);
  const key = partnerAddressFavoriteKey(street, houseNo, plz);
  if (existing.some((f) => partnerAddressFavoriteKey(f.street, f.houseNo, f.plz) === key)) {
    return { ok: false, error: "duplicate" };
  }
  if (existing.length >= MAX_PARTNER_ADDRESS_FAVORITES) {
    return { ok: false, error: "limit_reached" };
  }

  const label =
    String(input.label ?? "").trim() ||
    formatPartnerAddressFull(street, houseNo, plz).split(",")[0]?.trim() ||
    "Favorit";

  const next = {
    id: createPartnerAddressFavoriteId(),
    label,
    street,
    houseNo,
    plz,
    lat: Number.isFinite(input.lat) ? input.lat : null,
    lon: Number.isFinite(input.lon) ? input.lon : null,
  };

  const favorites = savePartnerAddressFavorites(companyId, [...existing, next]);
  return { ok: true, favorites };
}

/** @returns {PartnerAddressFavorite[]} */
export function removePartnerAddressFavorite(companyId, favoriteId) {
  const id = String(favoriteId ?? "").trim();
  if (!id) return loadPartnerAddressFavorites(companyId);
  const next = loadPartnerAddressFavorites(companyId).filter((f) => f.id !== id);
  return savePartnerAddressFavorites(companyId, next);
}
