import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable } from "./schema";

/** Öffentliche Firmendaten für das Partner-Panel (keine internen PRIO-Steuerfelder). */
export interface PanelCompanyPublic {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
}

export async function getPanelCompanyById(companyId: string): Promise<PanelCompanyPublic | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: adminCompaniesTable.id,
      name: adminCompaniesTable.name,
      email: adminCompaniesTable.email,
      phone: adminCompaniesTable.phone,
      is_active: adminCompaniesTable.is_active,
    })
    .from(adminCompaniesTable)
    .where(and(eq(adminCompaniesTable.id, companyId), eq(adminCompaniesTable.is_active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    isActive: r.is_active,
  };
}
