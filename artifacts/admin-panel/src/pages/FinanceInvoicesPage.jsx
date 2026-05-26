import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/invoices`;
const PAGE_SIZE = 20;

const WORKFLOW_TABS = [
  { v: "", label: "Alle" },
  { v: "open", label: "Offen" },
  { v: "due", label: "Fällig" },
  { v: "overdue", label: "Überfällig" },
  { v: "reminder_sent", label: "Zahlungserinnerung gesendet" },
  { v: "paid", label: "Bezahlt" },
  { v: "cancelled", label: "Storniert" },
];

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusPillClass(workflowOrStatus) {
  const s = String(workflowOrStatus ?? "").toLowerCase();
  if (s === "paid") return "admin-status-pill admin-status-pill--ok";
  if (s === "overdue" || s === "cancelled") return "admin-status-pill admin-status-pill--bad";
  if (s === "reminder_sent") return "admin-status-pill admin-status-pill--warn";
  if (["issued", "open", "due", "partially_paid", "partial", "draft"].includes(s)) {
    return "admin-status-pill admin-status-pill--pending";
  }
  return "admin-status-pill";
}

function auditActionLabel(action) {
  const m = {
    invoice_marked_paid: "Als bezahlt markiert",
    invoice_reminder_sent: "Zahlungserinnerung gesendet",
    invoice_payment_reverted: "Zahlung zurückgenommen",
  };
  return m[action] ?? action;
}

export default function FinanceInvoicesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [workflowFilter, setWorkflowFilter] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (workflowFilter) q.set("workflow_filter", workflowFilter);
      if (companyId.trim()) q.set("company_id", companyId.trim());
      if (companyCode.trim()) q.set("company_code", companyCode.trim());
      if (invoicePrefix.trim()) q.set("invoice_prefix", invoicePrefix.trim());
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Rechnungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, workflowFilter, companyId, companyCode, invoicePrefix]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id) {
    setDetailLoading(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setDetail(data.item);
    } catch {
      setDetail({ error: "Rechnungsdetail konnte nicht geladen werden." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function markPaid(id) {
    const targetId = id ?? detail?.id;
    if (!targetId || detail?.workflow_status === "paid") return;
    setMarkBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(targetId)}/mark-paid`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setActionMsg(data.idempotent ? "War bereits als bezahlt verbucht." : "Als bezahlt markiert.");
      await openDetail(targetId);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Markieren fehlgeschlagen.");
    } finally {
      setMarkBusy(false);
    }
  }

  async function revertPayment(id) {
    const targetId = id ?? detail?.id;
    if (!targetId) return;
    const reason = window.prompt(
      "Grund für die Rücknahme (optional, z. B. „Versehentlich als bezahlt markiert“):",
      "Versehentlich als bezahlt markiert",
    );
    if (reason === null) return;
    setRevertBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(targetId)}/revert-payment`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setActionMsg(
        data.idempotent
          ? "Rechnung war bereits nicht mehr als bezahlt verbucht."
          : `Zahlung zurückgenommen (Status: ${data.restoredStatus || data.invoice?.status || "offen"}).`,
      );
      if (data.invoice) setDetail(data.invoice);
      else await openDetail(targetId);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Rücknahme fehlgeschlagen.");
    } finally {
      setRevertBusy(false);
    }
  }

  async function sendReminder(id) {
    const targetId = id ?? detail?.id;
    if (!targetId) return;
    setReminderBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(targetId)}/send-reminder`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setActionMsg(data.idempotent ? "Erinnerung war bereits verbucht." : "Zahlungserinnerung gesendet.");
      await openDetail(targetId);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Erinnerung fehlgeschlagen.");
    } finally {
      setReminderBusy(false);
    }
  }

  function downloadPdf(id, invoiceNumber) {
    const url = `${LIST_URL}/${encodeURIComponent(id)}/pdf`;
    fetch(url, { headers: adminApiHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `ONRODA-Rechnung-${invoiceNumber || id}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        window.alert("PDF konnte nicht geladen werden.");
      });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canMarkPaid =
    detail &&
    !("error" in detail) &&
    detail.workflow_status !== "paid" &&
    detail.workflow_status !== "cancelled" &&
    detail.status !== "paid" &&
    detail.status !== "cancelled";
  const canRemind =
    detail &&
    !("error" in detail) &&
    !["paid", "cancelled", "draft"].includes(detail.workflow_status ?? detail.status);
  const canRevert =
    detail &&
    !("error" in detail) &&
    (detail.workflow_status === "paid" || detail.status === "paid");

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Plattform-Rechnungen (B2B)</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--admin-muted, #6b7280)" }}>
          Einheitlicher Workflow für Hotel, Medical, Corporate und Taxi — Verwendungszweck = Rechnungsnummer (z. B.{" "}
          <span className="admin-mono">ONR-HOT-2026-04-001</span>).
        </p>

        <div className="admin-finance-tabs" role="tablist" aria-label="Rechnungsstatus">
          {WORKFLOW_TABS.map((tab) => (
            <button
              key={tab.v || "all"}
              type="button"
              role="tab"
              aria-selected={workflowFilter === tab.v}
              className={"admin-finance-tabs__btn" + (workflowFilter === tab.v ? " admin-finance-tabs__btn--on" : "")}
              onClick={() => {
                setWorkflowFilter(tab.v);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-table-toolbar" style={{ marginTop: 12 }}>
          <input
            className="admin-input"
            placeholder="Mandanten-ID (intern)"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 140 }}
          />
          <input
            className="admin-input admin-mono"
            placeholder="Mandanten-Code"
            value={companyCode}
            onChange={(e) => {
              setCompanyCode(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 120 }}
          />
          <input
            className="admin-input admin-mono"
            placeholder="Prefix (HOT)"
            value={invoicePrefix}
            onChange={(e) => {
              setInvoicePrefix(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 100 }}
          />
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        <div className="admin-table-card" style={{ marginTop: 14 }}>
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head admin-finance-inv-row">
              <div>Rechnung</div>
              <div>Unternehmen</div>
              <div>Brutto</div>
              <div>Fällig</div>
              <div>Status</div>
              <div>Aktionen</div>
            </div>
            {items.map((x) => {
              const wf = x.workflow_status || x.status;
              const label = x.status_label_de || wf;
              return (
                <div className="admin-table-row admin-finance-inv-row" key={x.id}>
                  <div>
                    <div className="admin-mono" style={{ fontWeight: 700 }}>
                      {x.invoice_number}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--admin-muted,#6b7280)", marginTop: 4 }}>
                      {fmtDate(x.billing_period_start)} – {fmtDate(x.billing_period_end)}
                    </div>
                  </div>
                  <div>
                    {x.company_name || "—"}
                    {x.company_code ? (
                      <span className="admin-mono" style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                        {x.company_code}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontWeight: 700 }}>{money(x.total_gross)}</div>
                  <div style={{ fontSize: 13 }}>{fmtDate(x.due_date)}</div>
                  <div>
                    <span className={statusPillClass(wf)}>{label}</span>
                  </div>
                  <div className="admin-finance-inv-actions">
                    <button
                      type="button"
                      className="admin-page-btn admin-page-btn--compact"
                      onClick={() => downloadPdf(x.id, x.invoice_number)}
                    >
                      PDF
                    </button>
                    {wf !== "paid" && wf !== "cancelled" && wf !== "draft" ? (
                      <button
                        type="button"
                        className="admin-page-btn admin-page-btn--compact"
                        disabled={reminderBusy}
                        onClick={() => void sendReminder(x.id)}
                      >
                        Erinnerung
                      </button>
                    ) : null}
                    {wf !== "paid" && wf !== "cancelled" ? (
                      <button
                        type="button"
                        className="admin-page-btn admin-page-btn--compact"
                        disabled={markBusy}
                        onClick={() => void markPaid(x.id)}
                      >
                        Bezahlt
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-page-btn admin-page-btn--compact"
                      onClick={() => void openDetail(x.id)}
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Rechnungen gefunden.</div> : null}
          </div>
        </div>

        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-page-dots">
            Seite {page} / {pages} ({total} gesamt)
          </span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            Weiter
          </button>
        </div>
      </div>

      {detailLoading ? (
        <div className="admin-panel-card">
          <p style={{ margin: 0 }}>Detail wird geladen …</p>
        </div>
      ) : null}

      {detail && !detailLoading ? (
        <div className="admin-panel-card">
          <div className="admin-panel-card__title">Rechnungsdetail</div>
          {actionMsg ? <div className="admin-info-banner" style={{ marginBottom: 12 }}>{actionMsg}</div> : null}
          {"error" in detail ? (
            <div className="admin-error-banner">{detail.error}</div>
          ) : (
            <>
              <div className="finance-detail-grid">
                <div>
                  <strong>Rechnungsnr.:</strong> {detail.invoice_number}
                </div>
                <div>
                  <strong>Unternehmen:</strong> {detail.company_name || "—"}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  <span className={statusPillClass(detail.workflow_status || detail.status)}>
                    {detail.status_label_de || detail.workflow_status}
                  </span>
                </div>
                <div>
                  <strong>Fällig:</strong> {fmtDate(detail.due_date)}
                </div>
                <div>
                  <strong>Brutto:</strong> {money(detail.total_gross)}
                </div>
                <div>
                  <strong>Bezahlt am:</strong> {detail.paid_at ? fmtDate(detail.paid_at) : "—"}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>Verwendungszweck:</strong>
                  <div className="admin-mono" style={{ marginTop: 6, fontSize: 13, wordBreak: "break-word" }}>
                    {detail.payment_reference || detail.invoice_number}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => downloadPdf(detail.id, detail.invoice_number)}>
                  PDF
                </button>
                {canRemind ? (
                  <button type="button" className="admin-page-btn" onClick={() => void sendReminder()} disabled={reminderBusy}>
                    {reminderBusy ? "Sende …" : "Zahlungserinnerung senden"}
                  </button>
                ) : null}
                {canMarkPaid ? (
                  <button type="button" className="admin-page-btn" onClick={() => void markPaid()} disabled={markBusy}>
                    {markBusy ? "Speichere …" : "Als bezahlt markieren"}
                  </button>
                ) : null}
                {canRevert ? (
                  <button
                    type="button"
                    className="admin-page-btn admin-page-btn--compact"
                    onClick={() => void revertPayment()}
                    disabled={revertBusy}
                  >
                    {revertBusy ? "Rücknahme …" : "Zahlung zurücknehmen"}
                  </button>
                ) : null}
                <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => setDetail(null)}>
                  Schließen
                </button>
              </div>

              {detail.payment_reverted_at ? (
                <p style={{ marginTop: 12, fontSize: 13, color: "var(--admin-muted,#6b7280)" }}>
                  Zuletzt zurückgenommen: {fmtDate(detail.payment_reverted_at)}
                  {detail.payment_reverted_by_admin ? ` · ${detail.payment_reverted_by_admin}` : null}
                  {detail.payment_revert_reason ? ` · „${detail.payment_revert_reason}"` : null}
                </p>
              ) : null}

              {Array.isArray(detail.payments) && detail.payments.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Zahlungen</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {detail.payments.map((p) => (
                      <li key={p.id}>
                        {money(p.amount)} · <strong>{p.status}</strong> · {p.reference || "—"} ·{" "}
                        {p.paid_at ? fmtDate(p.paid_at) : "offen"}
                        {p.status === "reversed" ? " (zurückgenommen)" : null}
                        {detail.paid_by_admin && p.status === "booked" ? ` · Admin: ${detail.paid_by_admin}` : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(detail.audit_entries) && detail.audit_entries.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Verlauf / Audit</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {detail.audit_entries.map((a) => (
                      <li key={a.id}>
                        {fmtDate(a.created_at)} · {auditActionLabel(a.action)}
                        {a.actor_id ? ` · ${a.actor_id}` : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
