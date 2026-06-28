import * as WebBrowser from "expo-web-browser";

import { performCustomerLogout } from "@/utils/performCustomerLogout";

/**
 * Vor OAuth aus dem Login-UI: hängende Browser-Session schließen und
 * verwaiste AsyncStorage-Session löschen (ohne eingeloggten Nutzer abzumelden).
 */
export async function prepareCustomerOAuthLogin(isLoggedIn: boolean): Promise<void> {
  try {
    if (typeof WebBrowser.dismissAuthSession === "function") {
      await WebBrowser.dismissAuthSession();
    }
  } catch {
    /* ignore */
  }
  if (!isLoggedIn) {
    await performCustomerLogout();
  }
}
