import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminAuthAuditLogTable, adminAuthPasswordResetsTable, adminAuthUsersTable } from "./schema";

export type AdminRole = "admin" | "service";

export type AdminAuthUserRow = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  sessionVersion: number;
  isActive: boolean;
};

export type AdminAuthUserPublicRow = {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminAuthPasswordResetRow = {
  id: string;
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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
      email: adminAuthUsersTable.email,
      passwordHash: adminAuthUsersTable.password_hash,
      role: adminAuthUsersTable.role,
      sessionVersion: adminAuthUsersTable.session_version,
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
    email: row.email,
    passwordHash: row.passwordHash,
    role,
    sessionVersion: row.sessionVersion,
    isActive: row.isActive,
  };
}

export async function findActiveAdminAuthUserByIdentity(identity: string): Promise<AdminAuthUserRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const normalized = identity.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      email: adminAuthUsersTable.email,
      passwordHash: adminAuthUsersTable.password_hash,
      role: adminAuthUsersTable.role,
      sessionVersion: adminAuthUsersTable.session_version,
      isActive: adminAuthUsersTable.is_active,
    })
    .from(adminAuthUsersTable)
    .where(
      and(
        eq(adminAuthUsersTable.is_active, true),
        sql`(lower(${adminAuthUsersTable.username}) = ${normalized} OR lower(${adminAuthUsersTable.email}) = ${normalized})`,
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
    email: row.email,
    passwordHash: row.passwordHash,
    role,
    sessionVersion: row.sessionVersion,
    isActive: row.isActive,
  };
}

export async function upsertAdminAuthUser(input: {
  username: string;
  email?: string;
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
        email: (input.email ?? "").trim(),
        role: input.role,
        session_version: sql`${adminAuthUsersTable.session_version}`,
        is_active: true,
        updated_at: new Date(),
      })
      .where(eq(adminAuthUsersTable.id, existing.id));
    return;
  }
  await db.insert(adminAuthUsersTable).values({
    id: randomUUID(),
    username,
    email: (input.email ?? "").trim(),
    password_hash: input.passwordHash,
    role: input.role,
    session_version: 1,
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
      session_version: sql`${adminAuthUsersTable.session_version} + 1`,
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
      email: adminAuthUsersTable.email,
      role: adminAuthUsersTable.role,
      sessionVersion: adminAuthUsersTable.session_version,
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
        email: row.email,
        role,
        sessionVersion: row.sessionVersion,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies AdminAuthUserPublicRow;
    })
    .filter((row): row is AdminAuthUserPublicRow => row !== null);
}

export async function createAdminAuthUser(input: {
  username: string;
  email?: string;
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
      email: (input.email ?? "").trim(),
      password_hash: input.passwordHash,
      role: input.role,
      session_version: 1,
      is_active: input.isActive ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      email: adminAuthUsersTable.email,
      role: adminAuthUsersTable.role,
      sessionVersion: adminAuthUsersTable.session_version,
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
    email: created.email,
    role,
    sessionVersion: created.sessionVersion,
    isActive: created.isActive,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function findAdminAuthUserRowById(id: string): Promise<{
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
} | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      role: adminAuthUsersTable.role,
      isActive: adminAuthUsersTable.is_active,
    })
    .from(adminAuthUsersTable)
    .where(eq(adminAuthUsersTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const role = parseRole(row.role);
  if (!role) return null;
  return { id: row.id, username: row.username, role, isActive: row.isActive };
}

export async function countActiveAdminRoleUsers(): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(adminAuthUsersTable)
    .where(and(eq(adminAuthUsersTable.role, "admin"), eq(adminAuthUsersTable.is_active, true)));
  const raw = rows[0]?.n;
  return typeof raw === "number" ? raw : Number(raw) || 0;
}

export async function deleteAdminAuthUserById(id: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const deleted = await db
    .delete(adminAuthUsersTable)
    .where(eq(adminAuthUsersTable.id, id))
    .returning({ id: adminAuthUsersTable.id });
  return deleted.length > 0;
}

export async function patchAdminAuthUserById(input: {
  id: string;
  email?: string;
  role?: AdminRole;
  isActive?: boolean;
  passwordHash?: string;
}): Promise<AdminAuthUserPublicRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const patch: {
    role?: AdminRole;
    email?: string;
    is_active?: boolean;
    password_hash?: string;
    session_version?: unknown;
    updated_at: Date;
  } = { updated_at: new Date() };
  if (typeof input.role === "string") patch.role = input.role;
  if (typeof input.email === "string") patch.email = input.email.trim();
  if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
  if (typeof input.passwordHash === "string" && input.passwordHash) {
    patch.password_hash = input.passwordHash;
    patch.session_version = sql`${adminAuthUsersTable.session_version} + 1`;
  }
  const rows = await db
    .update(adminAuthUsersTable)
    .set(patch)
    .where(eq(adminAuthUsersTable.id, input.id))
    .returning({
      id: adminAuthUsersTable.id,
      username: adminAuthUsersTable.username,
      email: adminAuthUsersTable.email,
      role: adminAuthUsersTable.role,
      sessionVersion: adminAuthUsersTable.session_version,
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
    email: row.email,
    role,
    sessionVersion: row.sessionVersion,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createAdminPasswordResetToken(input: {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<AdminAuthPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .insert(adminAuthPasswordResetsTable)
    .values({
      id: randomUUID(),
      admin_user_id: input.adminUserId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      created_at: new Date(),
    })
    .returning({
      id: adminAuthPasswordResetsTable.id,
      adminUserId: adminAuthPasswordResetsTable.admin_user_id,
      tokenHash: adminAuthPasswordResetsTable.token_hash,
      expiresAt: adminAuthPasswordResetsTable.expires_at,
      usedAt: adminAuthPasswordResetsTable.used_at,
      createdAt: adminAuthPasswordResetsTable.created_at,
    });
  return rows[0] ?? null;
}

export async function findUsableAdminPasswordResetByTokenHash(tokenHash: string): Promise<AdminAuthPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: adminAuthPasswordResetsTable.id,
      adminUserId: adminAuthPasswordResetsTable.admin_user_id,
      tokenHash: adminAuthPasswordResetsTable.token_hash,
      expiresAt: adminAuthPasswordResetsTable.expires_at,
      usedAt: adminAuthPasswordResetsTable.used_at,
      createdAt: adminAuthPasswordResetsTable.created_at,
    })
    .from(adminAuthPasswordResetsTable)
    .where(eq(adminAuthPasswordResetsTable.token_hash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function markAdminPasswordResetUsed(id: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  await db
    .update(adminAuthPasswordResetsTable)
    .set({ used_at: new Date() })
    .where(eq(adminAuthPasswordResetsTable.id, id));
}

export async function insertAdminAuthAuditLog(input: {
  adminUserId?: string | null;
  username?: string;
  action: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  await db.insert(adminAuthAuditLogTable).values({
    id: randomUUID(),
    admin_user_id: input.adminUserId ?? null,
    username: (input.username ?? "").trim(),
    action: input.action,
    meta: input.meta ?? {},
    created_at: new Date(),
  });
}
