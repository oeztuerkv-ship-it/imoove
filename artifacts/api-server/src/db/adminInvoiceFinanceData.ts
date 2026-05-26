import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { findCompanyById } from "./adminData.js";
import { getDb } from "./client";
import { sendInvoiceReminderMail } from "../lib/invoiceReminderMail.js";
import {
  buildInvoicePaymentReference,
  resolveInvoicePaymentReference,
} from "../lib/invoicePaymentReference.js";
import { isOnrodaSmtpConfigured } from "../lib/onrodaSmtpMail.js";
import {
  resolveInvoiceWorkflowStatus,
  workflowStatusLabelDe,
  type InvoiceWorkflowStatus,
} from "../lib/invoiceWorkflow.js";
import {
  adminCompaniesTable,
  billingAccountsTable,
  financialAuditLogTable,
  invoicesTable,
  paymentsTable,
} from "./schema";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

async function insertFinancialAuditInTx(
  tx: ExecDb,
  input: {
    entityType: string;
    entityId: string;
    action: string;
    newValue: Record<string, unknown>;
    oldValue?: Record<string, unknown>;
    actorType: string;
    actorId?: string | null;
  },
): Promise<void> {
  await tx.insert(financialAuditLogTable).values({
    id: `fal-${randomUUID()}`,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_value_json: input.oldValue ?? {},
    new_value_json: input.newValue,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
  });
}

export function adminInvoiceStatusLabelDe(status: string): string {
  return workflowStatusLabelDe(resolveInvoiceWorkflowStatus({ status, due_date: null }));
}

export function enrichInvoiceAdminRow(
  row: typeof invoicesTable.$inferSelect,
  companyName: string | null,
): typeof row & {
  company_name: string | null;
  payment_reference: string;
  workflow_status: InvoiceWorkflowStatus;
  status_label_de: string;
} {
  const payment_reference = resolveInvoicePaymentReference({
    invoiceNumber: row.invoice_number,
    storedReference: row.payment_reference,
  });
  const workflow_status = resolveInvoiceWorkflowStatus({
    status: row.status,
    due_date: row.due_date,
  });
  return {
    ...row,
    company_name: companyName,
    payment_reference,
    workflow_status,
    status_label_de: workflowStatusLabelDe(workflow_status),
  };
}

/** Admin: Rechnung als bezahlt verbuchen (+ Zahlungszeile + Audit). */
export async function adminMarkInvoicePaid(input: {
  invoiceId: string;
  actorLabel: string;
  paidAt?: Date | null;
  amount?: number | null;
  bankReference?: string | null;
}): Promise<
  | { ok: true; paymentId: string; idempotent?: boolean }
  | { ok: false; error: string }
> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) return { ok: false, error: "invoice_id_required" };

  try {
    return await db.transaction(async (tx) => {
      const invRows = await tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, invoiceId))
        .for("update")
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw Object.assign(new Error("not_found"), { code: "invoice_not_found" });

      if (inv.status === "paid") {
        const existing = await tx
          .select()
          .from(paymentsTable)
          .where(and(eq(paymentsTable.target_type, "invoice"), eq(paymentsTable.target_id, invoiceId)))
          .orderBy(desc(paymentsTable.created_at))
          .limit(1);
        return {
          ok: true as const,
          paymentId: existing[0]?.id ?? invoiceId,
          idempotent: true,
        };
      }

      if (inv.status === "cancelled") {
        throw Object.assign(new Error("cancelled"), { code: "invoice_cancelled" });
      }

      const openpay = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.target_type, "invoice"),
            eq(paymentsTable.target_id, invoiceId),
            inArray(paymentsTable.status, ["pending", "booked"]),
          ),
        )
        .orderBy(desc(paymentsTable.created_at))
        .limit(1);
      if (openpay[0]) {
        return { ok: true as const, paymentId: openpay[0].id, idempotent: true };
      }

      const paidAt = input.paidAt ?? new Date();
      const amount = Number.isFinite(Number(input.amount)) ? Number(input.amount) : Number(inv.total_gross);
      const bankRef = String(input.bankReference ?? "").trim();

      let paymentReference = String(inv.payment_reference ?? "").trim();
      if (!paymentReference) {
        const [{ getPanelCompanyById }] = await Promise.all([import("./panelCompanyData.js")]);
        const company = inv.company_id ? await getPanelCompanyById(inv.company_id) : null;
        paymentReference = buildInvoicePaymentReference({ invoiceNumber: inv.invoice_number });
      }

      const pid = `pay-${randomUUID()}`;
      await tx.insert(paymentsTable).values({
        id: pid,
        target_type: "invoice",
        target_id: invoiceId,
        company_id: inv.company_id,
        payment_method: "bank_transfer",
        amount,
        paid_at: paidAt,
        reference: bankRef || paymentReference,
        status: "booked",
        metadata_json: { createdByActor: input.actorLabel, invoiceNumber: inv.invoice_number },
      });

      const oldStatus = inv.status;
      const prevMeta =
        inv.metadata_json && typeof inv.metadata_json === "object"
          ? (inv.metadata_json as Record<string, unknown>)
          : {};
      await tx
        .update(invoicesTable)
        .set({
          status: "paid",
          payment_reference: paymentReference,
          updated_at: new Date(),
          metadata_json: {
            ...prevMeta,
            status_before_paid: oldStatus,
            paid_at: paidAt.toISOString(),
            paid_by_admin: input.actorLabel,
            zahlungsreferenz: bankRef || paymentReference,
          },
        })
        .where(eq(invoicesTable.id, invoiceId));

      await insertFinancialAuditInTx(tx, {
        entityType: "invoice",
        entityId: invoiceId,
        action: "invoice_marked_paid",
        oldValue: { status: oldStatus },
        newValue: {
          status: "paid",
          paymentId: pid,
          amount,
          reference: bankRef || paymentReference,
          paidAt: paidAt.toISOString(),
        },
        actorType: "admin",
        actorId: input.actorLabel,
      });

      return { ok: true as const, paymentId: pid };
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "invoice_not_found") return { ok: false, error: "invoice_not_found" };
    if (err.code === "invoice_cancelled") return { ok: false, error: "invoice_cancelled" };
    throw e;
  }
}

function pickBillingEmail(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const t = String(raw ?? "").trim();
    if (t.includes("@")) return t;
  }
  return null;
}

/** Rechnungs-E-Mail: billing_accounts → Unternehmens-E-Mail → Support-E-Mail. */
export async function resolveInvoiceBillingEmail(companyId: string): Promise<string | null> {
  const db = getDb();
  if (!db || !companyId.trim()) return null;

  const billingRows = await db
    .select({ billing_email: billingAccountsTable.billing_email })
    .from(billingAccountsTable)
    .where(and(eq(billingAccountsTable.company_id, companyId), eq(billingAccountsTable.is_active, true)))
    .limit(5);

  for (const row of billingRows) {
    const email = pickBillingEmail(row.billing_email);
    if (email) return email;
  }

  const companyRows = await db
    .select({ email: adminCompaniesTable.email, support_email: adminCompaniesTable.support_email })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) return null;
  return pickBillingEmail(company.email, company.support_email);
}

export type AdminSendInvoiceReminderResult =
  | {
      ok: true;
      idempotent?: boolean;
      message: string;
      mail_to: string | null;
      mail_status: "sent" | "skipped_idempotent" | "not_sent";
      reminder_mail_sent_at?: string | null;
      reminder_mail_to?: string | null;
      reminder_mail_status?: string | null;
    }
  | { ok: false; error: string };

