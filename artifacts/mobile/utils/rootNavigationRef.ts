import {
  CommonActions,
  type NavigationContainerRefWithCurrent,
  type NavigationState,
  type ParamListBase,
} from "@react-navigation/native";
import type { Href } from "expo-router";
import { router } from "expo-router";

let boundRef: NavigationContainerRefWithCurrent<ParamListBase> | null = null;

export function bindRootNavigationRef(ref: { isReady?: () => boolean; dispatch?: unknown } | null): void {
  boundRef = ref as NavigationContainerRefWithCurrent<ParamListBase> | null;
}

export function isRootNavigationReady(): boolean {
  return Boolean(boundRef?.isReady?.());
}

function parseHref(href: Href): { pathname: string; params?: Record<string, string> } {
  if (typeof href === "string") {
    const path = href.split("?")[0]?.trim() || "/";
    return { pathname: path.startsWith("/") ? path : `/${path}` };
  }
  const pathname = href.pathname?.trim() || "/";
  const params = href.params as Record<string, string> | undefined;
  return { pathname: pathname.startsWith("/") ? pathname : `/${pathname}`, params };
}

/** React-Navigation-Route-Name (ohne führenden Slash), z. B. `driver/navigation`. */
function routeNameFromPath(pathname: string): string {
  return pathname.replace(/^\//, "");
}

/**
 * Ein Eintrag im Navigator — kein Zurück-Swipe zu älteren Navigation-Instanzen.
 * Fahrer-Routen liegen unter verschachteltem `driver`-Stack (app/driver/_layout.tsx).
 */
function buildResetState(pathname: string, params?: Record<string, string>): NavigationState {
  const fullName = routeNameFromPath(pathname);

  if (fullName.startsWith("driver/")) {
    const childName = fullName.slice("driver/".length);
    return {
      index: 0,
      routes: [
        {
          name: "driver",
          state: {
            index: 0,
            routes: [{ name: childName, params: params ?? {} }],
          },
        },
      ],
    } as NavigationState;
  }

  return {
    index: 0,
    routes: [{ name: fullName, params: params ?? {} }],
  } as NavigationState;
}

export function dispatchRootStackReset(href: Href): boolean {
  const ref = boundRef;
  if (!ref?.isReady?.()) return false;

  const { pathname, params } = parseHref(href);
  ref.dispatch(CommonActions.reset(buildResetState(pathname, params)));
  return true;
}

/** Nach Native-State-Restore: erst zurück, dann harter Reset (mit Retry). */
export function resetNavigationStackExclusive(href: Href, attempt = 0): void {
  if (dispatchRootStackReset(href)) return;

  if (attempt < 12) {
    const delay = attempt === 0 ? 0 : 50;
    setTimeout(() => resetNavigationStackExclusive(href, attempt + 1), delay);
    return;
  }

  try {
    if (typeof router.canGoBack === "function") {
      while (router.canGoBack()) router.back();
    }
  } catch {
    /* ignore */
  }
  router.replace(href);
}
