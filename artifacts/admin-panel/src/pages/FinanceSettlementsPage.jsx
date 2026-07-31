import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/settlements`;
const WEEKLY_RUN_URL = `${API_BASE}/admin/finance/settlements/weekly-commission-run`;
const TAXI_COMPANIES_URL = `${API_BASE}/admin/taxi-fleet-drivers/taxi-companies`;
const PAGE_SIZE = 25;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function directionDe(direction) {
  if (direction === "partner_pays_platform") return "Partner → ONRODA";
  if (direction === "platform_pays_partner") return "ONRODA → Partner";
  return direction || "—";
}

function directionBadgeClass(direction) {
  if (direction === "partner_pays_platform") return "admin-c-badge admin-c-badge--warn";
  if (direction === "platform_pays_partner") return "admin-c-badge admin-c-badge--ok";
  return "admin-c-badge admin-c-badge--neutral";
}

/**
 * @param {{
 *   onOpenInvoice?: (invoiceId: string, opts?: { metadataSource?: string }) => void;
 * }} props
 */
export default function FinanceSettlementsPage({ onOpenInvoice }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({
    companyId: "",
    status: "",
    direction: "",
    hasCommissionInvoice: "",
  });

  const [runDry, setRunDry] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [runReport, setRunReport] = useState(null);
  const [runMsg, setRunMsg] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(TAXI_COMPANIES_URL, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setCompanies(
          list
            .map((c) => ({
              id: String(c.id ?? "").trim(),
              name: String(c.name ?? c.id ?? "").trim() || String(c.id ?? ""),
            }))
            .filter((c) => c.id),
        );
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (filters.companyId.trim()) q.set("company_id", filters.companyId.trim());
      if (filters.status.trim()) q.set("status", filters.status.trim());
      if (filters.direction.trim()) q.set("direction", filters.direction.trim());
      if (filters.hasCommissionInvoice === "1") q.set("has_commission_invoice", "1");
      if (filters.hasCommissionInvoice === "0") q.set("has_commission_invoice", "0");
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Settlements konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runWeeklyCommission() {
    if (!runDry) {
      const ok = window.confirm(
        "Wochenlauf wirklich ausführen (nicht nur dryRun)? Es können Settlements und Provisionsrechnungen erzeugt werden.",
      );
      if (!ok) return;
    }
    setRunBusy(true);
    setRunMsg("");
    setRunReport(null);
    try {
      const res = await fetch(WEEKLY_RUN_URL, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: runDry }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setRunMsg(typeof data?.error === "string" ? data.error : "Wochenlauf fehlgeschlagen.");
        return;
      }
      setRunReport(data);
      setRunMsg(
        runDry
          ? `Dry-Run: ${data.companiesScanned ?? 0} Firmen · Schuld-Rechnungen ${data.createdDebtInvoiceCount ?? 0} · ausgeglichen ${data.skippedBalancedCount ?? 0}`
          : `Ausgeführt: ${data.createdDebtInvoiceCount ?? 0} Provisionsrechnungen · ${data.createdSettlementOnlyCount ?? 0} nur Settlement`,
      );
      if (!runDry) await load();
    } catch {
      setRunMsg("Wochenlauf fehlgeschlagen.");
    } finally {
      setRunBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-stack">
      <AdminCollapsibleSection title="Wochenlauf · Provisionsrechnung (Taxi-Netting)" defaultOpen>
        <p className="admin-muted" style={{ marginTop: 0, maxWidth: 720, lineHeight: 1.45 }}>
          Negativsaldo der Kalenderwoche → Settlement mit Richtung „Partner → ONRODA“ und verknüpfte Rechnung
          (<code>cash_card_netting_weekly_commission</code>). Auszahlung nur bei positivem Saldo (Phase A). Offene
          Forderungen: mark-paid / Reminder unter Finanzen · Invoices.
        </p>
        <div className="admin-table-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <label className="admin-check" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={runDry} onChange={(e) => setRunDry(e.target.checked)} />
            Dry-Run (keine Schreibvorgänge)
          </label>
          <button type="button" className="admin-btn-primary" disabled={runBusy} onClick={() => void runWeeklyCommission()}>
            {runBusy ? "Läuft …" : runDry ? "Wochenlauf prüfen" : "Wochenlauf ausführen"}
          </button>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => {
              if (typeof onOpenInvoice === "function") {
                onOpenInvoice("", { metadataSource: "cash_card_netting_weekly_commission" });
              }
            }}
          >
            Provisionsrechnungen öffnen →
          </button>
        </div>
        {runMsg ? <div className="admin-info-banner" style={{ marginTop: 12 }}>{runMsg}</div> : null}
        {runReport?.results?.length ? (
          <div className="admin-table-card admin-table-card--embedded" style={{ marginTop: 12 }}>
            <div className="admin-table-scroll">
              <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
                <div>Unternehmen</div>
                <div>Ergebnis</div>
                <div>Saldo</div>
                <div>Rechnung</div>
              </div>
              {runReport.results.map((row) => (
                <div
                  className="admin-table-row"
                  key={`${row.companyId}-${row.outcome}-${row.settlementId || row.invoiceId || ""}`}
                  style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
                >
                  <div>
                    {row.companyName || row.companyId}
                    <span className="admin-mono" style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                      {row.companyId}
                    </span>
                  </div>
                  <div>
                    <span className="admin-c-badge admin-c-badge--info">{row.outcome}</span>
                  </div>
                  <div className="admin-crisp-numeric">
                    {row.payoutAmount != null ? money(row.payoutAmount) : "—"}
                  </div>
                  <div className="admin-mono" style={{ fontSize: 12 }}>
                    {row.invoiceNumber || row.invoiceId || "—"}
                    {row.invoiceId && typeof onOpenInvoice === "function" ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="admin-link-btn"
                          onClick={() => onOpenInvoice(row.invoiceId)}
                        >
                          öffnen
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Settlements" defaultOpen>
        <div className="admin-table-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
          <select
            className="admin-input"
            value={filters.companyId}
            onChange={(e) => {
              setFilters((f) => ({ ...f, companyId: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Alle Taxi-Unternehmen</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filters.direction}
            onChange={(e) => {
              setFilters((f) => ({ ...f, direction: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Alle Richtungen</option>
            <option value="partner_pays_platform">Partner → ONRODA</option>
            <option value="platform_pays_partner">ONRODA → Partner</option>
          </select>
          <select
            className="admin-input"
            value={filters.hasCommissionInvoice}
            onChange={(e) => {
              setFilters((f) => ({ ...f, hasCommissionInvoice: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Rechnung verknüpft: alle</option>
            <option value="1">Nur mit Provisionsrechnung</option>
            <option value="0">Ohne Provisionsrechnung</option>
          </select>
          <input
            className="admin-input"
            placeholder="Status (issued, draft, …)"
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPage(1);
            }}
            style={{ minWidth: 140 }}
          />
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        {error ? <div className="admin-error-banner" style={{ marginTop: 12 }}>{error}</div> : null}

        <div className="admin-table-card admin-table-card--embedded" style={{ marginTop: 14 }}>
          <div className="admin-table-scroll">
            <div
              className="admin-table-row admin-table-row--head"
              style={{ gridTemplateColumns: "1.1fr 1.2fr 0.9fr 0.8fr 0.9fr 1fr" }}
            >
              <div>Settlement</div>
              <div>Unternehmen</div>
              <div>Periode</div>
              <div>Auszahlung</div>
              <div>Richtung</div>
              <div>Provisionsrechnung</div>
            </div>
            {loading && items.length === 0 ? (
              <p className="admin-muted" style={{ padding: 12 }}>
                Laden …
              </p>
            ) : null}
            {!loading && items.length === 0 ? (
              <p className="admin-muted" style={{ padding: 12 }}>
                Keine Settlements für die Filter.
              </p>
            ) : null}
            {items.map((x) => {
              const invId = x.commission_invoice_id || x.commissionInvoiceId;
              return (
                <div
                  className="admin-table-row"
                  key={x.id}
                  style={{ gridTemplateColumns: "1.1fr 1.2fr 0.9fr 0.8fr 0.9fr 1fr" }}
                >
                  <div>
                    <div className="admin-mono" style={{ fontWeight: 700 }}>
                      {x.settlement_number || x.id}
                    </div>
                    <span className="admin-c-badge admin-c-badge--neutral">{x.status || "—"}</span>
                  </div>
                  <div>
                    {x.company_name || "—"}
                    <span className="admin-mono" style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                      {x.company_id}
                    </span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {x.period_start || "—"} – {x.period_end || "—"}
                  </div>
                  <div className="admin-crisp-numeric">{money(x.payout_amount)}</div>
                  <div>
                    <span className={directionBadgeClass(x.direction)}>{directionDe(x.direction)}</span>
                  </div>
                  <div>
                    {invId ? (
                      <button
                        type="button"
                        className="admin-link-btn"
                        onClick={() => {
                          if (typeof onOpenInvoice === "function") onOpenInvoice(invId);
                        }}
                      >
                        Rechnung öffnen
                      </button>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-table-pager" style={{ marginTop: 12 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span>
            Seite {page} / {pageCount} · {total} Einträge
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Weiter
          </button>
        </div>
      </AdminCollapsibleSection>
    </div>
  );
}
