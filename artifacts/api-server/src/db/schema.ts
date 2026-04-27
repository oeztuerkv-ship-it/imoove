import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
});

/** Mandanten-Fahrer (eigenes Login / Fleet-App), nicht zu verwechseln mit rides.driver_id (Freitext/Legacy). */
export const fleetDriversTable = pgTable("fleet_drivers", {
  id: text("id").primaryKey(),
  company_id: text("company_id")
    .notNull()
    .references(() => adminCompaniesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  first_name: text("first_name").notNull().default(""),
  last_name: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  password_hash: text("password_hash").notNull(),
  session_version: integer("session_version").notNull().default(1),
  is_active: boolean("is_active").notNull().default(true),
  access_status: text("access_status").notNull().default("active"),
  /** Plattform-Freigabe: pending | in_review | approved | rejected (Login bleibt möglich). */
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
  vehicle_legal_type: text("vehicle_legal_type").notNull().default("taxi"),
  vehicle_class: text("vehicle_class").notNull().default("standard"),
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  last_heartbeat_at: timestamp("last_heartbeat_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  /** [{ storageKey, uploadedAt? }] – Nachweise; FK in Migration 035 */
  vehicle_documents: jsonb("vehicle_documents")
    .$type<{ storageKey: string; uploadedAt?: string }[]>()
    .notNull()
    .default([]),
  rejection_reason: text("rejection_reason").notNull().default(""),
  approval_decided_at: timestamp("approval_decided_at", { withTimezone: true }),
  approval_decided_by_admin_id: text("approval_decided_by_admin_id"),
  next_inspection_date: date("next_inspection_date"),
  is_active: boolean("is_active").notNull().default(false),
  /** draft | pending_approval | approved | rejected | blocked */
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
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").notNull(),
  customer_name: text("customer_name").notNull(),
  passenger_id: text("passenger_id"),
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
  metadata_json: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/** Einfahrgebiete: Substrings in Start-/Zieladresse. */
export const appServiceRegionsTable = pgTable("app_service_regions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  match_terms: jsonb("match_terms").$type<string[]>().notNull().default([]),
  /** substring (Default) | geofence — Geofence-Auswertung folgt. */
  match_mode: text("match_mode").notNull().default("substring"),
  /** Optional: Kreis/Polygon für spätere serverseitige Prüfung (JSON). */
  geo_fence_json: jsonb("geo_fence_json").$type<Record<string, unknown> | null>(),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
