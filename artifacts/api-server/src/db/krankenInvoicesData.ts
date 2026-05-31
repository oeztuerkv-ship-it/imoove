import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { getAdminCompanyCommissionRate, findCompanyById, type CompanyRow } from "./adminData.js";
import { getDb, isPostgresConfigured } from "./client.js";
import { findLatestMedicalCaseByRideId } from "./medicalCasesData.js";
import { calculateMedicalBillingReadiness } from "../lib/medicalBillingReadiness.js";
import { roundMoneyEur } from "../lib/invoice/partnerInvoicePdf.js";
import {
  adminCompaniesTable,
  krankenInvoiceSequencesTable,
  krankenInvoicesTable,
  ridesTable,
  transportVouchersTable,
} from "./schema.js";

export type TransportVoucherRow = {
  id: string;
  rideId: string;
  companyId: string;
  patientName: string;
  insurerName: string;
  insurerIk: string;
  insurerEmail: string;
  fareAmount: number;
  commissionAmount: number;
  netAmount: number;
  commissionRateSnap: number;
  status: string;
  krankenInvoiceId: string | null;
  billedAt: string | null;
  paidAt: string | null;
  rideReferenceAt: string | null;
  createdAt: string;
  updatedAt: string;
  rideFromFull?: string;
  rideToFull?: string;
  distanceKm?: number | null;
};

export type KrankenInvoiceRow = {
  id: string;
  companyId: string;
  companyName?: string;
  insurerName: string;
  insurerIk: string;
  insurerEmail: string;
  invoiceNumber: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: number;
  commissionAmount: number;
  netAmount: number;
  commissionRateSnap: number;
  status: string;
  sentAt: string | null;
  sentTo: string;
  paidAt: string | null;
  pdfStorageKey: string;
  rideCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InsurerBillingContact = {
  insurerName: string;
  insurerIk: string;
  email: string;
};

function normalizeIk(ik: string): string {
  return ik.replace(/\D/g, "").slice(0, 9);
}

function parseDateOnly(s: string): Date | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapVoucherRow(
  r: typeof transportVouchersTable.$inferSelect,
  extra?: { rideFromFull?: string; rideToFull?: string; distanceKm?: number | null },
): TransportVoucherRow {
  return {
    id: r.id,
    rideId: r.ride_id,
    companyId: r.company_id,
    patientName: r.patient_name ?? "",
    insurerName: r.insurer_name ?? "",
    insurerIk: r.insurer_ik ?? "",
    insurerEmail: r.insurer_email ?? "",
    fareAmount: r.fare_amount ?? 0,
    commissionAmount: r.commission_amount ?? 0,
    netAmount: r.net_amount ?? 0,
    commissionRateSnap: r.commission_rate_snap ?? 0,
    status: r.status ?? "open",
    krankenInvoiceId: r.kranken_invoice_id ?? null,
    billedAt: r.billed_at?.toISOString() ?? null,
    paidAt: r.paid_at?.toISOString() ?? null,
    rideReferenceAt: r.ride_reference_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    ...extra,
  };
}

function mapInvoiceRow(
  r: typeof krankenInvoicesTable.$inferSelect,
  companyName?: string,
): KrankenInvoiceRow {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName,
    insurerName: r.insurer_name ?? "",
    insurerIk: r.insurer_ik ?? "",
    insurerEmail: r.insurer_email ?? "",
    invoiceNumber: r.invoice_number,
    periodFrom: String(r.period_from),
    periodTo: String(r.period_to),
    totalAmount: r.total_amount ?? 0,
    commissionAmount: r.commission_amount ?? 0,
    netAmount: r.net_amount ?? 0,
    commissionRateSnap: r.commission_rate_snap ?? 0,
    status: r.status ?? "draft",
    sentAt: r.sent_at?.toISOString() ?? null,
    sentTo: r.sent_to ?? "",
    paidAt: r.paid_at?.toISOString() ?? null,
    pdfStorageKey: r.pdf_storage_key ?? "",
    rideCount: r.ride_count ?? 0,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rideFareAmount(ride: {
  final_fare: number | null;
  estimated_fare: number;
}): number {
  const f = ride.final_fare;
  if (typeof f === "number" && Number.isFinite(f) && f >= 0) return f;
  return typeof ride.estimated_fare === "number" && Number.isFinite(ride.estimated_fare) ? ride.estimated_fare : 0;
}

function insuranceFromRide(
  meta: Record<string, unknown>,
  medical?: { insuranceName: string; insuranceIk: string } | null,
): { insurerName: string; insurerIk: string } {
  const fromMetaName = typeof meta.insurance_name === "string" ? meta.insurance_name.trim() : "";
  const fromMetaIk =
    typeof meta.insurance_ik === "string"
      ? normalizeIk(meta.insurance_ik)
      : typeof meta.insurer_ik === "string"
        ? normalizeIk(meta.insurer_ik)
        : "";
  return {
    insurerName: fromMetaName || medical?.insuranceName?.trim() || "",
    insurerIk: fromMetaIk || normalizeIk(medical?.insuranceIk ?? ""),
  };
}

function patientFromRide(
  meta: Record<string, unknown>,
  medical?: { patientDisplayName: string; patientReference: string } | null,
  rideCustomerName?: string,
): string {
  const ref = typeof meta.patient_reference === "string" ? meta.patient_reference.trim() : "";
  if (ref) return ref.slice(0, 120);
  const disp = medical?.patientDisplayName?.trim();
  if (disp) return disp.slice(0, 120);
  const cn = (rideCustomerName ?? "").trim();
  if (cn) return cn.slice(0, 120);
  return medical?.patientReference?.trim().slice(0, 120) || "Patient";
}

function insurerMatchesFilter(
  row: { insurerName: string; insurerIk: string },
  filter: { insurerName?: string; insurerIk?: string },
): boolean {
  const wantIk = filter.insurerIk ? normalizeIk(filter.insurerIk) : "";
  const wantName = (filter.insurerName ?? "").trim().toLowerCase();
  if (wantIk && normalizeIk(row.insurerIk) !== wantIk) return false;
  if (wantName && row.insurerName.trim().toLowerCase() !== wantName) return false;
  return true;
}

function isMedicalInsuranceRide(ride: {
  payer_kind: string;
  ride_kind: string;
}): boolean {
  const pk = ride.payer_kind.trim().toLowerCase();
  const rk = ride.ride_kind.trim().toLowerCase();
  return pk === "insurance" || rk === "medical";
}

export function parseInsurerBillingContacts(raw: unknown): InsurerBillingContact[] {
  if (!Array.isArray(raw)) return [];
  const out: InsurerBillingContact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const insurerName = typeof o.insurerName === "string" ? o.insurerName.trim() : "";
    const insurerIk = normalizeIk(typeof o.insurerIk === "string" ? o.insurerIk : "");
    const email = typeof o.email === "string" ? o.email.trim() : "";
    if (!insurerName && !insurerIk) continue;
    out.push({ insurerName, insurerIk, email });
  }
  return out;
}

export async function getInsurerBillingContactsForCompany(companyId: string): Promise<InsurerBillingContact[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ contacts: adminCompaniesTable.insurer_billing_contacts_json })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId.trim()))
    .limit(1);
  return parseInsurerBillingContacts(rows[0]?.contacts);
}

