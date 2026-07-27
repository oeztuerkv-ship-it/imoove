import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const pgBytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value == null) return Buffer.alloc(0);
    return Buffer.from(String(value));
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
});

export const adminCompaniesTable = pgTable("admin_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact_name: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address_line1: text("address_line1").notNull().default(""),
  address_line2: text("address_line2").notNull().default(""),
  postal_code: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default(""),
  vat_id: text("vat_id").notNull().default(""),
  is_active: boolean("is_active").notNull().default(true),
  is_priority_company: boolean("is_priority_company").notNull().default(false),
  priority_for_live_rides: boolean("priority_for_live_rides").notNull().default(false),
  priority_for_reservations: boolean("priority_for_reservations").notNull().default(false),
  priority_price_threshold: doublePrecision("priority_price_threshold").notNull().default(0),
  priority_timeout_seconds: integer("priority_timeout_seconds").notNull().default(90),
  release_radius_km: doublePrecision("release_radius_km").notNull().default(10),
  /** JSON-Array von Modul-IDs; NULL = alle Module aktiv (Legacy). */
  panel_modules: jsonb("panel_modules").$type<string[] | null>(),
  /** general | taxi — Taxi aktiviert Flotten-/Fahrer-Flows (API + Modul taxi_fleet). */
  company_kind: text("company_kind").notNull().default("general"),
  /** Steuer-ID (nicht USt-IdNr.; die bleibt in vat_id). */
  tax_id: text("tax_id").notNull().default(""),
  concession_number: text("concession_number").notNull().default(""),
  compliance_gewerbe_storage_key: text("compliance_gewerbe_storage_key"),
  compliance_insurance_storage_key: text("compliance_insurance_storage_key"),
  legal_form: text("legal_form").notNull().default(""),
  owner_name: text("owner_name").notNull().default(""),
  billing_name: text("billing_name").notNull().default(""),
  billing_address_line1: text("billing_address_line1").notNull().default(""),
  billing_address_line2: text("billing_address_line2").notNull().default(""),
  billing_postal_code: text("billing_postal_code").notNull().default(""),
  billing_city: text("billing_city").notNull().default(""),
  billing_country: text("billing_country").notNull().default(""),
  bank_iban: text("bank_iban").notNull().default(""),
  bank_bic: text("bank_bic").notNull().default(""),
  support_email: text("support_email").notNull().default(""),
  dispo_phone: text("dispo_phone").notNull().default(""),
  logo_url: text("logo_url").notNull().default(""),
  opening_hours: text("opening_hours").notNull().default(""),
  business_notes: text("business_notes").notNull().default(""),
  verification_status: text("verification_status").notNull().default("pending"),
  compliance_status: text("compliance_status").notNull().default("pending"),
  contract_status: text("contract_status").notNull().default("inactive"),
  is_blocked: boolean("is_blocked").notNull().default(false),
  max_drivers: integer("max_drivers").notNull().default(100),
  max_vehicles: integer("max_vehicles").notNull().default(100),
  fare_permissions: jsonb("fare_permissions").$type<Record<string, unknown>>().notNull().default({}),
  insurer_permissions: jsonb("insurer_permissions").$type<Record<string, unknown>>().notNull().default({}),
  area_assignments: jsonb("area_assignments").$type<string[]>().notNull().default([]),
  /**
   * Nach vollständig ausgefüllten Basis-Stammdaten im Partner-Panel: keine Self-Service-PATCHes mehr
   * für diese Felder — nur noch `company_change_requests`.
   */
  partner_panel_profile_locked: boolean("partner_panel_profile_locked").notNull().default(false),
  /** ONRODA-Provision (0.10 = 10 %), siehe ride_financials bei completed. */
  commission_rate: doublePrecision("commission_rate").notNull().default(0.1),
  /** percentage | fixed | hybrid | none — Finance/ride_financials. */
  commission_type: text("commission_type").notNull().default("percentage"),
  commission_fixed_eur: doublePrecision("commission_fixed_eur").notNull().default(0),
  min_commission_eur: doublePrecision("min_commission_eur"),
  payout_allowed: boolean("payout_allowed").notNull().default(true),
  /** Partner-Panel-Login/API für diesen Mandanten (unabhängig von is_active). */
  panel_access_enabled: boolean("panel_access_enabled").notNull().default(true),
  /** Institutionskennzeichen (IK) des Partners — Snapshot in medical_cases. */
  partner_ik_number: text("partner_ik_number").notNull().default(""),
  /** Vorlagen Krankenkassen-Abrechnung: [{ insurerName, insurerIk, email }]. */
  insurer_billing_contacts_json: jsonb("insurer_billing_contacts_json")
    .$type<Array<{ insurerName?: string; insurerIk?: string; email?: string }>>()
    .notNull()
    .default([]),
  /** ONRODA-Admin: Krankenfahrten + Transportschein-Scanner für diesen Mandanten. */
  medical_transport_enabled: boolean("medical_transport_enabled").notNull().default(false),
  /** KK-Modul SaaS-Abo (Krankenfahrten/Sammelrechnung) — nur Taxi, Admin-Freischaltung. */
  feature_kk_module: boolean("feature_kk_module").notNull().default(false),
  feature_kk_module_since: timestamp("feature_kk_module_since", { withTimezone: true }),
  /** Öffentlicher Mandanten-Code (eindeutig), nicht company_id. */
  company_code: text("company_code").notNull().default(""),
  /** Segment ONR-{invoice_prefix}-YYYY-MM-SEQ (z. B. HOT, MED). */
  invoice_prefix: text("invoice_prefix").notNull().default(""),
  /** Reserve; Laufnummer in invoice_number_sequences. */
  invoice_sequence_next: integer("invoice_sequence_next").notNull().default(1),
  /** Gewerbeschein-Nr. (Onboarding, getrennt von Konzession Hauptnummer). */
  trade_license_number: text("trade_license_number").notNull().default(""),
  /** incomplete | pending | approved — Ampel-Freischaltung Taxi-Onboarding. */
  onboarding_status: text("onboarding_status").notNull().default("incomplete"),
  onboarding_approved_at: timestamp("onboarding_approved_at", { withTimezone: true }),
  onboarding_approved_by: text("onboarding_approved_by"),
  /** Interne Notizen KK-Modul (Admin). */
  kk_module_notes: text("kk_module_notes").notNull().default(""),
  /** Stripe Connect Express (acct_…); Zahlungen mit transfer_data.destination. */
  stripe_connect_account_id: text("stripe_connect_account_id"),
  stripe_connect_charges_enabled: boolean("stripe_connect_charges_enabled").notNull().default(false),
  stripe_connect_payouts_enabled: boolean("stripe_connect_payouts_enabled").notNull().default(false),
  stripe_connect_details_submitted: boolean("stripe_connect_details_submitted").notNull().default(false),
  stripe_connect_onboarded_at: timestamp("stripe_connect_onboarded_at", { withTimezone: true }),
});

/** Taxi-Onboarding: Fahrzeugregister (vor / parallel zur fleet_vehicles-Flotte). */
export const companyVehiclesTable = pgTable("company_vehicles", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  license_plate: text("license_plate").notNull(),
  vehicle_type: text("vehicle_type").notNull(),
  concession_number: text("concession_number").notNull().default(""),
  tuev_date: date("tuev_date"),
  is_active: boolean("is_active").notNull().default(true),
  review_status: text("review_status").notNull().default("draft"),
  operator_message: text("operator_message").notNull().default(""),
  submitted_at: timestamp("submitted_at", { withTimezone: true }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  reviewed_by_admin: text("reviewed_by_admin"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Operator↔Partner Nachrichten zu Onboarding-Fahrzeugen / Mandant. */
export const companyOperatorMessagesTable = pgTable("company_operator_messages", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  vehicle_id: text("vehicle_id").references(() => companyVehiclesTable.id, { onDelete: "set null" }),
  sender_type: text("sender_type").notNull(),
  sender_admin_user_id: text("sender_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  sender_panel_user_id: text("sender_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Taxi-Onboarding: hochgeladene Nachweise (Datei in DB). */
export const companyDocumentsTable = pgTable("company_documents", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  vehicle_id: text("vehicle_id").references(() => companyVehiclesTable.id, { onDelete: "cascade" }),
  doc_type: text("doc_type").notNull(),
  file_name: text("file_name").notNull(),
  file_data: pgBytea("file_data").notNull(),
  mime_type: text("mime_type").notNull(),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploaded_by: text("uploaded_by"),
});

export const invoiceNumberSequencesTable = pgTable(
  "invoice_number_sequences",
  {
    invoice_prefix: text("invoice_prefix").notNull(),
    period_ym: text("period_ym").notNull(),
    next_value: integer("next_value").notNull().default(1),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.invoice_prefix, t.period_ym] }),
  }),
);

