import { router } from "expo-router";
import { InteractionManager } from "react-native";

/** Verhindert parallele/doppelte Navigation nach Logout (mehrfach Klick). */
let customerStartNavigationLock = false;

function isOnCustomerStartRoute(pathname?: string): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/$/, "") || "/";
  return p === "/" || p === "/index";
}

/**
 * Nach Kunden-Logout zur Startseite — nur `replace`, kein `dismissAll`/`back`
 * (sonst Expo Router: „Is there any screen to go back to?“).
 */
export function navigateToCustomerStartScreen(pathname?: string): void {
  if (customerStartNavigationLock) return;
  if (isOnCustomerStartRoute(pathname)) return;

  customerStartNavigationLock = true;

  const goHome = () => {
    try {
      router.replace("/");
    } catch {
      /* Navigator noch nicht bereit — einmal nachfassen */
      setTimeout(() => {
        try {
          router.replace("/");
        } catch {
          /* ignore */
        }
      }, 80);
    } finally {
      setTimeout(() => {
        customerStartNavigationLock = false;
      }, 700);
    }
  };

  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(goHome);
  });
}
