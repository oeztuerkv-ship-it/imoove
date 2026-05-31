export type { AdminAccessCodeRow } from "../db/accessCodesData";

export interface CompanyRow {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  vat_id: string;
  /** general | taxi */
  company_kind: string;
  tax_id: string;
  concession_number: string;
  compliance_gewerbe_storage_key: string | null;
  compliance_insurance_storage_key: string | null;
  legal_form: string;
  owner_name: string;
  billing_name: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  bank_iban: string;
  bank_bic: string;
  support_email: string;
  dispo_phone: string;
  logo_url: string;
  opening_hours: string;
  business_notes: string;
  verification_status: string;
  compliance_status: string;
  contract_status: string;
  is_blocked: boolean;
  max_drivers: number;
  max_vehicles: number;
  fare_permissions: Record<string, unknown>;
  insurer_permissions: Record<string, unknown>;
  area_assignments: string[];
  is_active: boolean;
  is_priority_company: boolean;
  priority_for_live_rides: boolean;
  priority_for_reservations: boolean;
  priority_price_threshold: number;
  priority_timeout_seconds: number;
  release_radius_km: number;
  /**
   * Aktive Panel-Modul-IDs; `null` = alle Module (Default / Legacy).
   * Nur gültige IDs; Reihenfolge ohne Bedeutung.
   */
  panel_modules: string[] | null;
  /** Partner-Panel: Basis-Stammdaten per Self-Service abgeschlossen — nur noch Change-Requests. */
  partner_panel_profile_locked: boolean;
  /** ONRODA-Provisionssatz (0.10 = 10 %), Plattform-Admin je Mandant. */
  commission_rate: number;
  /** percentage | fixed | hybrid | none */
  commission_type: string;
  commission_fixed_eur: number;
  min_commission_eur: number | null;
  payout_allowed: boolean;
  panel_access_enabled: boolean;
  trade_license_number: string;
  onboarding_status: string;
  /** ONRODA-Admin: Krankenfahrten für diesen Mandanten freigeschaltet. */
  medical_transport_enabled: boolean;
  /** KK-Modul SaaS-Abo (Taxi) — Krankenfahrten/Sammelrechnung im Partner-Portal. */
  feature_kk_module: boolean;
  /** ISO-Zeitpunkt der letzten Aktivierung; null wenn deaktiviert. */
  feature_kk_module_since: string | null;
  /** Öffentlicher Mandanten-Code (eindeutig), z. B. STADTMITTE. */
  company_code: string;
  /** Rechnungs-Prefix ONR-{prefix}-YYYY-MM-SEQ (HOT, MED, …). */
  invoice_prefix: string;
  /** Reserve; Laufnummer in invoice_number_sequences. */
  invoice_sequence_next: number;
}

export interface FareAreaRow {
  id: string;
  name: string;
  ruleType: string;
  isRequiredArea: string;
  fixedPriceAllowed: string;
  status: string;
  isDefault: boolean;
  baseFareEur: number;
  rateFirstKmEur: number;
  rateAfterKmEur: number;
  thresholdKm: number;
  waitingPerHourEur: number;
  serviceFeeEur: number;
  onrodaBaseFareEur: number;
  onrodaPerKmEur: number;
  onrodaMinFareEur: number;
  manualFixedPriceEur: number | null;
}

/** Admin-Dashboard: Kennzahlen aus Postgres (camelCase JSON). */
export interface AdminDashboardStats {
  rides: {
    total: number;
    pending: number;
    active: number;
    completed: number;
    cancelled: number;
    rejected: number;
  };
  companies: {
    total: number;
    active: number;
  };
  /** Fahrer ohne eigene Tabelle: eindeutige `driver_id` auf Fahrten (jemals zugewiesen). */
  drivers: {
    distinctWithRide: number;
  };
  /** Aktive Partner-Panel-Zugänge (Login-Konten). */
  panelUsers: {
    active: number;
  };
  revenue: {
    currency: "EUR";
    periodFrom: string | null;
    periodTo: string | null;
    /** Abgeschlossene Fahrten: Summe `final_fare` falls gesetzt, sonst `estimated_fare`. */
    completedSum: number;
    completedRideCount: number;
  };
}