export async function resolveDefaultInsurerEmail(
  companyId: string,
  insurerName: string,
  insurerIk: string,
  fallbackEmail: string,
): Promise<string> {
  const contacts = await getInsurerBillingContactsForCompany(companyId);
  const ik = normalizeIk(insurerIk);
  const name = insurerName.trim().toLowerCase();
  const hit =
    contacts.find((c) => ik && c.insurerIk === ik && c.email) ??
    contacts.find((c) => name && c.insurerName.trim().toLowerCase() === name && c.email);
  return (hit?.email || fallbackEmail).trim();
}

/** Upsert offene T-Schein-Belege aus abgeschlossenen Krankenfahrten im Zeitraum. */
export async function syncOpenTransportVouchersForCompany(input: {
  companyId: string;
  periodFrom: string;
  periodTo: string;
  insurerName?: string;
  insurerIk?: string;
}): Promise<TransportVoucherRow[]> {
  const db = getDb();
  if (!db) return [];
  const cid = input.companyId.trim();
  const from = parseDateOnly(input.periodFrom);
  const to = parseDateOnly(input.periodTo);
  if (!from || !to) return [];

  const commissionRate = await getAdminCompanyCommissionRate(cid);
  const periodEnd = new Date(`${isoDateOnly(to)}T23:59:59.999Z`);

  const rideRows = await db
    .select()
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.company_id, cid),
        eq(ridesTable.status, "completed"),
        gte(ridesTable.created_at, from),
        lte(ridesTable.created_at, periodEnd),
        or(eq(ridesTable.payer_kind, "insurance"), eq(ridesTable.ride_kind, "medical"))!,
      ),
    )
    .orderBy(desc(ridesTable.created_at));

  const out: TransportVoucherRow[] = [];

  for (const ride of rideRows) {
    const meta = (ride.partner_booking_meta ?? {}) as Record<string, unknown>;
    const readiness = calculateMedicalBillingReadiness(meta);
    if (!readiness.billingReady) continue;

    const medical = await findLatestMedicalCaseByRideId(ride.id, cid);
    const ins = insuranceFromRide(meta, medical);
    if (!ins.insurerName && !ins.insurerIk) continue;
    if (!insurerMatchesFilter(ins, input)) continue;

    const fare = roundMoneyEur(rideFareAmount(ride));
    const commissionAmount = roundMoneyEur(fare * commissionRate);
    const netAmount = roundMoneyEur(fare - commissionAmount);
    const patientName = patientFromRide(meta, medical, ride.customer_name);
    const insurerEmail = await resolveDefaultInsurerEmail(
      cid,
      ins.insurerName,
      ins.insurerIk,
      typeof meta.insurer_email === "string" ? meta.insurer_email : "",
    );

    const existing = await db
      .select()
      .from(transportVouchersTable)
      .where(eq(transportVouchersTable.ride_id, ride.id))
      .limit(1);

    const now = new Date();
    const refAt = ride.scheduled_at ?? ride.created_at;

    if (existing[0]) {
      const ex = existing[0];
      if (ex.status !== "open") {
        if (ex.status === "billed" || ex.status === "paid") {
          out.push(
            mapVoucherRow(ex, {
              rideFromFull: ride.from_full,
              rideToFull: ride.to_full,
              distanceKm: ride.distance_km,
            }),
          );
        }
        continue;
      }
      await db
        .update(transportVouchersTable)
        .set({
          patient_name: patientName,
          insurer_name: ins.insurerName,
          insurer_ik: ins.insurerIk,
          insurer_email: insurerEmail,
          fare_amount: fare,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          commission_rate_snap: commissionRate,
          ride_reference_at: refAt,
          updated_at: now,
        })
        .where(eq(transportVouchersTable.id, ex.id));
      const refreshed = await db
        .select()
        .from(transportVouchersTable)
        .where(eq(transportVouchersTable.id, ex.id))
        .limit(1);
      if (refreshed[0]) {
        out.push(
          mapVoucherRow(refreshed[0], {
            rideFromFull: ride.from_full,
            rideToFull: ride.to_full,
            distanceKm: ride.distance_km,
          }),
        );
      }
      continue;
    }

    const id = `tv-${randomUUID()}`;
    await db.insert(transportVouchersTable).values({
      id,
      ride_id: ride.id,
      company_id: cid,
      patient_name: patientName,
      insurer_name: ins.insurerName,
      insurer_ik: ins.insurerIk,
      insurer_email: insurerEmail,
      fare_amount: fare,
      commission_amount: commissionAmount,
      net_amount: netAmount,
      commission_rate_snap: commissionRate,
      status: "open",
      ride_reference_at: refAt,
      created_at: now,
      updated_at: now,
    });
    const inserted = await db.select().from(transportVouchersTable).where(eq(transportVouchersTable.id, id)).limit(1);
    if (inserted[0]) {
      out.push(
        mapVoucherRow(inserted[0], {
          rideFromFull: ride.from_full,
          rideToFull: ride.to_full,
          distanceKm: ride.distance_km,
        }),
      );
    }
  }

  return out.filter((v) => v.status === "open");
}

