import { moneyDe } from "./dashboardHelpers.js";

/** @param {{ metrics: object | null; metricsError: string | null; fleetDash: object | null; fleetDashError: string | null; medicalOpen: number; ridesLoaded: boolean; onNavigateMedical?: () => void }} props */
export default function DashboardKpiGrid({
  metrics,
  metricsError,
  fleetDash,
  fleetDashError,
  medicalOpen,
  ridesLoaded,
  onNavigateMedical,
}) {
  const openRides = metricsError ? null : metrics?.openRides ?? 0;
  const revenueToday = metricsError ? null : metrics?.today?.revenue;
  const driversOnline = fleetDashError ? null : fleetDash?.driversOnline ?? null;
  const vehiclesActive = fleetDashError ? null : fleetDash?.vehiclesActive ?? null;

  const cards = [
    {
      key: "drv",
      title: "Fahrer online",
      value: fleetDashError ? "—" : driversOnline == null ? "—" : String(driversOnline),
      hint: fleetDashError || "Heartbeat ≤ 2 Min.",
    },
    {
      key: "veh",
      title: "Fahrzeuge aktiv",
      value: fleetDashError ? "—" : vehiclesActive == null ? "—" : String(vehiclesActive),
      hint: fleetDashError || "Freigegeben",
    },
    {
      key: "open",
      title: "Offene Fahrten",
      value: metricsError ? "—" : String(openRides ?? 0),
      hint: metricsError || "Noch nicht abgeschlossen",
    },
    {
      key: "rev",
      title: "Umsatz heute",
      value: metricsError ? "—" : moneyDe(revenueToday),
      hint: metricsError || "Abgeschlossene Fahrten (Kalendertag)",
    },
    {
      key: "med",
      title: "Offene Krankenfahrten",
      value: !ridesLoaded ? "…" : String(medicalOpen),
      hint: !ridesLoaded ? "Fahrten werden geladen …" : "Ohne bezahlte/stornierte Rechnung (vereinfacht)",
      action:
        typeof onNavigateMedical === "function" ? (
          <button type="button" className="partner-link-btn" style={{ marginTop: 8, padding: 0 }} onClick={() => onNavigateMedical()}>
            Zu Krankenfahrten
          </button>
        ) : null,
    },
  ];

  return (
    <div className="partner-dashboard-kpi-grid">
      {cards.map((c) => (
        <div key={c.key} className="partner-dashboard-kpi-card">
          <p className="partner-dashboard-kpi-card__title">{c.title}</p>
          <p className="partner-dashboard-kpi-card__value">{c.value}</p>
          <p className="partner-dashboard-kpi-card__hint">{typeof c.hint === "string" ? c.hint : ""}</p>
          {c.action ?? null}
        </div>
      ))}
    </div>
  );
}
