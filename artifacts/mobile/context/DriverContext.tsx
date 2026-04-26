import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getApiBaseUrl } from "@/utils/apiBase";

const STORAGE_KEY = "@Onroda_driver_session";
const DRIVER_HEARTBEAT_MS = 45_000;
const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

/** Lesbare Meldung zu `POST /fleet-auth/login` — siehe `getFleetLoginCompanyDenyReason` / `fleetAuth.ts`. */
function fleetLoginUserMessage(errorCode: string): string {
  switch (errorCode) {
    case "invalid_credentials":
      return "E-Mail oder Passwort ist falsch.";
    case "company_not_found":
      return "Unternehmensdaten fehlen. Bitte den Betrieb oder den Support kontaktieren.";
    case "company_inactive":
      return "Ihr Unternehmenszugang ist deaktiviert. Bitte den Betrieb oder den Support.";
    case "company_blocked":
      return "Ihr Unternehmen ist gesperrt. Bitte den Support kontaktieren.";
    case "contract_not_active":
      return "Kein aktiver Vertrag für Ihr Unternehmen hinterlegt. Bitte Betrieb oder Admin: Vertragsstatus muss „active“ sein.";
    case "fleet_login_only_taxi_company":
      return "Fahrer-Login steht nur Taxi-Unternehmen zur Verfügung.";
    case "driver_suspended":
      return "Ihr Fahrer-Zugang ist pausiert. Bitte den Betrieb kontaktieren.";
    case "rate_limited":
      return "Zu viele Anmeldeversuche. Bitte einen Moment warten und erneut versuchen.";
    case "email_and_password_required":
      return "Bitte E-Mail und Passwort eingeben.";
    case "fleet_jwt_not_configured":
    case "database_not_configured":
      return "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.";
    case "company_access_blocked":
      return "Unternehmenszugang blockiert. Bitte den Betrieb oder den Support (Vertrag / Sperre / Aktivierung).";
    default:
      return errorCode || "Anmeldung fehlgeschlagen.";
  }
}

const DEFAULT_NICHT_FREI_MSG =
  "Noch nicht freigegeben — Auftragsmarkt gesperrt. Bitte Ihr Unternehmen oder Onroda kontaktieren, bis alle Voraussetzungen erfüllt sind.";

