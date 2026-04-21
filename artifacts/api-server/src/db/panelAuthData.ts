import { and, eq, sql } from "drizzle-orm";
import { normalizeStoredPanelModules } from "../domain/panelModules";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, panelUsersTable } from "./schema";

export interface PanelUserRow {
  id: string;
  company_id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  must_change_password: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Lädt einen aktiven Panel-User inkl. aktivem Unternehmen (nur PostgreSQL, kein RAM-Fallback).
 */
export async function findActivePanelUserByUsername(
  username: string,
): Promise<PanelUserRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;

  const rows = await db
    .select({
      id: panelUsersTable.id,
      company_id: panelUsersTable.company_id,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      password_hash: panelUsersTable.password_hash,
      role: panelUsersTable.role,
      must_change_password: panelUsersTable.must_change_password,
      is_active: panelUsersTable.is_active,
      created_at: panelUsersTable.created_at,
      updated_at: panelUsersTable.updated_at,
    })
    .from(panelUsersTable)
    .innerJoin(adminCompaniesTable, eq(panelUsersTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        sql`lower(${panelUsersTable.username}) = ${normalized}`,
        eq(panelUsersTable.is_active, true),
        eq(adminCompaniesTable.is_active, true),
      ),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    company_id: r.company_id,
    username: r.username,
    email: r.email,
    password_hash: r.password_hash,
    role: r.role,
    must_change_password: r.must_change_password,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Gleiche Semantik wie `findActivePanelUserByUsername`, aber Abgleich über **geschäftliche E-Mail** (trim, lower).
 * Bei mehreren Treffern (seltene Dubletten) `null`, damit kein falscher Mandant gewählt wird.
 */
export async function findActivePanelUserByEmailNormalized(
  email: string,
): Promise<PanelUserRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;

  const rows = await db
    .select({
      id: panelUsersTable.id,
      company_id: panelUsersTable.company_id,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      password_hash: panelUsersTable.password_hash,
      role: panelUsersTable.role,
      must_change_password: panelUsersTable.must_change_password,
      is_active: panelUsersTable.is_active,
      created_at: panelUsersTable.created_at,
      updated_at: panelUsersTable.updated_at,
    })
    .from(panelUsersTable)
    .innerJoin(adminCompaniesTable, eq(panelUsersTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        sql`lower(trim(${panelUsersTable.email})) = ${normalized}`,
        eq(panelUsersTable.is_active, true),
        eq(adminCompaniesTable.is_active, true),
      ),
    )
    .limit(2);

  if (rows.length !== 1) return null;
  const r = rows[0]!;
  return {
    id: r.id,
    company_id: r.company_id,
    username: r.username,
    email: r.email,
    password_hash: r.password_hash,
    role: r.role,
    must_change_password: r.must_change_password,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export interface PanelUserProfileRow {
  id: string;
  companyId: string;
  companyName: string;
  /** Mandanten-Typ (`taxi` = Flotten-Modul möglich). */
  companyKind: "general" | "taxi" | "voucher_client" | "insurer" | "hotel" | "corporate" | "medical";
  username: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Normalisierte Modul-Whitelist; `null` = alle Panel-Module aktiv (Legacy). */
  panelModules: string[] | null;
}

/** Profil inkl. Firmenname für GET /api/panel/v1/me (nur PostgreSQL). */
export async function findActivePanelUserProfileById(id: string): Promise<PanelUserProfileRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: panelUsersTable.id,
      companyId: panelUsersTable.company_id,
      companyName: adminCompaniesTable.name,
      companyKindRaw: adminCompaniesTable.company_kind,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      role: panelUsersTable.role,
      mustChangePassword: panelUsersTable.must_change_password,
      createdAt: panelUsersTable.created_at,
      updatedAt: panelUsersTable.updated_at,
      companyPanelModulesJson: adminCompaniesTable.panel_modules,
    })
    .from(panelUsersTable)
    .innerJoin(adminCompaniesTable, eq(panelUsersTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        eq(panelUsersTable.id, id),
        eq(panelUsersTable.is_active, true),
        eq(adminCompaniesTable.is_active, true),
      ),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    companyId: r.companyId,
    companyName: r.companyName,
    companyKind:
      r.companyKindRaw === "taxi" ||
      r.companyKindRaw === "voucher_client" ||
      r.companyKindRaw === "insurer" ||
      r.companyKindRaw === "hotel" ||
      r.companyKindRaw === "corporate" ||
      r.companyKindRaw === "medical"
        ? r.companyKindRaw
        : "general",
    username: r.username,
    email: r.email,
    role: r.role,
    mustChangePassword: r.mustChangePassword,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    panelModules: normalizeStoredPanelModules(r.companyPanelModulesJson),
  };
}

export async function findActivePanelUserById(id: string): Promise<PanelUserRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: panelUsersTable.id,
      company_id: panelUsersTable.company_id,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      password_hash: panelUsersTable.password_hash,
      role: panelUsersTable.role,
      must_change_password: panelUsersTable.must_change_password,
      is_active: panelUsersTable.is_active,
      created_at: panelUsersTable.created_at,
      updated_at: panelUsersTable.updated_at,
    })
    .from(panelUsersTable)
    .innerJoin(adminCompaniesTable, eq(panelUsersTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        eq(panelUsersTable.id, id),
        eq(panelUsersTable.is_active, true),
        eq(adminCompaniesTable.is_active, true),
      ),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    company_id: r.company_id,
    username: r.username,
    email: r.email,
    password_hash: r.password_hash,
    role: r.role,
    must_change_password: r.must_change_password,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
