import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";

import {
  PASSENGER_ID_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
} from "@/constants/customerSessionStorage";
import { queryClient } from "@/lib/queryClient";

/**
 * Lokale Kunden-Session vollständig zurücksetzen (ohne Navigation).
 * Navigation: `navigateToCustomerStartScreen()` aus dem Aufrufer.
 */
export async function performCustomerLogout(): Promise<void> {
  try {
    if (typeof WebBrowser.dismissAuthSession === "function") {
      await WebBrowser.dismissAuthSession();
    }
  } catch {
    /* ignore */
  }

  try {
    await AsyncStorage.multiRemove([USER_PROFILE_STORAGE_KEY, PASSENGER_ID_STORAGE_KEY]);
  } catch {
    /* ignore */
  }

  queryClient.clear();
}