/** Antwort `GET /fleet-driver/v1/me` → Profil (Token bleibt aus `prev`). */
function mergeFleetDriverMeIntoProfile(prev: DriverProfile, me: Record<string, unknown>): DriverProfile {
  const d = (me.driver ?? {}) as Record<string, unknown>;
  const einsatzbereit = me.einsatzbereit === true;
  const notFreigegebenMessage =
    typeof me.notFreigegebenMessage === "string" && me.notFreigegebenMessage.trim()
      ? me.notFreigegebenMessage.trim()
      : einsatzbereit
        ? ""
        : DEFAULT_NICHT_FREI_MSG;
  const accessStatus = String(d.accessStatus ?? "");
  return {
    ...prev,
    id: String(d.id ?? prev.id ?? ""),
    companyId: String(d.companyId ?? prev.companyId ?? ""),
    name:
      `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() ||
      prev.name,
    email: String(d.email ?? prev.email ?? "").trim().toLowerCase(),
    mustChangePassword: Boolean(d.mustChangePassword ?? prev.mustChangePassword),
    blockedUntil: accessStatus === "active" ? null : prev.blockedUntil,
    einsatzbereit,
    isAvailable: einsatzbereit ? prev.isAvailable : false,
    notFreigegebenMessage,
  };
}

function patchStoredDriver(next: DriverProfile) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

function normalizeProfileFromStorage(parsed: unknown): DriverProfile {
  const p = parsed as Partial<DriverProfile> & Record<string, unknown>;
  return {
    id: String(p.id ?? ""),
    companyId: String(p.companyId ?? ""),
    name: String(p.name ?? "Fahrer"),
    email: String(p.email ?? "").trim().toLowerCase(),
    authToken: String(p.authToken ?? ""),
    mustChangePassword: Boolean(p.mustChangePassword),
    plate: String(p.plate ?? "—"),
    car: String(p.car ?? "—"),
    rating: typeof p.rating === "number" && Number.isFinite(p.rating) ? p.rating : 5,
    isAvailable: Boolean(p.isAvailable),
    blockedUntil: typeof p.blockedUntil === "string" || p.blockedUntil === null ? (p.blockedUntil as string | null) : null,
    einsatzbereit: p.einsatzbereit === true,
    notFreigegebenMessage: typeof p.notFreigegebenMessage === "string" ? p.notFreigegebenMessage : "",
  };
}

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
  /** Wahr, wenn alle Einsatzbereit-Bedingungen erfüllt sind (siehe API `/fleet-driver/v1/me`). */
  einsatzbereit: boolean;
  notFreigegebenMessage: string;
}

interface DriverContextValue {
  loading: boolean;
  isLoggedIn: boolean;
  isBlocked: boolean;
  blockedUntilDate: Date | null;
  driver: DriverProfile | null;
  refreshEinsatzbereit: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: true; mustChangePassword: boolean } | { ok: false; error: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  refreshEinsatzbereit: async () => {},
  login: async () => ({ ok: false, error: "Anmeldung fehlgeschlagen." }),
  changePassword: async () => ({ ok: false, error: "Passwortänderung fehlgeschlagen." }),
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
          const base = normalizeProfileFromStorage(JSON.parse(raw));
          if (!base.authToken) {
            return;
          }
          const res = await fetch(`${API_BASE}/fleet-driver/v1/me`, {
            headers: { Authorization: `Bearer ${base.authToken}` },
          });
          if (!res.ok) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
          }
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!data?.ok || !data?.driver) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
          }
          if (!cancelled) {
            const next = mergeFleetDriverMeIntoProfile(base, data);
            setDriver(next);
            patchStoredDriver(next);
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
    async (
      email: string,
      password: string,
    ): Promise<{ ok: true; mustChangePassword: boolean } | { ok: false; error: string }> => {
    setLastError("");
    try {
      const res = await fetch(`${API_BASE}/fleet-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }

      if (!res.ok || data?.ok !== true || !data?.token || !data?.driver) {
        const parsedError = typeof data.error === "string" ? data.error : "";
        const parsedHint = typeof data.hint === "string" ? data.hint : "";
        const bodySnippet = rawText.trim().slice(0, 400);
        const userFacing = parsedError
          ? [fleetLoginUserMessage(parsedError), parsedHint].filter(Boolean).join("\n\n")
          : parsedHint
            ? parsedHint
            : `HTTP ${res.status} ${res.statusText || ""}\nURL: ${API_BASE}/fleet-auth/login\n${bodySnippet || "Anmeldung fehlgeschlagen."}`.trim();
        setLastError(userFacing);
        return { ok: false, error: userFacing };
      }
      const d = data.driver as Record<string, unknown>;
      const token = String(data.token);
      const profile: DriverProfile = {
        id: String(d.id ?? ""),
        companyId: String(d.companyId ?? ""),
        name: `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() || "Fahrer",
        email: String(d.email ?? "").trim().toLowerCase(),
        authToken: token,
        mustChangePassword: Boolean(data.passwordChangeRequired ?? d.mustChangePassword),
        plate: "—",
        car: "—",
        rating: 5,
        isAvailable: false,
        blockedUntil: null,
        einsatzbereit: false,
        notFreigegebenMessage: DEFAULT_NICHT_FREI_MSG,
      };
      setDriver(profile);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      try {
        const meRes = await fetch(`${API_BASE}/fleet-driver/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meData = (await meRes.json().catch(() => ({}))) as Record<string, unknown>;
          if (meData?.ok && meData?.driver) {
            const enriched = mergeFleetDriverMeIntoProfile(profile, meData);
            setDriver(enriched);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
          }
        }
      } catch {
        /* Offline /v1/me — Profil bleibt ohne Einsatzbereit-Details */
      }
      const mustChangePassword = Boolean(data.passwordChangeRequired ?? d.mustChangePassword);
      return { ok: true, mustChangePassword };
    } catch (error) {
      const msg = `Netzwerkfehler beim Fahrer-Login: ${error instanceof Error ? error.message : String(error)}`;
      setLastError(msg);
      return { ok: false, error: msg };
    }
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!driver?.authToken) return { ok: false, error: "Nicht angemeldet." };
      if (newPassword.length < 10) {
        return { ok: false, error: "Neues Passwort muss mindestens 10 Zeichen haben." };
      }
      try {
        const res = await fetch(`${API_BASE}/fleet-driver/v1/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driver.authToken}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          data = {};
        }
        if (!res.ok || data?.ok !== true) {
          const parsedError = typeof data.error === "string" ? data.error : "";
          const parsedHint = typeof data.hint === "string" ? data.hint : "";
          const bodySnippet = rawText.trim().slice(0, 400);
          const msg =
            parsedError || parsedHint
              ? [parsedError, parsedHint].filter(Boolean).join("\n\n")
              : `HTTP ${res.status} ${res.statusText || ""}\n${bodySnippet || "Passwortänderung fehlgeschlagen."}`.trim();
          return { ok: false, error: msg };
        }
        setDriver((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, mustChangePassword: false };
          patchStoredDriver(updated);
          return updated;
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: `Netzwerkfehler bei Passwortänderung: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [driver?.authToken],
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

  const refreshEinsatzbereit = useCallback(async () => {
    const token = driver?.authToken;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/fleet-driver/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!data?.ok || !data?.driver) return;
      setDriver((prev) => {
        if (!prev) return prev;
        const next = mergeFleetDriverMeIntoProfile(prev, data);
        patchStoredDriver(next);
        return next;
      });
    } catch {
      /* ignore */
    }
  }, [driver?.authToken]);

  const setAvailable = useCallback((v: boolean) => {
    setDriver((prev) => {
      if (!prev) return prev;
      if (v && !prev.einsatzbereit) {
        return prev;
      }
      const updated = { ...prev, isAvailable: v };
      patchStoredDriver(updated);
      return updated;
    });
  }, []);

  const blockDriver48h = useCallback(async () => {
    const until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    setDriver((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, blockedUntil: until, isAvailable: false };
      patchStoredDriver(updated);
      return updated;
    });
  }, []);

  const blockedUntilDate = driver?.blockedUntil ? new Date(driver.blockedUntil) : null;
  const isBlocked = blockedUntilDate !== null && blockedUntilDate > new Date();

  useEffect(() => {
    if (!driver?.authToken) return;
    if (driver.einsatzbereit) return;
    if (!driver.isAvailable) return;
    setDriver((prev) => {
      if (!prev || prev.einsatzbereit || !prev.isAvailable) return prev;
      const updated = { ...prev, isAvailable: false };
      patchStoredDriver(updated);
      return updated;
    });
  }, [driver?.einsatzbereit, driver?.isAvailable, driver?.authToken]);

  useEffect(() => {
    if (!driver?.authToken) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void refreshEinsatzbereit();
      }
    });
    return () => sub.remove();
  }, [driver?.authToken, refreshEinsatzbereit]);

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
        refreshEinsatzbereit,
        login,
        changePassword,
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
