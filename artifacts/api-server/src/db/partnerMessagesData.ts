import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { adminCompaniesTable, partnerMessagesTable } from "./schema";

type Row = typeof partnerMessagesTable.$inferSelect;

const PARTNER_MESSAGE_COMPANY_KINDS = ["hotel", "corporate", "voucher_client", "general", "medical"] as const;

export type PartnerMessageDto = {
  id: string;
  companyId: string;
  companyName: string | null;
  subject: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  createdByAdmin: string;
};

function rowToDto(r: Row, companyName: string | null = null): PartnerMessageDto {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName,
    subject: r.subject,
    body: r.body,
    isRead: r.is_read,
    readAt: r.read_at ? r.read_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    createdByAdmin: r.created_by_admin,
  };
}

export async function listPartnerMessageRecipientCompanyIds(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: adminCompaniesTable.id })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.is_active, true),
        eq(adminCompaniesTable.is_blocked, false),
        inArray(adminCompaniesTable.company_kind, [...PARTNER_MESSAGE_COMPANY_KINDS]),
      ),
    );
  return rows.map((r) => r.id);
}

export async function partnerCompanyExistsForMessages(companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const id = companyId.trim();
  if (!id) return false;
  const rows = await db
    .select({ id: adminCompaniesTable.id })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.id, id),
        eq(adminCompaniesTable.is_active, true),
        eq(adminCompaniesTable.is_blocked, false),
        inArray(adminCompaniesTable.company_kind, [...PARTNER_MESSAGE_COMPANY_KINDS]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function insertPartnerMessagesBatch(input: {
  companyIds: string[];
  subject: string;
  body: string;
  createdByAdmin: string;
}): Promise<PartnerMessageDto[]> {
  const db = getDb();
  if (!db || input.companyIds.length === 0) return [];
  const now = new Date();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const createdByAdmin = input.createdByAdmin.trim() || "admin";
  const values = input.companyIds.map((companyId) => ({
    id: randomUUID(),
    company_id: companyId,
    subject,
    body,
    is_read: false,
    read_at: null as Date | null,
    created_at: now,
    created_by_admin: createdByAdmin,
  }));
  await db.insert(partnerMessagesTable).values(values);
  return values.map((v) =>
    rowToDto({
      id: v.id,
      company_id: v.company_id,
      subject: v.subject,
      body: v.body,
      is_read: v.is_read,
      read_at: v.read_at,
      created_at: v.created_at,
      created_by_admin: v.created_by_admin,
    }),
  );
}

export async function listPartnerMessagesForCompany(companyId: string, limit = 100): Promise<PartnerMessageDto[]> {
  const db = getDb();
  if (!db) return [];
  const cid = companyId.trim();
  if (!cid) return [];
  const cap = Math.min(200, Math.max(1, limit));
  const rows = await db
    .select({
      msg: partnerMessagesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(partnerMessagesTable)
    .leftJoin(adminCompaniesTable, eq(partnerMessagesTable.company_id, adminCompaniesTable.id))
    .where(eq(partnerMessagesTable.company_id, cid))
    .orderBy(desc(partnerMessagesTable.created_at))
    .limit(cap);
  return rows.map((r) => rowToDto(r.msg, r.companyName ?? null));
}

export async function countUnreadPartnerMessages(companyId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cid = companyId.trim();
  if (!cid) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(partnerMessagesTable)
    .where(and(eq(partnerMessagesTable.company_id, cid), eq(partnerMessagesTable.is_read, false)));
  return rows[0]?.n ?? 0;
}

export async function markPartnerMessageRead(messageId: string, companyId: string): Promise<PartnerMessageDto | null> {
  const db = getDb();
  if (!db) return null;
  const id = messageId.trim();
  const cid = companyId.trim();
  if (!id || !cid) return null;
  const now = new Date();
  await db
    .update(partnerMessagesTable)
    .set({ is_read: true, read_at: now })
    .where(and(eq(partnerMessagesTable.id, id), eq(partnerMessagesTable.company_id, cid), eq(partnerMessagesTable.is_read, false)));
  const rows = await db
    .select()
    .from(partnerMessagesTable)
    .where(and(eq(partnerMessagesTable.id, id), eq(partnerMessagesTable.company_id, cid)))
    .limit(1);
  return rows[0] ? rowToDto(rows[0]) : null;
}

export async function getPartnerMessageForCompany(
  messageId: string,
  companyId: string,
): Promise<PartnerMessageDto | null> {
  const db = getDb();
  if (!db) return null;
  const id = messageId.trim();
  const cid = companyId.trim();
  if (!id || !cid) return null;
  const rows = await db
    .select()
    .from(partnerMessagesTable)
    .where(and(eq(partnerMessagesTable.id, id), eq(partnerMessagesTable.company_id, cid)))
    .limit(1);
  return rows[0] ? rowToDto(rows[0]) : null;
}

export async function listPartnerMessagesAdmin(limit = 150): Promise<PartnerMessageDto[]> {
  const db = getDb();
  if (!db) return [];
  const cap = Math.min(300, Math.max(1, limit));
  const rows = await db
    .select({
      msg: partnerMessagesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(partnerMessagesTable)
    .leftJoin(adminCompaniesTable, eq(partnerMessagesTable.company_id, adminCompaniesTable.id))
    .orderBy(desc(partnerMessagesTable.created_at))
    .limit(cap);
  return rows.map((r) => rowToDto(r.msg, r.companyName ?? null));
}
