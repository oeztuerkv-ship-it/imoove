import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { panelUsersTable } from "./schema";

export interface PanelUserPublicRow {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toPublic(r: {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): PanelUserPublicRow {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listPanelUsersInCompany(companyId: string): Promise<PanelUserPublicRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: panelUsersTable.id,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      role: panelUsersTable.role,
      is_active: panelUsersTable.is_active,
      created_at: panelUsersTable.created_at,
      updated_at: panelUsersTable.updated_at,
    })
    .from(panelUsersTable)
    .where(eq(panelUsersTable.company_id, companyId))
    .orderBy(panelUsersTable.username);
  return rows.map(toPublic);
}

export async function getPanelUsernamesInCompany(
  companyId: string,
  ids: string[],
): Promise<Record<string, string>> {
  if (!isPostgresConfigured() || ids.length === 0) return {};
  const db = getDb();
  if (!db) return {};
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const rows = await db
    .select({ id: panelUsersTable.id, username: panelUsersTable.username })
    .from(panelUsersTable)
    .where(and(eq(panelUsersTable.company_id, companyId), inArray(panelUsersTable.id, uniq)));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.username;
  return out;
}

export async function findPanelUserInCompany(
  id: string,
  companyId: string,
): Promise<{ id: string; company_id: string; username: string; role: string; is_active: boolean } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: panelUsersTable.id,
      company_id: panelUsersTable.company_id,
      username: panelUsersTable.username,
      role: panelUsersTable.role,
      is_active: panelUsersTable.is_active,
    })
    .from(panelUsersTable)
    .where(and(eq(panelUsersTable.id, id), eq(panelUsersTable.company_id, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertPanelUser(input: {
  companyId: string;
  username: string;
  email: string;
  role: string;
  passwordHash: string;
}): Promise<{ id: string } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const id = randomUUID();
  const username = input.username.trim();
  const email = input.email.trim();
  try {
    await db.insert(panelUsersTable).values({
      id,
      company_id: input.companyId,
      username,
      email,
      password_hash: input.passwordHash,
      role: input.role,
      is_active: true,
    });
    return { id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return null;
    }
    throw e;
  }
}

export async function patchPanelUserInCompany(
  id: string,
  companyId: string,
  patch: { isActive?: boolean; role?: string; email?: string; username?: string },
): Promise<PanelUserPublicRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const sets: Partial<typeof panelUsersTable.$inferInsert> = {
    updated_at: new Date(),
  };
  if (typeof patch.isActive === "boolean") {
    sets.is_active = patch.isActive;
  }
  if (typeof patch.role === "string" && patch.role.length > 0) {
    sets.role = patch.role;
  }
  if (typeof patch.email === "string") {
    sets.email = patch.email.trim();
  }
  if (typeof patch.username === "string") {
    sets.username = patch.username.trim();
  }
  const rows = await db
    .update(panelUsersTable)
    .set(sets)
    .where(and(eq(panelUsersTable.id, id), eq(panelUsersTable.company_id, companyId)))
    .returning({
      id: panelUsersTable.id,
      username: panelUsersTable.username,
      email: panelUsersTable.email,
      role: panelUsersTable.role,
      is_active: panelUsersTable.is_active,
      created_at: panelUsersTable.created_at,
      updated_at: panelUsersTable.updated_at,
    });
  const r = rows[0];
  return r ? toPublic(r) : null;
}

/** Nur entfernen, wenn bereits deaktiviert — verhindert versehentliches Löschen aktiver Zugänge. */
export async function deleteInactivePanelUserInCompany(id: string, companyId: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .delete(panelUsersTable)
    .where(
      and(
        eq(panelUsersTable.id, id),
        eq(panelUsersTable.company_id, companyId),
        eq(panelUsersTable.is_active, false),
      ),
    )
    .returning({ id: panelUsersTable.id });
  return rows.length > 0;
}

export async function updatePanelUserPasswordInCompany(
  id: string,
  companyId: string,
  passwordHash: string,
): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .update(panelUsersTable)
    .set({ password_hash: passwordHash, updated_at: new Date() })
    .where(and(eq(panelUsersTable.id, id), eq(panelUsersTable.company_id, companyId)))
    .returning({ id: panelUsersTable.id });
  return rows.length > 0;
}

/** Global eindeutiger Login-Name (`panel_users_username_lower`). */
export async function panelUsernameTaken(normalized: string, excludeUserId?: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const n = normalized.trim().toLowerCase();
  if (!n) return false;
  const rows = await db
    .select({ id: panelUsersTable.id })
    .from(panelUsersTable)
    .where(
      excludeUserId
        ? and(sql`lower(${panelUsersTable.username}) = ${n}`, ne(panelUsersTable.id, excludeUserId))
        : sql`lower(${panelUsersTable.username}) = ${n}`,
    )
    .limit(1);
  return rows.length > 0;
}
