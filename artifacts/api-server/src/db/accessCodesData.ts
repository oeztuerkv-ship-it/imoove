import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, lte, gte, or, sql } from "drizzle-orm";
import type { AccessCodeType } from "../domain/rideAuthorization";
import { generateAccessCodePlain, isAccessCodeType, normalizeAccessCodeInput } from "../domain/rideAuthorization";
import { getDb } from "./client";
import { accessCodesTable } from "./schema";

export type RedeemErrorCode =
  | "access_code_invalid"
  | "access_code_inactive"
  | "access_code_not_yet_valid"
  | "access_code_expired"
  | "access_code_exhausted"
  | "access_code_wrong_company";

export type AccessCodeProbeResult =
  | { ok: true; id: string; codeType: string; label: string; companyIdOnCode: string | null; normalized: string }
  | { ok: false; error: RedeemErrorCode };

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
  meta: Record<string, unknown>;
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
  if (row.valid_from && row.valid_from > t) return "access_code_not_yet_valid";
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

export function verifyAccessCodeMemory(
  plain: string,
  bookingCompanyId: string | null,
): AccessCodeProbeResult {
  const normalized = normalizeAccessCodeInput(plain);
  if (!normalized) return { ok: false, error: "access_code_invalid" };
  const row = memByNormalized.get(normalized);
  if (!row) return { ok: false, error: "access_code_invalid" };
  const err = validateMemRow(row, bookingCompanyId);
  if (err) return { ok: false, error: err };
  return {
    ok: true,
    id: row.id,
    codeType: row.code_type,
    label: labelOrDefault(row.label),
    companyIdOnCode: row.company_id,
    normalized,
  };
}

