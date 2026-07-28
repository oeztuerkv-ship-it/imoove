/**
 * Bar-/Karten-Netting-Scope (Phase A+):
 * - Nur Mandanten `company_kind = taxi`
 * - Keine Fahrten mit verknüpfter echter KK-Rechnung (`transport_vouchers.kranken_invoice_id`)
 * - Flat-Medical (Krankenfahrt ohne KK-Rechnung) bleibt im Netting
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { adminCompaniesTable, ridesTable, transportVouchersTable } from "../db/schema";

export const CASH_CARD_NETTING_COMPANY_KIND = "taxi" as const;

export function isCashCardNettingCompanyKind(companyKind: string | null | undefined): boolean {
  return (
    String(companyKind ?? "")
      .trim()
      .toLowerCase() === CASH_CARD_NETTING_COMPANY_KIND
  );
}

/**
 * WHERE-Fragment: Fahrt hat keine verknüpfte KK-Sammelrechnung.
 * Flat-Medical / offene T-Scheine ohne `kranken_invoice_id` bleiben erlaubt.
 */
export function sqlRideNotLinkedToKrankenInvoice(rideIdSql: SQL): SQL {
  return sql`not exists (
    select 1 from transport_vouchers tv
    where tv.ride_id = ${rideIdSql}
      and tv.kranken_invoice_id is not null
      and length(trim(tv.kranken_invoice_id)) > 0
  )`;
}

/**
 * Completed-Fahrten plus Storno/No-Show mit Gebühr (`final_fare > 0`).
 * Storno ohne Fee bleibt draußen.
 */
export function sqlRideInCashCardNettingStatuses(): SQL {
  return sql`(
    ${ridesTable.status} = 'completed'
    OR (
      ${ridesTable.status} IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_driver', 'no_show')
      AND coalesce(${ridesTable.final_fare}, 0) > 0
    )
  )`;
}

/** Mandant muss `company_kind = taxi` sein. */
export function sqlCompanyKindIsTaxi(companyIdSql: SQL): SQL {
  return sql`exists (
    select 1 from admin_companies ac
    where ac.id = ${companyIdSql}
      and lower(trim(ac.company_kind)) = ${CASH_CARD_NETTING_COMPANY_KIND}
  )`;
}

export async function rideHasLinkedKrankenInvoice(rideId: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rid = rideId.trim();
  if (!rid) return false;
  const rows = await db
    .select({ id: transportVouchersTable.id })
    .from(transportVouchersTable)
    .where(
      and(
        eq(transportVouchersTable.ride_id, rid),
        sql`${transportVouchersTable.kranken_invoice_id} is not null`,
        sql`length(trim(${transportVouchersTable.kranken_invoice_id})) > 0`,
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function companyIsCashCardNettingEligible(companyId: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const cid = companyId.trim();
  if (!cid) return false;
  const [row] = await db
    .select({ kind: adminCompaniesTable.company_kind })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  return isCashCardNettingCompanyKind(row?.kind);
}
