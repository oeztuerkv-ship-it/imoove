import { PlatformPay } from "@stripe/stripe-react-native";
import { Platform } from "react-native";

const MERCHANT_COUNTRY_CODE = "DE";
const CURRENCY_CODE = "EUR";
const MERCHANT_NAME = "ONRODA";

export type PlatformPayConfirmFns = {
  confirmPlatformPayPayment: (
    clientSecret: string,
    params: PlatformPay.ConfirmParams,
  ) => Promise<PlatformPay.ConfirmPaymentResult>;
};

export type PlatformPaySetupConfirmFns = {
  confirmPlatformPaySetupIntent: (
    clientSecret: string,
    params: PlatformPay.ConfirmParams,
  ) => Promise<PlatformPay.ConfirmSetupIntentResult>;
};

/** SetupIntent hat keine Währung — Payment Sheet zeigt sonst USD. Native Wallet mit EUR. */
export function buildSetupApplePayConfirmParams(estimatedFareEur?: number): PlatformPay.ConfirmParams {
  const cartItems: PlatformPay.CartSummaryItem[] = [
    {
      label: "Karte zur Zahlung hinterlegen",
      amount: "0.00",
      paymentType: PlatformPay.PaymentType.Immediate,
    },
    {
      label: "Abbuchung erfolgt nach Fahrtende",
      amount: "0.00",
      paymentType: PlatformPay.PaymentType.Immediate,
    },
  ];
  if (typeof estimatedFareEur === "number" && Number.isFinite(estimatedFareEur) && estimatedFareEur > 0) {
    cartItems.push({
      label: `Voraussichtlich ca. ${estimatedFareEur.toFixed(2)} € nach der Fahrt`,
      amount: "0.00",
      paymentType: PlatformPay.PaymentType.Immediate,
    });
  }
  cartItems.push({
    label: MERCHANT_NAME,
    amount: "0.00",
    paymentType: PlatformPay.PaymentType.Immediate,
  });
  return {
    applePay: {
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
      currencyCode: CURRENCY_CODE,
      cartItems,
    },
  };
}

export function buildSetupGooglePayConfirmParams(estimatedFareEur?: number): PlatformPay.ConfirmParams {
  const fareHint =
    typeof estimatedFareEur === "number" && Number.isFinite(estimatedFareEur) && estimatedFareEur > 0
      ? ` · ca. ${estimatedFareEur.toFixed(2)} € nach Fahrt`
      : "";
  return {
    googlePay: {
      testEnv: __DEV__,
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
      currencyCode: CURRENCY_CODE,
      merchantName: MERCHANT_NAME,
      label: `Karte hinterlegen — Abbuchung nach Fahrtende${fareHint}`,
      amount: 0,
    },
  };
}

export function buildRideApplePayConfirmParams(amountEur: number): PlatformPay.ConfirmParams {
  return {
    applePay: {
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
      currencyCode: CURRENCY_CODE,
      cartItems: [
        {
          label: "ONRODA Fahrt",
          amount: amountEur.toFixed(2),
          paymentType: PlatformPay.PaymentType.Immediate,
        },
      ],
    },
  };
}

export function buildRideGooglePayConfirmParams(amountEur: number): PlatformPay.ConfirmParams {
  return {
    googlePay: {
      testEnv: __DEV__,
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
      currencyCode: CURRENCY_CODE,
      merchantName: MERCHANT_NAME,
      label: "ONRODA Fahrt",
      amount: Math.round(amountEur * 100),
    },
  };
}

export function platformPaySupportParams(): { googlePay?: { testEnv: boolean } } | undefined {
  return Platform.OS === "android" ? { googlePay: { testEnv: __DEV__ } } : undefined;
}

export function stripePlatformPayErrorMessage(message: string): string {
  const m = message.trim();
  if (!m) return "Zahlung konnte nicht abgeschlossen werden.";
  if (/not available in/i.test(m) || /Apple Pay is not available/i.test(m)) {
    return "Apple Pay ist auf diesem Gerät nicht verfügbar oder für ONRODA noch nicht freigeschaltet. Bitte Kreditkarte oder Bar wählen.";
  }
  return m;
}

/** Apple Pay (iOS): SetupIntent — Karte hinterlegen, EUR + erklärender Text. */
export async function presentStripeApplePaySetup(
  fns: PlatformPaySetupConfirmFns,
  clientSecret: string,
  estimatedFareEur?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const result = await fns.confirmPlatformPaySetupIntent(
    secret,
    buildSetupApplePayConfirmParams(estimatedFareEur),
  );
  if (result.error) {
    if (result.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: stripePlatformPayErrorMessage(result.error.message) };
  }
  return { ok: true };
}

/** Google Pay (Android): SetupIntent — Karte hinterlegen, EUR. */
export async function presentStripeGooglePaySetup(
  fns: PlatformPaySetupConfirmFns,
  clientSecret: string,
  estimatedFareEur?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const result = await fns.confirmPlatformPaySetupIntent(
    secret,
    buildSetupGooglePayConfirmParams(estimatedFareEur),
  );
  if (result.error) {
    if (result.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: stripePlatformPayErrorMessage(result.error.message) };
  }
  return { ok: true };
}

/** Apple Pay (iOS): PaymentIntent über natives Wallet bestätigen. */
export async function presentStripeApplePayPayment(
  fns: PlatformPayConfirmFns,
  clientSecret: string,
  amountEur: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const result = await fns.confirmPlatformPayPayment(secret, buildRideApplePayConfirmParams(amountEur));
  if (result.error) {
    if (result.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: stripePlatformPayErrorMessage(result.error.message) };
  }
  return { ok: true };
}

/** Google Pay (Android): PaymentIntent über natives Wallet bestätigen. */
export async function presentStripeGooglePayPayment(
  fns: PlatformPayConfirmFns,
  clientSecret: string,
  amountEur: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = clientSecret.trim();
  if (!secret) {
    return { ok: false, message: "Zahlungsdaten fehlen." };
  }
  const result = await fns.confirmPlatformPayPayment(secret, buildRideGooglePayConfirmParams(amountEur));
  if (result.error) {
    if (result.error.code === "Canceled") {
      return { ok: false, message: "Zahlung abgebrochen." };
    }
    return { ok: false, message: result.error.message };
  }
  return { ok: true };
}
