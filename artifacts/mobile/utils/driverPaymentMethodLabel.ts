/** Deutsche Anzeige der Kunden-Zahlungsart in der Fahrer-App (API liefert oft englische Keys). */

function isKrankenkassePayment(paymentMethod: string): boolean {
  return paymentMethod.trim().toLowerCase().includes("krankenkasse");
}

/** Label für Sofortfahrt-Angebot / aktive Fahrt — nie rohe API-Keys wie „cash“. */
export function driverPaymentMethodLabelDe(paymentMethod: string): string {
  const raw = (paymentMethod || "").trim();
  if (!raw) return "Barzahlung";
  if (isKrankenkassePayment(raw)) return "Krankenkasse";

  const pm = raw.toLowerCase().replace(/_/g, " ");

  if (pm === "cash" || pm === "bar" || pm.includes("barzahl")) return "Barzahlung";
  if (pm === "card" || pm.includes("kredit") || pm.includes("credit")) return "Kreditkarte";
  if (pm === "paypal") return "PayPal";
  if (pm === "voucher" || pm.includes("transportschein")) return "Transportschein";
  if (pm === "app" || pm.includes("app zahl") || pm.includes("app-zahl")) return "App-Zahlung";
  if (pm === "access code" || pm === "access_code" || pm.includes("freigabe") || pm.includes("gutschein")) {
    return "Gutschein / Freigabe";
  }
  if (pm === "invoice" || pm.includes("rechnung")) return "Rechnung";
  if (pm.includes("befreit")) return "Befreit von Zuzahlung";
  if (pm.includes("eigenanteil")) return "Eigenanteil";
  if (pm.includes("codefahrt")) return "Codefahrt";

  if (/[äöüßÄÖÜ]/.test(raw)) return raw;

  return "Zahlungsart offen";
}

/** Kompakt für Badge auf dem Annahme-Popup (wie Mockup: „Bar“, „Karte“). */
export function driverPaymentMethodBadgeDe(paymentMethod: string): string {
  const full = driverPaymentMethodLabelDe(paymentMethod);
  switch (full) {
    case "Barzahlung":
      return "Bar";
    case "Kreditkarte":
      return "Karte";
    case "App-Zahlung":
      return "App";
    case "Gutschein / Freigabe":
      return "Gutschein";
    case "Transportschein":
      return "Transportschein";
    default:
      return full;
  }
}

export function driverPaymentMethodIconName(
  paymentMethod: string,
): "cash" | "credit-card-outline" | "paypal" | "hospital-box-outline" | "ticket-percent-outline" {
  if (isKrankenkassePayment(paymentMethod)) return "hospital-box-outline";
  const pm = paymentMethod.toLowerCase();
  if (pm === "card" || pm.includes("kredit") || pm.includes("credit")) return "credit-card-outline";
  if (pm === "paypal") return "paypal";
  if (pm === "voucher" || pm.includes("transportschein") || pm.includes("gutschein") || pm.includes("freigabe")) {
    return "ticket-percent-outline";
  }
  return "cash";
}
