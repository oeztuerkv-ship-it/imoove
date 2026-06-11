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
 * Haupt-Tab wechseln und Buchungs-Modals/Stack bereinigen (z. B. booking-center → booking-medical).
 * `dismissTo` entfernt überlagerte Screens; Fallback `replace`.
 */
export function navigateToCustomerMainTab(tab: BottomTab): void {
  const href = TAB_HREF[tab];
  try {
    router.dismissTo(href);
    return;
  } catch {
    /* Navigator noch nicht bereit oder Route nicht im Stack */
  }
  try {
    router.replace(href);
  } catch {
    /* ignore */
  }
}