/** Admin: Zahlungserinnerung (Status + Audit + E-Mail über bestehenden SMTP-Stack). */
export async function adminSendInvoicePaymentReminder(input: {
  invoiceId: string;
  actorLabel: string;
}): Promise<AdminSendInvoiceReminderResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) return { ok: false, error: "invoice_id_required" };

  const invRows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  const inv = invRows[0];
  if (!inv) return { ok: false, error: "invoice_not_found" };
  if (inv.status === "paid") return { ok: false, error: "invoice_already_paid" };
  if (inv.status === "cancelled") return { ok: false, error: "invoice_cancelled" };
  if (inv.status === "draft") return { ok: false, error: "invoice_draft" };

  const prevMeta =
    inv.metadata_json && typeof inv.metadata_json === "object"
      ? (inv.metadata_json as Record<string, unknown>)
      : {};

  if (inv.status === "reminder_sent") {
    const mailTo = typeof prevMeta.reminder_mail_to === "string" ? prevMeta.reminder_mail_to : null;
    const mailStatus =
      typeof prevMeta.reminder_mail_status === "string" ? prevMeta.reminder_mail_status : "sent";
    return {
      ok: true,
      idempotent: true,
      message: mailTo
        ? `Erinnerung war bereits verbucht (E-Mail an ${mailTo}).`
        : "Erinnerung war bereits verbucht.",
      mail_to: mailTo,
      mail_status: "skipped_idempotent",
      reminder_mail_sent_at:
        typeof prevMeta.reminder_mail_sent_at === "string" ? prevMeta.reminder_mail_sent_at : null,
      reminder_mail_to: mailTo,
      reminder_mail_status: mailStatus,
    };
  }

  const companyId = String(inv.company_id ?? "").trim();
  if (!companyId) return { ok: false, error: "company_missing" };

  const mailTo = await resolveInvoiceBillingEmail(companyId);
  if (!mailTo) return { ok: false, error: "billing_email_missing" };
  if (!isOnrodaSmtpConfigured()) return { ok: false, error: "smtp_not_configured" };

  const company = await findCompanyById(companyId);
  const companyName = company?.billing_name?.trim() || company?.name?.trim() || companyId;
  const paymentReference = resolveInvoicePaymentReference({
    invoiceNumber: inv.invoice_number,
    storedReference: inv.payment_reference,
  });

  const mailResult = await sendInvoiceReminderMail({
    to: mailTo,
    companyName,
    invoiceNumber: inv.invoice_number,
    paymentReference,
    totalGross: Number(inv.total_gross),
    dueDate: inv.due_date ? String(inv.due_date) : null,
    periodFrom: String(inv.billing_period_start),
    periodTo: String(inv.billing_period_end),
  });

  if (!mailResult.ok) {
    return {
      ok: false,
      error: mailResult.reason === "smtp_not_configured" ? "smtp_not_configured" : "mail_send_failed",
    };
  }

  const sentAt = new Date().toISOString();
  const reminderCount = Number(prevMeta.reminder_count ?? 0) + 1;
  const priorHistory = Array.isArray(prevMeta.reminder_history)
    ? (prevMeta.reminder_history as Array<Record<string, unknown>>)
    : [];
  const reminder_history = [
    ...priorHistory,
    {
      sentAt,
      sentBy: input.actorLabel,
      sequence: reminderCount,
      mailTo,
      mailStatus: "sent",
    },
  ];

  try {
    await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, invoiceId))
        .for("update")
        .limit(1);
      const current = locked[0];
      if (!current) throw Object.assign(new Error("not_found"), { code: "invoice_not_found" });
      if (current.status === "paid") throw Object.assign(new Error("paid"), { code: "invoice_already_paid" });
      if (current.status === "cancelled") {
        throw Object.assign(new Error("cancelled"), { code: "invoice_cancelled" });
      }
      if (current.status === "draft") throw Object.assign(new Error("draft"), { code: "invoice_draft" });
      if (current.status === "reminder_sent") return;

      await tx
        .update(invoicesTable)
        .set({
          status: "reminder_sent",
          updated_at: new Date(),
          metadata_json: {
            ...prevMeta,
            reminder_sent_at: sentAt,
            reminder_count: reminderCount,
            last_reminder_by: input.actorLabel,
            reminder_history,
            reminder_mail_sent_at: sentAt,
            reminder_mail_to: mailTo,
            reminder_mail_status: "sent",
          },
        })
        .where(eq(invoicesTable.id, invoiceId));

      await insertFinancialAuditInTx(tx, {
        entityType: "invoice",
        entityId: invoiceId,
        action: "invoice_reminder_sent",
        oldValue: { status: current.status },
        newValue: {
          status: "reminder_sent",
          reminder_sent_at: sentAt,
          reminder_count: reminderCount,
          reminder_mail_sent_at: sentAt,
          reminder_mail_to: mailTo,
          reminder_mail_status: "sent",
        },
        actorType: "admin",
        actorId: input.actorLabel,
      });
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "invoice_not_found") return { ok: false, error: "invoice_not_found" };
    if (err.code === "invoice_cancelled") return { ok: false, error: "invoice_cancelled" };
    if (err.code === "invoice_already_paid") return { ok: false, error: "invoice_already_paid" };
    if (err.code === "invoice_draft") return { ok: false, error: "invoice_draft" };
    throw e;
  }

  return {
    ok: true,
    message: `Erinnerung gesendet an ${mailTo}.`,
    mail_to: mailTo,
    mail_status: "sent",
    reminder_mail_sent_at: sentAt,
    reminder_mail_to: mailTo,
    reminder_mail_status: "sent",
  };
}

