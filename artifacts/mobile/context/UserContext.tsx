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
};

interface UserContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  logout: () => void;
  loginWithGoogle: (data: Partial<UserProfile>) => void;
  /** Registrierung ohne Google (lokal); echte SMS-Verifizierung folgt über Backend/Firebase. */
  registerLocalCustomer: (data: { name: string; email: string; phone: string }) => void;
}

const UserContext = createContext<UserContextValue | null>(null);
const PROFILE_KEY = "@taxi24_user_profile";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => { if (raw) setProfile(JSON.parse(raw)); })
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

  const loginWithGoogle = useCallback((data: Partial<UserProfile>) => {
    const merged: UserProfile = {
      ...DEFAULT_PROFILE,
      isLoggedIn: true,
      ...data,
    };
    save(merged);
  }, [save]);

  const registerLocalCustomer = useCallback((data: { name: string; email: string; phone: string }) => {
    const updated: UserProfile = {
      ...DEFAULT_PROFILE,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      isLoggedIn: true,
      photoUri: null,
    };
    save(updated);
  }, [save]);

  const logout = useCallback(() => {
    save(DEFAULT_PROFILE);
  }, [save]);

  return (
    <UserContext.Provider value={{ profile, updateProfile, logout, loginWithGoogle, registerLocalCustomer }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