async function allocateKrankenInvoiceNumber(companyId: string, year: number): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("db_unavailable");
  const cid = companyId.trim();

  const existing = await db
    .select()
    .from(krankenInvoiceSequencesTable)
    .where(and(eq(krankenInvoiceSequencesTable.company_id, cid), eq(krankenInvoiceSequencesTable.year, year)))
    .limit(1);

  let seq = 1;
  if (existing[0]) {
    seq = existing[0].next_seq;
    await db
      .update(krankenInvoiceSequencesTable)
      .set({ next_seq: seq + 1 })
      .where(
        and(eq(krankenInvoiceSequencesTable.company_id, cid), eq(krankenInvoiceSequencesTable.year, year)),
      );
  } else {
    await db.insert(krankenInvoiceSequencesTable).values({
      company_id: cid,
      year,
      next_seq: 2,
    });
  }

  return `KR-${year}-${String(seq).padStart(3, "0")}`;
}

export async function listOpenTransportVouchersForCompany(
  companyId: string,
  filters: { periodFrom: string; periodTo: string; insurerName?: string; insurerIk?: string },
): Promise<TransportVoucherRow[]> {
  await syncOpenTransportVouchersForCompany({ companyId, ...filters });
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(transportVouchersTable)
    .where(and(eq(transportVouchersTable.company_id, companyId.trim()), eq(transportVouchersTable.status, "open")))
    .orderBy(desc(transportVouchersTable.ride_reference_at));

  const filtered = rows.filter((r) =>
    insurerMatchesFilter({ insurerName: r.insurer_name, insurerIk: r.insurer_ik }, filters),
  );

  const out: TransportVoucherRow[] = [];
  for (const r of filtered) {
    const rideRows = await db.select().from(ridesTable).where(eq(ridesTable.id, r.ride_id)).limit(1);
    const ride = rideRows[0];
    out.push(
      mapVoucherRow(r, ride
        ? { rideFromFull: ride.from_full, rideToFull: ride.to_full, distanceKm: ride.distance_km }
        : undefined),
    );
  }
  return out;
}

