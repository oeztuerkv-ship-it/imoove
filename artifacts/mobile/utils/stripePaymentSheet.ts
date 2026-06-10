import type { InitPaymentSheetResult, PresentPaymentSheetResult } from "@stripe/stripe-react-native";

type PaymentSheetFns = {
  initPaymentSheet: (params: {
    paymentIntentClientSecret: string;
    merchantDisplayName: string;
    applePay?: {
      merchantCountryCode: string;
      cartItems?: Array<{
        paymentType: "Immediate";
        label: string;
        amount: string;
      }>;
    };
  }) => Promise<InitPaymentSheetResult>;
  presentPaymentSheet: () => Promise<PresentPaymentSheetResult>;
};

type SetupSheetFns = {
  initPaymentSheet: (params: {
    setupIntentClientSecret: string;
    merchantDisplayName: string;
  }) => Promise<InitPaymentSheetResult>;
  presentPaymentSheet: () => Promise<PresentPaymentSheetResult>;
};

export async function presentStripePaymentSheet(
  fns: PaymentSheetFns,
  clientSecret: string,
  merchantDisplayName = "ONRODA",
  amountEur?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const amount =
    typeof amountEur === "number" && Number.isFinite(amountEur) && amountEur > 0
      ? amountEur.toFixed(2)
      : undefined;
  const init = await fns.initPaymentSheet({
    paymentIntentClientSecret: secret,
    merchantDisplayName,
    ...(amount
      ? {
          applePay: {
            merchantCountryCode: "DE",
            cartItems: [
              {
                paymentType: "Immediate" as const,
                label: "ONRODA Fahrt",
                amount,
              },
            ],
          },
        }
      : {}),
  });
  if (init.error) {
    return { ok: false, message: init.error.message };
  }
  const presented = await fns.presentPaymentSheet();
  if (presented.error) {
    if (presented.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: presented.error.message };
  }
  return { ok: true };
}

export async function presentStripeSetupSheet(
  fns: SetupSheetFns,
  clientSecret: string,
  merchantDisplayName = "ONRODA",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const init = await fns.initPaymentSheet({
    setupIntentClientSecret: secret,
    merchantDisplayName,
  });
  if (init.error) {
    return { ok: false, message: init.error.message };
  }
  const presented = await fns.presentPaymentSheet();
  if (presented.error) {
    if (presented.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: presented.error.message };
  }
  return { ok: true };
}
