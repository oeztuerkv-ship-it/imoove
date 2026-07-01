import * as WebBrowser from "expo-web-browser";

const DISMISS_AUTH_SESSION_MS = 1500;

/** Schließt eine offene OAuth-Browser-Session; bricht nach Timeout ab (iOS-Hänger vermeiden). */
export async function dismissAuthSessionSafe(): Promise<void> {
  try {
    if (typeof WebBrowser.dismissAuthSession !== "function") return;
    await Promise.race([
      WebBrowser.dismissAuthSession(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, DISMISS_AUTH_SESSION_MS);
      }),
    ]);
  } catch {
    /* ignore */
  }
}