export async function listKrankenInvoicesForCompany(companyId: string): Promise<KrankenInvoiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(krankenInvoicesTable)
    .where(eq(krankenInvoicesTable.company_id, companyId.trim()))
    .orderBy(desc(krankenInvoicesTable.created_at));
  const company = await findCompanyById(companyId);
  return rows.map((r) => mapInvoiceRow(r, company?.name));
}

export async function listAllKrankenInvoicesAdmin(): Promise<KrankenInvoiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(krankenInvoicesTable).orderBy(desc(krankenInvoicesTable.created_at));
  const out: KrankenInvoiceRow[] = [];
  for (const r of rows) {
    const c = await findCompanyById(r.company_id);
    out.push(mapInvoiceRow(r, c?.name));
  }
  return out;
}

export async function getKrankenInvoiceById(
  invoiceId: string,
  companyId?: string,
): Promise<{ invoice: KrankenInvoiceRow; vouchers: TransportVoucherRow[] } | null> {
  const db = getDb();
  if (!db) return null;
  const conds = [eq(krankenInvoicesTable.id, invoiceId.trim())];
  if (companyId) conds.push(eq(krankenInvoicesTable.company_id, companyId.trim()));
  const invRows = await db
    .select()
    .from(krankenInvoicesTable)
    .where(and(...conds)!)
    .limit(1);
  const inv = invRows[0];
  if (!inv) return null;
  const company = await findCompanyById(inv.company_id);
  const vouchers = await db
    .select()
    .from(transportVouchersTable)
    .where(eq(transportVouchersTable.kranken_invoice_id, inv.id))
    .orderBy(desc(transportVouchersTable.ride_reference_at));

  const voucherOut: TransportVoucherRow[] = [];
  for (const v of vouchers) {
    const rideRows = await db.select().from(ridesTable).where(eq(ridesTable.id, v.ride_id)).limit(1);
    const ride = rideRows[0];
    voucherOut.push(
      mapVoucherRow(v, ride
        ? { rideFromFull: ride.from_full, rideToFull: ride.to_full, distanceKm: ride.distance_km }
        : undefined),
    );
  }

  return { invoice: mapInvoiceRow(inv, company?.name), vouchers: voucherOut };
}

export async function generateKrankenInvoice(input: {
  companyId: string;
  periodFrom: string;
  periodTo: string;
  insurerName: string;
  insurerIk: string;
  insurerEmail: string;
}): Promise<{ invoice: KrankenInvoiceRow; vouchers: TransportVoucherRow[] } | { error: string }> {
  if (!isPostgresConfigured()) return { error: "db_required" };
  const cid = input.companyId.trim();
  const from = parseDateOnly(input.periodFrom);
  const to = parseDateOnly(input.periodTo);
  if (!from || !to) return { error: "period_from_to_required" };
  if (from > to) return { error: "period_invalid" };

  const open = await syncOpenTransportVouchersForCompany({
    companyId: cid,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    insurerName: input.insurerName,
    insurerIk: input.insurerIk,
  });

  if (open.length === 0) return { error: "no_open_vouchers" };

  const commissionRate = await getAdminCompanyCommissionRate(cid);
  let total = 0;
  let commission = 0;
  let net = 0;
  for (const v of open) {
    total += v.fareAmount;
    commission += v.commissionAmount;
    net += v.netAmount;
  }
  total = roundMoneyEur(total);
  commission = roundMoneyEur(commission);
  net = roundMoneyEur(net);

  const year = from.getUTCFullYear();
  const invoiceNumber = await allocateKrankenInvoiceNumber(cid, year);
  const id = `ki-${randomUUID()}`;
  const now = new Date();
  const email = input.insurerEmail.trim();

  const db = getDb()!;
  await db.insert(krankenInvoicesTable).values({
    id,
    company_id: cid,
    insurer_name: input.insurerName.trim(),
    insurer_ik: normalizeIk(input.insurerIk),
    insurer_email: email,
    invoice_number: invoiceNumber,
    period_from: isoDateOnly(from),
    period_to: isoDateOnly(to),
    total_amount: total,
    commission_amount: commission,
    net_amount: net,
    commission_rate_snap: commissionRate,
    status: "draft",
    ride_count: open.length,
    pdf_storage_key: "",
    created_at: now,
    updated_at: now,
  });

  for (const v of open) {
    await db
      .update(transportVouchersTable)
      .set({
        status: "billed",
        kranken_invoice_id: id,
        billed_at: now,
        updated_at: now,
      })
      .where(eq(transportVouchersTable.id, v.id));
  }

  const detail = await getKrankenInvoiceById(id, cid);
  if (!detail) return { error: "invoice_create_failed" };
  return detail;
}

