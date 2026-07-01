import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  PASSENGER_ID_STORAGE_KEY,
  PENDING_OAUTH_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
} from "@/constants/customerSessionStorage";
import { queryClient } from "@/lib/queryClient";
import { dismissAuthSessionSafe } from "@/utils/dismissAuthSessionSafe";

let customerLogoutInFlight: Promise<void> | null = null;

async function runCustomerLogoutCleanup(): Promise<void> {
  await dismissAuthSessionSafe();

  try {
    await AsyncStorage.multiRemove([
      USER_PROFILE_STORAGE_KEY,
      PASSENGER_ID_STORAGE_KEY,
      PENDING_OAUTH_STORAGE_KEY,
    ]);
  } catch {
    /* ignore */
  }

  queryClient.clear();
}

/**
 * Lokale Kunden-Session vollständig zurücksetzen (ohne Navigation).
 * Navigation: `navigateToCustomerStartScreen()` aus dem Aufrufer.
 * Idempotent: parallele Aufrufe teilen dieselbe Promise.
 */
export async function performCustomerLogout(): Promise<void> {
  if (customerLogoutInFlight) {
    await customerLogoutInFlight;
    return;
  }

  customerLogoutInFlight = runCustomerLogoutCleanup().finally(() => {
    customerLogoutInFlight = null;
  });

  await customerLogoutInFlight;
}
