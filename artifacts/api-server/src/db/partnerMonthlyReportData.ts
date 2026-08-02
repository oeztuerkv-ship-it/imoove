import { randomUUID } from "node:crypto";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { resolveInvoiceBillingEmail } from "./adminInvoiceFinanceData.js";
import { getDb } from "./client";
import {
  buildPanelSettlementCompletedAtDateRangeFilter,
  queryPanelFinancialSettlement,
} from "./panelOverviewSettlementData.js";
import {
  adminCompaniesTable,
  invoicesTable,
  krankenInvoicesTable,
  panelUsersTable,
  partnerMonthlyReportSendsTable,
} from "./schema";
import { logger } from "../lib/logger.js";
import { sendOnrodaMail } from "../lib/onrodaSmtpMail.js";
import {
  buildPartnerMonthlyReportMail,
  type MonthlyReportInvoiceLine,
} from "../lib/partnerMonthlyReportMail.js";
import {
  resolveInvoiceWorkflowStatus,
  workflowStatusLabelDe,
} from "../lib/invoiceWorkflow.js";

const OPEN_STATUSES_EXCLUDED = ["paid", "cancelled", "draft"] as const;

export type PartnerMonthlyReportCompanyResult = {
  companyId: string;
  companyName: string;
  companyKind: string;
  outcome:
    | "sent"
    | "dry_run"
    | "skipped_no_recipients"
    | "skipped_already_sent"
    | "skipped_inactive"
    | "error";
  recipients: string[];
  openInvoiceCount: number;
  openKrankenInvoiceCount: number;
  error?: string;
};

export type PartnerMonthlyReportRunResult = {
  ok: true;
  dryRun: boolean;
  periodYm: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  sentCount: number;
  dryRunCount: number;
  skippedCount: number;
  errorCount: number;
  results: PartnerMonthlyReportCompanyResult[];
};

function berlinCalendarParts(now = new Date()): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    day: Number(parts.find((p) => p.type === "day")?.value ?? "1"),
    hour: hourRaw === 24 ? 0 : hourRaw,
  };
}

