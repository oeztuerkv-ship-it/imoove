import { router } from "expo-router";

/** Nach Logout: Stack leeren und Startseite (Standard-UI). */
export function navigateToCustomerStartScreen(): void {
  try {
    if (typeof router.dismissAll === "function") {
      router.dismissAll();
    }
  } catch {
    /* ignore */
  }
  router.replace("/");
}