/** Mandanten-Fahrer (eigenes Login / Fleet-App), nicht zu verwechseln mit rides.driver_id (Freitext/Legacy). */
export const fleetDriversTable = pgTable("fleet_drivers", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  /** Plattformweit eindeutig (lower(trim)); ein Datensatz = ein Mandant — Migration 022/084. */
  email: text("email").notNull(),
  first_name: text("first_name").notNull().default(""),
  last_name: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  password_hash: text("password_hash").notNull(),
  session_version: integer("session_version").notNull().default(1),
  is_active: boolean("is_active").notNull().default(true),
  access_status: text("access_status").notNull().default("active"),
  /** Plattform-Freigabe: pending | in_review | missing_documents | approved | rejected (Login bleibt möglich). */
  approval_status: text("approval_status").notNull().default("approved"),
  /** Von Admin gesetzter Grund bei Sperre (MVP, Anzeige/Export). */
  suspension_reason: text("suspension_reason").notNull().default(""),
  /** Interne Plattform-Notiz (nur Admin, nicht an Partner ausliefern als fachlichen Status). */
  admin_internal_note: text("admin_internal_note").notNull().default(""),
  /**
   * Plattform-Operator: Einsatzbereitschaft trotz fehlender Unterlagen (P-Schein, Fahrzeug, Mandanten-Gate).
   * Sperre / explizite Nicht-Freigabe / abgelehnt bleiben wirksam.
   */
  readiness_override_system: boolean("readiness_override_system").notNull().default(false),
  must_change_password: boolean("must_change_password").notNull().default(true),
  p_schein_number: text("p_schein_number").notNull().default(""),
  p_schein_expiry: date("p_schein_expiry"),
  p_schein_doc_storage_key: text("p_schein_doc_storage_key"),
  /** Privat-/Meldeadresse (optional, Pflege durch Unternehmer). */
  home_address: text("home_address").notNull().default(""),
  drivers_license_number: text("drivers_license_number").notNull().default(""),
  drivers_license_expiry: date("drivers_license_expiry"),
  vehicle_legal_type: text("vehicle_legal_type").notNull().default("taxi"),
  vehicle_class: text("vehicle_class").notNull().default("standard"),
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  last_heartbeat_at: timestamp("last_heartbeat_at", { withTimezone: true }),
  /** Fleet-App: neue Markt-Sofortaufträge annehmen (false = offline am Markt). */
  is_market_online: boolean("is_market_online").notNull().default(false),
  /** Letzte Position am Markt (Dispatch-Radius). */
  last_market_lat: doublePrecision("last_market_lat"),
  last_market_lon: doublePrecision("last_market_lon"),
  /** Zeitpunkt letzter erfolgreicher last_market_*-Write (Outlier-Max-Age); NULL nach ONLINE-Reset. */
  last_market_at: timestamp("last_market_at", { withTimezone: true }),
  /** ONRODA-Admin: Fahrer-Override für Krankenfahrten (wirksam wenn inherit=false). */
  medical_transport_enabled: boolean("medical_transport_enabled").notNull().default(false),
  /** true = medical_transport_enabled vom Unternehmen erben. */
  medical_transport_inherit_from_company: boolean("medical_transport_inherit_from_company")
    .notNull()
    .default(true),
  /** KK-Modul: Mitarbeiter-Zugriff (Inhaber: is_owner). */
  permission_kk_module: boolean("permission_kk_module").notNull().default(false),
  /** Inhaber-Fahrerkonto — voller KK-Zugriff bei aktivem Mandanten-Modul. */
  is_owner: boolean("is_owner").notNull().default(false),
  /** Premium-Dispatch: A (manuell Admin) oder B (Standard neue Fahrer). */
  dispatch_priority: text("dispatch_priority").notNull().default("B"),
  /** Aufeinanderfolgende Markt-Ablehnungen (20 → Priorität A→B). */
  dispatch_reject_streak: integer("dispatch_reject_streak").notNull().default(0),
  /** Optional: individueller Provisionssatz (Dezimal); NULL = Mandant. */
  commission_rate: doublePrecision("commission_rate"),
  rating_sum: integer("rating_sum").notNull().default(0),
  rating_count: integer("rating_count").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  reservation_suspended_until: timestamp("reservation_suspended_until", { withTimezone: true }),
});

