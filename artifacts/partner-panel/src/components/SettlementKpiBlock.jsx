import { useMemo, useState } from "react";
import { moneyDe } from "../dashboard/dashboardHelpers.js";

/** @typedef {"today" | "week" | "month" | "year"} SettlementPeriodKey */

export const SETTLEMENT_PERIOD_OPTIONS = [
  { key: "today", label: "Tag", periodLabel: "Heute", scopeHint: "Kalendertag (Europe/Berlin)" },
  { key: "week", label: "Woche", periodLabel: "7 Tage", scopeHint: "Rollierend 7×24 Stunden" },
  { key: "month", label: "Monat", periodLabel: "Monat", scopeHint: "Kalendermonat (Europe/Berlin)" },
  { key: "year", label: "Jahr", periodLabel: "Jahr", scopeHint: "Kalenderjahr (Europe/Berlin)" },
];

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
 * @param {Record<string, unknown> | null | undefined} metrics
 * @param {SettlementPeriodKey} periodKey
 */
export function readSettlementPeriod(metrics, periodKey) {
  const period = metrics?.[periodKey];
  if (!period || typeof period !== "object") return null;
  const settlement = readSettlementWindow(period.settlement);
  if (!settlement) return null;
  const completedRides = Number(period.completedRides);
  return {
    settlement,
    completedRides: Number.isFinite(completedRides) ? completedRides : 0,
  };
}

/**
 * @param {{
 *   metrics: Record<string, unknown> | null | undefined;
 *   formatMoney?: (n: number) => string;
 *   Card: (props: { value: string; label: string; hero?: boolean }) => import("react").ReactNode;
 *   initialPeriod?: SettlementPeriodKey;
 * }} props
 */
export function SettlementKpiPeriodPanel({
  metrics,
  formatMoney = moneyDe,
  Card,
  initialPeriod = "today",
}) {
  const [periodKey, setPeriodKey] = useState(initialPeriod);

  const activeOption = useMemo(
    () => SETTLEMENT_PERIOD_OPTIONS.find((o) => o.key === periodKey) ?? SETTLEMENT_PERIOD_OPTIONS[0],
    [periodKey],
  );

  if (metrics?.presentation !== "taxi_betrieb") return null;

  const periodData = readSettlementPeriod(metrics, periodKey);
  if (!periodData) return null;

  const { settlement, completedRides } = periodData;

  return (
    <section className="panel-settlement-panel" aria-label="Ihre Abrechnung">
      <div className="panel-settlement-panel__head">
        <p className="panel-kpi-tier-label" style={{ margin: 0 }}>
          Ihre Abrechnung
        </p>
        <div className="panel-settlement-period-tabs" role="tablist" aria-label="Abrechnungszeitraum">
          {SETTLEMENT_PERIOD_OPTIONS.map((opt) => {
            const active = opt.key === periodKey;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`panel-settlement-period-tab${active ? " panel-settlement-period-tab--active" : ""}`}
                onClick={() => setPeriodKey(opt.key)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="panel-settlement-panel__scope">{activeOption.scopeHint}</p>
      <div className="panel-kpi-grid panel-kpi-grid--tier1">
        <Card hero value={formatMoney(settlement.gross)} label="Brutto" />
        <Card hero value={formatMoney(settlement.commission)} label="ONRODA-Provision" />
        <Card hero value={formatMoney(settlement.payout)} label="Ihr Anteil" />
        <Card hero value={String(completedRides)} label={`Abgeschlossen · ${activeOption.periodLabel}`} />
      </div>
    </section>
  );
}

/**
 * @param {{
 *   metrics: Record<string, unknown> | null | undefined;
 *   formatMoney?: (n: number) => string;
 *   initialPeriod?: SettlementPeriodKey;
 * }} props
 */
export function DashboardSettlementPeriodPanel({ metrics, formatMoney = moneyDe, initialPeriod = "today" }) {
  const [periodKey, setPeriodKey] = useState(initialPeriod);

  const activeOption = useMemo(
    () => SETTLEMENT_PERIOD_OPTIONS.find((o) => o.key === periodKey) ?? SETTLEMENT_PERIOD_OPTIONS[0],
    [periodKey],
  );

  if (metrics?.presentation !== "taxi_betrieb") return null;

  const periodData = readSettlementPeriod(metrics, periodKey);
  if (!periodData) return null;

  const { settlement, completedRides } = periodData;

  return (
    <div className="partner-settlement-panel partner-dashboard-kpi-card" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-settlement-panel__head">
        <p className="partner-dashboard-kpi-card__title" style={{ margin: 0 }}>
          Ihre Abrechnung
        </p>
        <div className="panel-settlement-period-tabs" role="tablist" aria-label="Abrechnungszeitraum">
          {SETTLEMENT_PERIOD_OPTIONS.map((opt) => {
            const active = opt.key === periodKey;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`panel-settlement-period-tab${active ? " panel-settlement-period-tab--active" : ""}`}
                onClick={() => setPeriodKey(opt.key)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="partner-dashboard-kpi-card__hint" style={{ margin: "8px 0 12px" }}>
        {activeOption.scopeHint} · {completedRides} abgeschlossen
      </p>
      <div className="partner-settlement-metrics-row">
        <div>
          <p className="partner-settlement-metrics-row__lbl">Brutto</p>
          <p className="partner-settlement-metrics-row__val">{formatMoney(settlement.gross)}</p>
        </div>
        <div>
          <p className="partner-settlement-metrics-row__lbl">ONRODA-Provision</p>
          <p className="partner-settlement-metrics-row__val">{formatMoney(settlement.commission)}</p>
        </div>
        <div>
          <p className="partner-settlement-metrics-row__lbl">Ihr Anteil</p>
          <p className="partner-settlement-metrics-row__val">{formatMoney(settlement.payout)}</p>
        </div>
      </div>
    </div>
  );
}
