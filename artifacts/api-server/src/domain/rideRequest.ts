import type { PayerKind, RideKind } from "./rideBillingProfile";
import type { AccessCodeType, AuthorizationSource } from "./rideAuthorization";
import type { AccessCodeDefinitionState, AccessCodeTripOutcome } from "./accessCodeTrace";
import type { PartnerBookingMeta } from "./partnerBookingMeta";

export type { AccessCodeType, AuthorizationSource, PayerKind, RideKind };
export type { AccessCodeDefinitionState, AccessCodeTripOutcome };
export type { PartnerBookingMeta };

/** DB/API: `tariff_snapshot_json` */
export type TariffBookingSnapshotV1 = {
  engineSchemaVersion: number;
  serviceRegionId: string | null;
  /** Gerundeter Gesamt-Schätzpreis = `estimatedFare` bei Buchung */
  finalPriceEur: number;
  subtotal: number;
  afterMinFare: number;
  breakdown: {
    baseFare: number;
    distanceCharge: number;
    tripMinutesCharge: number;
    waitingCharge: number;
    airportFlatEur: number;
    minFare: number;
    surcharges: { type: string; amount: number }[];
    vehicleClassMultiplier: number;
  };
  distanceKm: number;
  tripMinutes: number;
  waitingMinutes: number;
  vehicle: string;
  at: string;
};

export type RideAccessibilityAssistanceLevel = "boarding" | "to_door" | "to_apartment" | "none";
export type RideAccessibilityWheelchairType = "foldable" | "electric";
export type RideAccessibilityCompanionCount = 0 | 1 | 2;

/** Fahrtrelevante Rollstuhl-/Barrierefrei-Infos (ohne Medizin-/Diagnosedaten). */
export type RideAccessibilityOptions = {
  assistanceLevel: RideAccessibilityAssistanceLevel;
  wheelchairType: RideAccessibilityWheelchairType;
  wheelchairStaysOccupied: boolean;
  canTransfer: boolean;
  companionCount: RideAccessibilityCompanionCount;
  rampRequired: boolean;
  carryChairRequired: boolean;
  elevatorAvailable: boolean;
  stairsPresent: boolean;
  driverNote?: string | null;
};

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
  /** Barrierefrei-/Rollstuhl-Zusatzinfos für Disposition, Fahrer und Admin-Akte. */
  accessibilityOptions?: RideAccessibilityOptions | null;
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
  /**
   * Geschätzter Fahrpreis bei Buchung — nur serverseitig (operationalTariffEngine), kein Client-Override.
   */
  estimatedFare: number;
  /**
   * Snapshot der Tarif-Engine (POST /rides): gleiche Logik wie /fare-estimate, bei Abschluss nicht neu berechnen.
   */
  tariffSnapshot?: TariffBookingSnapshotV1 | null;
  /** Tatsächlicher Preis nach Fahrtende — Abrechnungsbetrag gegen Kostenträger bei Code-/Firmenlogik. */
  finalFare?: number | null;
  paymentMethod: string;
  vehicle: string;
  pricingMode?: "taxi_tariff" | null;
  customerName: string;
  /** Kunden-Telefon bei Buchung; Pflicht wenn bookingRules.requirePhone. */
  customerPhone?: string | null;
  passengerId?: string;
  driverId?: string | null;
  rejectedBy: string[];
  status:
    | "draft"
    | "scheduled"
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
