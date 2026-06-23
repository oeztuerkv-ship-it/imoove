import { getApiBaseUrl } from "@/utils/apiBase";
import { readFleetJwtForWsJoin } from "@/utils/wsJoinAuth";

import { Alert } from "react-native";

export async function postDriverCashConfirmed(rideId: string): Promise<
  | { ok: true; cashConfirmedAt: string }
  | { ok: false; error: string }
> {
  const apiBase = getApiBaseUrl();
  const token = await readFleetJwtForWsJoin();
  const id = rideId.trim();
  if (!apiBase || !token || !id) return { ok: false, error: "unauthorized" };
  const res = await fetch(`${apiBase}/rides/${encodeURIComponent(id)}/cash-confirmed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    cashConfirmedAt?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
  }
  return {
    ok: true,
    cashConfirmedAt: typeof body.cashConfirmedAt === "string" ? body.cashConfirmedAt : new Date().toISOString(),
  };
}

export function driverRidePaymentLooksLikeCash(paymentMethod: string | null | undefined): boolean {
  const pm = String(paymentMethod ?? "").trim().toLowerCase();
  if (!pm) return true;
  if (pm.includes("karte") || pm.includes("card") || pm.includes("paypal") || pm.includes("apple") || pm.includes("google")) {
    return false;
  }
  if (pm.includes("krankenkasse") || pm.includes("voucher") || pm.includes("kv")) return false;
  return pm.includes("bar") || pm === "cash";
}

/** Vor „Fahrt beenden“: Hinweis Barzahlung am Ziel — OK öffnet den nächsten Schritt. */
export function confirmCashPaymentBeforeRideEnd(onConfirm: () => void): void {
  Alert.alert(
    "Achtung Barzahlung!",
    "Bitte Barzahlung am Ziel vom Kunden annehmen — nicht vergessen.",
    [
      { text: "Abbrechen", style: "cancel" },
      { text: "OK", onPress: onConfirm },
    ],
  );
}

export function warnCashPaymentIfNeeded(
  paymentMethod: string | null | undefined,
  onConfirm: () => void,
): void {
  if (driverRidePaymentLooksLikeCash(paymentMethod)) {
    confirmCashPaymentBeforeRideEnd(onConfirm);
    return;
  }
  onConfirm();
}