export async function updateKrankenInvoicePdfKey(invoiceId: string, storageKey: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(krankenInvoicesTable)
    .set({ pdf_storage_key: storageKey, updated_at: new Date() })
    .where(eq(krankenInvoicesTable.id, invoiceId));
}

export async function markKrankenInvoiceSent(
  invoiceId: string,
  sentTo: string,
  companyId?: string,
): Promise<KrankenInvoiceRow | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const conds = [eq(krankenInvoicesTable.id, invoiceId.trim())];
  if (companyId) conds.push(eq(krankenInvoicesTable.company_id, companyId.trim()));
  await db
    .update(krankenInvoicesTable)
    .set({ status: "sent", sent_at: now, sent_to: sentTo.trim(), updated_at: now })
    .where(and(...conds)!);
  const detail = await getKrankenInvoiceById(invoiceId, companyId);
  return detail?.invoice ?? null;
}

export async function markKrankenInvoicePaidAdmin(invoiceId: string): Promise<KrankenInvoiceRow | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const invId = invoiceId.trim();
  await db
    .update(krankenInvoicesTable)
    .set({ status: "paid", paid_at: now, updated_at: now })
    .where(eq(krankenInvoicesTable.id, invId));
  await db
    .update(transportVouchersTable)
    .set({ status: "paid", paid_at: now, updated_at: now })
    .where(eq(transportVouchersTable.kranken_invoice_id, invId));
  const detail = await getKrankenInvoiceById(invId);
  return detail?.invoice ?? null;
}

export function companySenderLines(company: CompanyRow): string[] {
  const lines: string[] = [];
  const name = (company.billing_name || company.name || "").trim();
  if (name) lines.push(name);
  const a1 = (company.billing_address_line1 || company.address_line1 || "").trim();
  const a2 = (company.billing_address_line2 || company.address_line2 || "").trim();
  const plz = (company.billing_postal_code || company.postal_code || "").trim();
  const city = (company.billing_city || company.city || "").trim();
  if (a1) lines.push(a1);
  if (a2) lines.push(a2);
  if (plz || city) lines.push(`${plz} ${city}`.trim());
  const ik = String(company.partner_ik_number ?? "").trim();
  if (ik) lines.push(`IK: ${ik}`);
  return lines.length ? lines : [name || "Taxi-Unternehmen"];
}

export async function getKrankenInvoiceAdminKpis(): Promise<{
  totalInvoices: number;
  draftCount: number;
  sentCount: number;
  paidCount: number;
  totalAmount: number;
  commissionAmount: number;
  netAmount: number;
}> {
  const db = getDb();
  if (!db) {
    return {
      totalInvoices: 0,
      draftCount: 0,
      sentCount: 0,
      paidCount: 0,
      totalAmount: 0,
      commissionAmount: 0,
      netAmount: 0,
    };
  }
  const rows = await db.select().from(krankenInvoicesTable);
  let draftCount = 0;
  let sentCount = 0;
  let paidCount = 0;
  let totalAmount = 0;
  let commissionAmount = 0;
  let netAmount = 0;
  for (const r of rows) {
    const st = r.status;
    if (st === "draft") draftCount += 1;
    else if (st === "sent") sentCount += 1;
    else if (st === "paid") paidCount += 1;
    totalAmount += r.total_amount ?? 0;
    commissionAmount += r.commission_amount ?? 0;
    netAmount += r.net_amount ?? 0;
  }
  return {
    totalInvoices: rows.length,
    draftCount,
    sentCount,
    paidCount,
    totalAmount: roundMoneyEur(totalAmount),
    commissionAmount: roundMoneyEur(commissionAmount),
    netAmount: roundMoneyEur(netAmount),
  };
}
