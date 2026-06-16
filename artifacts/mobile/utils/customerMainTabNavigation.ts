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
 * Modals/Stack: zuerst dismissAll, dann dismissTo; Fallback replace.
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
    router.dismissTo(href);
    return;
  } catch {
    /* Route nicht im Stack */
  }
  try {
    router.replace(href);
  } catch {
    /* ignore */
  }
}
