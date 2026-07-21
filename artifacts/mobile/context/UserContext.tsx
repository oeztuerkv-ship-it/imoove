import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { USER_PROFILE_STORAGE_KEY } from "@/constants/customerSessionStorage";
import {
  loginCustomerWithPassword,
  mapCustomerAuthApiError,
  registerCustomerWithPassword,
  type CustomerAuthDto,
} from "@/utils/customerAuthApi";
import { performCustomerLogout } from "@/utils/performCustomerLogout";
import { clearPendingOAuthSession } from "@/utils/pendingOAuthSessionStorage";
import { syncCustomerExpoPushToken } from "@/utils/syncCustomerExpoPushToken";

export interface UserProfile {
  isLoggedIn: boolean;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  photoUri: string | null;
  googleId?: string;
  /** Login-Kanal (Apple nutzt intern ebenfalls googleId/passenger_id). */
  authProvider?: "google" | "apple" | "email";
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
  billingType: "private" | "company" | "insurance";
  companyName: string;
  companyAddress: string;
  companyCity: string;
  vatNumber: string;
  costCenter: string;
  billingEmail: string;
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
  billingType: "private",
  companyName: "",
  companyAddress: "",
  companyCity: "",
  vatNumber: "",
  costCenter: "",
  billingEmail: "",
  wheelchairDefaults: null,
};

