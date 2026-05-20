import { t } from "@/src/i18n";

function isKrankenkassePayment(paymentMethod: string): boolean {
  return paymentMethod.trim().toLowerCase().includes("krankenkasse");
}

type PaymentLabelKey =
  | "cashFull"
  | "cardFull"
  | "paypal"
  | "voucherFull"
  | "app"
  | "invoice"
  | "exempt"
  | "copay"
  | "codeRide"
  | "insurance"
  | "unknown";

function resolvePaymentLabelKey(paymentMethod: string): PaymentLabelKey {
  const raw = (paymentMethod || "").trim();
  if (!raw) return "cashFull";
  if (isKrankenkassePayment(raw)) return "insurance";

  const pm = raw.toLowerCase().replace(/_/g, " ");

  if (pm === "cash" || pm === "bar" || pm.includes("barzahl")) return "cashFull";
  if (pm === "card" || pm.includes("kredit") || pm.includes("credit")) return "cardFull";
  if (pm === "paypal") return "paypal";
  if (pm === "voucher" || pm.includes("transportschein")) return "voucherFull";
  if (pm === "app" || pm.includes("app zahl") || pm.includes("app-zahl")) return "app";
  if (pm === "access code" || pm === "access_code" || pm.includes("freigabe") || pm.includes("gutschein")) {
    return "voucherFull";
  }
  if (pm === "invoice" || pm.includes("rechnung")) return "invoice";
  if (pm.includes("befreit")) return "exempt";
  if (pm.includes("eigenanteil")) return "copay";
  if (pm.includes("codefahrt")) return "codeRide";

  if (/[äöüßÄÖÜ]/.test(raw)) return "unknown";

  return "unknown";
}

/** Vollständiges Label für aktive Fahrt / Details. */
export function driverPaymentMethodLabelDe(paymentMethod: string): string {
  const key = resolvePaymentLabelKey(paymentMethod);
  if (key === "unknown") {
    const raw = (paymentMethod || "").trim();
    return raw || t("driver.payment.unknown");
  }
  return t(`driver.payment.${key}`);
}

/** Kompakt für Badge auf dem Annahme-Popup. */
export function driverPaymentMethodBadgeDe(paymentMethod: string): string {
  const key = resolvePaymentLabelKey(paymentMethod);
  switch (key) {
    case "cashFull":
      return t("driver.payment.cash");
    case "cardFull":
      return t("driver.payment.card");
    case "app":
      return t("driver.payment.app");
    case "voucherFull":
      return t("driver.payment.voucher");
    default:
      return driverPaymentMethodLabelDe(paymentMethod);
  }
}

export function driverPaymentMethodIconName(
  paymentMethod: string,
): "cash" | "credit-card-outline" | "wallet-outline" | "hospital-box-outline" | "ticket-percent-outline" {
  if (isKrankenkassePayment(paymentMethod)) return "hospital-box-outline";
  const pm = paymentMethod.toLowerCase();
  if (pm === "card" || pm.includes("kredit") || pm.includes("credit")) return "credit-card-outline";
  if (pm === "paypal") return "wallet-outline";
  if (pm === "voucher" || pm.includes("transportschein") || pm.includes("gutschein") || pm.includes("freigabe")) {
    return "ticket-percent-outline";
  }
  return "cash";
}
