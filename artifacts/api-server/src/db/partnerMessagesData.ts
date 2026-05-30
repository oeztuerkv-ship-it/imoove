import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { adminCompaniesTable, partnerMessagesTable } from "./schema";

type Row = typeof partnerMessagesTable.$inferSelect;

/** Alle DB-`company_kind`-Werte, die als Nachrichten-Empfänger erlaubt sind. */
export const ADMIN_MESSAGE_COMPANY_KINDS = [
  "general",
  "taxi",
  "voucher_client",
  "insurer",
  "hotel",
  "corporate",
  "medical",
] as const;

/** Standard-Broadcast „Alle Partner“ (Posteingang Hotel/Agentur, ohne Taxi/Versicherer). */
export const PARTNER_MESSAGE_DEFAULT_BROADCAST_KINDS = [
  "hotel",
  "corporate",
  "voucher_client",
  "general",
  "medical",
] as const;

export const ADMIN_MESSAGE_KIND_LABELS_DE: Record<(typeof ADMIN_MESSAGE_COMPANY_KINDS)[number], string> = {
  general: "Allgemein",
  taxi: "Taxi / Mietwagen",
  voucher_client: "Gutscheinpartner",
  insurer: "Krankenkasse / Versicherung",
  hotel: "Hotel",
  corporate: "Unternehmen / Firma",
  medical: "Medizinische Fahrt",
};

export type AdminMessageRecipientResolution = {
  mode: "single" | "broadcast";
  companyIds: string[];
  targetLabel: string;
  targetKey: string;
};

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
  batchId?: string | null;
};

export type PartnerMessageRecipientAdmin = {
  id: string;
  companyId: string;
  companyName: string | null;
  companyKind: string | null;
  isRead: boolean;
  readAt: string | null;
};

export type PartnerMessageAdminGroup = {
  groupKey: string;
  batchId: string | null;
  subject: string;
  body: string;
  createdAt: string;
  createdByAdmin: string;
  recipientCount: number;
  readCount: number;
  recipients: PartnerMessageRecipientAdmin[];
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

function isAdminMessageCompanyKind(kind: string): kind is (typeof ADMIN_MESSAGE_COMPANY_KINDS)[number] {
  return (ADMIN_MESSAGE_COMPANY_KINDS as readonly string[]).includes(kind);
}

export async function listPartnerMessageRecipientCompanyIdsByKinds(
  kinds: readonly string[],
): Promise<string[]> {
  const db = getDb();
  if (!db || kinds.length === 0) return [];
  const allowed = kinds.filter(isAdminMessageCompanyKind);
  if (allowed.length === 0) return [];
  const rows = await db
    .select({ id: adminCompaniesTable.id })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.is_active, true),
        eq(adminCompaniesTable.is_blocked, false),
        inArray(adminCompaniesTable.company_kind, allowed),
      ),
    );
  return rows.map((r) => r.id);
}

