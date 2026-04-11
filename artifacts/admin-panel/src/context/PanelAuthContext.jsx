import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { API_BASE } from "../lib/apiBase.js";

const STORAGE_KEY = "onrodaPanelJwt";

const PanelAuthContext = createContext(null);

async function fetchMe(jwt) {
  const res = await fetch(`${API_BASE}/panel-auth/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return { ok: false };
  const data = await res.json().catch(() => ({}));
  if (!data?.ok || !data.user) return { ok: false };
  return { ok: true, user: data.user };
}

export function PanelAuthProvider({ children }) {
  const [token, setTokenState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      setBooting(false);
      return () => {
        cancelled = true;
      };
    }
    setBooting(true);
    void (async () => {
      const r = await fetchMe(token);
      if (cancelled) return;
      if (!r.ok) {
        clearSession();
      } else {
        setUser(r.user);
      }
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  const login = useCallback(async (username, password) => {
    setError("");
    const res = await fetch(`${API_BASE}/panel-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      if (data?.error === "invalid_credentials") {
        setError("Benutzername oder Passwort ist ungültig.");
      } else if (data?.error === "database_not_configured") {
        setError("Anmeldung nicht möglich: Datenbank ist auf dem Server nicht konfiguriert.");
      } else if (data?.error === "panel_jwt_not_configured") {
        setError(
          "Anmeldung nicht möglich: In Produktion muss PANEL_JWT_SECRET in der API gesetzt sein (siehe API-.env).",
        );
      } else {
        setError(
          typeof data?.error === "string"
            ? data.error
            : `Anmeldung fehlgeschlagen (HTTP ${res.status}).`,
        );
      }
      return false;
    }
    const jwt = typeof data?.token === "string" ? data.token : "";
    if (!jwt) {
      setError("Ungültige Antwort der API (kein Token).");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, jwt);
    } catch {
      /* ignore */
    }
    setTokenState(jwt);
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/panel-auth/logout`, { method: "POST" });
    } catch {
      /* ignore */
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      booting,
      error,
      setError,
      login,
      logout,
      token,
    }),
    [user, booting, error, login, logout, token],
  );

  return <PanelAuthContext.Provider value={value}>{children}</PanelAuthContext.Provider>;
}

export function usePanelAuth() {
  const v = useContext(PanelAuthContext);
  if (!v) {
    throw new Error("usePanelAuth must be used within PanelAuthProvider");
  }
  return v;
}
