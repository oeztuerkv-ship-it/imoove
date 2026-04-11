import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Fahrten — Spalten snake_case; API mappt auf camelCase (RideRequest). */
export const ridesTable = pgTable("rides", {
  id: text("id").primaryKey(),
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
});

export const adminCompaniesTable = pgTable("admin_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  is_active: boolean("is_active").notNull().default(true),
  is_priority_company: boolean("is_priority_company").notNull().default(false),
  priority_for_live_rides: boolean("priority_for_live_rides").notNull().default(false),
  priority_for_reservations: boolean("priority_for_reservations").notNull().default(false),
  priority_price_threshold: doublePrecision("priority_price_threshold").notNull().default(0),
  priority_timeout_seconds: integer("priority_timeout_seconds").notNull().default(90),
  release_radius_km: doublePrecision("release_radius_km").notNull().default(10),
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
