import { formatMoney } from "./financeHelpers.js";

/**
 * @param {{
 *   kpiLoading: boolean;
 *   kpiMonthLabel: string;
 *   kpi: Record<string, unknown>;
 *   onRefreshKpi: () => void;
 * }} props
 */
export default function FinanceOverviewTab({ kpiLoading, kpiMonthLabel, kpi, onRefreshKpi }) {
  const cards = [
    { title: "Umsatz Monat", value: formatMoney(kpi.revenueMonth), hint: `Zeitraum: ${kpiMonthLabel}` },
    { title: "Umsatz heute", value: formatMoney(kpi.revenueToday), hint: "Summe final/geschätzt, heutiges Datum." },
    { title: "Offene Rechnungen", value: String(kpi.openInvoiceCount), hint: "Noch nicht bezahlt / nicht storniert." },
    { title: "Letzte Abrechnung", value: kpi.lastSettlementDisplay, hint: "Letztes Rechnungsdatum im Snapshot." },
  ];

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section partner-finance-overview-actions">
        <p className="partner-muted" style={{ margin: "0 0 12px", maxWidth: 720, lineHeight: 1.5 }}>
          Kennzahlen zum <strong>aktuellen Kalendermonat</strong> (Billing-Snapshot). Krankenfahrten-Details siehe eigenes Modul.
        </p>
        <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" disabled={kpiLoading} onClick={onRefreshKpi}>
          {kpiLoading ? "Aktualisiere …" : "Übersicht aktualisieren"}
        </button>
      </div>

      <div className="partner-finance-kpi-grid">
        {cards.map((c) => (
          <div key={c.title} className="partner-finance-kpi-card">
            <p className="partner-finance-kpi-card__title">{c.title}</p>
            <p className="partner-finance-kpi-card__value">{kpiLoading ? "…" : c.value}</p>
            <p className="partner-finance-kpi-card__hint">{c.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
