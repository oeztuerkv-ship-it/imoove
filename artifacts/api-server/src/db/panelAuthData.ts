import { and, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, panelUsersTable } from "./schema";

export interface PanelUserRow {
  id: string;
  company_id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
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
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export interface PanelUserProfileRow {
  id: string;
  companyId: string;
  companyName: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Profil inkl. Firmenname für GET /panel-auth/me (nur PostgreSQL). */
export async function findActivePanelUserProfileById(id: string): Promise<PanelUserProfileRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: panelUsersTable.id,
      companyId: panelUsersTable.company_id,
      companyName: adminCompaniesTable.name,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      role: panelUsersTable.role,
      createdAt: panelUsersTable.created_at,
      updatedAt: panelUsersTable.updated_at,
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
    username: r.username,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
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
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