function readInvoiceMeta(inv: typeof invoicesTable.$inferSelect): Record<string, unknown> {
  return inv.metadata_json && typeof inv.metadata_json === "object"
    ? (inv.metadata_json as Record<string, unknown>)
    : {};
}

async function resolveStatusAfterPaymentRevert(
  tx: ExecDb,
  invoiceId: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const fromMeta = meta.status_before_paid;
  if (typeof fromMeta === "string") {
    const s = fromMeta.trim().toLowerCase();
    if (s && s !== "paid" && s !== "cancelled") return s;
  }
  const audits = await tx
    .select()
    .from(financialAuditLogTable)
    .where(
      and(
        eq(financialAuditLogTable.entity_type, "invoice"),
        eq(financialAuditLogTable.entity_id, invoiceId),
        eq(financialAuditLogTable.action, "invoice_marked_paid"),
      ),
    )
    .orderBy(desc(financialAuditLogTable.created_at))
    .limit(1);
  const oldStatus = audits[0]?.old_value_json?.status;
  if (typeof oldStatus === "string") {
    const s = oldStatus.trim().toLowerCase();
    if (s && s !== "paid" && s !== "cancelled") return s;
  }
  return "issued";
}

/** Admin: Bezahlstatus zurücknehmen (Payment → reversed, Rechnung wieder offen, Audit). */
export async function adminRevertInvoicePayment(input: {
  invoiceId: string;
  actorLabel: string;
  reason?: string | null;
}): Promise<
  | { ok: true; invoiceId: string; restoredStatus: string; idempotent?: boolean }
  | { ok: false; error: string }
> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) return { ok: false, error: "invoice_id_required" };

  try {
    return await db.transaction(async (tx) => {
      const invRows = await tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, invoiceId))
        .for("update")
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw Object.assign(new Error("not_found"), { code: "invoice_not_found" });

      if (inv.status !== "paid") {
        return { ok: true as const, invoiceId, restoredStatus: inv.status, idempotent: true };
      }

      const prevMeta = readInvoiceMeta(inv);
      const restoredStatus = await resolveStatusAfterPaymentRevert(tx, invoiceId, prevMeta);
      const revertedAt = new Date();
      const reason = String(input.reason ?? "").trim();

      const bookedPayments = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.target_type, "invoice"),
            eq(paymentsTable.target_id, invoiceId),
            eq(paymentsTable.status, "booked"),
          ),
        )
        .orderBy(desc(paymentsTable.created_at));

      const reversedPaymentIds: string[] = [];
      for (const pay of bookedPayments) {
        const payMeta =
          pay.metadata_json && typeof pay.metadata_json === "object"
            ? (pay.metadata_json as Record<string, unknown>)
            : {};
        await tx
          .update(paymentsTable)
          .set({
            status: "reversed",
            updated_at: revertedAt,
            metadata_json: {
              ...payMeta,
              reversed_at: revertedAt.toISOString(),
              reversed_by_admin: input.actorLabel,
              revert_reason: reason || null,
            },
          })
          .where(eq(paymentsTable.id, pay.id));
        reversedPaymentIds.push(pay.id);
      }

      await tx
        .update(invoicesTable)
        .set({
          status: restoredStatus,
          updated_at: revertedAt,
          metadata_json: {
            ...prevMeta,
            payment_reverted_at: revertedAt.toISOString(),
            payment_reverted_by_admin: input.actorLabel,
            payment_revert_reason: reason || null,
            last_restored_status: restoredStatus,
          },
        })
        .where(eq(invoicesTable.id, invoiceId));

      await insertFinancialAuditInTx(tx, {
        entityType: "invoice",
        entityId: invoiceId,
        action: "invoice_payment_reverted",
        oldValue: {
          status: "paid",
          paymentIds: reversedPaymentIds,
          paid_at: prevMeta.paid_at ?? null,
          paid_by_admin: prevMeta.paid_by_admin ?? null,
        },
        newValue: {
          status: restoredStatus,
          reversedPaymentIds,
          revertedAt: revertedAt.toISOString(),
          revertedByAdmin: input.actorLabel,
          reason: reason || null,
        },
        actorType: "admin",
        actorId: input.actorLabel,
      });

      return { ok: true as const, invoiceId, restoredStatus };
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "invoice_not_found") return { ok: false, error: "invoice_not_found" };
    throw e;
  }
}