export async function listPartnerMessageRecipientCompanyIds(): Promise<string[]> {
  return listPartnerMessageRecipientCompanyIdsByKinds([...PARTNER_MESSAGE_DEFAULT_BROADCAST_KINDS]);
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
        inArray(adminCompaniesTable.company_kind, [...ADMIN_MESSAGE_COMPANY_KINDS]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Admin-POST: `alle`, `kind:taxi`, … oder konkrete Mandanten-ID. */
export async function resolveAdminMessageRecipients(
  companyIdRaw: string,
): Promise<AdminMessageRecipientResolution | null> {
  const raw = companyIdRaw.trim();
  const lower = raw.toLowerCase();

  if (lower === "alle" || lower === "all" || raw === "") {
    const companyIds = await listPartnerMessageRecipientCompanyIdsByKinds([
      ...PARTNER_MESSAGE_DEFAULT_BROADCAST_KINDS,
    ]);
    return {
      mode: "broadcast",
      companyIds,
      targetLabel: "Alle Partner (Hotel, Agentur, Medizin, …)",
      targetKey: "alle",
    };
  }

  if (lower.startsWith("kind:")) {
    const kind = raw.slice(5).trim().toLowerCase();
    if (!isAdminMessageCompanyKind(kind)) return null;
    const companyIds = await listPartnerMessageRecipientCompanyIdsByKinds([kind]);
    return {
      mode: "broadcast",
      companyIds,
      targetLabel: ADMIN_MESSAGE_KIND_LABELS_DE[kind],
      targetKey: `kind:${kind}`,
    };
  }

  const ok = await partnerCompanyExistsForMessages(raw);
  if (!ok) return null;
  return {
    mode: "single",
    companyIds: [raw],
    targetLabel: "Einzelnes Unternehmen",
    targetKey: raw,
  };
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
  const batchId = randomUUID();
  const values = input.companyIds.map((companyId) => ({
    id: randomUUID(),
    company_id: companyId,
    batch_id: batchId,
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
      batch_id: v.batch_id,
      subject: v.subject,
      body: v.body,
      is_read: v.is_read,
      read_at: v.read_at,
      created_at: v.created_at,
      created_by_admin: v.created_by_admin,
    }),
  );
}

function adminMessageGroupKey(msg: Row): string {
  const bid = msg.batch_id?.trim();
  if (bid) return `batch:${bid}`;
  const t = msg.created_at.toISOString().slice(0, 19);
  return `legacy:${msg.subject}\n${msg.body}\n${t}\n${msg.created_by_admin}`;
}

function sortRecipientsForAdmin(a: PartnerMessageRecipientAdmin, b: PartnerMessageRecipientAdmin): number {
  if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
  return String(a.companyName || a.companyId).localeCompare(String(b.companyName || b.companyId), "de");
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
  const groups = await listPartnerMessagesAdminGroups(limit);
  return groups.flatMap((g) =>
    g.recipients.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.companyName,
      subject: g.subject,
      body: g.body,
      isRead: r.isRead,
      readAt: r.readAt,
      createdAt: g.createdAt,
      createdByAdmin: g.createdByAdmin,
      batchId: g.batchId,
    })),
  );
}

export async function listPartnerMessagesAdminGroups(groupLimit = 60): Promise<PartnerMessageAdminGroup[]> {
  const db = getDb();
  if (!db) return [];
  const cap = Math.min(120, Math.max(1, groupLimit));
  const rows = await db
    .select({
      msg: partnerMessagesTable,
      companyName: adminCompaniesTable.name,
      companyKind: adminCompaniesTable.company_kind,
    })
    .from(partnerMessagesTable)
    .leftJoin(adminCompaniesTable, eq(partnerMessagesTable.company_id, adminCompaniesTable.id))
    .orderBy(desc(partnerMessagesTable.created_at))
    .limit(500);

  const map = new Map<string, PartnerMessageAdminGroup>();
  for (const row of rows) {
    const msg = row.msg;
    const key = adminMessageGroupKey(msg);
    let group = map.get(key);
    if (!group) {
      group = {
        groupKey: key,
        batchId: msg.batch_id?.trim() || null,
        subject: msg.subject,
        body: msg.body,
        createdAt: msg.created_at.toISOString(),
        createdByAdmin: msg.created_by_admin,
        recipientCount: 0,
        readCount: 0,
        recipients: [],
      };
      map.set(key, group);
    }
    const recipient: PartnerMessageRecipientAdmin = {
      id: msg.id,
      companyId: msg.company_id,
      companyName: row.companyName ?? null,
      companyKind: row.companyKind ?? null,
      isRead: msg.is_read,
      readAt: msg.read_at ? msg.read_at.toISOString() : null,
    };
    group.recipients.push(recipient);
    group.recipientCount += 1;
    if (msg.is_read) group.readCount += 1;
  }

  return [...map.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, cap)
    .map((g) => ({
      ...g,
      recipients: [...g.recipients].sort(sortRecipientsForAdmin),
    }));
}

export async function deletePartnerMessageForCompany(messageId: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const id = messageId.trim();
  const cid = companyId.trim();
  if (!id || !cid) return false;
  const deleted = await db
    .delete(partnerMessagesTable)
    .where(and(eq(partnerMessagesTable.id, id), eq(partnerMessagesTable.company_id, cid)))
    .returning({ id: partnerMessagesTable.id });
  return deleted.length > 0;
}

export async function deletePartnerMessageById(messageId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const id = messageId.trim();
  if (!id) return false;
  const deleted = await db
    .delete(partnerMessagesTable)
    .where(eq(partnerMessagesTable.id, id))
    .returning({ id: partnerMessagesTable.id });
  return deleted.length > 0;
}