/** Vormonat Europe/Berlin relativ zu `now`. */
export function berlinPreviousMonthPeriod(now = new Date()): {
  periodYm: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
} {
  const b = berlinCalendarParts(now);
  let y = b.year;
  let m = b.month - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const periodYm = `${y}-${String(m).padStart(2, "0")}`;
  const periodStart = `${periodYm}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodEnd = `${periodYm}-${String(lastDay).padStart(2, "0")}`;
  const periodLabel = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { periodYm, periodStart, periodEnd, periodLabel };
}

/** Cron-Fenster: 1. des Monats, Stunde 08 Europe/Berlin. */
export function isPartnerMonthlyReportCronWindow(now = new Date()): boolean {
  const b = berlinCalendarParts(now);
  return b.day === 1 && b.hour === 8;
}

function invoiceKindLabel(row: {
  invoice_type: string;
  metadata_json: unknown;
}): string {
  const meta =
    row.metadata_json && typeof row.metadata_json === "object"
      ? (row.metadata_json as Record<string, unknown>)
      : {};
  const source = typeof meta.source === "string" ? meta.source : "";
  if (source === "cash_card_netting_weekly_commission") return "Provisionsrechnung";
  const t = String(row.invoice_type ?? "").trim().toLowerCase();
  if (t.includes("partner")) return "Partner-Rechnung";
  return t || "Rechnung";
}

async function listOwnerEmails(companyId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ email: panelUsersTable.email })
    .from(panelUsersTable)
    .where(
      and(
        eq(panelUsersTable.company_id, companyId),
        eq(panelUsersTable.is_active, true),
        sql`lower(trim(${panelUsersTable.role})) = 'owner'`,
      ),
    );
  const out: string[] = [];
  for (const r of rows) {
    const e = String(r.email ?? "").trim().toLowerCase();
    if (e.includes("@")) out.push(e);
  }
  return out;
}

async function resolveRecipients(companyId: string): Promise<string[]> {
  const billing = await resolveInvoiceBillingEmail(companyId);
  const owners = await listOwnerEmails(companyId);
  const set = new Set<string>();
  if (billing?.includes("@")) set.add(billing.trim().toLowerCase());
  for (const o of owners) set.add(o);
  return [...set];
}

/** Live aus DB — unmittelbar vor Versand, kein Cache. */
async function listOpenPartnerInvoicesLive(companyId: string): Promise<MonthlyReportInvoiceLine[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.company_id, companyId),
        notInArray(invoicesTable.status, [...OPEN_STATUSES_EXCLUDED]),
      ),
    )
    .orderBy(asc(invoicesTable.due_date), asc(invoicesTable.created_at));

  return rows.map((row) => {
    const workflow = resolveInvoiceWorkflowStatus({
      status: row.status,
      due_date: row.due_date,
    });
    return {
      invoiceNumber: row.invoice_number,
      kindLabel: invoiceKindLabel(row),
      totalGross: Number(row.total_gross) || 0,
      dueDate: row.due_date ? String(row.due_date) : null,
      statusLabel: workflowStatusLabelDe(workflow),
    };
  });
}

async function listOpenKrankenInvoicesLive(companyId: string): Promise<MonthlyReportInvoiceLine[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(krankenInvoicesTable)
    .where(
      and(
        eq(krankenInvoicesTable.company_id, companyId),
        notInArray(krankenInvoicesTable.status, [...OPEN_STATUSES_EXCLUDED]),
      ),
    )
    .orderBy(asc(krankenInvoicesTable.period_to), asc(krankenInvoicesTable.created_at));

  return rows.map((row) => {
    const st = String(row.status ?? "").trim().toLowerCase();
    const statusLabel =
      st === "sent" ? "Gesendet" : st === "issued" ? "Offen" : st || "Offen";
    return {
      invoiceNumber: row.invoice_number,
      kindLabel: "Kranken-Sammelrechnung",
      totalGross: Number(row.total_amount) || 0,
      dueDate: null,
      statusLabel,
    };
  });
}

async function alreadySent(companyId: string, periodYm: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: partnerMonthlyReportSendsTable.id })
    .from(partnerMonthlyReportSendsTable)
    .where(
      and(
        eq(partnerMonthlyReportSendsTable.company_id, companyId),
        eq(partnerMonthlyReportSendsTable.period_ym, periodYm),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function recordSend(input: {
  companyId: string;
  periodYm: string;
  recipients: string[];
  openInvoiceCount: number;
  openKrankenInvoiceCount: number;
  mailStatus: string;
  actorLabel: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(partnerMonthlyReportSendsTable).values({
    id: `pmrs-${randomUUID().replace(/-/g, "").slice(0, 22)}`,
    company_id: input.companyId,
    period_ym: input.periodYm,
    recipients_json: input.recipients,
    open_invoice_count: input.openInvoiceCount,
    open_kranken_invoice_count: input.openKrankenInvoiceCount,
    mail_status: input.mailStatus,
    actor_label: input.actorLabel,
  });
}

export async function runPartnerMonthlyReport(input: {
  dryRun?: boolean;
  companyId?: string;
  force?: boolean;
  actorLabel: string;
  now?: Date;
}): Promise<PartnerMonthlyReportRunResult | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const dryRun = Boolean(input.dryRun);
  const force = Boolean(input.force);
  const now = input.now ?? new Date();
  const { periodYm, periodStart, periodEnd, periodLabel } = berlinPreviousMonthPeriod(now);

  const companiesQuery = db
    .select({
      id: adminCompaniesTable.id,
      name: adminCompaniesTable.name,
      company_kind: adminCompaniesTable.company_kind,
      is_active: adminCompaniesTable.is_active,
    })
    .from(adminCompaniesTable)
    .orderBy(adminCompaniesTable.name);

  const allCompanies = await companiesQuery;
  const companies = input.companyId?.trim()
    ? allCompanies.filter((c) => c.id === input.companyId!.trim())
    : allCompanies;

  const results: PartnerMonthlyReportCompanyResult[] = [];
  let sentCount = 0;
  let dryRunCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const rideFilter = buildPanelSettlementCompletedAtDateRangeFilter(periodStart, periodEnd);

  for (const company of companies) {
    const companyId = company.id;
    const companyName = String(company.name ?? "").trim() || companyId;
    const companyKind = String(company.company_kind ?? "general").trim().toLowerCase();

    if (!company.is_active) {
      skippedCount += 1;
      results.push({
        companyId,
        companyName,
        companyKind,
        outcome: "skipped_inactive",
        recipients: [],
        openInvoiceCount: 0,
        openKrankenInvoiceCount: 0,
      });
      continue;
    }

    try {
      if (!force && (await alreadySent(companyId, periodYm))) {
        skippedCount += 1;
        results.push({
          companyId,
          companyName,
          companyKind,
          outcome: "skipped_already_sent",
          recipients: [],
          openInvoiceCount: 0,
          openKrankenInvoiceCount: 0,
        });
        continue;
      }

      const recipients = await resolveRecipients(companyId);
      if (!recipients.length) {
        skippedCount += 1;
        results.push({
          companyId,
          companyName,
          companyKind,
          outcome: "skipped_no_recipients",
          recipients: [],
          openInvoiceCount: 0,
          openKrankenInvoiceCount: 0,
        });
        continue;
      }

      // Live-Stand unmittelbar vor Mail-Aufbau / Versand
      const openInvoices = await listOpenPartnerInvoicesLive(companyId);
      const openKrankenInvoices = await listOpenKrankenInvoicesLive(companyId);

      let taxiKpis: {
        grossAmount: number;
        commissionAmount: number;
        operatorPayoutAmount: number;
      } | null = null;
      if (companyKind === "taxi") {
        const window = await queryPanelFinancialSettlement(db, companyId, rideFilter, rideFilter);
        taxiKpis = {
          grossAmount: window.grossAmount,
          commissionAmount: window.commissionAmount,
          operatorPayoutAmount: window.operatorPayoutAmount,
        };
      }

      const mail = buildPartnerMonthlyReportMail({
        companyName,
        periodYm,
        periodLabel,
        periodStart,
        periodEnd,
        openInvoices,
        openKrankenInvoices,
        taxiKpis,
      });

      if (dryRun) {
        dryRunCount += 1;
        results.push({
          companyId,
          companyName,
          companyKind,
          outcome: "dry_run",
          recipients,
          openInvoiceCount: openInvoices.length,
          openKrankenInvoiceCount: openKrankenInvoices.length,
        });
        continue;
      }

      // Pro Empfänger separat (billing_email + Owner), Live-Listen bereits geladen
      let anyOk = false;
      let lastFail = "";
      for (const to of recipients) {
        const sent = await sendOnrodaMail({
          to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          logEvent: "partner_monthly_report.sent",
        });
        if (sent.ok) anyOk = true;
        else lastFail = sent.reason;
      }
      if (!anyOk) {
        errorCount += 1;
        results.push({
          companyId,
          companyName,
          companyKind,
          outcome: "error",
          recipients,
          openInvoiceCount: openInvoices.length,
          openKrankenInvoiceCount: openKrankenInvoices.length,
          error: lastFail || "mail_failed",
        });
        continue;
      }

      await recordSend({
        companyId,
        periodYm,
        recipients,
        openInvoiceCount: openInvoices.length,
        openKrankenInvoiceCount: openKrankenInvoices.length,
        mailStatus: "sent",
        actorLabel: input.actorLabel,
      });
      sentCount += 1;
      results.push({
        companyId,
        companyName,
        companyKind,
        outcome: "sent",
        recipients,
        openInvoiceCount: openInvoices.length,
        openKrankenInvoiceCount: openKrankenInvoices.length,
      });
    } catch (err) {
      logger.error({ err, companyId }, "partner monthly report company failed");
      errorCount += 1;
      results.push({
        companyId,
        companyName,
        companyKind,
        outcome: "error",
        recipients: [],
        openInvoiceCount: 0,
        openKrankenInvoiceCount: 0,
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  return {
    ok: true,
    dryRun,
    periodYm,
    periodStart,
    periodEnd,
    periodLabel,
    sentCount,
    dryRunCount,
    skippedCount,
    errorCount,
    results,
  };
}
