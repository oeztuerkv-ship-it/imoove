import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminAuthUsersTable } from "./schema";

export type AdminRole = "admin" | "service";

export type AdminAuthUserRow = {
  id: string;
  username: string;
  passwordHash: string;
  role: AdminRole;
  isActive: boolean;
};

export type AdminAuthUserPublicRow = {
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function parseRole(raw: string): AdminRole | null {
  return raw === "admin" || raw === "service" ? raw : null;
}

export async function findActiveAdminAuthUserByUsername(username: string): Promise<AdminAuthUserRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      passwordHash: adminAuthUsersTable.password_hash,
      role: adminAuthUsersTable.role,
      isActive: adminAuthUsersTable.is_active,
    })
    .from(adminAuthUsersTable)
    .where(
      and(
        sql`lower(${adminAuthUsersTable.username}) = ${normalized}`,
        eq(adminAuthUsersTable.is_active, true),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const role = parseRole(row.role);
  if (!role) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role,
    isActive: row.isActive,
  };
}

export async function upsertAdminAuthUser(input: {
  username: string;
  passwordHash: string;
  role: AdminRole;
}): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  const username = input.username.trim();
  if (!username) return;
  const existingRows = await db
    .select({ id: adminAuthUsersTable.id })
    .from(adminAuthUsersTable)
    .where(sql`lower(${adminAuthUsersTable.username}) = ${username.toLowerCase()}`)
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    await db
      .update(adminAuthUsersTable)
      .set({
        password_hash: input.passwordHash,
        role: input.role,
        is_active: true,
        updated_at: new Date(),
      })
      .where(eq(adminAuthUsersTable.id, existing.id));
    return;
  }
  await db.insert(adminAuthUsersTable).values({
    id: randomUUID(),
    username,
    password_hash: input.passwordHash,
    role: input.role,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

export async function updateAdminAuthPasswordByUsername(input: {
  username: string;
  passwordHash: string;
}): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const username = input.username.trim();
  if (!username) return false;
  const rows = await db
    .update(adminAuthUsersTable)
    .set({
      password_hash: input.passwordHash,
      updated_at: new Date(),
    })
    .where(sql`lower(${adminAuthUsersTable.username}) = ${username.toLowerCase()}`)
    .returning({ id: adminAuthUsersTable.id });
  return rows.length > 0;
}

export async function listAdminAuthUsers(): Promise<AdminAuthUserPublicRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      role: adminAuthUsersTable.role,
      isActive: adminAuthUsersTable.is_active,
      createdAt: adminAuthUsersTable.created_at,
      updatedAt: adminAuthUsersTable.updated_at,
    })
    .from(adminAuthUsersTable)
    .orderBy(sql`lower(${adminAuthUsersTable.username}) asc`);
  return rows
    .map((row) => {
      const role = parseRole(row.role);
      if (!role) return null;
      return {
        id: row.id,
        username: row.username,
        role,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies AdminAuthUserPublicRow;
    })
    .filter((row): row is AdminAuthUserPublicRow => row !== null);
}

export async function createAdminAuthUser(input: {
  username: string;
  passwordHash: string;
  role: AdminRole;
  isActive?: boolean;
}): Promise<AdminAuthUserPublicRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const username = input.username.trim();
  if (!username) return null;
  const createdRows = await db
    .insert(adminAuthUsersTable)
    .values({
      id: randomUUID(),
      username,
      password_hash: input.passwordHash,
      role: input.role,
      is_active: input.isActive ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      role: adminAuthUsersTable.role,
      isActive: adminAuthUsersTable.is_active,
      createdAt: adminAuthUsersTable.created_at,
      updatedAt: adminAuthUsersTable.updated_at,
    });
  const created = createdRows[0];
  if (!created) return null;
  const role = parseRole(created.role);
  if (!role) return null;
  return {
    id: created.id,
    username: created.username,
    role,
    isActive: created.isActive,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function patchAdminAuthUserById(input: {
  id: string;
  role?: AdminRole;
  isActive?: boolean;
  passwordHash?: string;
}): Promise<AdminAuthUserPublicRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const patch: {
    role?: AdminRole;
    is_active?: boolean;
    password_hash?: string;
    updated_at: Date;
  } = { updated_at: new Date() };
  if (typeof input.role === "string") patch.role = input.role;
  if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
  if (typeof input.passwordHash === "string" && input.passwordHash) patch.password_hash = input.passwordHash;
  const rows = await db
    .update(adminAuthUsersTable)
    .set(patch)
    .where(eq(adminAuthUsersTable.id, input.id))
    .returning({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      role: adminAuthUsersTable.role,
      isActive: adminAuthUsersTable.is_active,
      createdAt: adminAuthUsersTable.created_at,
      updatedAt: adminAuthUsersTable.updated_at,
    });
  const row = rows[0];
  if (!row) return null;
  const role = parseRole(row.role);
  if (!role) return null;
  return {
    id: row.id,
    username: row.username,
    role,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
