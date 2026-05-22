import { DEFAULT_LOCALE, type AppLocale } from "./types";

/** Gerätesprache per Intl (kein natives Modul — Metro/pnpm-sicher). */
export function normalizeDeviceLocale(): AppLocale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale?.split(/[-_]/)[0]?.toLowerCase();
    if (tag === "en") return "en";
    if (tag === "tr") return "tr";
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}
