import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  type OnrodaAppConfig,
  fetchAppConfig,
  getDefaultAppConfig,
  invalidateAppConfigCache,
} from "@/lib/appConfig";
import { type AppPricingResponse, fetchAppPricing } from "@/lib/appPricing";

type AppConfigContextValue = {
  config: OnrodaAppConfig;
  loading: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

const REFRESH_MS = 45_000;

function mergePricingIntoConfig(data: OnrodaAppConfig, pricing: AppPricingResponse | null): OnrodaAppConfig {
  if (!pricing?.tariffs || typeof pricing.tariffs !== "object") return data;
  return {
    ...data,
    tariffs: { ...data.tariffs, ...pricing.tariffs },
    version: typeof pricing.version === "number" ? pricing.version : data.version,
    updatedAt: pricing.updatedAt ?? data.updatedAt,
  };
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<OnrodaAppConfig>(getDefaultAppConfig);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLastError(null);
    try {
      invalidateAppConfigCache();
      const [data, pricing] = await Promise.all([fetchAppConfig(), fetchAppPricing()]);
      setConfig(mergePricingIntoConfig(data, pricing));
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "config_load_failed");
      let fallback = getDefaultAppConfig();
      try {
        const pricing = await fetchAppPricing();
        fallback = mergePricingIntoConfig(fallback, pricing);
      } catch {
        /* ignore */
      }
      setConfig(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void refresh();
    });
    const t = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [refresh]);

  const value = useMemo<AppConfigContextValue>(
    () => ({ config, loading, lastError, refresh }),
    [config, loading, lastError, refresh],
  );

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useOnrodaAppConfig(): AppConfigContextValue {
  const v = useContext(AppConfigContext);
  if (!v) {
    return {
      config: getDefaultAppConfig(),
      loading: false,
      lastError: null,
      refresh: async () => {
        await fetchAppConfig();
      },
    };
  }
  return v;
}
