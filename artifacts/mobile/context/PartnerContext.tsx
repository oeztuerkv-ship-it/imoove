import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { partnerFetchMe, partnerPanelLogin } from "@/utils/partnerApi";
import {
  isPartnerMobileAllowed,
  partnerMobileAccessDeniedReason,
  type PartnerMeUser,
} from "@/utils/partnerMobileAccess";
import { clearPartnerJwt, getPartnerJwt, setPartnerJwt } from "@/utils/partnerSessionStorage";

type PartnerContextValue = {
  token: string | null;
  user: PartnerMeUser | null;
  booting: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
  /** Bei 401/403 von Panel-API: Session leeren (Aufrufer navigiert zum Login). */
  handleUnauthorized: () => Promise<void>;
};

const PartnerContext = createContext<PartnerContextValue | null>(null);

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PartnerMeUser | null>(null);
  const [booting, setBooting] = useState(true);

  const loadSession = useCallback(async (jwt: string) => {
    const me = await partnerFetchMe(jwt);
    if (!me) {
      await clearPartnerJwt();
      setToken(null);
      setUser(null);
      return false;
    }
    if (!isPartnerMobileAllowed(me)) {
      await clearPartnerJwt();
      setToken(null);
      setUser(null);
      return false;
    }
    setToken(jwt);
    setUser(me);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getPartnerJwt();
      if (!stored) {
        if (!cancelled) {
          setBooting(false);
        }
        return;
      }
      await loadSession(stored);
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await partnerPanelLogin(username, password);
      if (!result.ok) return { ok: false, message: result.message };
      if (result.passwordChangeRequired) {
        return {
          ok: false,
          message: "Bitte zuerst im Partner-Portal (panel.onroda.de) Ihr Passwort ändern.",
        };
      }
      await setPartnerJwt(result.token);
      const me = await partnerFetchMe(result.token);
      const denied = partnerMobileAccessDeniedReason(me);
      if (denied) {
        await clearPartnerJwt();
        setToken(null);
        setUser(null);
        return { ok: false, message: denied };
      }
      setToken(result.token);
      setUser(me);
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearPartnerJwt();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return false;
    return loadSession(token);
  }, [loadSession, token]);

  const handleUnauthorized = useCallback(async () => {
    await clearPartnerJwt();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, booting, login, logout, refreshUser, handleUnauthorized }),
    [token, user, booting, login, logout, refreshUser, handleUnauthorized],
  );

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error("usePartner must be used within PartnerProvider");
  return ctx;
}
