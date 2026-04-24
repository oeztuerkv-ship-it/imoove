import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, supportMessagesTable, supportThreadsTable } from "./schema";

export const SUPPORT_THREAD_STATUSES = ["open", "in_progress", "answered", "closed"] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

export const SUPPORT_CATEGORIES = ["stammdaten", "documents", "billing", "technical", "help", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export type SupportMessageRow = {
  id: string;
  threadId: string;
  senderType: "partner" | "admin";
  senderPanelUserId: string | null;
  senderAdminUserId: string | null;
  body: string;
  attachments: Record<string, unknown>[] | null;
  createdAt: string;
};

export type SupportThreadRow = {
  id: string;
  companyId: string;
  createdByPanelUserId: string;
  category: SupportCategory;
  title: string;
  status: SupportThreadStatus;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportThreadListItemPartner = SupportThreadRow & {
  lastSnippet: string;
};

export type SupportThreadListItemAdmin = SupportThreadListItemPartner & {
  companyName: string;
};

function isSupportThreadStatus(v: string): v is SupportThreadStatus {
  return (SUPPORT_THREAD_STATUSES as readonly string[]).includes(v);
}

function isSupportCategory(v: string): v is SupportCategory {
  return (SUPPORT_CATEGORIES as readonly string[]).includes(v);
}

function mapThread(r: typeof supportThreadsTable.$inferSelect): SupportThreadRow {
  return {
    id: r.id,
    companyId: r.company_id,
    createdByPanelUserId: r.created_by_panel_user_id,
    category: r.category as SupportCategory,
    title: r.title,
    status: isSupportThreadStatus(r.status) ? r.status : "open",
    lastMessageAt: r.last_message_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function mapMessage(r: typeof supportMessagesTable.$inferSelect): SupportMessageRow {
  return {
    id: r.id,
    threadId: r.thread_id,
    senderType: r.sender_type === "admin" ? "admin" : "partner",
    senderPanelUserId: r.sender_panel_user_id ?? null,
    senderAdminUserId: r.sender_admin_user_id ?? null,
    body: r.body,
    attachments: (r.attachments as Record<string, unknown>[] | null) ?? null,
    createdAt: r.created_at.toISOString(),
  };
}

async function lastMessageSnippet(threadId: string): Promise<string> {
  if (!isPostgresConfigured()) return "";
  const db = getDb();
  if (!db) return "";
  const rows = await db
    .select({ body: supportMessagesTable.body })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.thread_id, threadId))
    .orderBy(desc(supportMessagesTable.created_at))
    .limit(1);
  const b = rows[0]?.body ?? "";
  const t = b.trim().replace(/\s+/g, " ");
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

export async function listSupportThreadsForCompany(companyId: string): Promise<SupportThreadListItemPartner[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.company_id, companyId))
    .orderBy(desc(supportThreadsTable.last_message_at));
  const out: SupportThreadListItemPartner[] = [];
  for (const r of rows) {
    const base = mapThread(r);
    out.push({ ...base, lastSnippet: await lastMessageSnippet(r.id) });
  }
  return out;
}

export type SupportThreadsAdminQuery = {
  status?: SupportThreadStatus;
  companyId?: string;
  category?: SupportCategory;
  q?: string;
  limit: number;
  offset: number;
};

export async function countSupportThreadsByStatusForAdmin(): Promise<Record<SupportThreadStatus, number>> {
  const empty: Record<SupportThreadStatus, number> = {
    open: 0,
    in_progress: 0,
    answered: 0,
    closed: 0,
  };
  if (!isPostgresConfigured()) return { ...empty };
  const db = getDb();
  if (!db) return { ...empty };
  const rows = await db
    .select({
      status: supportThreadsTable.status,
      n: count(),
    })
    .from(supportThreadsTable)
    .groupBy(supportThreadsTable.status);
  for (const r of rows) {
    const s = String(r.status ?? "");
    if (isSupportThreadStatus(s)) {
      empty[s] = Number(r.n ?? 0);
    }
  }
  return empty;
}

export async function listSupportThreadsAdmin(q: SupportThreadsAdminQuery): Promise<SupportThreadListItemAdmin[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const conds: SQL[] = [];
  if (q.status) conds.push(eq(supportThreadsTable.status, q.status));
  if (q.companyId?.trim()) conds.push(eq(supportThreadsTable.company_id, q.companyId.trim()));
  if (q.category) conds.push(eq(supportThreadsTable.category, q.category));
  if (q.q?.trim()) {
    const term = `%${q.q.trim().replace(/%/g, "\\%")}%`;
    const searchOr = or(ilike(supportThreadsTable.title, term), ilike(supportThreadsTable.company_id, term));
    if (searchOr) conds.push(searchOr);
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const rows = where
    ? await db
        .select({
          thread: supportThreadsTable,
          companyName: adminCompaniesTable.name,
        })
        .from(supportThreadsTable)
        .innerJoin(adminCompaniesTable, eq(adminCompaniesTable.id, supportThreadsTable.company_id))
        .where(where)
        .orderBy(desc(supportThreadsTable.last_message_at))
        .limit(q.limit)
        .offset(q.offset)
    : await db
        .select({
          thread: supportThreadsTable,
          companyName: adminCompaniesTable.name,
        })
        .from(supportThreadsTable)
        .innerJoin(adminCompaniesTable, eq(adminCompaniesTable.id, supportThreadsTable.company_id))
        .orderBy(desc(supportThreadsTable.last_message_at))
        .limit(q.limit)
        .offset(q.offset);
  const out: SupportThreadListItemAdmin[] = [];
  for (const { thread: r, companyName } of rows) {
    const base = mapThread(r);
    out.push({
      ...base,
      companyName: companyName ?? "",
      lastSnippet: await lastMessageSnippet(r.id),
    });
  }
  return out;
}

export async function getSupportThreadForCompany(
  threadId: string,
  companyId: string,
): Promise<{ thread: SupportThreadRow; messages: SupportMessageRow[] } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const trows = await db
    .select()
    .from(supportThreadsTable)
    .where(and(eq(supportThreadsTable.id, threadId), eq(supportThreadsTable.company_id, companyId)))
    .limit(1);
  const tr = trows[0];
  if (!tr) return null;
  const mrows = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.thread_id, threadId))
    .orderBy(supportMessagesTable.created_at);
  return { thread: mapThread(tr), messages: mrows.map(mapMessage) };
}

