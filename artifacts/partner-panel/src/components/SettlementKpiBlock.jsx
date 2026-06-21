import { moneyDe } from "../dashboard/dashboardHelpers.js";

/**
 * @param {{ grossAmount?: unknown; commissionAmount?: unknown; operatorPayoutAmount?: unknown } | null | undefined} settlement
 */
export function readSettlementWindow(settlement) {
  if (!settlement || typeof settlement !== "object") return null;
  const gross = Number(settlement.grossAmount);
  const commission = Number(settlement.commissionAmount);
  const payout = Number(settlement.operatorPayoutAmount);
  if ([gross, commission, payout].some((n) => Number.isNaN(n))) return null;
  return { gross, commission, payout };
}

/**
 * @param {{ gross: number; commission: number; payout: number }} s
 * @param {(n: number) => string} [formatMoney]
 */
export function settlementLineText(s, formatMoney = moneyDe) {
  return `${formatMoney(s.gross)} · Provision ${formatMoney(s.commission)} · Ihr Anteil ${formatMoney(s.payout)}`;
}

/**
 * @param {{
 *   metrics: Record<string, unknown> | null | undefined;
 *   formatMoney?: (n: number) => string;
 *   hero?: boolean;
 *   periodKey?: "today" | "week" | "month";
 *   periodLabel?: string;
 *   layout?: "cards" | "line";
 *   Card?: (props: { value: string; label: string; hero?: boolean }) => import("react").ReactNode;
 * }} props
 */
export function SettlementKpiBlock({
  metrics,
  formatMoney = moneyDe,
  hero = false,
  periodKey = "today",
  periodLabel = "Heute",
  layout = "cards",
  Card,
}) {
  if (metrics?.presentation !== "taxi_betrieb") return null;
  const period = metrics?.[periodKey];
  const settlement = readSettlementWindow(
    period && typeof period === "object" ? period.settlement : null,
  );
  if (!settlement) return null;

  if (layout === "line") {
    return (
      <p className="panel-settlement-line" title={`Abrechnung ${periodLabel} (Finanz-Snapshot)`}>
        <span className="panel-settlement-line__label">{periodLabel}:</span>{" "}
        {settlementLineText(settlement, formatMoney)}
      </p>
    );
  }

  if (!Card) return null;

  return (
    <>
      <p className="panel-kpi-tier-label">Ihre Abrechnung · {periodLabel}</p>
      <div className={`panel-kpi-grid ${hero ? "panel-kpi-grid--tier1" : "panel-kpi-grid--tier2"}`}>
        <Card hero={hero} value={formatMoney(settlement.gross)} label="Brutto" />
        <Card hero={hero} value={formatMoney(settlement.commission)} label="ONRODA-Provision" />
        <Card hero={hero} value={formatMoney(settlement.payout)} label="Ihr Anteil" />
      </div>
    </>
  );
}

/**
 * @param {{
 *   metrics: Record<string, unknown> | null | undefined;
 *   formatMoney?: (n: number) => string;
 * }} props
 */
export function DashboardSettlementCards({ metrics, formatMoney = moneyDe }) {
  if (metrics?.presentation !== "taxi_betrieb") return null;
  const settlement = readSettlementWindow(metrics?.today?.settlement);
  if (!settlement) return null;

  return (
    <>
      <div className="partner-dashboard-kpi-card">
        <p className="partner-dashboard-kpi-card__title">Brutto heute</p>
        <p className="partner-dashboard-kpi-card__value">{formatMoney(settlement.gross)}</p>
        <p className="partner-dashboard-kpi-card__hint">Finanz-Snapshot abgeschlossene Fahrten</p>
      </div>
      <div className="partner-dashboard-kpi-card">
        <p className="partner-dashboard-kpi-card__title">ONRODA-Provision</p>
        <p className="partner-dashboard-kpi-card__value">{formatMoney(settlement.commission)}</p>
        <p className="partner-dashboard-kpi-card__hint">Heute (Kalendertag Berlin)</p>
      </div>
      <div className="partner-dashboard-kpi-card">
        <p className="partner-dashboard-kpi-card__title">Ihr Anteil</p>
        <p className="partner-dashboard-kpi-card__value">{formatMoney(settlement.payout)}</p>
        <p className="partner-dashboard-kpi-card__hint">Netto-Auszahlung heute</p>
      </div>
    </>
  );
}
