import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { appFaqTable } from "./schema";

export type AppFaqCategory = "general" | "payment" | "driver" | "booking" | "account";

const CATEGORIES: ReadonlySet<string> = new Set(["general", "payment", "driver", "booking", "account"]);

export function parseAppFaqCategory(raw: string | null | undefined): AppFaqCategory {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (CATEGORIES.has(s)) return s as AppFaqCategory;
  return "general";
}

type Row = typeof appFaqTable.$inferSelect;

function rowToAdminDto(r: Row) {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    category: parseAppFaqCategory(r.category),
    sortOrder: r.sort_order,
    active: r.active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToPublicDto(r: Row) {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    category: parseAppFaqCategory(r.category),
  };
}

export async function listAppFaqPublic() {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(appFaqTable)
    .where(eq(appFaqTable.active, true))
    .orderBy(asc(appFaqTable.sort_order), asc(appFaqTable.created_at));
  return rows.map(rowToPublicDto);
}

export async function listAppFaqAdmin() {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(appFaqTable)
    .orderBy(asc(appFaqTable.sort_order), asc(appFaqTable.created_at));
  return rows.map(rowToAdminDto);
}

export async function findAppFaqAdmin(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(appFaqTable).where(eq(appFaqTable.id, id)).limit(1);
  return rows[0] ? rowToAdminDto(rows[0]) : null;
}

export async function createAppFaqItem(input: {
  question: string;
  answer: string;
  category: AppFaqCategory;
  sortOrder: number;
  active: boolean;
}) {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const id = randomUUID();
  await db.insert(appFaqTable).values({
    id,
    question: input.question,
    answer: input.answer,
    category: input.category,
    sort_order: input.sortOrder,
    active: input.active,
    created_at: now,
    updated_at: now,
  });
  return findAppFaqAdmin(id);
}

export async function patchAppFaqItem(
  id: string,
  patch: Partial<{
    question: string;
    answer: string;
    category: AppFaqCategory;
    sortOrder: number;
    active: boolean;
  }>,
) {
  const db = getDb();
  if (!db) return null;
  const set: Partial<typeof appFaqTable.$inferInsert> = { updated_at: new Date() };
  if (typeof patch.question === "string") set.question = patch.question;
  if (typeof patch.answer === "string") set.answer = patch.answer;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.sortOrder !== undefined) set.sort_order = patch.sortOrder;
  if (typeof patch.active === "boolean") set.active = patch.active;
  await db.update(appFaqTable).set(set).where(eq(appFaqTable.id, id));
  return findAppFaqAdmin(id);
}

export async function deleteAppFaqItem(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const out = await db.delete(appFaqTable).where(eq(appFaqTable.id, id)).returning({ id: appFaqTable.id });
  return out.length > 0;
}
