import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, lte, gte, or, sql } from "drizzle-orm";
import type { AccessCodeType } from "../domain/rideAuthorization";
import { isAccessCodeType, normalizeAccessCodeInput } from "../domain/rideAuthorization";
import { getDb } from "./client";
import { accessCodesTable } from "./schema";

export type RedeemErrorCode =
  | "access_code_invalid"
  | "access_code_inactive"
  | "access_code_expired"
  | "access_code_exhausted"
  | "access_code_wrong_company";

type MemRow = {
  id: string;
  code_normalized: string;
  code_type: AccessCodeType;
  company_id: string | null;
  label: string;
  max_uses: number | null;
  uses_count: number;
  valid_from: Date | null;
  valid_until: Date | null;
  is_active: boolean;
  created_at: Date;
};

const memByNormalized = new Map<string, MemRow>();

function labelOrDefault(l: string): string {
  const t = l.trim();
  return t.length > 0 ? t : "Code-Fahrt";
}

/** API-Antworten: Anzeige für Fahrer/Kunde ohne Klartext-Code. */
export async function attachAccessCodeSummariesToRides<T extends { accessCodeId?: string | null }>(
  rides: T[],
): Promise<(T & { accessCodeSummary?: { codeType: string; label: string } | null })[]> {
  const ids = [...new Set(rides.map((r) => r.accessCodeId).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) {
    return rides.map((r) => ({ ...r, accessCodeSummary: undefined }));
  }
  const m = await loadLabelsByIds(ids);
  return rides.map((r) => {
    if (!r.accessCodeId) return { ...r, accessCodeSummary: undefined };
    const s = m.get(r.accessCodeId);
    return { ...r, accessCodeSummary: s ?? null };
  });
}

async function loadLabelsByIds(ids: string[]): Promise<Map<string, { codeType: string; label: string }>> {
  const out = new Map<string, { codeType: string; label: string }>();
  const db = getDb();
  if (!db) {
    for (const row of memByNormalized.values()) {
      if (ids.includes(row.id)) {
        out.set(row.id, { codeType: row.code_type, label: labelOrDefault(row.label) });
      }
    }
    return out;
  }
  const rows = await db
    .select({
      id: accessCodesTable.id,
      code_type: accessCodesTable.code_type,
      label: accessCodesTable.label,
    })
    .from(accessCodesTable)
    .where(inArray(accessCodesTable.id, ids));
  for (const row of rows) {
    out.set(row.id, { codeType: row.code_type, label: labelOrDefault(row.label ?? "") });
  }
  return out;
}

function validateMemRow(row: MemRow, bookingCompanyId: string | null): RedeemErrorCode | null {
  if (!row.is_active) return "access_code_inactive";
  const t = new Date();
  if (row.valid_from && row.valid_from > t) return "access_code_expired";
  if (row.valid_until && row.valid_until < t) return "access_code_expired";
  if (row.max_uses != null && row.uses_count >= row.max_uses) return "access_code_exhausted";
  if (bookingCompanyId && row.company_id && row.company_id !== bookingCompanyId) {
    return "access_code_wrong_company";
  }
  return null;
}

/**
 * In-Memory-Einlösung (ohne Postgres).
 * @returns companyIdOnCode Mandant vom Code (für Kundenbuchung ohne company_id)
 */
export function redeemAccessCodeMemory(
  plain: string,
  bookingCompanyId: string | null,
):
  | { ok: true; id: string; codeType: string; label: string; companyIdOnCode: string | null }
  | { ok: false; error: RedeemErrorCode } {
  const normalized = normalizeAccessCodeInput(plain);
  if (!normalized) return { ok: false, error: "access_code_invalid" };
  const row = memByNormalized.get(normalized);
  if (!row) return { ok: false, error: "access_code_invalid" };
  const err = validateMemRow(row, bookingCompanyId);
  if (err) return { ok: false, error: err };
  row.uses_count += 1;
  return {
    ok: true,
    id: row.id,
    codeType: row.code_type,
    label: labelOrDefault(row.label),
    companyIdOnCode: row.company_id,
  };
}

/** Drizzle-Transaktions-Client (atomare Code-Einlösung). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

/** Atomare Einlösung unter Postgres (UPDATE … RETURNING mit allen Guards). */
export async function redeemAccessCodeInTransaction(
  tx: DbTx,
  normalized: string,
  bookingCompanyId: string | null,
):
  | { ok: true; id: string; codeType: string; label: string; companyIdOnCode: string | null }
  | { ok: false; error: RedeemErrorCode } {
  if (!normalized) return { ok: false, error: "access_code_invalid" };
  const tnow = new Date();

  const whereParts = [
    eq(accessCodesTable.code_normalized, normalized),
    eq(accessCodesTable.is_active, true),
    or(isNull(accessCodesTable.valid_from), lte(accessCodesTable.valid_from, tnow)),
    or(isNull(accessCodesTable.valid_until), gte(accessCodesTable.valid_until, tnow)),
    or(isNull(accessCodesTable.max_uses), lt(accessCodesTable.uses_count, accessCodesTable.max_uses)),
  ];
  if (bookingCompanyId != null && bookingCompanyId !== "") {
    whereParts.push(
      or(isNull(accessCodesTable.company_id), eq(accessCodesTable.company_id, bookingCompanyId)),
    );
  }

  const [row] = await tx
    .update(accessCodesTable)
    .set({ uses_count: sql`${accessCodesTable.uses_count} + 1` })
    .where(and(...whereParts))
    .returning({
      id: accessCodesTable.id,
      code_type: accessCodesTable.code_type,
      label: accessCodesTable.label,
      company_id: accessCodesTable.company_id,
    });

  if (row) {
    if (!isAccessCodeType(row.code_type)) return { ok: false, error: "access_code_invalid" };
    return {
      ok: true,
      id: row.id,
      codeType: row.code_type,
      label: labelOrDefault(row.label ?? ""),
      companyIdOnCode: row.company_id ?? null,
    };
  }

  const [probe] = await tx
    .select({
      id: accessCodesTable.id,
      company_id: accessCodesTable.company_id,
      is_active: accessCodesTable.is_active,
      valid_from: accessCodesTable.valid_from,
      valid_until: accessCodesTable.valid_until,
      max_uses: accessCodesTable.max_uses,
      uses_count: accessCodesTable.uses_count,
    })
    .from(accessCodesTable)
    .where(eq(accessCodesTable.code_normalized, normalized))
    .limit(1);

  if (!probe) return { ok: false, error: "access_code_invalid" };
  if (!probe.is_active) return { ok: false, error: "access_code_inactive" };
  if (
    bookingCompanyId &&
    probe.company_id &&
    probe.company_id !== bookingCompanyId
  ) {
    return { ok: false, error: "access_code_wrong_company" };
  }
  if (probe.valid_from && probe.valid_from > tnow) return { ok: false, error: "access_code_expired" };
  if (probe.valid_until && probe.valid_until < tnow) return { ok: false, error: "access_code_expired" };
  if (probe.max_uses != null && probe.uses_count >= probe.max_uses) return { ok: false, error: "access_code_exhausted" };
  return { ok: false, error: "access_code_exhausted" };
}

export interface AdminAccessCodeRow {
  id: string;
  codeNormalized: string;
  codeType: AccessCodeType;
  companyId: string | null;
  label: string;
  maxUses: number | null;
  usesCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

function rowToAdmin(r: typeof accessCodesTable.$inferSelect): AdminAccessCodeRow {
  return {
    id: r.id,
    codeNormalized: r.code_normalized,
    codeType: (isAccessCodeType(r.code_type) ? r.code_type : "general") as AccessCodeType,
    companyId: r.company_id ?? null,
    label: r.label ?? "",
    maxUses: r.max_uses ?? null,
    usesCount: r.uses_count,
    validFrom: r.valid_from ? new Date(r.valid_from).toISOString() : null,
    validUntil: r.valid_until ? new Date(r.valid_until).toISOString() : null,
    isActive: r.is_active,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function memToAdmin(m: MemRow): AdminAccessCodeRow {
  return {
    id: m.id,
    codeNormalized: m.code_normalized,
    codeType: m.code_type,
    companyId: m.company_id,
    label: m.label,
    maxUses: m.max_uses,
    usesCount: m.uses_count,
    validFrom: m.valid_from ? m.valid_from.toISOString() : null,
    validUntil: m.valid_until ? m.valid_until.toISOString() : null,
    isActive: m.is_active,
    createdAt: m.created_at.toISOString(),
  };
}

export type AccessCodeTraceDbRow = {
  is_active: boolean;
  valid_from: Date | null;
  valid_until: Date | null;
  max_uses: number | null;
  uses_count: number;
};

/** Für Panel-Verlauf: aktueller Stand des Code-Datensatzes (Gültigkeit, Kontingent). */
export async function loadAccessCodesForTraceByIds(ids: string[]): Promise<Map<string, AccessCodeTraceDbRow>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, AccessCodeTraceDbRow>();
  if (uniq.length === 0) return out;
  const db = getDb();
  if (!db) {
    for (const m of memByNormalized.values()) {
      if (uniq.includes(m.id)) {
        out.set(m.id, {
          is_active: m.is_active,
          valid_from: m.valid_from,
          valid_until: m.valid_until,
          max_uses: m.max_uses,
          uses_count: m.uses_count,
        });
      }
    }
    return out;
  }
  const rows = await db
    .select({
      id: accessCodesTable.id,
      is_active: accessCodesTable.is_active,
      valid_from: accessCodesTable.valid_from,
      valid_until: accessCodesTable.valid_until,
      max_uses: accessCodesTable.max_uses,
      uses_count: accessCodesTable.uses_count,
    })
    .from(accessCodesTable)
    .where(inArray(accessCodesTable.id, uniq));
  for (const row of rows) {
    out.set(row.id, {
      is_active: row.is_active,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      max_uses: row.max_uses,
      uses_count: row.uses_count,
    });
  }
  return out;
}

export async function listAccessCodesAdmin(): Promise<AdminAccessCodeRow[]> {
  const db = getDb();
  if (!db) {
    return [...memByNormalized.values()].map(memToAdmin);
  }
  const rows = await db.select().from(accessCodesTable);
  return rows.map(rowToAdmin);
}

/**
 * Neuen Freigabe-Code anlegen (Admin). `label` erscheint bei Fahrern ohne Klartext-Code.
 * `meta` (später erweiterbar via API): z. B. `{ "internalRef": "…", "intendedPassenger": "…" }` nur zur internen Zuordnung.
 */
export async function insertAccessCodeAdmin(body: {
  code: string;
  codeType: string;
  companyId?: string | null;
  label?: string;
  maxUses?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
}): Promise<{ ok: true; item: AdminAccessCodeRow } | { ok: false; error: string }> {
  const normalized = normalizeAccessCodeInput(body.code);
  if (!normalized) return { ok: false, error: "code_required" };
  if (!isAccessCodeType(body.codeType)) return { ok: false, error: "code_type_invalid" };

  const id = `ac-${randomUUID()}`;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const companyId =
    typeof body.companyId === "string" && body.companyId.trim() ? body.companyId.trim() : null;
  const maxUses =
    typeof body.maxUses === "number" && Number.isFinite(body.maxUses) && body.maxUses > 0
      ? Math.floor(body.maxUses)
      : null;
  const validFrom =
    typeof body.validFrom === "string" && body.validFrom.trim()
      ? new Date(body.validFrom.trim())
      : null;
  const validUntil =
    typeof body.validUntil === "string" && body.validUntil.trim()
      ? new Date(body.validUntil.trim())
      : null;
  if (validFrom && Number.isNaN(validFrom.getTime())) return { ok: false, error: "valid_from_invalid" };
  if (validUntil && Number.isNaN(validUntil.getTime())) return { ok: false, error: "valid_until_invalid" };

  const db = getDb();
  if (!db) {
    if (memByNormalized.has(normalized)) return { ok: false, error: "code_duplicate" };
    const m: MemRow = {
      id,
      code_normalized: normalized,
      code_type: body.codeType,
      company_id: companyId,
      label,
      max_uses: maxUses,
      uses_count: 0,
      valid_from: validFrom && !Number.isNaN(validFrom.getTime()) ? validFrom : null,
      valid_until: validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null,
      is_active: true,
      created_at: new Date(),
    };
    memByNormalized.set(normalized, m);
    return { ok: true, item: memToAdmin(m) };
  }

  try {
    await db.insert(accessCodesTable).values({
      id,
      code_normalized: normalized,
      code_type: body.codeType,
      company_id: companyId,
      label,
      max_uses: maxUses,
      uses_count: 0,
      valid_from: validFrom && !Number.isNaN(validFrom.getTime()) ? validFrom : null,
      valid_until: validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null,
      is_active: true,
      meta: {},
    });
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
    if (msg === "23505" || String(e).includes("unique")) return { ok: false, error: "code_duplicate" };
    throw e;
  }

  const [r] = await db.select().from(accessCodesTable).where(eq(accessCodesTable.id, id)).limit(1);
  if (!r) return { ok: false, error: "insert_failed" };
  return { ok: true, item: rowToAdmin(r) };
}
