import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/invoices`;
const KPIS_URL = `${API_BASE}/admin/finance/invoices/kpis`;
const LOOKUP_URL = `${API_BASE}/admin/finance/invoices/lookup`;
const EXPORT_URL = `${API_BASE}/admin/finance/invoices/export`;
const MONTHLY_RUN_URL = `${API_BASE}/admin/finance/invoices/monthly-run`;
const PAGE_SIZE = 20;

function defaultPreviousMonthPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const prevEnd = new Date(y, m, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const fmt = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { periodStart: fmt(prevStart), periodEnd: fmt(prevEnd) };
}

const MONTHLY_OUTCOME_LABELS = {
  created: "Erzeugt",
  skipped: "Übersprungen",
  no_rides: "Keine Fahrten",
  error: "Fehler",
};

const WORKFLOW_TABS = [
  { v: "", label: "Alle" },
  { v: "open", label: "Offen" },
  { v: "due", label: "Fällig" },
  { v: "overdue", label: "Überfällig" },
  { v: "reminder_sent", label: "Erinnerung" },
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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function timelineKindClass(kind) {
  if (kind === "marked_paid" || kind === "payment_booked") return "admin-finance-timeline__dot--ok";
  if (kind === "payment_reverted" || kind === "payment_reversed") return "admin-finance-timeline__dot--warn";
  if (kind === "reminder_sent") return "admin-finance-timeline__dot--info";
  return "";
}

export default function FinanceInvoicesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [workflowFilter, setWorkflowFilter] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [bankReference, setBankReference] = useState("");

  const [monthlyRunOpen, setMonthlyRunOpen] = useState(false);
  const [monthlyPeriodStart, setMonthlyPeriodStart] = useState(() => defaultPreviousMonthPeriod().periodStart);
  const [monthlyPeriodEnd, setMonthlyPeriodEnd] = useState(() => defaultPreviousMonthPeriod().periodEnd);
  const [monthlyRunBusy, setMonthlyRunBusy] = useState(false);
  const [monthlyRunReport, setMonthlyRunReport] = useState(null);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const res = await fetch(KPIS_URL, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.ok) setKpis(data.kpis);
    } catch {
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  }, []);

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
      if (bankReference.trim()) q.set("invoice_number", bankReference.trim());
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
  }, [page, workflowFilter, companyId, companyCode, invoicePrefix, bankReference]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

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

  async function bankLookup() {
    const ref = bankReference.trim();
    if (!ref) return;
    setLookupBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LOOKUP_URL}?${new URLSearchParams({ reference: ref })}`, {
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(data.error === "not_found" ? `Keine Rechnung für „${ref}".` : "Lookup fehlgeschlagen.");
        return;
      }
      if (data.invoice?.id) {
        setDetail(data.invoice);
        setActionMsg(`Bankmatching: ${data.invoice.invoice_number} (${data.invoice.company_name || "—"})`);
      }
    } catch {
      setActionMsg("Bankmatching fehlgeschlagen.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function exportCsv() {
    const q = new URLSearchParams();
    if (workflowFilter) q.set("workflow_filter", workflowFilter);
    if (companyId.trim()) q.set("company_id", companyId.trim());
    if (companyCode.trim()) q.set("company_code", companyCode.trim());
    if (invoicePrefix.trim()) q.set("invoice_prefix", invoicePrefix.trim());
    try {
      const res = await fetch(`${EXPORT_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "onroda-rechnungen.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.alert("CSV-Export fehlgeschlagen.");
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
      await loadKpis();
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
      "Grund für die Rücknahme (optional):",
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
          : `Zahlung zurückgenommen (Status: ${data.restoredStatus || "offen"}).`,
      );
      if (data.invoice) setDetail(data.invoice);
      else await openDetail(targetId);
      await load();
      await loadKpis();
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
      await loadKpis();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Erinnerung fehlgeschlagen.");
    } finally {
      setReminderBusy(false);
    }
  }

  async function runMonthlyInvoiceBatch(dryRun) {
    if (!monthlyPeriodStart.trim() || !monthlyPeriodEnd.trim()) {
      setActionMsg("Bitte Abrechnungszeitraum (von/bis) angeben.");
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        `Monatslauf wirklich ausführen?\n\nZeitraum: ${monthlyPeriodStart} – ${monthlyPeriodEnd}\n\nEs werden Rechnungen erstellt und ride_financials auf „invoiced“ gesetzt. Kein E-Mail-Versand.`,
      );
      if (!ok) return;
    }
    setMonthlyRunBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(MONTHLY_RUN_URL, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: monthlyPeriodStart.trim(),
          periodEnd: monthlyPeriodEnd.trim(),
          dryRun,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setMonthlyRunReport(data);
      const s = data.summary ?? {};
      const prefix = dryRun ? "Vorschau (Dry-Run)" : "Monatslauf abgeschlossen";
      setActionMsg(
        `${prefix}: ${s.createdCount ?? 0} erzeugt, ${s.skippedCount ?? 0} übersprungen, ${s.noRidesCount ?? 0} ohne Fahrten, ${s.errorCount ?? 0} Fehler — Summe ${money(s.totalGrossCreated)}.`,
      );
      if (!dryRun) {
        await load();
        await loadKpis();
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Monatslauf fehlgeschlagen.");
      setMonthlyRunReport(null);
    } finally {
      setMonthlyRunBusy(false);
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
      .catch(() => window.alert("PDF konnte nicht geladen werden."));
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
    detail && !("error" in detail) && (detail.workflow_status === "paid" || detail.status === "paid");

  const kpiCards = [
    { label: "Offene Summe", value: money(kpis?.openTotalGross) },
    { label: "Überfällige Summe", value: money(kpis?.overdueTotalGross) },
    { label: "Bezahlt (Monat)", value: money(kpis?.paidThisMonthGross) },
    { label: "Offene Rechnungen", value: String(kpis?.openCount ?? "—") },
    { label: "Überfällige Rechnungen", value: String(kpis?.overdueCount ?? "—") },
  ];

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Rechnungs-KPIs (Plattform)</div>
        <div className="finance-kpi-grid">
          {kpiCards.map((c) => (
            <div key={c.label} className="finance-kpi-card">
              <div className="finance-kpi-card__label">{c.label}</div>
              <div className="finance-kpi-card__value admin-crisp-numeric">
                {kpisLoading ? "…" : c.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Plattform-Rechnungen (B2B)</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--admin-muted, #6b7280)" }}>
          Verwendungszweck = Rechnungsnummer (z. B. <span className="admin-mono">ONR-HOT-2026-04-001</span>). PDF
          bleibt neutral („Rechnung“).
        </p>

        <div className="admin-table-toolbar" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="admin-page-btn"
            onClick={() => {
              const d = defaultPreviousMonthPeriod();
              setMonthlyPeriodStart(d.periodStart);
              setMonthlyPeriodEnd(d.periodEnd);
              setMonthlyRunReport(null);
              setMonthlyRunOpen((o) => !o);
            }}
          >
            {monthlyRunOpen ? "Monatslauf schließen" : "Monatslauf starten"}
          </button>
          <input
            className="admin-input admin-mono"
            placeholder="Bankmatching: Rechnungsnr. / Verwendungszweck"
            value={bankReference}
            onChange={(e) => {
              setBankReference(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 260, flex: 1 }}
          />
          <button type="button" className="admin-page-btn admin-page-btn--compact" disabled={lookupBusy} onClick={() => void bankLookup()}>
            {lookupBusy ? "Suche …" : "Finden"}
          </button>
          <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void exportCsv()}>
            CSV-Export
          </button>
        </div>

        {monthlyRunOpen ? (
          <div className="admin-finance-monthly-run">
            <div className="admin-finance-monthly-run__head">
              <strong>Monatslauf (manuell)</strong>
              <span className="admin-finance-monthly-run__hint">
                Hotel, Corporate, Medical/Kasse, Voucher — aus offenen ride_financials. Idempotent pro Mandant
                und Zeitraum. PDF über bestehende Rechnungs-PDF-Route.
              </span>
            </div>
            <div className="admin-finance-monthly-run__fields">
              <label>
                <span>Von</span>
                <input
                  type="date"
                  className="admin-input"
                  value={monthlyPeriodStart}
                  onChange={(e) => setMonthlyPeriodStart(e.target.value)}
                />
              </label>
              <label>
                <span>Bis</span>
                <input
                  type="date"
                  className="admin-input"
                  value={monthlyPeriodEnd}
                  onChange={(e) => setMonthlyPeriodEnd(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="admin-page-btn admin-page-btn--compact"
                disabled={monthlyRunBusy}
                onClick={() => void runMonthlyInvoiceBatch(true)}
              >
                {monthlyRunBusy ? "Läuft …" : "Vorschau (Dry-Run)"}
              </button>
              <button
                type="button"
                className="admin-page-btn"
                disabled={monthlyRunBusy}
                onClick={() => void runMonthlyInvoiceBatch(false)}
              >
                {monthlyRunBusy ? "Läuft …" : "Monatslauf ausführen"}
              </button>
            </div>
            {monthlyRunReport?.summary ? (
              <div className="admin-finance-monthly-run__summary">
                <span>
                  {monthlyRunReport.dryRun ? "Vorschau" : "Ergebnis"} · {monthlyRunReport.periodStart} –{" "}
                  {monthlyRunReport.periodEnd}
                </span>
                <span>
                  Mandanten: {monthlyRunReport.summary.companiesScanned} · Erzeugt:{" "}
                  {monthlyRunReport.summary.createdCount} · Übersprungen: {monthlyRunReport.summary.skippedCount} ·
                  Ohne Fahrten: {monthlyRunReport.summary.noRidesCount} · Fehler: {monthlyRunReport.summary.errorCount}
                </span>
                <span className="admin-crisp-numeric">
                  Gesamtbetrag: {money(monthlyRunReport.summary.totalGrossCreated)}
                </span>
              </div>
            ) : null}
            {Array.isArray(monthlyRunReport?.results) && monthlyRunReport.results.length > 0 ? (
              <div className="admin-table-card admin-finance-monthly-run__table">
                <div className="admin-table-scroll">
                  <div className="admin-table-row admin-table-row--head admin-finance-monthly-run-row">
                    <div>Mandant</div>
                    <div>Status</div>
                    <div>Fahrten</div>
                    <div>Netto</div>
                    <div>MwSt</div>
                    <div>Brutto</div>
                    <div>Rechnung</div>
                  </div>
                  {monthlyRunReport.results.map((row) => {
                    const status = row.status ?? row.outcome;
                    return (
                      <div className="admin-table-row admin-finance-monthly-run-row" key={row.company_id ?? row.companyId}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{row.company_name ?? row.companyName}</div>
                          <div className="admin-mono" style={{ fontSize: 12, color: "#64748b" }}>
                            {row.company_code ?? row.companyCode ?? "—"} · {row.company_id ?? row.companyId}
                          </div>
                        </div>
                        <div>
                          <span
                            className={
                              status === "error"
                                ? "admin-status-pill admin-status-pill--bad"
                                : status === "skipped"
                                  ? "admin-status-pill admin-status-pill--warn"
                                  : "admin-status-pill"
                            }
                          >
                            {status === "created" && monthlyRunReport.dryRun
                              ? "Würde erzeugen"
                              : MONTHLY_OUTCOME_LABELS[status] || status}
                          </span>
                          {row.error && status !== "created" ? (
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{row.error}</div>
                          ) : null}
                        </div>
                        <div>{row.ride_count ?? row.rideCount ?? "—"}</div>
                        <div className="admin-crisp-numeric">
                          {row.subtotal_net != null ? money(row.subtotal_net) : "—"}
                        </div>
                        <div className="admin-crisp-numeric">
                          {row.vat_total != null ? money(row.vat_total) : "—"}
                        </div>
                        <div className="admin-crisp-numeric">
                          {row.total_gross != null ? money(row.total_gross) : "—"}
                        </div>
                        <div className="admin-mono" style={{ fontSize: 12 }}>
                          {row.invoice_number ?? row.invoiceNumber ?? row.invoice_id ?? "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

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
            placeholder="Mandanten-ID"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 120 }}
          />
          <input
            className="admin-input admin-mono"
            placeholder="Mandanten-Code"
            value={companyCode}
            onChange={(e) => {
              setCompanyCode(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 110 }}
          />
          <input
            className="admin-input admin-mono"
            placeholder="Prefix HOT"
            value={invoicePrefix}
            onChange={(e) => {
              setInvoicePrefix(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: 90 }}
          />
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        {actionMsg && !detail ? <div className="admin-info-banner" style={{ marginTop: 12 }}>{actionMsg}</div> : null}

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
              return (
                <div className="admin-table-row admin-finance-inv-row" key={x.id}>
                  <div>
                    <div className="admin-mono" style={{ fontWeight: 700 }}>
                      {x.invoice_number}
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
                  <div>{fmtDate(x.due_date)}</div>
                  <div>
                    <span className={statusPillClass(wf)}>{x.status_label_de || wf}</span>
                  </div>
                  <div className="admin-finance-inv-actions">
                    <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => downloadPdf(x.id, x.invoice_number)}>
                      PDF
                    </button>
                    <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void openDetail(x.id)}>
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
          <div className="admin-panel-card__title">Rechnungsdetail · {detail.invoice_number}</div>
          {actionMsg ? <div className="admin-info-banner" style={{ marginBottom: 12 }}>{actionMsg}</div> : null}
          {"error" in detail ? (
            <div className="admin-error-banner">{detail.error}</div>
          ) : (
            <>
              <div className="finance-detail-grid">
                <div>
                  <strong>Unternehmen:</strong> {detail.company_name || "—"}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  <span className={statusPillClass(detail.workflow_status || detail.status)}>
                    {detail.status_label_de}
                  </span>
                </div>
                <div>
                  <strong>Brutto:</strong> {money(detail.total_gross)}
                </div>
                <div>
                  <strong>Fällig:</strong> {fmtDate(detail.due_date)}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>Verwendungszweck:</strong>
                  <div className="admin-mono" style={{ marginTop: 6, wordBreak: "break-word" }}>
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
                  <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void revertPayment()} disabled={revertBusy}>
                    {revertBusy ? "Rücknahme …" : "Zahlung zurücknehmen"}
                  </button>
                ) : null}
                <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => setDetail(null)}>
                  Schließen
                </button>
              </div>

              {Array.isArray(detail.timeline) && detail.timeline.length > 0 ? (
                <div style={{ marginTop: 24 }}>
                  <strong>Timeline / Zahlungshistorie</strong>
                  <ul className="admin-finance-timeline">
                    {detail.timeline.map((ev) => (
                      <li key={ev.id} className="admin-finance-timeline__item">
                        <span className={"admin-finance-timeline__dot " + timelineKindClass(ev.kind)} aria-hidden />
                        <div className="admin-finance-timeline__body">
                          <div className="admin-finance-timeline__title">{ev.title}</div>
                          <div className="admin-finance-timeline__meta">
                            {fmtDateTime(ev.at)}
                            {ev.actor ? ` · ${ev.actor}` : null}
                          </div>
                          {ev.detail ? <div className="admin-finance-timeline__detail">{ev.detail}</div> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(detail.reminder_history) && detail.reminder_history.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Reminder-Historie</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {detail.reminder_history.map((r) => (
                      <li key={`${r.sentAt}-${r.sequence}`}>
                        #{r.sequence} · {fmtDateTime(r.sentAt)}
                        {r.sentBy ? ` · ${r.sentBy}` : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(detail.payment_history) && detail.payment_history.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Payments (vollständig)</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {detail.payment_history.map((p) => (
                      <li key={p.id}>
                        <strong>{p.status}</strong> · {money(p.amount)} · {p.reference || "—"} ·{" "}
                        {p.paid_at ? fmtDateTime(p.paid_at) : "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(detail.audit_entries) && detail.audit_entries.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Audit (Rohdaten)</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#64748b" }}>
                    {detail.audit_entries.map((a) => (
                      <li key={a.id}>
                        {fmtDateTime(a.created_at)} · <code>{a.action}</code>
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
