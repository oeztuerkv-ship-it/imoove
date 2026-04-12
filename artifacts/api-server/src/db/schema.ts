import {
  boolean,
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
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
});
