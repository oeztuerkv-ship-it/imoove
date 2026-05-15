import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "./client";
import { appHelpTicketsTable } from "./schema";

export const APP_HELP_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type AppHelpTicketStatus = (typeof APP_HELP_TICKET_STATUSES)[number];

export const APP_HELP_CATEGORIES = ["booking", "account", "payment", "app_issue", "other"] as const;
export type AppHelpCategory = (typeof APP_HELP_CATEGORIES)[number];

function isStatus(v: string): v is AppHelpTicketStatus {
  return (APP_HELP_TICKET_STATUSES as readonly string[]).includes(v);
}

export function parseAppHelpCategory(raw: string): AppHelpCategory {
  const v = raw.trim().toLowerCase();
  return (APP_HELP_CATEGORIES as readonly string[]).includes(v) ? (v as AppHelpCategory) : "other";
}

export type AppHelpTicketRow = {
  id: string;
  passengerId: string;
  passengerName: string | null;
  passengerEmail: string;
  passengerPhone: string | null;
  category: AppHelpCategory;
  subject: string | null;
  message: string;
  status: AppHelpTicketStatus;
  internalNote: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: typeof appHelpTicketsTable.$inferSelect): AppHelpTicketRow {
  return {
    id: r.id,
    passengerId: r.passenger_id,
    passengerName: r.passenger_name,
    passengerEmail: r.passenger_email,
    passengerPhone: r.passenger_phone,
    category: parseAppHelpCategory(r.category),
    subject: r.subject,
    message: r.message,
    status: isStatus(r.status) ? r.status : "open",
    internalNote: r.internal_note,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function createAppHelpTicket(input: {
  passengerId: string;
  passengerName: string | null;
  passengerEmail: string;
  passengerPhone: string | null;
  category: AppHelpCategory;
  subject: string | null;
  message: string;
  source?: string;
}): Promise<AppHelpTicketRow | null> {
  const db = getDb();
  if (!db) return null;

  const id = `aht-${randomUUID()}`;
  const now = new Date();
  const msg = input.message.trim().slice(0, 8000);
  if (msg.length < 5) return null;

  await db.insert(appHelpTicketsTable).values({
    id,
    passenger_id: input.passengerId.trim(),
    passenger_name: input.passengerName?.trim() ? input.passengerName.trim().slice(0, 200) : null,
    passenger_email: input.passengerEmail.trim().slice(0, 320),
    passenger_phone: input.passengerPhone?.trim() ? input.passengerPhone.trim().slice(0, 64) : null,
    category: input.category,
    subject: input.subject?.trim() ? input.subject.trim().slice(0, 200) : null,
    message: msg,
    status: "open",
    internal_note: null,
    source: input.source?.trim() || "mobile_help",
    created_at: now,
    updated_at: now,
  });

  const [row] = await db.select().from(appHelpTicketsTable).where(eq(appHelpTicketsTable.id, id)).limit(1);
  return row ? mapRow(row) : null;
}

export async function getAppHelpTicketAdmin(id: string): Promise<AppHelpTicketRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(appHelpTicketsTable).where(eq(appHelpTicketsTable.id, id)).limit(1);
  return row ? mapRow(row) : null;
}

export async function updateAppHelpTicketAdmin(
  id: string,
  input: { status?: AppHelpTicketStatus; internalNote?: string | null },
): Promise<AppHelpTicketRow | null> {
  const db = getDb();
  if (!db) return null;
  const [cur] = await db.select().from(appHelpTicketsTable).where(eq(appHelpTicketsTable.id, id)).limit(1);
  if (!cur) return null;

  const set: Partial<typeof appHelpTicketsTable.$inferInsert> = { updated_at: new Date() };
  if (input.status && isStatus(input.status)) set.status = input.status;
  if (Object.prototype.hasOwnProperty.call(input, "internalNote")) {
    set.internal_note =
      input.internalNote == null
        ? null
        : String(input.internalNote).trim().length === 0
          ? null
          : String(input.internalNote).trim().slice(0, 8000);
  }
  await db.update(appHelpTicketsTable).set(set).where(eq(appHelpTicketsTable.id, id));
  return getAppHelpTicketAdmin(id);
}

export async function listAppHelpTicketsAdminPage(input: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}): Promise<{ total: number; items: AppHelpTicketRow[] }> {
  const db = getDb();
  if (!db) return { total: 0, items: [] };

  const whereParts: SQL[] = [];
  if (input.status && isStatus(input.status)) {
    whereParts.push(eq(appHelpTicketsTable.status, input.status));
  }
  const q = input.q?.trim();
  if (q) {
    const p = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    whereParts.push(
      or(
        ilike(appHelpTicketsTable.id, p),
        ilike(appHelpTicketsTable.passenger_id, p),
        ilike(appHelpTicketsTable.passenger_email, p),
        ilike(appHelpTicketsTable.message, p),
        ilike(appHelpTicketsTable.subject, p),
      )!,
    );
  }
  const w = whereParts.length > 0 ? and(...whereParts) : undefined;

  const [countRow] = await db.select({ n: count() }).from(appHelpTicketsTable).where(w);
  const total = Number(countRow?.n ?? 0);
  if (total === 0) return { total: 0, items: [] };

  const offset = (input.page - 1) * input.pageSize;
  const rows = await db
    .select()
    .from(appHelpTicketsTable)
    .where(w)
    .orderBy(desc(appHelpTicketsTable.created_at))
    .limit(input.pageSize)
    .offset(offset);

  return { total, items: rows.map(mapRow) };
}
