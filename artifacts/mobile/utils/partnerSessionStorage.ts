import AsyncStorage from "@react-native-async-storage/async-storage";

import { PARTNER_JWT_STORAGE_KEY } from "@/constants/partnerSessionStorage";

export async function getPartnerJwt(): Promise<string> {
  try {
    const t = await AsyncStorage.getItem(PARTNER_JWT_STORAGE_KEY);
    return t?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function setPartnerJwt(jwt: string): Promise<void> {
  try {
    if (jwt.trim()) {
      await AsyncStorage.setItem(PARTNER_JWT_STORAGE_KEY, jwt.trim());
    } else {
      await AsyncStorage.removeItem(PARTNER_JWT_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export async function clearPartnerJwt(): Promise<void> {
  await setPartnerJwt("");
}
