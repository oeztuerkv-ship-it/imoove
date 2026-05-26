/**
 * Einheitlicher Rechnungs-Workflow (Admin + Partner + PDF-Anzeige).
 * Gespeichert in DB: draft | issued | partially_paid | paid | cancelled | overdue | reminder_sent.
 * Abgeleitet (Anzeige/Filter): due aus Fälligkeitsdatum.
 */

export const INVOICE_STORED_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
  "overdue",
  "reminder_sent",
] as const;

export type InvoiceStoredStatus = (typeof INVOICE_STORED_STATUSES)[number];

export const INVOICE_WORKFLOW_STATUSES = [
  "draft",
  "issued",
  "due",
  "overdue",
  "reminder_sent",
  "partially_paid",
  "paid",
  "cancelled",
] as const;

export type InvoiceWorkflowStatus = (typeof INVOICE_WORKFLOW_STATUSES)[number];

/** Admin-Listenfilter (Tabs). */
export type InvoiceWorkflowFilter =
  | "all"
  | "open"
  | "due"
  | "overdue"
  | "reminder_sent"
  | "paid"
  | "cancelled";

export function berlinDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
}

export function invoiceDueDateKey(due: string | Date | null | undefined): string | null {
  if (due == null || due === "") return null;
  if (due instanceof Date) {
    if (Number.isNaN(due.getTime())) return null;
    return berlinDateKey(due);
  }
  const s = String(due).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s.includes("T") ? s : `${s}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return berlinDateKey(parsed);
}

export function resolveInvoiceWorkflowStatus(
  row: {
    status: string;
    due_date?: string | Date | null;
  },
  now: Date = new Date(),
): InvoiceWorkflowStatus {
  const stored = row.status.trim().toLowerCase();
  if (stored === "paid") return "paid";
  if (stored === "cancelled") return "cancelled";
  if (stored === "draft") return "draft";
  if (stored === "partially_paid") return "partially_paid";
  if (stored === "reminder_sent") return "reminder_sent";
  if (stored === "overdue") return "overdue";

  const dueKey = invoiceDueDateKey(row.due_date);
  const today = berlinDateKey(now);
  if (!dueKey) return "issued";

  if (dueKey > today) return "issued";
  if (dueKey === today) return "due";
  return "overdue";
}

export function workflowStatusLabelDe(status: InvoiceWorkflowStatus): string {
  const m: Record<InvoiceWorkflowStatus, string> = {
    draft: "Entwurf",
    issued: "Offen",
    due: "Fällig",
    overdue: "Überfällig",
    reminder_sent: "Zahlungserinnerung gesendet",
    partially_paid: "Teilweise bezahlt",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
  return m[status] ?? status;
}

export function workflowFilterLabelDe(filter: InvoiceWorkflowFilter): string {
  const m: Record<InvoiceWorkflowFilter, string> = {
    all: "Alle",
    open: "Offen",
    due: "Fällig",
    overdue: "Überfällig",
    reminder_sent: "Zahlungserinnerung gesendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
  return m[filter] ?? filter;
}

export function matchesWorkflowFilter(
  workflow: InvoiceWorkflowStatus,
  filter: InvoiceWorkflowFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return workflow === "paid";
  if (filter === "cancelled") return workflow === "cancelled";
  if (filter === "reminder_sent") return workflow === "reminder_sent";
  if (filter === "due") return workflow === "due";
  if (filter === "overdue") return workflow === "overdue";
  if (filter === "open") {
    return workflow === "issued" || workflow === "partially_paid";
  }
  return false;
}

/** PDF: neutral — kein „Überfällig“ o. Ä. im Dokument. */
export function invoicePdfNeutralStatusLabel(): string {
  return "Rechnung";
}

export type PartnerPaymentUiKind = "none" | "open_payment" | "reminder";

export type PartnerPaymentUi = {
  kind: PartnerPaymentUiKind;
  title: string;
  bodyLines: string[];
  showPaymentDetails: boolean;
};

export function buildPartnerPaymentUi(input: {
  workflowStatus: InvoiceWorkflowStatus;
  invoiceNumber: string;
  totalGross: number;
  dueDate: string | null;
  paymentReference: string;
}): PartnerPaymentUi {
  const none: PartnerPaymentUi = {
    kind: "none",
    title: "",
    bodyLines: [],
    showPaymentDetails: false,
  };
  if (["paid", "cancelled", "draft"].includes(input.workflowStatus)) return none;

  const ref = input.paymentReference || input.invoiceNumber;
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    input.totalGross,
  );
  const dueFmt = input.dueDate
    ? new Date(input.dueDate.includes("T") ? input.dueDate : `${input.dueDate}T12:00:00`).toLocaleDateString(
        "de-DE",
        { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : "—";

  if (input.workflowStatus === "overdue" || input.workflowStatus === "reminder_sent") {
    const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
      input.totalGross,
    );
    return {
      kind: "reminder",
      title: "Zahlungserinnerung",
      bodyLines: [
        `Zu Rechnung ${input.invoiceNumber} (${amount}) liegt noch kein Zahlungseingang vor.`,
        input.dueDate ? `Fällig war: ${dueFmt}.` : "",
        "Bitte überweisen Sie mit folgendem Verwendungszweck:",
        ref,
      ].filter(Boolean),
      showPaymentDetails: true,
    };
  }

  if (["issued", "due", "partially_paid"].includes(input.workflowStatus)) {
    return {
      kind: "open_payment",
      title: "Offene Zahlung",
      bodyLines: [
        `Rechnung: ${input.invoiceNumber}`,
        `Betrag: ${amount}`,
        `Zahlbar bis: ${dueFmt}`,
      ],
      showPaymentDetails: true,
    };
  }

  return none;
}
