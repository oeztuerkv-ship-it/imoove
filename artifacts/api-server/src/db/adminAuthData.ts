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
  if (row.role !== "admin" && row.role !== "service") return null;
  return row as AdminAuthUserRow;
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
  const existing = await findActiveAdminAuthUserByUsername(username);
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