interface UserContextValue {
  profile: UserProfile;
  /** true nach erstem AsyncStorage-Lesen — vor dem nicht als „ausgeloggt“ behandeln. */
  profileHydrated: boolean;
  updateProfile: (updates: Partial<UserProfile>) => void;
  logout: () => Promise<void>;
  loginWithGoogle: (data: Partial<UserProfile> | Record<string, unknown>) => Promise<void>;
  /** @deprecated Nur Legacy — nutze `registerCustomerAccount`. */
  registerLocalCustomer: (
    data: { name: string; email: string; phone: string },
    options?: { emailVerificationProofToken?: string },
  ) => void;
  /** E-Mail-Registrierung mit Passwort (Server-Konto + Session-JWT). */
  registerCustomerAccount: (data: {
    name: string;
    email: string;
    password: string;
    passwordConfirm: string;
    emailVerificationProofToken: string;
    acceptLegal: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** E-Mail + Passwort Login (customer_accounts). */
  loginWithEmailAccount: (data: {
    email: string;
    password: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Telefonnummer-Flow: Profil anlegen/aktualisieren, angemeldet. */
  loginWithPhone: (data: {
    phone: string;
    firstName: string;
    lastName: string;
    email?: string;
  }) => void;
}

const UserContext = createContext<UserContextValue | null>(null);
const PROFILE_KEY = USER_PROFILE_STORAGE_KEY;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSameCustomerAccount(
  existing: UserProfile,
  incoming: { googleId?: string; email?: string },
): boolean {
  const existingId = existing.googleId?.trim();
  const incomingId = incoming.googleId?.trim();
  if (existingId && incomingId && existingId === incomingId) return true;
  const existingEmail = normalizeEmail(existing.email);
  const incomingEmail = normalizeEmail(incoming.email ?? "");
  return Boolean(existingEmail && incomingEmail && existingEmail === incomingEmail);
}

/** Google/Apple-OAuth: Session-Felder setzen; bei Konto-Wechsel Profil zurücksetzen. */
function mergeOAuthSessionIntoProfile(
  existing: UserProfile,
  incoming: Partial<UserProfile>,
): UserProfile {
  const sameAccount = isSameCustomerAccount(existing, incoming);
  const base = sameAccount ? existing : { ...DEFAULT_PROFILE };
  return {
    ...base,
    isLoggedIn: true,
    name: (incoming.name ?? "").trim() || base.name,
    email: (incoming.email ?? "").trim() || base.email,
    phone: sameAccount ? base.phone : "",
    photoUri: incoming.photoUri !== undefined ? incoming.photoUri : base.photoUri,
    googleId: incoming.googleId ?? base.googleId,
    authProvider: incoming.authProvider ?? base.authProvider ?? "google",
    sessionToken: incoming.sessionToken ?? base.sessionToken,
    googleIdToken: sameAccount ? (incoming.googleIdToken ?? base.googleIdToken) : undefined,
    googleAccessToken: sameAccount ? (incoming.googleAccessToken ?? base.googleAccessToken) : undefined,
    googleAccessTokenExpiresAt: sameAccount
      ? (incoming.googleAccessTokenExpiresAt ?? base.googleAccessTokenExpiresAt)
      : undefined,
    emailVerificationProofToken: sameAccount
      ? incoming.emailVerificationProofToken !== undefined
        ? incoming.emailVerificationProofToken
        : base.emailVerificationProofToken
      : null,
  };
}

function mergeCustomerAuthSession(
  existing: UserProfile,
  customer: CustomerAuthDto,
  sessionToken: string,
): UserProfile {
  const sameAccount = isSameCustomerAccount(existing, { googleId: customer.id, email: customer.email });
  const base = sameAccount ? existing : { ...DEFAULT_PROFILE };
  return {
    ...base,
    isLoggedIn: true,
    name: customer.name.trim() || base.name,
    email: customer.email.trim() || base.email,
    phone: (customer.phone ?? "").trim() || base.phone,
    photoUri: sameAccount ? base.photoUri : null,
    googleId: customer.id,
    authProvider: "email",
    sessionToken,
    emailVerificationProofToken: null,
    googleIdToken: undefined,
    googleAccessToken: undefined,
    googleAccessTokenExpiresAt: undefined,
  };
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const profileRef = React.useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => {
        if (cancelled || !raw?.trim()) return;
        try {
          const parsed = JSON.parse(raw) as UserProfile;
          setProfile((current) => {
            // Späte Hydration darf eine frische In-Memory-Session nicht überschreiben
            // (Race: Apple/Google-Login vor Abschluss von getItem nach Mount).
            if (
              current.isLoggedIn &&
              typeof current.sessionToken === "string" &&
              current.sessionToken.trim().length > 0
            ) {
              return current;
            }
            return parsed;
          });
        } catch {
          void AsyncStorage.removeItem(PROFILE_KEY);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProfileHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const passengerId = profile.googleId?.trim();
    if (!profile.isLoggedIn || !profile.sessionToken?.trim() || !passengerId) return;
    void syncCustomerExpoPushToken({
      sessionToken: profile.sessionToken.trim(),
      googleId: passengerId,
    });
  }, [profile.isLoggedIn, profile.sessionToken, profile.googleId]);

  const persistProfile = useCallback(async (updated: UserProfile): Promise<void> => {
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
    } catch {
      /* Storage voll / transient — In-Memory-State bleibt Quelle bis zum nächsten Write */
    }
  }, []);

  const save = useCallback(
    (updated: UserProfile) => {
      setProfile(updated);
      void persistProfile(updated);
    },
    [persistProfile],
  );

  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setProfile((prev) => {
        const updated = { ...prev, ...updates };
        void persistProfile(updated);
        return updated;
      });
    },
    [persistProfile],
  );

  const loginWithGoogle = useCallback(
    async (data: Partial<UserProfile> | Record<string, unknown>): Promise<void> => {
      const incoming = data as Partial<UserProfile>;
      const merged = mergeOAuthSessionIntoProfile(profileRef.current, incoming);
      profileRef.current = merged;
      setProfile(merged);
      await persistProfile(merged);
    },
    [persistProfile],
  );

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

  const applyCustomerSession = useCallback(
    async (customer: CustomerAuthDto, sessionToken: string): Promise<void> => {
      const merged = mergeCustomerAuthSession(profileRef.current, customer, sessionToken);
      profileRef.current = merged;
      setProfile(merged);
      await persistProfile(merged);
    },
    [persistProfile],
  );

  const loginWithEmailAccount = useCallback(
    async (data: {
      email: string;
      password: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      const outcome = await loginCustomerWithPassword({
        email: data.email,
        password: data.password,
      });
      if (!outcome.ok) {
        return { ok: false, error: mapCustomerAuthApiError(outcome.error) };
      }
      await clearPendingOAuthSession();
      await applyCustomerSession(outcome.customer, outcome.sessionToken);
      return { ok: true };
    },
    [applyCustomerSession],
  );

  const registerCustomerAccount = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      passwordConfirm: string;
      emailVerificationProofToken: string;
      acceptLegal: boolean;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      const outcome = await registerCustomerWithPassword({
        email: data.email,
        proofToken: data.emailVerificationProofToken,
        name: data.name,
        password: data.password,
        passwordConfirm: data.passwordConfirm,
        acceptLegal: data.acceptLegal,
      });
      if (!outcome.ok) {
        return { ok: false, error: mapCustomerAuthApiError(outcome.error) };
      }
      await clearPendingOAuthSession();
      await applyCustomerSession(outcome.customer, outcome.sessionToken);
      if (!outcome.customer.name.trim() && data.name.trim()) {
        updateProfile({ name: data.name.trim() });
      }
      return { ok: true };
    },
    [applyCustomerSession, updateProfile],
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
        profileRef.current = updated;
        void persistProfile(updated);
        return updated;
      });
    },
    [persistProfile],
  );

  const logout = useCallback(async () => {
    await performCustomerLogout();
    profileRef.current = DEFAULT_PROFILE;
    setProfile(DEFAULT_PROFILE);
  }, []);

  return (
    <UserContext.Provider
      value={{
        profile,
        profileHydrated,
        updateProfile,
        logout,
        loginWithGoogle,
        registerLocalCustomer,
        registerCustomerAccount,
        loginWithEmailAccount,
        loginWithPhone,
      }}
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
