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
    { title: "Umsatz heute", value: formatMoney(kpi.revenueToday), hint: "Summe final/geschätzt, Fahrten mit heutigem Datum (lokal)." },
    { title: "Umsatz Monat", value: formatMoney(kpi.revenueMonth), hint: `Zeitraum: ${kpiMonthLabel}` },
    { title: "Offene Rechnungen", value: String(kpi.openInvoiceCount), hint: "Fahrten mit Rechnungsstatus nicht bezahlt / nicht storniert." },
    { title: "Ausstehende Auszahlung", value: formatMoney(kpi.pendingPayoutSum), hint: "Summe aus Partner-Auszahlungsfeld bei noch nicht bezahlten Rechnungen (falls hinterlegt)." },
    { title: "Krankenfahrten offen", value: String(kpi.medicalOpenCount), hint: "Medizinische Fahrten ohne bezahlte Rechnung (vereinfachte Zählung)." },
    { title: "Letzte Abrechnung", value: kpi.lastSettlementDisplay, hint: "Letztes bekanntes Rechnungsdatum (erstellt oder bezahlt) im Snapshot." },
  ];

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section partner-finance-overview-actions">
        <p className="partner-muted" style={{ margin: "0 0 12px", maxWidth: 720, lineHeight: 1.5 }}>
          Kennzahlen beziehen sich auf den <strong>aktuellen Kalendermonat</strong> ohne Zusatzfilter. Für Detaillisten nutzen Sie die anderen Tabs.
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
