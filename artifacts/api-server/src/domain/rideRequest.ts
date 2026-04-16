import type { PayerKind, RideKind } from "./rideBillingProfile";
import type { AccessCodeType, AuthorizationSource } from "./rideAuthorization";
import type { AccessCodeDefinitionState, AccessCodeTripOutcome } from "./accessCodeTrace";
import type { PartnerBookingMeta } from "./partnerBookingMeta";

export type { AccessCodeType, AuthorizationSource, PayerKind, RideKind };
export type { AccessCodeDefinitionState, AccessCodeTripOutcome };
export type { PartnerBookingMeta };

export interface RideRequest {
  id: string;
  /**
   * Mandant / Kostenträger für Abrechnung.
   * Bei Code-Freigabe (`authorizationSource === 'access_code'`) i. d. R. aus dem Zugangscode oder Panel-Kontext;
   * zusammen mit `finalFare` nach Abschluss Grundlage für die digitale Kostenübernahme.
   */
  companyId?: string | null;
  /** Gesetzt, wenn die Fahrt über das Partner-Panel angelegt wurde. */
  createdByPanelUserId?: string | null;
  /**
   * Produktlinie: normal, Krankenfahrt, Gutschein, Firmenfahrt.
   * @default standard
   */
  rideKind: RideKind;
  /**
   * Abrechnungsgegenpart (wer zahlt / wer wird belastet).
   * @default passenger
   */
  payerKind: PayerKind;
  /** Bei rideKind voucher typischerweise gesetzt. */
  voucherCode?: string | null;
  /** Freitext: Aktenzeichen, Kostenstelle, Leistungsreferenz (KV, Firma, …). */
  billingReference?: string | null;
  /**
   * Freigabe: Fahrgast direkt (App-Zahlung o. ä.), **digitale Kostenübernahme** per Zugangscode,
   * oder Mandanten-/B2B-Kontext (`partner`), sofern ohne Code gebucht.
   * @default passenger_direct
   */
  authorizationSource: AuthorizationSource;
  /** Verknüpfung zum Code-Datensatz — Audit- und Abrechnungspfad (welcher Auftraggeber hat freigegeben). */
  accessCodeId?: string | null;
  /**
   * Normalisierter Code zum Buchungszeitpunkt (Kopie) — Verlauf/Abrechnung auch bei späterer Code-Änderung.
   * Nicht in `GET /rides` (öffentlicher Pool) ausliefern.
   */
  accessCodeNormalizedSnapshot?: string | null;
  /** Hotel / Medizin / Serien — nur Panel-Mandantensicht; nicht öffentlich. */
  partnerBookingMeta?: PartnerBookingMeta | null;
  /**
   * Nur API-Antworten (Fahrer/Kunde): Typ + Anzeigename — **ohne** Klartext-Code.
   * Nicht in der DB speichern.
   */
  accessCodeSummary?: {
    codeType: AccessCodeType | string;
    label: string;
  } | null;
  createdAt: string;
  scheduledAt?: string | null;
  from: string;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  to: string;
  toFull: string;
  toLat?: number;
  toLon?: number;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  /** Tatsächlicher Preis nach Fahrtende — Abrechnungsbetrag gegen Kostenträger bei Code-/Firmenlogik. */
  finalFare?: number | null;
  paymentMethod: string;
  vehicle: string;
  pricingMode?: "taxi_tariff" | "fixed_price" | null;
  customerName: string;
  passengerId?: string;
  driverId?: string | null;
  rejectedBy: string[];
  status:
    | "draft"
    | "requested"
    | "searching_driver"
    | "offered"
    | "pending"
    | "accepted"
    | "driver_arriving"
    | "driver_waiting"
    | "passenger_onboard"
    | "arrived"
    | "in_progress"
    | "cancelled_by_customer"
    | "cancelled_by_driver"
    | "cancelled_by_system"
    | "expired"
    | "rejected"
    | "cancelled"
    | "completed";

  /** Optional: angereichert in `GET /panel/v1/rides` (nicht persistiert). */
  accessCodeTripOutcome?: AccessCodeTripOutcome;
  /** Optional: Zustand des Code-Datensatzes zum Abfragezeitpunkt (nicht persistiert). */
  accessCodeDefinitionState?: AccessCodeDefinitionState | null;
}