export async function getSupportThreadAdmin(
  threadId: string,
): Promise<{ thread: SupportThreadRow; messages: SupportMessageRow[]; companyName: string } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const joined = await db
    .select({
      thread: supportThreadsTable,
      companyName: adminCompaniesTable.name,
    })
    .from(supportThreadsTable)
    .innerJoin(adminCompaniesTable, eq(adminCompaniesTable.id, supportThreadsTable.company_id))
    .where(eq(supportThreadsTable.id, threadId))
    .limit(1);
  const j = joined[0];
  if (!j) return null;
  const mrows = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.thread_id, threadId))
    .orderBy(supportMessagesTable.created_at);
  return {
    thread: mapThread(j.thread),
    messages: mrows.map(mapMessage),
    companyName: j.companyName ?? "",
  };
}

export async function insertSupportThreadWithFirstMessage(input: {
  threadId: string;
  messageId: string;
  companyId: string;
  createdByPanelUserId: string;
  category: SupportCategory;
  title: string;
  body: string;
}): Promise<{ thread: SupportThreadRow; message: SupportMessageRow } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  try {
    return await db.transaction(async (tx) => {
      const [tr] = await tx
        .insert(supportThreadsTable)
        .values({
          id: input.threadId,
          company_id: input.companyId,
          created_by_panel_user_id: input.createdByPanelUserId,
          category: input.category,
          title: input.title,
          status: "open",
          last_message_at: now,
          created_at: now,
          updated_at: now,
        })
        .returning();
      if (!tr) return null;
      const [mr] = await tx
        .insert(supportMessagesTable)
        .values({
          id: input.messageId,
          thread_id: input.threadId,
          sender_type: "partner",
          sender_panel_user_id: input.createdByPanelUserId,
          sender_admin_user_id: null,
          body: input.body,
          attachments: null,
          created_at: now,
        })
        .returning();
      if (!mr) return null;
      return { thread: mapThread(tr), message: mapMessage(mr) };
    });
  } catch {
    return null;
  }
}

