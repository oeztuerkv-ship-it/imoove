import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSegments } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isAppLocale,
  languageDisplayName,
  setI18nLocale,
  t as translate,
  type AppLocale,
} from "@/src/i18n";
import { normalizeDeviceLocale } from "@/src/i18n/deviceLocale";

type LanguageContextValue = {
  locale: AppLocale;
  ready: boolean;
  setLocale: (next: AppLocale) => Promise<void>;
  t: (key: string, options?: Record<string, string | number>) => string;
  languageLabel: string;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  ready: false,
  setLocale: async () => {},
  t: translate,
  languageLabel: languageDisplayName(DEFAULT_LOCALE),
});

async function readStoredLocale(): Promise<AppLocale> {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return normalizeDeviceLocale();
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const isDriverSurface = segments[0] === "driver" || segments[0] === "fahrer-login";
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  /** Fahrer-App: immer Deutsch — keine Sprachwahl, kein Mix mit Kunden-Locale. */
  const activeLocale: AppLocale = isDriverSurface ? DEFAULT_LOCALE : locale;

  useEffect(() => {
    let cancelled = false;
    void readStoredLocale().then((stored) => {
      if (cancelled) return;
      setLocaleState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setI18nLocale(activeLocale);
  }, [ready, activeLocale]);

  const setLocale = useCallback(async (next: AppLocale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
    setLocaleState(next);
    if (!isDriverSurface) {
      setI18nLocale(next);
    }
  }, [isDriverSurface]);

  const t = useCallback(
    (key: string, options?: Record<string, string | number>) => translate(key, options),
    [activeLocale],
  );

  const value = useMemo(
    (): LanguageContextValue => ({
      locale: activeLocale,
      ready,
      setLocale,
      t,
      languageLabel: languageDisplayName(activeLocale),
    }),
    [activeLocale, ready, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Alias: `const { t, locale, setLocale } = useTranslation()` */
export function useTranslation() {
  return useContext(LanguageContext);
}
