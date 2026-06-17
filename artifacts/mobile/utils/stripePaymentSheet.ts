import type { InitPaymentSheetResult, PresentPaymentSheetResult } from "@stripe/stripe-react-native";

import { STRIPE_RETURN_URL, STRIPE_SETUP_EXPLAINER_DE } from "@/constants/stripe";

type PaymentSheetFns = {
  initPaymentSheet: (params: {
    paymentIntentClientSecret: string;
    merchantDisplayName: string;
    returnURL?: string;
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
    returnURL?: string;
    primaryButtonLabel?: string;
    paymentMethodOrder?: string[];
    googlePay?: {
      merchantCountryCode: string;
      currencyCode: string;
      testEnv?: boolean;
      label?: string;
      amount?: string;
    };
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
    returnURL: STRIPE_RETURN_URL,
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

/**
 * Kreditkarte per SetupIntent — ohne Apple/Google Pay im Sheet (SetupIntent → sonst USD).
 * Wallet: eigene Flows über `confirmPlatformPaySetupIntent` in stripePlatformPay.ts.
 */
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
    returnURL: STRIPE_RETURN_URL,
    primaryButtonLabel: "Karte hinterlegen",
    paymentMethodOrder: ["card"],
    googlePay: {
      merchantCountryCode: "DE",
      currencyCode: "EUR",
      testEnv: __DEV__,
      label: STRIPE_SETUP_EXPLAINER_DE,
      amount: "0",
    },
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
