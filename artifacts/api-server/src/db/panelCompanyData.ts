import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable } from "./schema";

/** Öffentliche Firmendaten fürs Partner-Panel (keine internen PRIO-Steuerfelder). */
export interface PanelCompanyPublic {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  isActive: boolean;
}

export type PanelCompanyProfilePatch = Partial<{
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
}>;

const MAX = {
  name: 200,
  line: 500,
  short: 120,
  vat: 64,
} as const;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function rowToPanelPublic(r: typeof adminCompaniesTable.$inferSelect): PanelCompanyPublic {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    vatId: r.vat_id,
    isActive: r.is_active,
  };
}

export async function getPanelCompanyById(companyId: string): Promise<PanelCompanyPublic | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(adminCompaniesTable)
    .where(and(eq(adminCompaniesTable.id, companyId), eq(adminCompaniesTable.is_active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return rowToPanelPublic(r);
}

/**
 * Nur Stammdaten, die das Partner-Panel pflegen darf — keine PRIO-/Aktiv-Flags.
 */
export async function patchPanelCompanyProfile(
  companyId: string,
  patch: PanelCompanyProfilePatch,
): Promise<{ ok: true; company: PanelCompanyPublic } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured" };
  }
  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured" };
  }

  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r0 = rows[0];
  if (!r0 || !r0.is_active) {
    return { ok: false, error: "company_not_found" };
  }

  const keys = Object.keys(patch).filter((k) => patch[k as keyof PanelCompanyProfilePatch] !== undefined);
  if (keys.length === 0) {
    return { ok: false, error: "no_changes" };
  }

  const set: Partial<typeof adminCompaniesTable.$inferInsert> = {};

  if (patch.name !== undefined) {
    const name = clip(patch.name, MAX.name);
    if (!name) {
      return { ok: false, error: "name_required" };
    }
    set.name = name;
  }
  if (patch.contactName !== undefined) {
    set.contact_name = clip(patch.contactName, MAX.short);
  }
  if (patch.email !== undefined) {
    const e = clip(patch.email, MAX.short);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { ok: false, error: "email_invalid" };
    }
    set.email = e;
  }
  if (patch.phone !== undefined) {
    set.phone = clip(patch.phone, MAX.short);
  }
  if (patch.addressLine1 !== undefined) {
    set.address_line1 = clip(patch.addressLine1, MAX.line);
  }
  if (patch.addressLine2 !== undefined) {
    set.address_line2 = clip(patch.addressLine2, MAX.line);
  }
  if (patch.postalCode !== undefined) {
    set.postal_code = clip(patch.postalCode, 32);
  }
  if (patch.city !== undefined) {
    set.city = clip(patch.city, MAX.short);
  }
  if (patch.country !== undefined) {
    set.country = clip(patch.country, MAX.short);
  }
  if (patch.vatId !== undefined) {
    set.vat_id = clip(patch.vatId, MAX.vat);
  }

  if (Object.keys(set).length === 0) {
    return { ok: false, error: "no_changes" };
  }

  await db.update(adminCompaniesTable).set(set).where(eq(adminCompaniesTable.id, companyId));

  const again = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r1 = again[0];
  if (!r1) {
    return { ok: false, error: "company_not_found" };
  }
  return { ok: true, company: rowToPanelPublic(r1) };
}
