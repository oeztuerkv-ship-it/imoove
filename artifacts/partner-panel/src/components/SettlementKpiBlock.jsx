import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { moneyDe } from "../dashboard/dashboardHelpers.js";
import {
  apiPeriodForUi,
  billingMonthForSettlementPeriod,
  buildSettlementExportQueryParams,
  formatShortDt,
  paymentMethodDe,
  paymentStatusDe,
  settlementAmountCell,
  settlementPeriodScopeHint,
} from "../dashboard/settlementDashboardHelpers.js";

/** @typedef {"today" | "week" | "month" | "year"} SettlementUiPeriodKey */

export const SETTLEMENT_PERIOD_OPTIONS = [
  { key: "today", label: "Tag", periodLabel: "Heute" },
  { key: "week", label: "Woche", periodLabel: "Woche" },
  { key: "month", label: "Monat", periodLabel: "Monat" },
  { key: "year", label: "Jahr", periodLabel: "Jahr" },
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
 * @param {SettlementUiPeriodKey} periodKey
 * @param {"rolling" | "calendar"} weekMode
 */
export function readSettlementPeriod(metrics, periodKey, weekMode = "rolling") {
  const apiKey = periodKey === "week" && weekMode === "calendar" ? "weekCalendar" : periodKey;
  const period = metrics?.[apiKey];
  if (!period || typeof period !== "object") return null;
  const settlement = readSettlementWindow(period.settlement);
  if (!settlement) return null;
  const completedRides = Number(period.completedRides);
  const paymentStats = period.paymentStats && typeof period.paymentStats === "object" ? period.paymentStats : null;
  return {
    settlement,
    completedRides: Number.isFinite(completedRides) ? completedRides : 0,
    paymentStats,
  };
}

/**
 * @param {{
 *   metrics: Record<string, unknown> | null | undefined;
 *   token?: string | null;
 *   formatMoney?: (n: number) => string;
 *   formatPctRate?: (n: number | null | undefined) => string;
 *   Card: (props: {
 *     value: string;
 *     label: string;
 *     hero?: boolean;
 *     hint?: string;
 *     onClick?: () => void;
 *     active?: boolean;
 *   }) => import("react").ReactNode;
 *   initialPeriod?: SettlementUiPeriodKey;
 *   selectedYear?: number;
 *   onYearChange?: (year: number) => void;
 *   onNavigateFinanzen?: (opts: { billingMonth: string }) => void;
 * }} props
 */
export function SettlementKpiPeriodPanel({
  metrics,
  token,
  formatMoney = moneyDe,
  formatPctRate = (r) => (r == null ? "—" : `${Math.round(r * 1000) / 10} %`),
  Card,
  initialPeriod = "today",
  selectedYear: selectedYearProp,
  onYearChange,
  onNavigateFinanzen,
}) {
  const [periodKey, setPeriodKey] = useState(initialPeriod);
  const [weekMode, setWeekMode] = useState("rolling");
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillErr, setDrillErr] = useState("");
  const [drillRides, setDrillRides] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErr, setPdfErr] = useState("");

  const selectedYear = selectedYearProp ?? metrics?.selectedYear ?? new Date().getFullYear();
  const availableYears = Array.isArray(metrics?.availableYears) ? metrics.availableYears : [selectedYear];

  const activeOption = useMemo(
    () => SETTLEMENT_PERIOD_OPTIONS.find((o) => o.key === periodKey) ?? SETTLEMENT_PERIOD_OPTIONS[0],
    [periodKey],
  );

  const periodData = readSettlementPeriod(metrics, periodKey, weekMode);

  const scopeHint = settlementPeriodScopeHint(periodKey, weekMode, selectedYear);

  const commissionHint = useMemo(() => {
    const rate = metrics?.commissionRate;
    if (rate == null || Number.isNaN(Number(rate))) return null;
    return `Berechnet mit Ihrem Satz von ${formatPctRate(Number(rate))} — geändert im Admin, gilt für neue Fahrten.`;
  }, [metrics?.commissionRate, formatPctRate]);

  const loadDrillDown = useCallback(async () => {
    if (!token) return;
    setDrillLoading(true);
    setDrillErr("");
    try {
      const apiPeriod = apiPeriodForUi(periodKey, weekMode);
      const p = new URLSearchParams();
      p.set("period", apiPeriod);
      if (periodKey === "week") p.set("weekMode", weekMode);
      if (periodKey === "year") p.set("year", String(selectedYear));
      const res = await fetch(`${API_BASE}/panel/v1/overview/settlement-rides?${p.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDrillErr("Fahrtenliste konnte nicht geladen werden.");
        setDrillRides([]);
        return;
      }
      setDrillRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {
      setDrillErr("Fahrtenliste konnte nicht geladen werden.");
      setDrillRides([]);
    } finally {
      setDrillLoading(false);
    }
  }, [token, periodKey, weekMode, selectedYear]);

  const openDrill = useCallback(() => {
    setDrillOpen(true);
    void loadDrillDown();
  }, [loadDrillDown]);

  useEffect(() => {
    if (drillOpen) void loadDrillDown();
  }, [drillOpen, loadDrillDown]);

  const downloadPdf = useCallback(async () => {
    if (!token) return;
    setPdfLoading(true);
    setPdfErr("");
    try {
      const p = buildSettlementExportQueryParams(periodKey, weekMode, selectedYear);
      const res = await fetch(`${API_BASE}/panel/v1/overview/export-pdf?${p.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPdfErr(typeof data?.error === "string" ? data.error : "PDF konnte nicht erstellt werden.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "Onroda-Abrechnung.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfErr("PDF konnte nicht heruntergeladen werden.");
    } finally {
      setPdfLoading(false);
    }
  }, [token, periodKey, weekMode, selectedYear]);

  if (metrics?.presentation !== "taxi_betrieb") return null;
  if (!periodData) return null;

  const { settlement, completedRides, paymentStats } = periodData;
  const ps = paymentStats ?? {};

  const billingMonth = billingMonthForSettlementPeriod(periodKey, weekMode, selectedYear);

  return (
    <section className="panel-settlement-panel" aria-label="Ihre Abrechnung">
      <div className="panel-settlement-panel__head">
        <p className="panel-kpi-tier-label" style={{ margin: 0 }}>
          Ihre Abrechnung
        </p>
        <div className="panel-settlement-panel__head-actions">
          <button
            type="button"
            className="panel-settlement-export-pdf"
            disabled={pdfLoading || !token}
            onClick={() => void downloadPdf()}
          >
            {pdfLoading ? "PDF …" : "PDF für Steuerberater"}
          </button>
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
                onClick={() => {
                  setPeriodKey(opt.key);
                  setDrillOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {pdfErr ? <p className="panel-page__warn">{pdfErr}</p> : null}

      {periodKey === "week" ? (
        <div className="panel-settlement-week-mode" role="group" aria-label="Wochenmodus">
          <button
            type="button"
            className={`panel-settlement-week-mode__btn${weekMode === "rolling" ? " panel-settlement-week-mode__btn--active" : ""}`}
            onClick={() => setWeekMode("rolling")}
          >
            Rollierend 7×24h
          </button>
          <button
            type="button"
            className={`panel-settlement-week-mode__btn${weekMode === "calendar" ? " panel-settlement-week-mode__btn--active" : ""}`}
            onClick={() => setWeekMode("calendar")}
          >
            Kalenderwoche (Mo–So)
          </button>
        </div>
      ) : null}

      {periodKey === "year" ? (
        <div className="panel-settlement-year-chips" role="group" aria-label="Kalenderjahr">
          {availableYears.map((y) => {
            const active = Number(y) === Number(selectedYear);
            return (
              <button
                key={y}
                type="button"
                className={`panel-settlement-year-chip${active ? " panel-settlement-year-chip--active" : ""}`}
                aria-pressed={active}
                onClick={() => {
                  if (typeof onYearChange === "function") onYearChange(Number(y));
                }}
              >
                {y}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="panel-settlement-panel__scope">{scopeHint}</p>
      {commissionHint ? <p className="panel-settlement-panel__commission">{commissionHint}</p> : null}

      <div className="panel-kpi-grid panel-kpi-grid--tier1">
        <Card
          hero
          value={formatMoney(settlement.gross)}
          label="Brutto (abgerechnet)"
          hint="Klicken für Fahrtenliste"
          onClick={openDrill}
          active={drillOpen}
        />
        <Card
          hero
          value={formatMoney(settlement.commission)}
          label="ONRODA-Provision"
          hint="Klicken für Fahrtenliste"
          onClick={openDrill}
        />
        <Card
          hero
          value={formatMoney(settlement.payout)}
          label={settlement.payout < 0 ? "Sie schulden ONRODA" : "Ihr Anteil"}
          hint={
            settlement.payout < 0
              ? "Negativsaldo (Bar-Provision) — keine Auszahlung in diesem Zeitraum"
              : "Klicken für Fahrtenliste"
          }
          onClick={openDrill}
        />
        <Card hero value={String(completedRides)} label={`Abgeschlossen · ${activeOption.periodLabel}`} />
      </div>

      <div className="panel-settlement-payment-stats">
        <p className="panel-settlement-payment-stats__title">Zahlungen im Zeitraum</p>
        <div className="panel-settlement-payment-stats__grid">
          <div>
            <span className="panel-settlement-payment-stats__lbl">Karte</span>
            <span className="panel-settlement-payment-stats__val">
              {formatMoney(Number(ps.cardGrossAmount ?? 0))} · {Number(ps.cardRideCount ?? 0)} Fahrten
            </span>
          </div>
          <div>
            <span className="panel-settlement-payment-stats__lbl">Bar</span>
            <span className="panel-settlement-payment-stats__val">
              {formatMoney(Number(ps.cashGrossAmount ?? 0))} · {Number(ps.cashRideCount ?? 0)} Fahrten
            </span>
          </div>
          <div>
            <span className="panel-settlement-payment-stats__lbl">Trinkgeld gesamt</span>
            <span className="panel-settlement-payment-stats__val">
              {formatMoney(Number(ps.tipTotal ?? 0))} · 100&nbsp;% Fahrer
            </span>
          </div>
          <div>
            <span className="panel-settlement-payment-stats__lbl">Karte offen/fehlgeschlagen</span>
            <span className="panel-settlement-payment-stats__val">
              {Number(ps.pendingPaymentCount ?? 0)} offen · {Number(ps.failedPaymentCount ?? 0)} fehlgeschlagen
            </span>
          </div>
        </div>
      </div>

      {typeof onNavigateFinanzen === "function" ? (
        <p className="panel-settlement-finance-link">
          <button
            type="button"
            className="partner-link-btn"
            onClick={() => onNavigateFinanzen({ billingMonth })}
          >
            Details in Finanzen →
          </button>
          <span className="panel-settlement-finance-link__hint"> Monat {billingMonth} vorgefiltert</span>
        </p>
      ) : null}

      {drillOpen ? (
        <div className="panel-settlement-drill">
          <div className="panel-settlement-drill__head">
            <h3 className="panel-settlement-drill__title">
              Abgerechnete Fahrten · {activeOption.periodLabel}
              {periodKey === "year" ? ` ${selectedYear}` : ""}
            </h3>
            <button type="button" className="panel-settlement-drill__close" onClick={() => setDrillOpen(false)}>
              Schließen
            </button>
          </div>
          {drillLoading ? <p className="panel-dash-empty">Lade Fahrten …</p> : null}
          {drillErr ? <p className="panel-page__warn">{drillErr}</p> : null}
          {!drillLoading && !drillErr ? (
            <div className="panel-dash-table-wrap">
              {drillRides.length === 0 ? (
                <p className="panel-dash-empty">Keine abgeschlossenen Fahrten in diesem Zeitraum.</p>
              ) : (
                <table className="panel-dash-table panel-dash-table--settlement">
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Route</th>
                      <th>Endpreis</th>
                      <th>Provision</th>
                      <th>Ihr Anteil / Saldo</th>
                      <th>Zahlungsart</th>
                      <th>Fahrer</th>
                      <th>Status Zahlung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRides.map((r) => {
                      const amt = settlementAmountCell(r);
                      return (
                        <tr key={r.id}>
                          <td>{formatShortDt(r.createdAt)}</td>
                          <td>
                            <span className="panel-dash-table__muted">{r.from || "—"}</span> → {r.to || "—"}
                          </td>
                          <td>
                            {amt.value}
                            {amt.label ? (
                              <span className="panel-dash-table__amount-kind"> · {amt.label}</span>
                            ) : null}
                          </td>
                          <td>{r.commissionAmount != null ? formatMoney(r.commissionAmount) : "—"}</td>
                          <td>{r.operatorPayoutAmount != null ? formatMoney(r.operatorPayoutAmount) : "—"}</td>
                          <td>{paymentMethodDe(r.paymentMethod)}</td>
                          <td>{r.driverName || "—"}</td>
                          <td>{paymentStatusDe(r.paymentStatus)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** @deprecated Einheitliches Cockpit nutzt SettlementKpiPeriodPanel */
export function DashboardSettlementPeriodPanel(props) {
  return <SettlementKpiPeriodPanel {...props} Card={LegacyDashCard} />;
}

function LegacyDashCard({ value, label, hint }) {
  return (
    <div className="partner-dashboard-kpi-card__inline">
      <p className="partner-settlement-metrics-row__lbl">{label}</p>
      <p className="partner-settlement-metrics-row__val">{value}</p>
      {hint ? <p className="partner-dashboard-kpi-card__hint">{hint}</p> : null}
    </div>
  );
}
