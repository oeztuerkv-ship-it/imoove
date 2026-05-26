/** Admin: einheitliche Rechnungs-Timeline aus DB, Audit, Payments, Metadata. */

export type InvoiceTimelineKind =
  | "invoice_created"
  | "reminder_sent"
  | "marked_paid"
  | "payment_reverted"
  | "payment_booked"
  | "payment_reversed";

export type InvoiceTimelineEvent = {
  id: string;
  at: string;
  kind: InvoiceTimelineKind;
  title: string;
  detail: string | null;
  actor: string | null;
};

export type ReminderHistoryEntry = {
  sentAt: string;
  sentBy: string | null;
  sequence: number;
};

function parseIsoMs(iso: string | Date | null | undefined): number {
  if (!iso) return 0;
  const d = iso instanceof Date ? iso : new Date(String(iso));
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function auditTitle(action: string): string {
  const m: Record<string, string> = {
    invoice_marked_paid: "Als bezahlt markiert",
    invoice_reminder_sent: "Zahlungserinnerung gesendet",
    invoice_payment_reverted: "Zahlung zurückgenommen",
  };
  return m[action] ?? action;
}

function auditKind(action: string): InvoiceTimelineKind | null {
  if (action === "invoice_marked_paid") return "marked_paid";
  if (action === "invoice_reminder_sent") return "reminder_sent";
  if (action === "invoice_payment_reverted") return "payment_reverted";
  return null;
}

export function parseReminderHistory(meta: Record<string, unknown>): ReminderHistoryEntry[] {
  const raw = meta.reminder_history;
  if (!Array.isArray(raw)) {
    if (typeof meta.reminder_sent_at === "string") {
      return [
        {
          sentAt: meta.reminder_sent_at,
          sentBy: typeof meta.last_reminder_by === "string" ? meta.last_reminder_by : null,
          sequence: Number(meta.reminder_count ?? 1) || 1,
        },
      ];
    }
    return [];
  }
  return raw
    .map((row, i) => {
      const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const sentAt = typeof o.sentAt === "string" ? o.sentAt : "";
      if (!sentAt) return null;
      return {
        sentAt,
        sentBy: typeof o.sentBy === "string" ? o.sentBy : null,
        sequence: Number(o.sequence ?? i + 1) || i + 1,
      };
    })
    .filter((x): x is ReminderHistoryEntry => x !== null);
}

export function buildInvoiceTimeline(input: {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: Date | string;
  issueDate: string;
  auditEntries: Array<{
    id: string;
    action: string;
    created_at: Date | string;
    actor_id: string | null;
    new_value_json?: Record<string, unknown>;
  }>;
  payments: Array<{
    id: string;
    status: string;
    amount: number;
    paid_at: Date | string | null;
    reference: string;
    created_at: Date | string;
    metadata_json?: Record<string, unknown>;
  }>;
  reminderHistory: ReminderHistoryEntry[];
}): InvoiceTimelineEvent[] {
  const events: InvoiceTimelineEvent[] = [];

  events.push({
    id: `created-${input.invoiceId}`,
    at: new Date(input.createdAt).toISOString(),
    kind: "invoice_created",
    title: "Rechnung erstellt",
    detail: `${input.invoiceNumber} · Ausstellungsdatum ${input.issueDate}`,
    actor: null,
  });

  for (const r of input.reminderHistory) {
    events.push({
      id: `reminder-${r.sentAt}-${r.sequence}`,
      at: r.sentAt.includes("T") ? r.sentAt : `${r.sentAt}T12:00:00.000Z`,
      kind: "reminder_sent",
      title: "Zahlungserinnerung gesendet",
      detail: r.sequence > 1 ? `Erinnerung #${r.sequence}` : null,
      actor: r.sentBy,
    });
  }

  for (const a of input.auditEntries) {
    const kind = auditKind(a.action);
    if (!kind) continue;
    const nv = a.new_value_json ?? {};
    let detail: string | null = null;
    if (kind === "marked_paid" && nv.amount != null) {
      detail = `Betrag ${nv.amount} € · Ref. ${String(nv.reference ?? "—")}`;
    }
    if (kind === "payment_reverted" && nv.reason) {
      detail = String(nv.reason);
    }
    events.push({
      id: `audit-${a.id}`,
      at: new Date(a.created_at).toISOString(),
      kind,
      title: auditTitle(a.action),
      detail,
      actor: a.actor_id,
    });
  }

  for (const p of input.payments) {
    const meta =
      p.metadata_json && typeof p.metadata_json === "object"
        ? (p.metadata_json as Record<string, unknown>)
        : {};
    if (p.status === "booked") {
      events.push({
        id: `pay-booked-${p.id}`,
        at: (p.paid_at ? new Date(p.paid_at) : new Date(p.created_at)).toISOString(),
        kind: "payment_booked",
        title: "Zahlung verbucht",
        detail: `${p.amount} € · ${p.reference || "—"}`,
        actor: typeof meta.createdByActor === "string" ? meta.createdByActor : null,
      });
    }
    if (p.status === "reversed") {
      const revAt = typeof meta.reversed_at === "string" ? meta.reversed_at : new Date(p.created_at).toISOString();
      events.push({
        id: `pay-reversed-${p.id}`,
        at: revAt.includes("T") ? revAt : `${revAt}T12:00:00.000Z`,
        kind: "payment_reversed",
        title: "Zahlung zurückgenommen (Payment reversed)",
        detail:
          typeof meta.revert_reason === "string" && meta.revert_reason
            ? meta.revert_reason
            : `${p.amount} €`,
        actor: typeof meta.reversed_by_admin === "string" ? meta.reversed_by_admin : null,
      });
    }
  }

  events.sort((a, b) => parseIsoMs(b.at) - parseIsoMs(a.at));
  return events;
}
