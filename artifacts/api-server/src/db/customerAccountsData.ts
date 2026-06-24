import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { customerAccountsTable } from "./schema";
import { normalizeCustomerEmail } from "../lib/emailVerificationCode";

export type CustomerAccountRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  email_verified_at: Date;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: typeof customerAccountsTable.$inferSelect): CustomerAccountRow {
  return {
    id: r.id,
    email: r.email,
    password_hash: r.password_hash,
    name: r.name,
    phone: r.phone,
    email_verified_at: r.email_verified_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function findCustomerAccountByEmail(email: string): Promise<CustomerAccountRow | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const normalizedEmail = normalizeCustomerEmail(email);
  if (!normalizedEmail) return null;
  const rows = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.email, normalizedEmail))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findCustomerAccountById(id: string): Promise<CustomerAccountRow | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const tid = id.trim();
  if (!tid) return null;
  const rows = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, tid))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function insertCustomerAccount(row: {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  emailVerifiedAt: Date;
}): Promise<CustomerAccountRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const now = new Date();
  await db.insert(customerAccountsTable).values({
    id: row.id,
    email: row.email,
    password_hash: row.passwordHash,
    name: row.name,
    phone: row.phone,
    email_verified_at: row.emailVerifiedAt,
    created_at: now,
    updated_at: now,
  });
  const created = await findCustomerAccountById(row.id);
  if (!created) throw new Error("customer_account_insert_failed");
  return created;
}

export type CustomerAccountAdminDto = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string;
  createdAt: string;
};

export async function updateCustomerAccountPassword(
  email: string,
  passwordHash: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const normalizedEmail = normalizeCustomerEmail(email);
  if (!normalizedEmail) return false;
  const now = new Date();
  const rows = await db
    .update(customerAccountsTable)
    .set({ password_hash: passwordHash, updated_at: now })
    .where(eq(customerAccountsTable.email, normalizedEmail))
    .returning({ id: customerAccountsTable.id });
  return rows.length > 0;
}

export async function listCustomerAccountsAdmin(limit = 500): Promise<CustomerAccountAdminDto[]> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const cap = Math.min(Math.max(1, limit), 2000);
  const rows = await db
    .select({
      id: customerAccountsTable.id,
      email: customerAccountsTable.email,
      name: customerAccountsTable.name,
      email_verified_at: customerAccountsTable.email_verified_at,
      created_at: customerAccountsTable.created_at,
    })
    .from(customerAccountsTable)
    .orderBy(desc(customerAccountsTable.created_at))
    .limit(cap);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    emailVerifiedAt: r.email_verified_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  }));
}
