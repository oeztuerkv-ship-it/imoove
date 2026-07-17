import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import {
  securityBanEventsTable,
  securityIpBlocklistTable,
  securityIpWhitelistTable,
} from "./schema";

export type SecurityIpRow = {
  id: string;
  ipCidr: string;
  label: string;
  notes?: string;
  reason?: string;
  createdBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapWhitelist(row: typeof securityIpWhitelistTable.$inferSelect): SecurityIpRow {
  return {
    id: row.id,
    ipCidr: row.ip_cidr,
    label: row.label,
    notes: row.notes,
    createdBy: row.created_by,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBlocklist(row: typeof securityIpBlocklistTable.$inferSelect): SecurityIpRow {
  return {
    id: row.id,
    ipCidr: row.ip_cidr,
    label: row.label,
    reason: row.reason,
    createdBy: row.created_by,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listSecurityWhitelist(): Promise<SecurityIpRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(securityIpWhitelistTable)
    .where(eq(securityIpWhitelistTable.active, true))
    .orderBy(desc(securityIpWhitelistTable.created_at));
  return rows.map(mapWhitelist);
}

export async function listSecurityBlocklist(): Promise<SecurityIpRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(securityIpBlocklistTable)
    .where(eq(securityIpBlocklistTable.active, true))
    .orderBy(desc(securityIpBlocklistTable.created_at));
  return rows.map(mapBlocklist);
}

export async function isIpWhitelisted(ipCidr: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const normalized = ipCidr.trim();
  const rows = await db
    .select({ id: securityIpWhitelistTable.id })
    .from(securityIpWhitelistTable)
    .where(and(eq(securityIpWhitelistTable.active, true), eq(securityIpWhitelistTable.ip_cidr, normalized)))
    .limit(1);
  return rows.length > 0;
}

export async function addSecurityWhitelist(input: {
  ipCidr: string;
  label?: string;
  notes?: string;
  createdBy: string;
}): Promise<SecurityIpRow> {
  if (!isPostgresConfigured()) throw new Error("database_not_configured");
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const now = new Date();
  const id = `sec-wl-${randomUUID()}`;
  const ip = input.ipCidr.trim();
  await db.insert(securityIpWhitelistTable).values({
    id,
    ip_cidr: ip,
    label: (input.label ?? "").trim(),
    notes: (input.notes ?? "").trim(),
    created_by: input.createdBy.trim(),
    active: true,
    created_at: now,
    updated_at: now,
  });
  const rows = await db.select().from(securityIpWhitelistTable).where(eq(securityIpWhitelistTable.id, id)).limit(1);
  return mapWhitelist(rows[0]!);
}

export async function removeSecurityWhitelist(id: string): Promise<{ ipCidr: string } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(securityIpWhitelistTable)
    .where(and(eq(securityIpWhitelistTable.id, id), eq(securityIpWhitelistTable.active, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(securityIpWhitelistTable)
    .set({ active: false, updated_at: new Date() })
    .where(eq(securityIpWhitelistTable.id, id));
  return { ipCidr: row.ip_cidr };
}

export async function addSecurityBlocklist(input: {
  ipCidr: string;
  label?: string;
  reason?: string;
  createdBy: string;
}): Promise<SecurityIpRow> {
  if (!isPostgresConfigured()) throw new Error("database_not_configured");
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const now = new Date();
  const id = `sec-bl-${randomUUID()}`;
  const ip = input.ipCidr.trim();
  await db.insert(securityIpBlocklistTable).values({
    id,
    ip_cidr: ip,
    label: (input.label ?? "").trim(),
    reason: (input.reason ?? "").trim(),
    created_by: input.createdBy.trim(),
    active: true,
    created_at: now,
    updated_at: now,
  });
  const rows = await db.select().from(securityIpBlocklistTable).where(eq(securityIpBlocklistTable.id, id)).limit(1);
  return mapBlocklist(rows[0]!);
}

export async function removeSecurityBlocklist(id: string): Promise<{ ipCidr: string } | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(securityIpBlocklistTable)
    .where(and(eq(securityIpBlocklistTable.id, id), eq(securityIpBlocklistTable.active, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(securityIpBlocklistTable)
    .set({ active: false, updated_at: new Date() })
    .where(eq(securityIpBlocklistTable.id, id));
  return { ipCidr: row.ip_cidr };
}

export async function insertSecurityBanEvent(input: {
  ip: string;
  jail?: string | null;
  action: string;
  source?: string;
  adminUsername: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  await db.insert(securityBanEventsTable).values({
    id: `sec-ev-${randomUUID()}`,
    ip: input.ip.trim(),
    jail: input.jail?.trim() || null,
    action: input.action,
    source: input.source ?? "admin_api",
    admin_username: input.adminUsername.trim(),
    meta: input.meta ?? {},
    created_at: new Date(),
  });
}

export type SecurityBanDailyStat = {
  date: string;
  bans: number;
  unbans: number;
};

export async function getSecurityBanDailyStats(days: number): Promise<SecurityBanDailyStat[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 90);
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE action IN ('ban', 'permanent_ban', 'bulk_ban'))::int AS bans,
      COUNT(*) FILTER (WHERE action IN ('unban', 'bulk_unban'))::int AS unbans
    FROM security_ban_events
    WHERE created_at >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const list = rows.rows as Array<{ day: string; bans: number; unbans: number }>;
  return list.map((r) => ({
    date: String(r.day),
    bans: Number(r.bans ?? 0),
    unbans: Number(r.unbans ?? 0),
  }));
}

export async function syncActiveBlocklistToFail2ban(
  banFn: (ip: string) => Promise<void>,
): Promise<{ applied: number; failed: string[] }> {
  const rows = await listSecurityBlocklist();
  let applied = 0;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      await banFn(row.ipCidr);
      applied += 1;
    } catch {
      failed.push(row.ipCidr);
    }
  }
  return { applied, failed };
}

export async function syncActiveWhitelistToFail2ban(
  applyFn: (ip: string) => Promise<void>,
): Promise<{ applied: number; failed: string[] }> {
  const rows = await listSecurityWhitelist();
  let applied = 0;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      await applyFn(row.ipCidr);
      applied += 1;
    } catch {
      failed.push(row.ipCidr);
    }
  }
  return { applied, failed };
}
