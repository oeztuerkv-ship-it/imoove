import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const SUMMARY_URL = `${API_BASE}/admin/finance/summary`;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(x);
}

export default function FinanceDashboardPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (dateFrom) q.set("date_from", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) q.set("date_to", `${dateTo}T23:59:59.999Z`);
      const url = q.toString() ? `${SUMMARY_URL}?${q.toString()}` : SUMMARY_URL;
      const res = await fetch(url, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok || !data?.summary) throw new Error("invalid_response");
      setSummary(data.summary);
    } catch {
      setSummary(null);
      setError("Finance-Summary konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: "Gesamtumsatz", value: money(summary?.totalRevenue) },
    { label: "Offene Forderungen", value: money(summary?.openReceivables) },
    { label: "Rechnungen bezahlt", value: String(summary?.invoicesPaidCount ?? 0) },
    { label: "Rechnungen offen", value: String(summary?.invoicesOpenCount ?? 0) },
    { label: "Rechnungen überfällig", value: String(summary?.invoicesOverdueCount ?? 0) },
    { label: "Offene Unternehmer-Abrechnungen", value: String(summary?.openSettlementsCount ?? 0) },
    { label: "Offene Plattform-Provision", value: money(summary?.openPlatformCommission) },
  ];

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">Plattform-Finanzüberblick — KPIs zu Umsatz, Forderungen und Abrechnungen.</p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="KPI-Summary" subtitle="Abrechnung & Plattform-Provision" defaultOpen>
        <div className="admin-filter-toolbar admin-filter-toolbar--modern">
          <label className="admin-filter-field">
            <span className="admin-field-label">Von</span>
            <input className="admin-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Bis</span>
            <input className="admin-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button type="button" className="admin-btn-refresh admin-filter-toolbar--modern__refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="finance-kpi-grid">
          {cards.map((c) => (
            <div key={c.label} className="finance-kpi-card">
              <div className="finance-kpi-card__label">{c.label}</div>
              <div className="finance-kpi-card__value admin-crisp-numeric">{c.value}</div>
            </div>
          ))}
        </div>
      </AdminCollapsibleSection>
    </div>
  );
}
