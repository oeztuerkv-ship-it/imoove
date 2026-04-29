import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface UserProfile {
  isLoggedIn: boolean;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  photoUri: string | null;
  googleId?: string;
  /** OpenID JWT von Google (einmal nach Login von `/auth/google/profile`). */
  googleIdToken?: string;
  /** OAuth2 Access Token; kurzlebig, für direkte Google-API-Aufrufe von der App. */
  googleAccessToken?: string;
  googleAccessTokenExpiresAt?: number;
  /** Session-JWT von der API nach Google-OAuth (`?token=`). */
  sessionToken?: string;
  /** Nach E-Mail-Otp (`/auth/email/verify`); optional für spätere API-Nutzung. */
  emailVerificationProofToken?: string | null;
  /* Patienten-Profil */
  krankenkasse: string;
  versichertennummer: string;
  rollstuhl: boolean;
  rollator: boolean;
  blindenhund: boolean;
  sauerstoff: boolean;
  begleitperson: boolean;
  abholungTuer: boolean;
  abholungStockwerk: string;
  begleitungAnmeldung: boolean;
  tragehilfe: boolean;
  dialyse: boolean;
  notfallName: string;
  notfallTelefon: string;
  patientNotiz: string;
  /** Fahrtrelevante Rollstuhl-Standardwerte (keine Diagnose- oder Behandlungsdaten). */
  wheelchairDefaults?: {
    wheelchairType: "foldable" | "electric";
    assistanceLevel: "boarding" | "to_door" | "to_apartment" | "none";
    canTransfer: boolean;
    companionCount: 0 | 1 | 2;
    rampRequired: boolean;
    carryChairRequired: boolean;
    elevatorAvailable: boolean;
    stairsPresent: boolean;
    driverNote?: string | null;
  } | null;
}

const DEFAULT_PROFILE: UserProfile = {
  isLoggedIn: false,
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  photoUri: null,
  krankenkasse: "",
  versichertennummer: "",
  rollstuhl: false,
  rollator: false,
  blindenhund: false,
  sauerstoff: false,
  begleitperson: false,
  abholungTuer: false,
  abholungStockwerk: "",
  begleitungAnmeldung: false,
  tragehilfe: false,
  dialyse: false,
  notfallName: "",
  notfallTelefon: "",
  patientNotiz: "",
  wheelchairDefaults: null,
};

interface UserContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  logout: () => void;
  loginWithGoogle: (data: Partial<UserProfile> | Record<string, unknown>) => void;
  /** Registrierung ohne Google (lokal); E-Mail-Verifizierung vorher über `/api/auth/email/*`. */
  registerLocalCustomer: (
    data: { name: string; email: string; phone: string },
    options?: { emailVerificationProofToken?: string },
  ) => void;
  /** Telefonnummer-Flow: Profil anlegen/aktualisieren, angemeldet. */
  loginWithPhone: (data: {
    phone: string;
    firstName: string;
    lastName: string;
    email?: string;
  }) => void;
}

const UserContext = createContext<UserContextValue | null>(null);
const PROFILE_KEY = "@taxi24_user_profile";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => {
        if (!raw?.trim()) return;
        try {
          setProfile(JSON.parse(raw) as UserProfile);
        } catch {
          void AsyncStorage.removeItem(PROFILE_KEY);
        }
      })
      .catch(() => {});
  }, []);

  const save = useCallback((updated: UserProfile) => {
    setProfile(updated);
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const loginWithGoogle = useCallback((data: Partial<UserProfile> | Record<string, unknown>) => {
    const merged: UserProfile = {
      ...DEFAULT_PROFILE,
      isLoggedIn: true,
      ...(data as Partial<UserProfile>),
    };
    save(merged);
  }, [save]);

  const registerLocalCustomer = useCallback(
    (data: { name: string; email: string; phone: string }, options?: { emailVerificationProofToken?: string }) => {
      const pt = typeof options?.emailVerificationProofToken === "string"
        ? options.emailVerificationProofToken.trim() || undefined
        : undefined;
      const updated: UserProfile = {
        ...DEFAULT_PROFILE,
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        isLoggedIn: true,
        photoUri: null,
        ...(pt ? { emailVerificationProofToken: pt } : {}),
      };
      save(updated);
    },
    [save],
  );

  const loginWithPhone = useCallback(
    (data: { phone: string; firstName: string; lastName: string; email?: string }) => {
      const name = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();
      setProfile((prev) => {
        const {
          googleId: _rmGid,
          googleIdToken: _rmGi,
          googleAccessToken: _rmGa,
          googleAccessTokenExpiresAt: _rmGe,
          ...rest
        } = prev;
        const updated: UserProfile = {
          ...rest,
          name,
          email: (data.email ?? "").trim(),
          phone: data.phone.trim(),
          isLoggedIn: true,
        };
        AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    },
    [],
  );

  const logout = useCallback(() => {
    save(DEFAULT_PROFILE);
  }, [save]);

  return (
    <UserContext.Provider
      value={{ profile, updateProfile, logout, loginWithGoogle, registerLocalCustomer, loginWithPhone }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
