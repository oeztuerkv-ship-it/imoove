import { PlatformPay } from "@stripe/stripe-react-native";

const MERCHANT_COUNTRY_CODE = "DE";
const CURRENCY_CODE = "EUR";

export type PlatformPayConfirmFns = {
  confirmPlatformPayPayment: (
    clientSecret: string,
    params: PlatformPay.ConfirmParams,
  ) => Promise<PlatformPay.ConfirmPaymentResult>;
};

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
    return { ok: false, message: result.error.message };
  }
  return { ok: true };
}