export async function verifyAccessCode(
  plain: string,
  bookingCompanyId: string | null,
): Promise<AccessCodeProbeResult> {
  const normalized = normalizeAccessCodeInput(plain);
  if (!normalized) return { ok: false, error: "access_code_invalid" };
  const db = getDb();
  if (!db) return verifyAccessCodeMemory(plain, bookingCompanyId);
  const tnow = new Date();
  const [probe] = await db
    .select({
      id: accessCodesTable.id,
      code_type: accessCodesTable.code_type,
      label: accessCodesTable.label,
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
  if (probe.valid_from && probe.valid_from > tnow) return { ok: false, error: "access_code_not_yet_valid" };
  if (probe.valid_until && probe.valid_until < tnow) return { ok: false, error: "access_code_expired" };
  if (probe.max_uses != null && probe.uses_count >= probe.max_uses) return { ok: false, error: "access_code_exhausted" };
  if (!isAccessCodeType(probe.code_type)) return { ok: false, error: "access_code_invalid" };
  return {
    ok: true,
    id: probe.id,
    codeType: probe.code_type,
    label: labelOrDefault(probe.label ?? ""),
    companyIdOnCode: probe.company_id ?? null,
    normalized,
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
  if (probe.valid_from && probe.valid_from > tnow) return { ok: false, error: "access_code_not_yet_valid" };
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
  /** Interne Admin-Notiz (Meta.internalNote), nicht an Partner-API ausliefern. */
  internalNote: string | null;
}

function internalNoteFromMeta(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = meta.internalNote;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function rowToAdmin(r: typeof accessCodesTable.$inferSelect): AdminAccessCodeRow {
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
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
    internalNote: internalNoteFromMeta(meta),
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
    internalNote: internalNoteFromMeta(m.meta),
  };
}

/** Partner-Panel: gleiche Struktur ohne interne Notiz. */
export function accessCodeRowForPanel(row: AdminAccessCodeRow): AdminAccessCodeRow {
  return row;
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

/** Nur Codes dieses Mandanten (Partner-Panel). */
export async function listAccessCodesForCompany(companyId: string): Promise<AdminAccessCodeRow[]> {
  const db = getDb();
  if (!db) {
    return [...memByNormalized.values()]
      .filter((m) => m.company_id === companyId)
      .map(memToAdmin);
  }
  const rows = await db.select().from(accessCodesTable).where(eq(accessCodesTable.company_id, companyId));
  return rows.map(rowToAdmin);
}

export async function patchAccessCodeForCompany(
  companyId: string,
  id: string,
  patch: { isActive?: boolean },
): Promise<{ ok: true; item: AdminAccessCodeRow } | { ok: false; error: "not_found" | "no_changes" }> {
  if (patch.isActive === undefined) return { ok: false, error: "no_changes" };
  const db = getDb();
  if (!db) {
    for (const m of memByNormalized.values()) {
      if (m.id === id && m.company_id === companyId) {
        m.is_active = patch.isActive;
        return { ok: true, item: memToAdmin(m) };
      }
    }
    return { ok: false, error: "not_found" };
  }
  const updated = await db
    .update(accessCodesTable)
    .set({ is_active: patch.isActive })
    .where(and(eq(accessCodesTable.id, id), eq(accessCodesTable.company_id, companyId)))
    .returning();
  if (updated.length === 0) return { ok: false, error: "not_found" };
  return { ok: true, item: rowToAdmin(updated[0]!) };
}

export type InsertAccessCodeAdminResult =
  | { ok: true; item: AdminAccessCodeRow; revealedCode?: string }
  | { ok: false; error: string };

/**
 * Neuen Freigabe-Code anlegen (Admin/Panel). `label` erscheint bei Fahrern ohne Klartext-Code.
 * Mit `generate: true` erzeugt der Server einen zufälligen Code; `revealedCode` nur in der Antwort (Klartext), in der DB nur normalisiert.
 */
export async function insertAccessCodeAdmin(body: {
  code?: string;
  /** Wenn true: `code` ignorieren, sicheren Code erzeugen. */
  generate?: boolean;
  codeType: string;
  companyId?: string | null;
  label?: string;
  maxUses?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  /** Nur Plattform-Admin: interner Zweck / Kontext (Meta.internalNote). */
  internalNote?: string | null;
}): Promise<InsertAccessCodeAdminResult> {
  if (!isAccessCodeType(body.codeType)) return { ok: false, error: "code_type_invalid" };

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const rawNote = typeof body.internalNote === "string" ? body.internalNote.trim() : "";
  const internalNoteMeta =
    rawNote.length > 2000 ? rawNote.slice(0, 2000) : rawNote.length > 0 ? rawNote : null;
  const meta: Record<string, unknown> = internalNoteMeta ? { internalNote: internalNoteMeta } : {};
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

  const wantGenerate = body.generate === true;
  let normalized: string;
  let revealedCode: string | undefined;

  if (wantGenerate) {
    const maxAttempts = 12;
    for (let a = 0; a < maxAttempts; a += 1) {
      const plain = generateAccessCodePlain(12);
      const n = normalizeAccessCodeInput(plain);
      const ins = await insertAccessCodeRow({
        normalized: n,
        codeType: body.codeType,
        companyId,
        label,
        maxUses,
        validFrom,
        validUntil,
        meta,
      });
      if (ins.ok === true) {
        return { ok: true, item: ins.item, revealedCode: plain };
      }
      if (ins.error !== "code_duplicate") return ins;
    }
    return { ok: false, error: "code_generate_failed" };
  }

  normalized = normalizeAccessCodeInput(typeof body.code === "string" ? body.code : "");
  if (!normalized) return { ok: false, error: "code_required" };
  const single = await insertAccessCodeRow({
    normalized,
    codeType: body.codeType,
    companyId,
    label,
    maxUses,
    validFrom,
    validUntil,
    meta,
  });
  if (!single.ok) return single;
  return { ok: true, item: single.item };
}

type InsertRowArgs = {
  normalized: string;
  codeType: string;
  companyId: string | null;
  label: string;
  maxUses: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  meta: Record<string, unknown>;
};

async function insertAccessCodeRow(args: InsertRowArgs): Promise<InsertAccessCodeAdminResult> {
  const { normalized, codeType, companyId, label, maxUses, validFrom, validUntil, meta } = args;
  const id = `ac-${randomUUID()}`;
  const vf = validFrom && !Number.isNaN(validFrom.getTime()) ? validFrom : null;
  const vu = validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null;

  const db = getDb();
  if (!db) {
    if (memByNormalized.has(normalized)) return { ok: false, error: "code_duplicate" };
    const m: MemRow = {
      id,
      code_normalized: normalized,
      code_type: codeType as AccessCodeType,
      company_id: companyId,
      label,
      max_uses: maxUses,
      uses_count: 0,
      valid_from: vf,
      valid_until: vu,
      is_active: true,
      meta: { ...meta },
      created_at: new Date(),
    };
    memByNormalized.set(normalized, m);
    return { ok: true, item: memToAdmin(m) };
  }

  try {
    await db.insert(accessCodesTable).values({
      id,
      code_normalized: normalized,
      code_type: codeType,
      company_id: companyId,
      label,
      max_uses: maxUses,
      uses_count: 0,
      valid_from: vf,
      valid_until: vu,
      is_active: true,
      meta: Object.keys(meta).length ? meta : {},
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
