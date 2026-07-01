import { clearPendingOAuthSession } from "@/utils/pendingOAuthSessionStorage";
import { dismissAuthSessionSafe } from "@/utils/dismissAuthSessionSafe";
import { performCustomerLogout } from "@/utils/performCustomerLogout";

/** Vor Google-OAuth (Browser): stale AuthSession + lokale Gast-Session räumen. */
export async function prepareGoogleOAuthLogin(isLoggedIn: boolean): Promise<void> {
  await dismissAuthSessionSafe();
  if (!isLoggedIn) {
    await performCustomerLogout();
  }
}

/**
 * Vor nativem Apple-Login: kein WebBrowser.dismissAuthSession — kann auf iOS hängen,
 * wenn zuvor AGB im Browser geöffnet wurde oder gar keine Auth-Session existiert.
 */
export async function prepareNativeAppleOAuthLogin(isLoggedIn: boolean): Promise<void> {
  if (!isLoggedIn) {
    await clearPendingOAuthSession();
  }
}

/** @deprecated Bitte prepareGoogleOAuthLogin / prepareNativeAppleOAuthLogin nutzen. */
export async function prepareCustomerOAuthLogin(isLoggedIn: boolean): Promise<void> {
  return prepareGoogleOAuthLogin(isLoggedIn);
}
