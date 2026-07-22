import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bump when Richtlinien-Text sich inhaltlich ändert —
 * Fahrer müssen dann erneut bestätigen.
 */
export const DRIVER_PREBOOK_GUIDELINES_VERSION = "2026-07-22";

const STORAGE_PREFIX = "@onroda/driver_prebook_guidelines:";

type StoredConsent = {
  version: string;
  acceptedAt: string;
};

function storageKey(driverId: string): string {
  return `${STORAGE_PREFIX}${driverId.trim()}`;
}

export async function hasAcceptedDriverPrebookGuidelines(driverId: string): Promise<boolean> {
  const id = driverId.trim();
  if (!id) return false;
  try {
    const raw = await AsyncStorage.getItem(storageKey(id));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed?.version === DRIVER_PREBOOK_GUIDELINES_VERSION && Boolean(parsed.acceptedAt);
  } catch {
    return false;
  }
}

export async function acceptDriverPrebookGuidelines(driverId: string): Promise<void> {
  const id = driverId.trim();
  if (!id) return;
  const payload: StoredConsent = {
    version: DRIVER_PREBOOK_GUIDELINES_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(id), JSON.stringify(payload));
}
