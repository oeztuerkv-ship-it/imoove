import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import { emailVerificationCodesTable } from "./schema";

export async function deleteUnconsumedCodesForEmailPurpose(
  normalizedEmail: string,
  purpose: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  await db
    .delete(emailVerificationCodesTable)
    .where(
      and(
        eq(emailVerificationCodesTable.email, normalizedEmail),
        eq(emailVerificationCodesTable.purpose, purpose),
        isNull(emailVerificationCodesTable.consumed_at),
      ),
    );
}

export async function insertVerificationCode(row: {
  id: string;
  email: string;
  codeHash: string;
  purpose: string;
  expiresAt: Date;
}): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  await db.insert(emailVerificationCodesTable).values({
    id: row.id,
    email: row.email,
    code_hash: row.codeHash,
    purpose: row.purpose,
    expires_at: row.expiresAt,
    attempts: 0,
    consumed_at: null,
  });
}

export async function countSendsInRollingHour(
  normalizedEmail: string,
): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailVerificationCodesTable)
    .where(
      and(eq(emailVerificationCodesTable.email, normalizedEmail), gte(emailVerificationCodesTable.created_at, hourAgo)),
    );
  const n = r[0]?.c;
  return typeof n === "number" ? n : 0;
}

export async function incrementAttempts(id: string): Promise<number | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const updated = await db
    .update(emailVerificationCodesTable)
    .set({ attempts: sql`${emailVerificationCodesTable.attempts} + 1` })
    .where(eq(emailVerificationCodesTable.id, id))
    .returning({ attempts: emailVerificationCodesTable.attempts });
  return updated[0]?.attempts ?? null;
}

/** Aktiv oder abgelaufen, solange noch nicht konsumiert (für Fehlertexte beim Verifizieren). */
export async function getLatestUnconsumedRowAnyExpiry(
  normalizedEmail: string,
  purpose: string,
): Promise<{
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
} | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const rows = await db
    .select({
      id: emailVerificationCodesTable.id,
      code_hash: emailVerificationCodesTable.code_hash,
      attempts: emailVerificationCodesTable.attempts,
      expires_at: emailVerificationCodesTable.expires_at,
      consumed_at: emailVerificationCodesTable.consumed_at,
    })
    .from(emailVerificationCodesTable)
    .where(
      and(
        eq(emailVerificationCodesTable.email, normalizedEmail),
        eq(emailVerificationCodesTable.purpose, purpose),
        isNull(emailVerificationCodesTable.consumed_at),
      ),
    )
    .orderBy(desc(emailVerificationCodesTable.created_at))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteVerificationCodeById(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  await db.delete(emailVerificationCodesTable).where(eq(emailVerificationCodesTable.id, id));
}

export async function markConsumed(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  await db
    .update(emailVerificationCodesTable)
    .set({ consumed_at: new Date() })
    .where(eq(emailVerificationCodesTable.id, id));
}

export async function getLastCreatedAtForEmail(
  normalizedEmail: string,
): Promise<Date | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const rows = await db
    .select({ created_at: emailVerificationCodesTable.created_at })
    .from(emailVerificationCodesTable)
    .where(eq(emailVerificationCodesTable.email, normalizedEmail))
    .orderBy(desc(emailVerificationCodesTable.created_at))
    .limit(1);
  return rows[0]?.created_at ?? null;
}
