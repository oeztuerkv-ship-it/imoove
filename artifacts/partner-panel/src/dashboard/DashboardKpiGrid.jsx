import { moneyDe } from "./dashboardHelpers.js";

/** @param {{ metrics: object | null; metricsError: string | null; fleetDash: object | null; fleetDashError: string | null; medicalOpen: number; docWarnings: number; ridesLoaded: boolean }} props */
export default function DashboardKpiGrid({ metrics, metricsError, fleetDash, fleetDashError, medicalOpen, docWarnings, ridesLoaded }) {
  const openRides = metricsError ? null : metrics?.openRides ?? 0;
  const revenueToday = metricsError ? null : metrics?.today?.revenue;
  const driversOnline = fleetDashError ? null : fleetDash?.driversOnline ?? null;
  const vehiclesActive = fleetDashError ? null : fleetDash?.vehiclesActive ?? null;

  const cards = [
    {
      key: "open",
      title: "Offene Fahrten",
      value: metricsError ? "—" : String(openRides ?? 0),
      hint: metricsError || "Noch nicht abgeschlossen / nicht storniert",
    },
    {
      key: "drv",
      title: "Fahrer online",
      value: fleetDashError ? "—" : driversOnline == null ? "—" : String(driversOnline),
      hint: fleetDashError || "Heartbeat ≤ 2 Min. (Fleet-Dashboard)",
    },
    {
      key: "veh",
      title: "Fahrzeuge aktiv",
      value: fleetDashError ? "—" : vehiclesActive == null ? "—" : String(vehiclesActive),
      hint: fleetDashError || "Freigegeben im System",
    },
    {
      key: "rev",
      title: "Umsatz heute",
      value: metricsError ? "—" : moneyDe(revenueToday),
      hint: metricsError || "Abgeschlossene Fahrten, Kalendertag Europe/Berlin",
    },
    {
      key: "med",
      title: "Krankenfahrten offen",
      value: !ridesLoaded ? "…" : String(medicalOpen),
      hint: !ridesLoaded ? "Fahrten werden geladen …" : "Ohne bezahlte/stornierte Rechnung (vereinfacht)",
    },
    {
      key: "doc",
      title: "Dokumente mit Warnungen",
      value: String(docWarnings),
      hint: "Aus Compliance- und Fristenprüfung",
    },
  ];

  return (
    <div className="partner-dashboard-kpi-grid">
      {cards.map((c) => (
        <div key={c.key} className="partner-dashboard-kpi-card">
          <p className="partner-dashboard-kpi-card__title">{c.title}</p>
          <p className="partner-dashboard-kpi-card__value">{c.value}</p>
          <p className="partner-dashboard-kpi-card__hint">{typeof c.hint === "string" ? c.hint : ""}</p>
        </div>
      ))}
    </div>
  );
}