/** Partner-Nachricht; bei Status `answered` → Thread wieder `open`. */
export async function insertPartnerSupportMessage(input: {
  messageId: string;
  threadId: string;
  companyId: string;
  panelUserId: string;
  body: string;
}): Promise<
  | { ok: true; message: SupportMessageRow; threadStatus: SupportThreadStatus }
  | { ok: false; error: "not_found" | "closed" }
> {
  if (!isPostgresConfigured()) return { ok: false, error: "not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "not_found" };
  try {
    return await db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(supportThreadsTable)
        .where(and(eq(supportThreadsTable.id, input.threadId), eq(supportThreadsTable.company_id, input.companyId)))
        .limit(1);
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status === "closed") return { ok: false, error: "closed" };
      let nextStatus: SupportThreadStatus = cur.status as SupportThreadStatus;
      if (cur.status === "answered") nextStatus = "open";
      const now = new Date();
      const [mr] = await tx
        .insert(supportMessagesTable)
        .values({
          id: input.messageId,
          thread_id: input.threadId,
          sender_type: "partner",
          sender_panel_user_id: input.panelUserId,
          sender_admin_user_id: null,
          body: input.body,
          attachments: null,
          created_at: now,
        })
        .returning();
      if (!mr) return { ok: false, error: "not_found" };
      await tx
        .update(supportThreadsTable)
        .set({
          status: nextStatus,
          last_message_at: now,
          updated_at: now,
        })
        .where(eq(supportThreadsTable.id, input.threadId));
      return { ok: true, message: mapMessage(mr), threadStatus: nextStatus };
    });
  } catch {
    return { ok: false, error: "not_found" };
  }
}

/** Admin-Antwort; setzt Status mindestens auf `answered` (außer Thread war `closed` → Fehler). */
export async function insertAdminSupportMessage(input: {
  messageId: string;
  threadId: string;
  body: string;
  senderAdminUserId: string | null;
}): Promise<
  | { ok: true; message: SupportMessageRow; threadStatus: SupportThreadStatus }
  | { ok: false; error: "not_found" | "closed" }
> {
  if (!isPostgresConfigured()) return { ok: false, error: "not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "not_found" };
  try {
    return await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, input.threadId)).limit(1);
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status === "closed") return { ok: false, error: "closed" };
      const nextStatus: SupportThreadStatus = "answered";
      const now = new Date();
      const [mr] = await tx
        .insert(supportMessagesTable)
        .values({
          id: input.messageId,
          thread_id: input.threadId,
          sender_type: "admin",
          sender_panel_user_id: null,
          sender_admin_user_id: input.senderAdminUserId,
          body: input.body,
          attachments: null,
          created_at: now,
        })
        .returning();
      if (!mr) return { ok: false, error: "not_found" };
      await tx
        .update(supportThreadsTable)
        .set({
          status: nextStatus,
          last_message_at: now,
          updated_at: now,
        })
        .where(eq(supportThreadsTable.id, input.threadId));
      return { ok: true, message: mapMessage(mr), threadStatus: nextStatus };
    });
  } catch {
    return { ok: false, error: "not_found" };
  }
}

export async function patchSupportThreadStatusAdmin(input: {
  threadId: string;
  status: SupportThreadStatus;
}): Promise<SupportThreadRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  if (!isSupportThreadStatus(input.status)) return null;
  const now = new Date();
  const rows = await db
    .update(supportThreadsTable)
    .set({ status: input.status, updated_at: now })
    .where(eq(supportThreadsTable.id, input.threadId))
    .returning();
  const r = rows[0];
  return r ? mapThread(r) : null;
}

export function parseSupportCategory(raw: unknown): SupportCategory | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return isSupportCategory(s) ? s : null;
}

export function parseSupportThreadStatus(raw: unknown): SupportThreadStatus | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return isSupportThreadStatus(s) ? s : null;
}
