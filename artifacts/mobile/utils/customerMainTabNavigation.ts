import { router, type Href } from "expo-router";

import type { BottomTab } from "@/components/BottomTabBar";

const TAB_HREF: Record<BottomTab, Href> = {
  start: "/",
  fahrten: "/my-rides",
  buchen: "/booking-center",
  orte: "/orte",
  account: "/profile",
};

/**
 * Haupt-Tab wechseln und überlagerte Buchungs-Screens schließen.
 * `replace` statt `dismissTo` — vermeidet leeren Stack nach dismissAll (Fahrten/Wallet leer).
 */
export function navigateToCustomerMainTab(tab: BottomTab): void {
  const href = TAB_HREF[tab];
  try {
    if (typeof router.canDismiss === "function" && router.canDismiss()) {
      router.dismissAll();
    }
  } catch {
    /* Navigator noch nicht bereit */
  }
  try {
    router.replace(href);
  } catch {
    try {
      router.push(href);
    } catch {
      /* ignore */
    }
  }
}
