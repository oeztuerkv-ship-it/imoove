import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchErrorMessage, getApiBaseUrl } from "@/utils/apiBase";

const STORAGE_KEY = "@Onroda_driver_session";
const DRIVER_HEARTBEAT_MS = 45_000;
const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

export interface DriverProfile {
  id: string;
  companyId: string;
  name: string;
  email: string;
  authToken: string;
  mustChangePassword: boolean;
  plate: string;
  car: string;
  rating: number;
  isAvailable: boolean;
  blockedUntil: string | null;
}

interface DriverContextValue {
  loading: boolean;
  isLoggedIn: boolean;
  isBlocked: boolean;
  blockedUntilDate: Date | null;
  driver: DriverProfile | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  setAvailable: (v: boolean) => void;
  blockDriver48h: () => Promise<void>;
  lastError: string;
}

const DriverContext = createContext<DriverContextValue>({
  loading: true,
  isLoggedIn: false,
  isBlocked: false,
  blockedUntilDate: null,
  driver: null,
  login: async () => ({ ok: false, error: "Anmeldung fehlgeschlagen." }),
  logout: async () => {},
  setAvailable: () => {},
  blockDriver48h: async () => {},
  lastError: "",
});

export function DriverProvider({ children }: { children: React.ReactNode }) {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (!raw || cancelled) return;
        try {
          const parsed: DriverProfile = JSON.parse(raw);
          if (!parsed?.authToken) {
            return;
          }
          const res = await fetch(`${API_BASE}/fleet-driver/v1/me`, {
            headers: { Authorization: `Bearer ${parsed.authToken}` },
          });
          if (!res.ok) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (!data?.ok || !data?.driver) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
          }
          if (!cancelled) {
            const d = data.driver as Record<string, unknown>;
            setDriver({
              ...parsed,
              id: String(d.id ?? parsed.id ?? ""),
              companyId: String(d.companyId ?? parsed.companyId ?? ""),
              name: `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() || parsed.name,
              email: String(d.email ?? parsed.email ?? ""),
              mustChangePassword: Boolean(d.mustChangePassword),
              blockedUntil: d.accessStatus === "active" ? null : parsed.blockedUntil,
            });
          }
        } catch {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    setLastError("");
    try {
      const res = await fetch(`${API_BASE}/fleet-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.token || !data?.driver) {
        const msg = await fetchErrorMessage(res, "Anmeldung fehlgeschlagen.");
        setLastError(msg);
        return { ok: false, error: msg };
      }
      const d = data.driver as Record<string, unknown>;
      const profile: DriverProfile = {
        id: String(d.id ?? ""),
        companyId: String(d.companyId ?? ""),
        name: `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() || "Fahrer",
        email: String(d.email ?? "").trim().toLowerCase(),
        authToken: String(data.token),
        mustChangePassword: Boolean(data.passwordChangeRequired ?? d.mustChangePassword),
        plate: "—",
        car: "—",
        rating: 5,
        isAvailable: true,
        blockedUntil: null,
      };
      setDriver(profile);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return { ok: true };
    } catch {
      const msg = "Netzwerkfehler beim Fahrer-Login.";
      setLastError(msg);
      return { ok: false, error: msg };
    }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (driver?.authToken) {
        await fetch(`${API_BASE}/fleet-auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${driver.authToken}` },
        });
      }
    } catch {
      /* ignore */
    }
    setDriver(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, [driver?.authToken]);

  const setAvailable = useCallback((v: boolean) => {
    setDriver((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, isAvailable: v };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const blockDriver48h = useCallback(async () => {
    const until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    setDriver((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, blockedUntil: until, isAvailable: false };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const blockedUntilDate = driver?.blockedUntil ? new Date(driver.blockedUntil) : null;
  const isBlocked = blockedUntilDate !== null && blockedUntilDate > new Date();

  useEffect(() => {
    if (!driver?.authToken) return;
    const t = setInterval(() => {
      fetch(`${API_BASE}/fleet-driver/v1/ping`, {
        method: "POST",
        headers: { Authorization: `Bearer ${driver.authToken}` },
      }).catch(() => {});
    }, DRIVER_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [driver?.authToken]);

  return (
    <DriverContext.Provider
      value={{
        loading,
        isLoggedIn: !!driver,
        isBlocked,
        blockedUntilDate,
        driver,
        login,
        logout,
        setAvailable,
        blockDriver48h,
        lastError,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  return useContext(DriverContext);
}
