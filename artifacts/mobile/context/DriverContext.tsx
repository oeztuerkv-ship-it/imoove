import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "@imoove_driver_session";

export interface DriverProfile {
  name: string;
  email: string;
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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setAvailable: (v: boolean) => void;
  blockDriver48h: () => Promise<void>;
}

const DRIVER_ACCOUNTS: Array<{ email: string; password: string; profile: DriverProfile }> = [
  {
    email: "oeztuerkv@mail.de",
    password: "Zidane87",
    profile: {
      name: "Vedat Öztürk",
      email: "oeztuerkv@mail.de",
      plate: "ES-GS 9087",
      car: "VW Passat",
      rating: 4.9,
      isAvailable: true,
      blockedUntil: null,
    },
  },
];

const DriverContext = createContext<DriverContextValue>({
  loading: true,
  isLoggedIn: false,
  isBlocked: false,
  blockedUntilDate: null,
  driver: null,
  login: async () => false,
  logout: async () => {},
  setAvailable: () => {},
  blockDriver48h: async () => {},
});

export function DriverProvider({ children }: { children: React.ReactNode }) {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed: DriverProfile = JSON.parse(raw);
            setDriver(parsed);
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const account = DRIVER_ACCOUNTS.find(
      (a) =>
        a.email.toLowerCase() === email.toLowerCase().trim() &&
        a.password === password
    );
    if (account) {
      const profile = { ...account.profile, blockedUntil: null };
      setDriver(profile);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    setDriver(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

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

  return (
    <DriverContext.Provider
      value={{ loading, isLoggedIn: !!driver, isBlocked, blockedUntilDate, driver, login, logout, setAvailable, blockDriver48h }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  return useContext(DriverContext);
}