export const fleetVehiclesTable = pgTable("fleet_vehicles", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  license_plate: text("license_plate").notNull(),
  vin: text("vin").notNull().default(""),
  color: text("color").notNull().default(""),
  model: text("model").notNull().default(""),
  vehicle_type: text("vehicle_type").notNull().default("sedan"),
  vehicle_legal_type: text("vehicle_legal_type").notNull().default("taxi"),
  vehicle_class: text("vehicle_class").notNull().default("standard"),
  taxi_order_number: text("taxi_order_number").notNull().default(""),
  /** Taxikonzession / Ordnungsnummer (Pflicht bis Freigabe) */
  konzession_number: text("konzession_number").notNull().default(""),
  /** Nachweise: chronologisch angehängt, keine Partner-Hard-Deletes; Felder siehe fleetVehiclesData VehicleDocumentRef */
  vehicle_documents: jsonb("vehicle_documents")
    .$type<
      {
        storageKey: string;
        uploadedAt?: string;
        kind?: "concession" | "registration" | "insurance" | "taximeter" | "accessibility";
        uploadedByPanelUserId?: string | null;
      }[]
    >()
    .notNull()
    .default([]),
  rejection_reason: text("rejection_reason").notNull().default(""),
  approval_decided_at: timestamp("approval_decided_at", { withTimezone: true }),
  approval_decided_by_admin_id: text("approval_decided_by_admin_id"),
  next_inspection_date: date("next_inspection_date"),
  is_active: boolean("is_active").notNull().default(false),
  /** draft | pending_approval | missing_documents | approved | rejected | blocked */
  approval_status: text("approval_status").notNull().default("draft"),
  admin_internal_note: text("admin_internal_note").notNull().default(""),
  /** Sperrgrund (Plattform) bei `approval_status` = blocked */
  block_reason: text("block_reason").notNull().default(""),
  model_year: integer("model_year"),
  passenger_seats: integer("passenger_seats"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverVehicleAssignmentsTable = pgTable("driver_vehicle_assignments", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  driver_id: text("driver_id")
    .notNull()
    .references(() => fleetDriversTable.id, { onDelete: "cascade" }),
  vehicle_id: text("vehicle_id")
    .notNull()
    .references(() => fleetVehiclesTable.id, { onDelete: "cascade" }),
  assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Digitale Freigabe / Kostenübernahme durch Auftraggeber — kein Papiergutschein.
 * `code_type` (voucher | hotel | company | general) nur Klassifikation; `company_id` = Abrechnungs-Mandant.
 * Optionale Details (z. B. interne Vorgangsnummer) in `meta`.
 */
export const accessCodesTable = pgTable("access_codes", {
  id: text("id").primaryKey(),
  code_normalized: text("code_normalized").notNull().unique(),
  code_type: text("code_type").notNull(),
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  label: text("label").notNull().default(""),
  max_uses: integer("max_uses"),
  uses_count: integer("uses_count").notNull().default(0),
  reserved_count: integer("reserved_count").notNull().default(0),
  valid_from: timestamp("valid_from", { withTimezone: true }),
  valid_until: timestamp("valid_until", { withTimezone: true }),
  is_active: boolean("is_active").notNull().default(true),
  /** active | reserved | redeemed */
  lifecycle_status: text("lifecycle_status").notNull().default("active"),
  /** Verknüpfung zur laufenden Buchung (atomare Sperre). */
  reserved_ride_id: text("reserved_ride_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fareAreasTable = pgTable("fare_areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rule_type: text("rule_type").notNull(),
  is_required_area: text("is_required_area").notNull(),
  fixed_price_allowed: text("fixed_price_allowed").notNull(),
  status: text("status").notNull(),
  is_default: boolean("is_default").notNull().default(false),
  base_fare_eur: doublePrecision("base_fare_eur").notNull().default(4.3),
  rate_first_km_eur: doublePrecision("rate_first_km_eur").notNull().default(3.0),
  rate_after_km_eur: doublePrecision("rate_after_km_eur").notNull().default(2.5),
  threshold_km: doublePrecision("threshold_km").notNull().default(4),
  waiting_per_hour_eur: doublePrecision("waiting_per_hour_eur").notNull().default(38),
  service_fee_eur: doublePrecision("service_fee_eur").notNull().default(0),
  onroda_base_fare_eur: doublePrecision("onroda_base_fare_eur").notNull().default(3.5),
  onroda_per_km_eur: doublePrecision("onroda_per_km_eur").notNull().default(2.2),
  onroda_min_fare_eur: doublePrecision("onroda_min_fare_eur").notNull().default(0),
  manual_fixed_price_eur: doublePrecision("manual_fixed_price_eur"),
});

/** Partner-Panel (panel.onroda.de): Login pro Unternehmen, nur mit PostgreSQL. */
export const panelUsersTable = pgTable("panel_users", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "restrict" }),
  username: text("username").notNull(),
  email: text("email").notNull().default(""),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull(),
  must_change_password: boolean("must_change_password").notNull().default(true),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Einmal-Tokens für Partner-Panel Passwort-vergessen (gehasht, ablaufend, single-use). */
export const panelPasswordResetsTable = pgTable("panel_password_resets", {
  id: text("id").primaryKey(),
  panel_user_id: text("panel_user_id")
    .notNull()
    .references(() => panelUsersTable.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Partner-Panel: Festpreis-Gutschein nach Stripe-Zahlung (Access-Code + PDF). */
export const fixedPriceVoucherOrdersTable = pgTable("fixed_price_voucher_orders", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  panel_user_id: text("panel_user_id").references(() => panelUsersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  stripe_checkout_session_id: text("stripe_checkout_session_id").unique(),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  access_code_id: text("access_code_id").references(() => accessCodesTable.id, { onDelete: "set null" }),
  code_plain: text("code_plain"),
  label: text("label").notNull().default(""),
  from_full: text("from_full").notNull().default(""),
  to_full: text("to_full").notNull().default(""),
  from_lat: doublePrecision("from_lat"),
  from_lon: doublePrecision("from_lon"),
  to_lat: doublePrecision("to_lat"),
  to_lon: doublePrecision("to_lon"),
  distance_km: doublePrecision("distance_km").notNull().default(0),
  vehicle: text("vehicle").notNull().default("standard"),
  price_eur: doublePrecision("price_eur").notNull().default(0),
  base_price_eur: doublePrecision("base_price_eur"),
  vehicle_surcharge_eur: doublePrecision("vehicle_surcharge_eur"),
  pricing_snapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paid_at: timestamp("paid_at", { withTimezone: true }),
});

/** Firmen-Compliance (Gewerbe-/Versicherungsnachweis): aktuelle Fassung pro Typ, Prüf-Metadaten. */
export const companyComplianceDocumentsTable = pgTable("company_compliance_documents", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  /** "gewerbe" | "insurance" */
  document_type: text("document_type").notNull(),
  storage_key: text("storage_key").notNull(),
  uploaded_by_panel_user_id: text("uploaded_by_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  /** pending | approved | rejected */
  review_status: text("review_status").notNull().default("pending"),
  review_note: text("review_note").notNull().default(""),
  is_current: boolean("is_current").notNull().default(true),
});

/** Plattform-Admin-Login (admin.onroda.de): lokale Nutzerbasis für Session/JWT-Auth. */
export const adminAuthUsersTable = pgTable("admin_auth_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull().default(""),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull(),
  /** Optional: Hotel- (o. ä.) Konsole — nur Fahrten dieses Mandanten. */
  scope_company_id: text("scope_company_id"),
  session_version: integer("session_version").notNull().default(1),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Kunden-Identität (E-Mail-Konto, Google sub, apple:sub) — zentrale passenger_id-Registry. */
export const passengerProfilesTable = pgTable("passenger_profiles", {
  passenger_id: text("passenger_id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  auth_provider: text("auth_provider").notNull().default("google"),
  first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  rating_sum: integer("rating_sum").notNull().default(0),
  rating_count: integer("rating_count").notNull().default(0),
  terms_accepted_at: timestamp("terms_accepted_at", { withTimezone: true }),
  privacy_accepted_at: timestamp("privacy_accepted_at", { withTimezone: true }),
  terms_version: text("terms_version").notNull().default(""),
  privacy_version: text("privacy_version").notNull().default(""),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  /** scrypt-Hash 4-stelliger Abhol-PIN (Fahrer-Verify). */
  ride_verify_pin_hash: text("ride_verify_pin_hash"),
  /** AES-GCM Cipher nur für Anzeige an den Kontoinhaber. */
  ride_verify_pin_enc: text("ride_verify_pin_enc"),
  ride_verify_pin_set_at: timestamp("ride_verify_pin_set_at", { withTimezone: true }),
});

/** Kunden-Storno-Sperre (passenger_id = JWT sub / customer_accounts.id / OAuth sub). */
export const customerCancellationSuspensionTable = pgTable("customer_cancellation_suspension", {
  passenger_id: text("passenger_id").primaryKey(),
  suspended_until: timestamp("suspended_until", { withTimezone: true }).notNull(),
  suspended_at: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull().default("too_many_cancellations"),
  lifted_at: timestamp("lifted_at", { withTimezone: true }),
  lifted_by_admin: text("lifted_by_admin"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fahrer-Storno-Sperre nach zu vielen Stornos nach Annahme (7-Tage-Fenster). */
export const fleetDriverCancellationSuspensionTable = pgTable("fleet_driver_cancellation_suspension", {
  fleet_driver_id: text("fleet_driver_id")
    .primaryKey()
    .references(() => fleetDriversTable.id, { onDelete: "cascade" }),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  suspended_until: timestamp("suspended_until", { withTimezone: true }).notNull(),
  suspended_at: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull().default("too_many_post_accept_cancellations"),
  lifted_at: timestamp("lifted_at", { withTimezone: true }),
  lifted_by_admin: text("lifted_by_admin"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Kunden-App: Registrierung per E-Mail + Passwort (JWT sub = id). */
export const customerAccountsTable = pgTable("customer_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email_verified_at: timestamp("email_verified_at", { withTimezone: true }).notNull(),
  terms_accepted_at: timestamp("terms_accepted_at", { withTimezone: true }),
  privacy_accepted_at: timestamp("privacy_accepted_at", { withTimezone: true }),
  terms_version: text("terms_version").notNull().default(""),
  privacy_version: text("privacy_version").notNull().default(""),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Einmal-Tokens für Admin-Passwort-Reset (gehasht, ablaufend, single-use). */
export const adminAuthPasswordResetsTable = pgTable("admin_auth_password_resets", {
  id: text("id").primaryKey(),
  admin_user_id: text("admin_user_id")
    .notNull()
    .references(() => adminAuthUsersTable.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Nachvollziehbarkeit für Admin-Auth-Ereignisse (Reset angefordert/abgeschlossen/fehlgeschlagen). */
export const adminAuthAuditLogTable = pgTable("admin_auth_audit_log", {
  id: text("id").primaryKey(),
  admin_user_id: text("admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  username: text("username").notNull().default(""),
  action: text("action").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit-Trail für sensible Panel-Aktionen (kein Voll-Audit aller Reads). */
export const panelAuditLogTable = pgTable("panel_audit_log", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  actor_panel_user_id: text("actor_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  subject_type: text("subject_type"),
  subject_id: text("subject_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyChangeRequestsTable = pgTable("company_change_requests", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  requested_by_panel_user_id: text("requested_by_panel_user_id")
    .notNull()
    .references(() => panelUsersTable.id, { onDelete: "restrict" }),
  request_type: text("request_type").notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  admin_decision_note: text("admin_decision_note").notNull().default(""),
  decided_by_admin_user_id: text("decided_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  decided_at: timestamp("decided_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerRegistrationRequestsTable = pgTable("partner_registration_requests", {
  id: text("id").primaryKey(),
  company_name: text("company_name").notNull(),
  legal_form: text("legal_form").notNull().default(""),
  partner_type: text("partner_type").notNull(),
  uses_vouchers: boolean("uses_vouchers").notNull().default(false),
  contact_first_name: text("contact_first_name").notNull().default(""),
  contact_last_name: text("contact_last_name").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  address_line1: text("address_line1").notNull().default(""),
  address_line2: text("address_line2").notNull().default(""),
  owner_name: text("owner_name").notNull().default(""),
  dispo_phone: text("dispo_phone").notNull().default(""),
  postal_code: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default(""),
  tax_id: text("tax_id").notNull().default(""),
  vat_id: text("vat_id").notNull().default(""),
  concession_number: text("concession_number").notNull().default(""),
  desired_region: text("desired_region").notNull().default(""),
  requested_usage: jsonb("requested_usage").$type<Record<string, unknown>>().notNull().default({}),
  documents_meta: jsonb("documents_meta").$type<Record<string, unknown>>().notNull().default({}),
  notes: text("notes").notNull().default(""),
  registration_status: text("registration_status").notNull().default("open"),
  verification_status: text("verification_status").notNull().default("pending"),
  compliance_status: text("compliance_status").notNull().default("pending"),
  contract_status: text("contract_status").notNull().default("inactive"),
  missing_documents_note: text("missing_documents_note").notNull().default(""),
  admin_note: text("admin_note").notNull().default(""),
  master_data_locked: boolean("master_data_locked").notNull().default(true),
  linked_company_id: text("linked_company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  reviewed_by_admin_user_id: text("reviewed_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerRegistrationDocumentsTable = pgTable("partner_registration_documents", {
  id: text("id").primaryKey(),
  request_id: text("request_id")
    .notNull()
    .references(() => partnerRegistrationRequestsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("general"),
  original_file_name: text("original_file_name").notNull(),
  mime_type: text("mime_type").notNull().default("application/octet-stream"),
  storage_path: text("storage_path").notNull(),
  file_size_bytes: integer("file_size_bytes").notNull().default(0),
  uploaded_by_actor_type: text("uploaded_by_actor_type").notNull().default("partner"),
  uploaded_by_actor_label: text("uploaded_by_actor_label").notNull().default(""),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerRegistrationTimelineTable = pgTable("partner_registration_timeline", {
  id: text("id").primaryKey(),
  request_id: text("request_id")
    .notNull()
    .references(() => partnerRegistrationRequestsTable.id, { onDelete: "cascade" }),
  actor_type: text("actor_type").notNull(),
  actor_label: text("actor_label").notNull().default(""),
  event_type: text("event_type").notNull(),
  message: text("message").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fahrten — Spalten snake_case; API mappt auf camelCase (RideRequest). */
export const ridesTable = pgTable("rides", {
  id: text("id").primaryKey(),
  /** Mandant (Partner-Portal); NULL = noch nicht zugeordnet / Altbestand. */
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  /** NULL = App/Kunde oder Altbestand; gesetzt bei Anlage über Partner-Panel. */
  created_by_panel_user_id: text("created_by_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  /** Fahrtabschluss — Abrechnungszeiträume (Partner) nach Fahrtende, nicht Buchungsdatum. */
  completed_at: timestamp("completed_at", { withTimezone: true }),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").notNull(),
  customer_name: text("customer_name").notNull(),
  passenger_id: text("passenger_id"),
  /** Fahrer hat Kunden-PIN bei Ankunft bestätigt (nur App-Direktfahrten). */
  passenger_pin_verified_at: timestamp("passenger_pin_verified_at", { withTimezone: true }),
  driver_id: text("driver_id"),
  from_label: text("from_label").notNull(),
  from_full: text("from_full").notNull(),
  from_lat: doublePrecision("from_lat"),
  from_lon: doublePrecision("from_lon"),
  to_label: text("to_label").notNull(),
  to_full: text("to_full").notNull(),
  to_lat: doublePrecision("to_lat"),
  to_lon: doublePrecision("to_lon"),
  distance_km: doublePrecision("distance_km").notNull(),
  duration_minutes: integer("duration_minutes").notNull(),
  estimated_fare: doublePrecision("estimated_fare").notNull(),
  final_fare: doublePrecision("final_fare"),
  actual_distance_km: doublePrecision("actual_distance_km"),
  actual_duration_minutes: integer("actual_duration_minutes"),
  payment_method: text("payment_method").notNull(),
  vehicle: text("vehicle").notNull(),
  pricing_mode: text("pricing_mode"),
  rejected_by: jsonb("rejected_by").$type<string[]>().notNull().default([]),
  /** standard | medical | voucher | company */
  ride_kind: text("ride_kind").notNull().default("standard"),
  /** passenger | company | insurance | voucher | third_party */
  payer_kind: text("payer_kind").notNull().default("passenger"),
  voucher_code: text("voucher_code"),
  billing_reference: text("billing_reference"),
  /** passenger_direct | access_code */
  authorization_source: text("authorization_source").notNull().default("passenger_direct"),
  access_code_id: text("access_code_id").references(() => accessCodesTable.id, {
    onDelete: "set null",
  }),
  /** Kopie des normalisierten Codes bei Einlösung (Audit / Verlauf). */
  access_code_normalized_snapshot: text("access_code_normalized_snapshot"),
  /** Optional: Kunden-Telefon bei Buchung (bookingRules.requirePhone). */
  customer_phone: text("customer_phone"),
  /** Hotel/Medizin/Serien — nur Panel; nicht in öffentlichem Ride-Pool ausliefern. */
  partner_booking_meta: jsonb("partner_booking_meta")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Tarif-Engine-Snapshot bei Buchung (Merge + Breakdown; freeze). */
  tariff_snapshot_json: jsonb("tariff_snapshot_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Rollstuhl-/Barrierefrei-Infos (fahrtrelevant, keine Diagnose). */
  accessibility_options_json: jsonb("accessibility_options_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Kunde: einmaliger Push bei Zuweisung (scheduled → scheduled_assigned). */
  push_customer_reservation_assigned_at: timestamp("push_customer_reservation_assigned_at", { withTimezone: true }),
  /** Fahrer: einmaliger Push ca. 45 Min. vor Abholung (Aktivierung erinnern). */
  push_driver_activation_reminder_at: timestamp("push_driver_activation_reminder_at", { withTimezone: true }),
  driver_waiting_started_at: timestamp("driver_waiting_started_at", { withTimezone: true }),
  no_show_countdown_started_at: timestamp("no_show_countdown_started_at", { withTimezone: true }),
  no_show_evidence_at: timestamp("no_show_evidence_at", { withTimezone: true }),
  driver_trip_started_at: timestamp("driver_trip_started_at", { withTimezone: true }),
  waiting_minutes_billed: integer("waiting_minutes_billed"),
  waiting_charge_eur: doublePrecision("waiting_charge_eur"),
  payment_status: text("payment_status").notNull().default("pending"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  payment_capture_attempt_count: integer("payment_capture_attempt_count").notNull().default(0),
  payment_capture_last_attempt_at: timestamp("payment_capture_last_attempt_at", { withTimezone: true }),
  payment_capture_next_retry_at: timestamp("payment_capture_next_retry_at", { withTimezone: true }),
  payment_capture_last_error: text("payment_capture_last_error"),
  payment_failed_notified_at: timestamp("payment_failed_notified_at", { withTimezone: true }),
  stripe_refund_id: text("stripe_refund_id"),
  refunded_at: timestamp("refunded_at", { withTimezone: true }),
  cash_confirmed_at: timestamp("cash_confirmed_at", { withTimezone: true }),
  provision_amount: doublePrecision("provision_amount"),
  payout_amount: doublePrecision("payout_amount"),
  tip_amount: doublePrecision("tip_amount"),
  tip_paid_at: timestamp("tip_paid_at", { withTimezone: true }),
  stripe_tip_payment_intent_id: text("stripe_tip_payment_intent_id"),
  passenger_rating: integer("passenger_rating"),
  /** Fahrer bewertet Kunde (1–5), einmalig nach Fahrtende. */
  driver_passenger_rating: integer("driver_passenger_rating"),
  /** Sofortfahrt: aktuelle Angebots-Stufe A→B. */
  dispatch_tier: text("dispatch_tier").notNull().default("A"),
  dispatch_tier_started_at: timestamp("dispatch_tier_started_at", { withTimezone: true }),
  /** Zwei-Wege-Chat (Snapshot bei Annahme durch A-Fahrer); strikt fahrtgebunden. */
  chat_enabled: boolean("chat_enabled").notNull().default(false),
  chat_enabled_at: timestamp("chat_enabled_at", { withTimezone: true }),
});

/** Chat-Nachrichten pro Fahrt — Historie bleibt nach Terminal-Status, Senden gesperrt. */
export const rideChatMessagesTable = pgTable(
  "ride_chat_messages",
  {
    id: text("id").primaryKey(),
    ride_id: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    sender_kind: text("sender_kind").notNull(),
    sender_actor_id: text("sender_actor_id"),
    body: text("body").notNull(),
    client_message_id: text("client_message_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rideCreatedIdx: index("ride_chat_messages_ride_created_idx").on(t.ride_id, t.created_at),
    clientDedupeIdx: uniqueIndex("ride_chat_messages_client_dedupe_idx")
      .on(t.ride_id, t.sender_actor_id, t.client_message_id)
      .where(sql`${t.client_message_id} IS NOT NULL`),
  }),
);

/** Offene fehlgeschlagene Kartenzahlung — Buchungssperre bis Begleichung. */
export const customerPaymentSuspensionTable = pgTable("customer_payment_suspension", {
  passenger_id: text("passenger_id").primaryKey(),
  outstanding_ride_id: text("outstanding_ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  suspended_at: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull().default("unpaid_ride"),
  lifted_at: timestamp("lifted_at", { withTimezone: true }),
  lifted_by_admin: text("lifted_by_admin"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** GPS-Ping-Historie pro Fahrt (Haversine-Abrechnung, Admin-Nachverfolgung). */
export const rideLocationHistoryTable = pgTable(
  "ride_location_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ride_id: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    fleet_driver_id: text("fleet_driver_id").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rideRecordedIdx: index("ride_location_history_ride_recorded_idx").on(t.ride_id, t.recorded_at),
    recordedAtIdx: index("ride_location_history_recorded_at_idx").on(t.recorded_at),
  }),
);

/** Letzte Fahrer-GPS pro Fahrt (Geofence, Live-Tracking, Recovery). */
export const rideDriverLocationsTable = pgTable("ride_driver_locations", {
  ride_id: text("ride_id")
    .primaryKey()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  fleet_driver_id: text("fleet_driver_id").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Dispatch-Angebot pro Fahrer und Sofortfahrt (offer_sent / offer_seen / accepted). */
export const rideDriverDispatchOffersTable = pgTable("ride_driver_dispatch_offers", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  fleet_driver_id: text("fleet_driver_id").notNull(),
  company_id: text("company_id").notNull(),
  sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  seen_at: timestamp("seen_at", { withTimezone: true }),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
});

/** Expo Push: Fahrer-App, Token pro Gerät (Mandant + Fahrer). */
export const fleetDriverExpoPushTokensTable = pgTable("fleet_driver_expo_push_tokens", {
  expo_push_token: text("expo_push_token").primaryKey(),
  fleet_driver_id: text("fleet_driver_id").notNull(),
  company_id: text("company_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Expo Push: ein Token pro Gerät; bei Login dem Passagier (Google-Sub) zugeordnet. */
export const passengerExpoPushTokensTable = pgTable("passenger_expo_push_tokens", {
  expo_push_token: text("expo_push_token").primaryKey(),
  passenger_id: text("passenger_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Event-Historie pro Fahrt (Statuswechsel, Matching, Storno, Abschluss, etc.). */
export const rideEventsTable = pgTable("ride_events", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  event_type: text("event_type").notNull(),
  from_status: text("from_status"),
  to_status: text("to_status"),
  actor_type: text("actor_type").notNull().default("system"),
  actor_id: text("actor_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Kundensupport-Anfragen pro Fahrt (Mobile); Snapshot ist unveränderlicher Kontext beim Erzeugen. */
export const rideSupportTicketsTable = pgTable("ride_support_tickets", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  passenger_id: text("passenger_id").notNull(),
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  category: text("category").notNull(),
  message: text("message"),
  status: text("status").notNull().default("open"),
  internal_note: text("internal_note"),
  priority: text("priority").notNull().default("normal"),
  source: text("source").notNull().default("mobile"),
  created_by_actor_kind: text("created_by_actor_kind").notNull().default("customer"),
  created_by_actor_id: text("created_by_actor_id"),
  ride_context_snapshot: jsonb("ride_context_snapshot")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  snapshot_schema_version: integer("snapshot_schema_version").notNull().default(1),
  snapshot_captured_at: timestamp("snapshot_captured_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Allgemeine Hilfe-Anfragen aus der Kunden-App (Tab Hilfe, ohne Fahrtbezug). */
export const appHelpTicketsTable = pgTable("app_help_tickets", {
  id: text("id").primaryKey(),
  passenger_id: text("passenger_id").notNull(),
  passenger_name: text("passenger_name"),
  passenger_email: text("passenger_email").notNull(),
  passenger_phone: text("passenger_phone"),
  category: text("category").notNull().default("other"),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  internal_note: text("internal_note"),
  source: text("source").notNull().default("mobile_help"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * OCR / Krankenkassen-Vorbereitung: strukturierte Extraktionszeilen (policy: keine Diagnose).
 * Vorerst optional; API-Endpunkte können später geschrieben werden.
 */
export const medicalDocumentExtractionsTable = pgTable("medical_document_extractions", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  company_id: text("company_id").references(() => adminCompaniesTable.id, { onDelete: "set null" }),
  document_kind: text("document_kind").notNull().default("transport_sheet"),
  source: text("source").notNull().default("ocr_placeholder"),
  review_status: text("review_status").notNull().default("draft"),
  extraction_json: jsonb("extraction_json").$type<Record<string, unknown>>().notNull().default({}),
  confidence_json: jsonb("confidence_json").$type<Record<string, unknown>>().notNull().default({}),
  reviewed_by_actor_kind: text("reviewed_by_actor_kind"),
  reviewed_by_actor_id: text("reviewed_by_actor_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Abrechnungskonto pro Unternehmen/Rolle (Partner, Betreiber, Zahler, Leistungserbringer). */
export const billingAccountsTable = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "cascade",
  }),
  account_role: text("account_role").notNull().default("partner"),
  account_name: text("account_name").notNull().default(""),
  billing_email: text("billing_email").notNull().default(""),
  billing_address_json: jsonb("billing_address_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  payment_terms_days: integer("payment_terms_days").notNull().default(14),
  settlement_interval: text("settlement_interval").notNull().default("monthly"),
  payment_method: text("payment_method").notNull().default("bank_transfer"),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Finanz-Snapshot pro Fahrt (kaufmännische Wahrheit, nicht live aus rides berechnet). */
export const rideFinancialsTable = pgTable("ride_financials", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .unique()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  payer_type: text("payer_type").notNull(),
  billing_mode: text("billing_mode").notNull(),
  service_provider_company_id: text("service_provider_company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  partner_company_id: text("partner_company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  billing_reference: text("billing_reference").notNull().default(""),
  gross_amount: doublePrecision("gross_amount").notNull().default(0),
  net_amount: doublePrecision("net_amount").notNull().default(0),
  vat_rate: doublePrecision("vat_rate").notNull().default(0),
  vat_amount: doublePrecision("vat_amount").notNull().default(0),
  commission_type: text("commission_type").notNull().default("percentage"),
  commission_value: doublePrecision("commission_value").notNull().default(0),
  commission_amount: doublePrecision("commission_amount").notNull().default(0),
  operator_payout_amount: doublePrecision("operator_payout_amount").notNull().default(0),
  tip_amount: doublePrecision("tip_amount").notNull().default(0),
  /** Stripe-Gebühr (ONRODA trägt; Unternehmer-Netto unverändert). */
  stripe_fee_amount: doublePrecision("stripe_fee_amount").notNull().default(0),
  /** Manuelle Auszahlung: offen | ausgezahlt */
  payout_line_status: text("payout_line_status").notNull().default("offen"),
  billing_status: text("billing_status").notNull().default("unbilled"),
  settlement_status: text("settlement_status").notNull().default("open"),
  calculated_at: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  calculation_version: text("calculation_version").notNull().default("v1"),
  calculation_rule_set: text("calculation_rule_set"),
  calculation_metadata_json: jsonb("calculation_metadata_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  locked_at: timestamp("locked_at", { withTimezone: true }),
  lock_reason: text("lock_reason"),
  correction_count: integer("correction_count").notNull().default(0),
  last_correction_at: timestamp("last_correction_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoice_number: text("invoice_number").notNull(),
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  invoice_type: text("invoice_type").notNull(),
  billing_period_start: date("billing_period_start").notNull(),
  billing_period_end: date("billing_period_end").notNull(),
  subtotal_net: doublePrecision("subtotal_net").notNull().default(0),
  vat_total: doublePrecision("vat_total").notNull().default(0),
  total_gross: doublePrecision("total_gross").notNull().default(0),
  issue_date: date("issue_date").notNull(),
  due_date: date("due_date"),
  status: text("status").notNull().default("draft"),
  /** SEPA-Verwendungszweck (= invoice_number, siehe buildInvoicePaymentReference). */
  payment_reference: text("payment_reference").notNull().default(""),
  pdf_storage_key: text("pdf_storage_key").notNull().default(""),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: text("id").primaryKey(),
  invoice_id: text("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "cascade" }),
  ride_id: text("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  item_type: text("item_type").notNull(),
  description: text("description").notNull().default(""),
  quantity: doublePrecision("quantity").notNull().default(1),
  unit_net: doublePrecision("unit_net").notNull().default(0),
  vat_rate: doublePrecision("vat_rate").notNull().default(0),
  line_net: doublePrecision("line_net").notNull().default(0),
  line_vat: doublePrecision("line_vat").notNull().default(0),
  line_gross: doublePrecision("line_gross").notNull().default(0),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settlementsTable = pgTable("settlements", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  settlement_number: text("settlement_number").notNull(),
  period_start: date("period_start").notNull(),
  period_end: date("period_end").notNull(),
  gross_revenue: doublePrecision("gross_revenue").notNull().default(0),
  platform_commission: doublePrecision("platform_commission").notNull().default(0),
  adjustments: doublePrecision("adjustments").notNull().default(0),
  payout_amount: doublePrecision("payout_amount").notNull().default(0),
  status: text("status").notNull().default("draft"),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  payment_reference: text("payment_reference").notNull().default(""),
  /** Optional; eindeutig wenn gesetzt — idempotente Settlement-Erzeugung (Retry / gleicher Batch). */
  idempotency_key: text("idempotency_key"),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eine Fahrt global höchstens einer Abrechnung zugeordnet (UNIQUE auf ride_id). */
export const settlementRideAllocationsTable = pgTable(
  "settlement_ride_allocations",
  {
    settlement_id: text("settlement_id")
      .notNull()
      .references(() => settlementsTable.id, { onDelete: "cascade" }),
    ride_id: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    ride_financial_id: text("ride_financial_id")
      .notNull()
      .references(() => rideFinancialsTable.id, { onDelete: "cascade" }),
    gross_amount_snap: doublePrecision("gross_amount_snap").notNull().default(0),
    commission_amount_snap: doublePrecision("commission_amount_snap").notNull().default(0),
    operator_payout_snap: doublePrecision("operator_payout_snap").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.settlement_id, t.ride_id] }),
    rideUnique: uniqueIndex("settlement_ride_allocations_one_ride_global").on(t.ride_id),
  }),
);

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey(),
  target_type: text("target_type").notNull(),
  target_id: text("target_id").notNull(),
  company_id: text("company_id").references(() => adminCompaniesTable.id, {
    onDelete: "set null",
  }),
  payment_method: text("payment_method").notNull().default("bank_transfer"),
  amount: doublePrecision("amount").notNull().default(0),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference").notNull().default(""),
  status: text("status").notNull().default("pending"),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financialAuditLogTable = pgTable("financial_audit_log", {
  id: text("id").primaryKey(),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id").notNull(),
  action: text("action").notNull(),
  old_value_json: jsonb("old_value_json").$type<Record<string, unknown>>().notNull().default({}),
  new_value_json: jsonb("new_value_json").$type<Record<string, unknown>>().notNull().default({}),
  actor_type: text("actor_type").notNull().default("system"),
  actor_id: text("actor_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Partner-Anfragen an die Plattform (Chat-Thread). */
export const supportThreadsTable = pgTable("support_threads", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  created_by_panel_user_id: text("created_by_panel_user_id")
    .notNull()
    .references(() => panelUsersTable.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  last_message_at: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: text("id").primaryKey(),
  thread_id: text("thread_id")
    .notNull()
    .references(() => supportThreadsTable.id, { onDelete: "cascade" }),
  sender_type: text("sender_type").notNull(),
  sender_panel_user_id: text("sender_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  sender_admin_user_id: text("sender_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<Record<string, unknown>[] | null>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Medizinische Serienfahrten: Kopfdatensatz; Fahrten tragen seriesId in partner_booking_meta. */
export const partnerRideSeriesTable = pgTable("partner_ride_series", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  created_by_panel_user_id: text("created_by_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  patient_reference: text("patient_reference").notNull().default(""),
  billing_reference: text("billing_reference"),
  valid_from: timestamp("valid_from", { withTimezone: true }),
  valid_until: timestamp("valid_until", { withTimezone: true }),
  total_rides: integer("total_rides").notNull(),
  status: text("status").notNull().default("active"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Medical-Fall (Patient/KK/IK, Datumslogik) — Phase 1 Scan-Workflow. */
export const medicalCasesTable = pgTable("medical_cases", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  ride_id: text("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  series_id: text("series_id").references(() => partnerRideSeriesTable.id, { onDelete: "set null" }),
  patient_display_name: text("patient_display_name").notNull().default(""),
  patient_reference: text("patient_reference").notNull().default(""),
  insurance_name: text("insurance_name").notNull().default(""),
  insurance_ik: text("insurance_ik").notNull().default(""),
  partner_ik_number: text("partner_ik_number").notNull().default(""),
  case_type: text("case_type").notNull().default("transport_sheet"),
  date_logic_type: text("date_logic_type").notNull().default("today"),
  date_logic_context_json: jsonb("date_logic_context_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  status: text("status").notNull().default("open"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Transportschein-Scan inkl. OCR-Rohdaten (Claude Vision Phase 1). */
export const medicalDocumentsTable = pgTable("medical_documents", {
  id: text("id").primaryKey(),
  case_id: text("case_id")
    .notNull()
    .references(() => medicalCasesTable.id, { onDelete: "cascade" }),
  ride_id: text("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  document_type: text("document_type").notNull().default("transport_sheet"),
  storage_key: text("storage_key").notNull().default(""),
  mime_type: text("mime_type").notNull().default(""),
  ocr_provider: text("ocr_provider").notNull().default(""),
  ocr_model: text("ocr_model").notNull().default(""),
  ocr_raw_json: jsonb("ocr_raw_json").$type<Record<string, unknown>>().notNull().default({}),
  ocr_extracted_json: jsonb("ocr_extracted_json").$type<Record<string, unknown>>().notNull().default({}),
  ocr_confidence_json: jsonb("ocr_confidence_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ampel-Review (green/yellow/red) — keine automatische Freigabe (auto_approved bleibt false). */
export const medicalReviewsTable = pgTable("medical_reviews", {
  id: text("id").primaryKey(),
  case_id: text("case_id")
    .notNull()
    .references(() => medicalCasesTable.id, { onDelete: "cascade" }),
  document_id: text("document_id")
    .notNull()
    .references(() => medicalDocumentsTable.id, { onDelete: "cascade" }),
  traffic_light: text("traffic_light").notNull().default("yellow"),
  warnings_json: jsonb("warnings_json").$type<unknown[]>().notNull().default([]),
  date_logic_result_json: jsonb("date_logic_result_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  reviewer_actor_kind: text("reviewer_actor_kind").notNull().default("system"),
  reviewer_actor_id: text("reviewer_actor_id"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  auto_approved: boolean("auto_approved").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Kunden-Transportschein-OCR vor Krankenfahrt-Buchung (Snapshot bis Ride-Create). */
export const customerMedicalTransportScansTable = pgTable("customer_medical_transport_scans", {
  id: text("id").primaryKey(),
  passenger_id: text("passenger_id").notNull(),
  traffic_light: text("traffic_light").notNull(),
  primary_reason_de: text("primary_reason_de").notNull().default(""),
  snapshot_json: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  storage_key: text("storage_key").notNull().default(""),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumed_at: timestamp("consumed_at", { withTimezone: true }),
  consumed_ride_id: text("consumed_ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Admin Krankenkassen-Modus: Export-Batches (CSV), Fahrt-IDs im Batch für Anzeige „Exportiert in …“. */
export const billingExportBatchesTable = pgTable("billing_export_batches", {
  id: text("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  created_by_label: text("created_by_label").notNull().default(""),
  period_from: timestamp("period_from", { withTimezone: true }).notNull(),
  period_to: timestamp("period_to", { withTimezone: true }).notNull(),
  company_id_filter: text("company_id_filter"),
  status: text("status").notNull().default("completed"),
  row_count: integer("row_count").notNull().default(0),
  file_rel_path: text("file_rel_path").notNull().default(""),
  included_ride_ids: jsonb("included_ride_ids").$type<string[]>().notNull().default([]),
  schema_version: text("schema_version").notNull().default("insurer_export_v1"),
});

/** Feingranulare Korrekturhistorie zu Abrechnungsfeldern (append-only; Phase 1 meist leer). */
export const rideBillingCorrectionsTable = pgTable("ride_billing_corrections", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  field_name: text("field_name").notNull(),
  old_value: text("old_value").notNull().default(""),
  new_value: text("new_value").notNull().default(""),
  reason_code: text("reason_code").notNull().default(""),
  reason_note: text("reason_note").notNull().default(""),
  actor_type: text("actor_type").notNull().default("system"),
  actor_id: text("actor_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Öffentliche Homepage-Hinweise/Banner (vom Admin gepflegt, public read-only ausgeliefert). */
export const homepagePlaceholdersTable = pgTable("homepage_placeholders", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  message: text("message").notNull().default(""),
  cta_label: text("cta_label"),
  cta_url: text("cta_url"),
  /** Visueller Hinweis-Typ in API als `type`: info | success | warning | important (Legacy-Spaltenname). */
  tone: text("tone").notNull().default("info"),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  visible_from: timestamp("visible_from", { withTimezone: true }),
  visible_until: timestamp("visible_until", { withTimezone: true }),
  dismiss_key: text("dismiss_key").notNull().default(""),
  created_by_admin_user_id: text("created_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  updated_by_admin_user_id: text("updated_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** CMS-MVP für zentrale Homepage-Hero-Inhalte (Marketing-only). */
export const homepageContentTable = pgTable("homepage_content", {
  id: text("id").primaryKey(),
  hero_headline: text("hero_headline").notNull().default(""),
  hero_subline: text("hero_subline").notNull().default(""),
  cta1_text: text("cta1_text").notNull().default(""),
  cta1_link: text("cta1_link").notNull().default(""),
  cta2_text: text("cta2_text").notNull().default(""),
  cta2_link: text("cta2_link").notNull().default(""),
  notice_text: text("notice_text").notNull().default(""),
  notice_active: boolean("notice_active").notNull().default(false),
  section2_title: text("section2_title").notNull().default(""),
  section2_cards: jsonb("section2_cards")
    .$type<
      Array<{
        icon: string;
        title: string;
        body: string;
        ctaText: string;
        ctaLink: string;
        isActive: boolean;
      }>
    >()
    .notNull()
    .default([]),
  services_kicker: text("services_kicker").notNull().default(""),
  services_title: text("services_title").notNull().default(""),
  services_subline: text("services_subline").notNull().default(""),
  services_cards: jsonb("services_cards")
    .$type<Array<{ icon: string; title: string; body: string; isActive: boolean }>>()
    .notNull()
    .default([]),
  manifest_kicker: text("manifest_kicker").notNull().default(""),
  manifest_title: text("manifest_title").notNull().default(""),
  manifest_subline: text("manifest_subline").notNull().default(""),
  manifest_cards: jsonb("manifest_cards")
    .$type<
      Array<{
        num: string;
        icon: string;
        title: string;
        body: string;
        ctaText: string;
        ctaLink: string;
        isActive: boolean;
      }>
    >()
    .notNull()
    .default([]),
  about_title: text("about_title").notNull().default(""),
  about_intro: text("about_intro").notNull().default(""),
  about_vision: text("about_vision").notNull().default(""),
  about_challenges_intro: text("about_challenges_intro").notNull().default(""),
  about_bullets: jsonb("about_bullets").$type<string[]>().notNull().default([]),
  about_closing: text("about_closing").notNull().default(""),
  about_tagline: text("about_tagline").notNull().default(""),
  nav_promo: jsonb("nav_promo")
    .$type<{
      label: string;
      href: string;
      isActive: boolean;
      badge: string;
      highlight: boolean;
    }>()
    .notNull()
    .default({
      label: "Fixpreise",
      href: "/fixpreise/",
      isActive: true,
      badge: "",
      highlight: true,
    }),
  fixpreis_section: jsonb("fixpreis_section")
    .$type<{
      title: string;
      body: string;
      ctaText: string;
      ctaLink: string;
      isActive: boolean;
    }>()
    .notNull()
    .default({
      title: "Festpreis-Fahrten",
      body: "Transparente Pauschalpreise für Ihre Strecke außerhalb des Pflichtfahrgebiets — Grundgebühr plus Kilometer nach ONRODA-Tarif. In der App buchen oder Festpreis-Gutschein über Hotel und Partner.",
      ctaText: "Jetzt in der App buchen",
      ctaLink: "/#jetzt-buchen",
      isActive: true,
    }),
  site_branding: jsonb("site_branding")
    .$type<{ headerLogoUrl: string; faviconUrl: string }>()
    .notNull()
    .default({ headerLogoUrl: "", faviconUrl: "" }),
  section_themes: jsonb("section_themes").$type<Record<string, unknown>>().notNull().default({}),
  updated_by_admin_user_id: text("updated_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Krankenkassen-Partner: interne Kostenstellen-Referenzen (V1). */
export const insurerCostCentersTable = pgTable("insurer_cost_centers", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull().default(""),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Krankenkassen-Partner: Transportschein-Datei (nur technische Metadaten; kein ausgelesener medizinischer Inhalt).
 */
export const insurerRideTransportDocumentsTable = pgTable("insurer_ride_transport_documents", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  storage_key: text("storage_key").notNull(),
  original_filename: text("original_filename").notNull().default(""),
  content_type: text("content_type").notNull().default("application/pdf"),
  byte_size: integer("byte_size").notNull().default(0),
  created_by_panel_user_id: text("created_by_panel_user_id").references(() => panelUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** CMS: Rechtstexte (AGB, Datenschutz, Impressum). */
export const legalPagesTable = pgTable("legal_pages", {
  slug: text("slug").primaryKey(),
  page_title: text("page_title").notNull().default(""),
  stand_label: text("stand_label").notNull().default(""),
  body_html: text("body_html").notNull().default(""),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Homepage CMS: FAQ-Liste (modular getrennt von homepage_content). */
export const homepageFaqItemsTable = pgTable("homepage_faq_items", {
  id: text("id").primaryKey(),
  question: text("question").notNull().default(""),
  answer: text("answer").notNull().default(""),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  created_by_admin_user_id: text("created_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  updated_by_admin_user_id: text("updated_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Homepage CMS: "So funktioniert ONRODA" (3 editierbare Schritte, DB-seitig nicht hart limitiert). */
export const homepageHowStepsTable = pgTable("homepage_how_steps", {
  id: text("id").primaryKey(),
  icon: text("icon").notNull().default(""),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  created_by_admin_user_id: text("created_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  updated_by_admin_user_id: text("updated_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Homepage CMS: Trust-KPI-Kacheln. */
export const homepageTrustMetricsTable = pgTable("homepage_trust_metrics", {
  id: text("id").primaryKey(),
  value: text("value").notNull().default(""),
  label: text("label").notNull().default(""),
  description: text("description").notNull().default(""),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  created_by_admin_user_id: text("created_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  updated_by_admin_user_id: text("updated_by_admin_user_id").references(() => adminAuthUsersTable.id, {
    onDelete: "set null",
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Zentral: App/Betrieb (MVP) — JSON-Payload, Singleton id=default. */
export const appOperationalConfigTable = pgTable("app_operational_config", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Einmal-Codes zur E-Mail-Verifizierung (Kunden-App); Klartext nie in der DB. */
export const emailVerificationCodesTable = pgTable("email_verification_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  code_hash: text("code_hash").notNull(),
  purpose: text("purpose").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed_at: timestamp("consumed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mobile: Neuigkeiten / In-App-Mitteilungen (Admin, öffentlicher GET). */
export const appNewsItemsTable = pgTable("app_news_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  image_url: text("image_url"),
  button_text: text("button_text"),
  target_type: text("target_type").notNull().default("none"),
  target_value: text("target_value"),
  audience: text("audience").notNull().default("all"),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  starts_at: timestamp("starts_at", { withTimezone: true }),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mobile App: FAQ (Hilfe-Screen, getrennt von homepage_faq_items). */
export const appFaqTable = pgTable("app_faq", {
  id: text("id").primaryKey(),
  question: text("question").notNull().default(""),
  answer: text("answer").notNull().default(""),
  category: text("category").notNull().default("general"),
  sort_order: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Operator-Nachrichten an Fahrer (Broadcast oder Einzel). */
export const driverMessagesTable = pgTable("driver_messages", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  target_driver_id: text("target_driver_id").references(() => fleetDriversTable.id, { onDelete: "set null" }),
  sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sent_by: text("sent_by").notNull().default(""),
  message_type: text("message_type").notNull().default("inbox"),
});
export const driverMessageDismissalsTable = pgTable("driver_message_dismissals", {
  fleet_driver_id: text("fleet_driver_id").notNull(),
  message_id: text("message_id").notNull(),
  dismissed_at: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Operator → Partner: Einweg-Posteingang (je Zeile ein Mandant). */
export const partnerMessagesTable = pgTable("partner_messages", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  batch_id: text("batch_id"),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  is_read: boolean("is_read").notNull().default(false),
  read_at: timestamp("read_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  created_by_admin: text("created_by_admin").notNull().default(""),
});

export const appSponsorsTable = pgTable("app_sponsors", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  image_url: text("image_url"),
  logo_url: text("logo_url"),
  external_url: text("external_url"),
  button_text: text("button_text"),
  qr_code_url: text("qr_code_url"),
  qr_from_link: boolean("qr_from_link").notNull().default(false),
  category: text("category").notNull().default("partner"),
  audience: text("audience").notNull().default("all"),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  starts_at: timestamp("starts_at", { withTimezone: true }),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Einfahrgebiete: Substring in Adresse ODER Mittelpunkt+Radius (match_mode=radius). */
export const appServiceRegionsTable = pgTable("app_service_regions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  match_terms: jsonb("match_terms").$type<string[]>().notNull().default([]),
  /** substring (Default) | radius | geofence/polygon (vorbereitet) */
  match_mode: text("match_mode").notNull().default("substring"),
  center_lat: doublePrecision("center_lat"),
  center_lng: doublePrecision("center_lng"),
  radius_km: doublePrecision("radius_km"),
  /** Optional: erweiterte Geometrie; Radius nutzt bevorzugt center_* + radius_km. */
  geo_fence_json: jsonb("geo_fence_json").$type<Record<string, unknown> | null>(),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** T-Schein-Beleg je Krankenfahrt (vor Sammelrechnung status=open). */
export const transportVouchersTable = pgTable("transport_vouchers", {
  id: text("id").primaryKey(),
  ride_id: text("ride_id")
    .notNull()
    .references(() => ridesTable.id, { onDelete: "cascade" }),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  patient_name: text("patient_name").notNull().default(""),
  insurer_name: text("insurer_name").notNull().default(""),
  insurer_ik: text("insurer_ik").notNull().default(""),
  insurer_email: text("insurer_email").notNull().default(""),
  fare_amount: doublePrecision("fare_amount").notNull().default(0),
  commission_amount: doublePrecision("commission_amount").notNull().default(0),
  net_amount: doublePrecision("net_amount").notNull().default(0),
  commission_rate_snap: doublePrecision("commission_rate_snap").notNull().default(0),
  status: text("status").notNull().default("open"),
  kranken_invoice_id: text("kranken_invoice_id"),
  billed_at: timestamp("billed_at", { withTimezone: true }),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  ride_reference_at: timestamp("ride_reference_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sammelrechnung Taxi → Krankenkasse (ONRODA dokumentiert + PDF). */
export const krankenInvoicesTable = pgTable("kranken_invoices", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  insurer_name: text("insurer_name").notNull().default(""),
  insurer_ik: text("insurer_ik").notNull().default(""),
  insurer_email: text("insurer_email").notNull().default(""),
  invoice_number: text("invoice_number").notNull(),
  period_from: date("period_from").notNull(),
  period_to: date("period_to").notNull(),
  total_amount: doublePrecision("total_amount").notNull().default(0),
  commission_amount: doublePrecision("commission_amount").notNull().default(0),
  net_amount: doublePrecision("net_amount").notNull().default(0),
  commission_rate_snap: doublePrecision("commission_rate_snap").notNull().default(0),
  status: text("status").notNull().default("draft"),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  sent_to: text("sent_to").notNull().default(""),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  pdf_storage_key: text("pdf_storage_key").notNull().default(""),
  ride_count: integer("ride_count").notNull().default(0),
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const krankenInvoiceSequencesTable = pgTable(
  "kranken_invoice_sequences",
  {
    company_id: text("company_id")
      .notNull()
      .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    next_seq: integer("next_seq").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.company_id, t.year] }),
  }),
);

/** Marketing-Homepage: anonyme Besucher-Events (ohne IP, DSGVO-freundlich). */
export const homepageAnalyticsEventsTable = pgTable("homepage_analytics_events", {
  id: text("id").primaryKey(),
  event_type: text("event_type").notNull(),
  page_path: text("page_path").notNull().default("/"),
  referrer: text("referrer"),
  device_type: text("device_type"),
  browser: text("browser"),
  country: text("country"),
  anonymous_visitor_id: text("anonymous_visitor_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fail2Ban-Dashboard: Team-IPs die nicht gesperrt werden sollen. */
export const securityIpWhitelistTable = pgTable(
  "security_ip_whitelist",
  {
    id: text("id").primaryKey(),
    ip_cidr: text("ip_cidr").notNull(),
    label: text("label").notNull().default(""),
    notes: text("notes").notNull().default(""),
    created_by: text("created_by").notNull().default(""),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ipCidrUq: uniqueIndex("security_ip_whitelist_ip_cidr_uq").on(t.ip_cidr),
  }),
);

/** Fail2Ban-Dashboard: permanente manuelle IP-Sperren. */
export const securityIpBlocklistTable = pgTable(
  "security_ip_blocklist",
  {
    id: text("id").primaryKey(),
    ip_cidr: text("ip_cidr").notNull(),
    label: text("label").notNull().default(""),
    reason: text("reason").notNull().default(""),
    created_by: text("created_by").notNull().default(""),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ipCidrUq: uniqueIndex("security_ip_blocklist_ip_cidr_uq").on(t.ip_cidr),
  }),
);

/** Fail2Ban-Dashboard: Ban/Unban-Audit für Statistik. */
export const securityBanEventsTable = pgTable("security_ban_events", {
  id: text("id").primaryKey(),
  ip: text("ip").notNull(),
  jail: text("jail"),
  action: text("action").notNull(),
  source: text("source").notNull().default("admin_api"),
  admin_username: text("admin_username").notNull().default(""),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
