import type { PayerKind, RideRequest } from "@/context/RideRequestContext";
import type { PaymentMethod } from "@/context/RideContext";

const PAYMENT_DISPLAY: Record<PaymentMethod, string> = {
  cash: "Bar",
  paypal: "PayPal",
  card: "Kreditkarte",
  voucher: "Transportschein (Krankenkasse)",
  app: "App-Zahlung",
  access_code: "Gutschein / Freigabe-Code",
};

/** Kurzbeschreibung der Freigabe-Art für Kund:innen (gleiche Sprache wie im Partner-/Fahrerbereich). */
export function accessCodeTypeCustomerLabel(codeType: string): string {
  const t = codeType.toLowerCase();
  if (t === "hotel") return "Hotel";
  if (t === "company") return "Firma";
  if (t === "voucher") return "Gutschein";
  if (t === "general") return "Allgemein";
  return "Freigabe";
}

export type CustomerPayerBlock = { title: string; subtitle: string };

/** Während der Buchung (noch kein Server-Request): nur Zahlungsart aus dem RideContext. */
export function customerPayerBlockFromBooking(
  paymentMethod: PaymentMethod | null,
  isExempted: boolean,
): CustomerPayerBlock {
  if (!paymentMethod) {
    return {
      title: "Wer zahlt?",
      subtitle: "Bitte wählen Sie unten eine Zahlungsart — danach können Sie die Fahrt verbindlich buchen.",
    };
  }
  if (paymentMethod === "voucher") {
    return {
      title: "Krankenkasse / Transportschein",
      subtitle: isExempted
        ? "Sie sind von der Zuzahlung befreit. Bitte halten Sie den Nachweis und den Transportschein bereit."
        : "Es fällt ein Eigenanteil an (siehe Preisbox). Der Rest wird über die Krankenkasse abgerechnet.",
    };
  }
  if (paymentMethod === "access_code") {
    return {
      title: "Gutschein / Freigabe",
      subtitle:
        "Sie haben einen digitalen Code von Hotel, Firma oder Auftraggeber? Geben Sie ihn unten ein — die Abrechnung läuft über den Kostenträger, nicht bar bei Ihnen.",
    };
  }
  const label = PAYMENT_DISPLAY[paymentMethod];
  return {
    title: "Zahlung",
    subtitle: `Sie zahlen mit: ${label}. Der Betrag richtet sich nach der gewählten Fahrt und dem angezeigten Preis.`,
  };
}

/** Nach der Buchung / in Listen: aus API-normalisiertem Auftrag. */
export function customerPayerBlockFromRideRequest(req: RideRequest): CustomerPayerBlock {
  const pm = (req.paymentMethod || "").trim() || "Bar";
  const isVoucherish =
    (req.authorizationSource === "passenger_direct" || req.authorizationSource === "partner") &&
    (req.payerKind === "voucher" ||
      req.payerKind === "insurance" ||
      pm.toLowerCase().includes("krankenkasse") ||
      pm.toLowerCase().includes("transportschein"));

  if (req.authorizationSource === "access_code") {
    const typeLb = req.accessCodeSummary?.codeType
      ? accessCodeTypeCustomerLabel(req.accessCodeSummary.codeType)
      : "";
    const nameLb = req.accessCodeSummary?.label?.trim();
    const who = [nameLb, typeLb].filter(Boolean).join(" · ");
    return {
      title: "Kostenübernahme",
      subtitle: who
        ? `Aktiv über ${who}. Die Abrechnung erfolgt über den Freigabegeber, sofern nichts anderes vereinbart ist.`
        : "Aktiv. Die Kosten werden über die digitale Freigabe abgerechnet.",
    };
  }

  if (req.payerKind === "company") {
    return {
      title: "Rechnung / Firma",
      subtitle: "Kostenübernahme durch ein Unternehmen. Details siehe Auftragsbestätigung oder Fahrer.",
    };
  }

  if (isVoucherish) {
    return {
      title: "Krankenkasse / Transportschein",
      subtitle: "Abrechnung über Transportschein. Bitte Unterlagen zur Fahrt bereithalten.",
    };
  }

  return {
    title: "Zahlung",
    subtitle: `Sie zahlen: ${pm}.`,
  };
}
