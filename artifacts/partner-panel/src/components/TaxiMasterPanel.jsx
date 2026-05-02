import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import DashboardOverviewPage from "../dashboard/DashboardOverviewPage.jsx";
import { medicalOpenOperationsCount } from "../dashboard/dashboardHelpers.js";
const STORAGE_KEY = "onrodaPanelJwt";

function getPanelHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function loadPanelResource(url, label, getBody) {
  let res;
  try {
    res = await fetch(url, { headers: getPanelHeaders() });
  } catch {
    return { ok: false, error: `${label} konnten nicht geladen werden (Netzwerk).`, data: null };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiErr = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
    return { ok: false, error: `${label}: ${apiErr}`, data: null };
  }
  if (!data?.ok) {
    const apiErr = typeof data?.error === "string" ? data.error : "Ungültige Antwort";
    return { ok: false, error: `${label}: ${apiErr}`, data: null };
  }
  return { ok: true, error: null, data: getBody ? getBody(data) : data };
}

/**
 * Taxi-Dashboard — Datenladung hier, Darstellung modular.
 * @param {{ company?: object; user: object; onNavigateModule?: (key: string, opts?: { settingsTab?: string }) => void; onQuickCreate?: (id: string) => void }} props
 */
export default function TaxiMasterPanel({ company, user, onNavigateModule, onQuickCreate }) {
  const [loadComplete, setLoadComplete] = useState(false);

  const [companyData, setCompanyData] = useState(null);
  const [companyError, setCompanyError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [fleetDash, setFleetDash] = useState(null);
  const [fleetDashError, setFleetDashError] = useState(null);

  const [rides, setRides] = useState([]);
  const [ridesError, setRidesError] = useState(null);
  const [ridesLoaded, setRidesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadComplete(false);
      setCompanyError(null);
      setMetricsError(null);
      setFleetDashError(null);
      setRidesError(null);
      setRidesLoaded(false);

      setCompanyData(null);
      setMetrics(null);
      setDrivers([]);
      setVehicles([]);
      setFleetDash(null);
      setRides([]);

      const [cRes, mRes, dRes, vRes, fdRes, rRes] = await Promise.all([
        loadPanelResource(`${API_BASE}/panel/v1/company`, "Firmendaten", (d) => d.company ?? null),
        loadPanelResource(`${API_BASE}/panel/v1/overview/metrics`, "Kennzahlen", (d) => d.metrics ?? null),
        loadPanelResource(`${API_BASE}/panel/v1/fleet/drivers`, "Fahrerliste", (d) => (Array.isArray(d.drivers) ? d.drivers : [])),
        loadPanelResource(`${API_BASE}/panel/v1/fleet/vehicles`, "Fahrzeugliste", (d) => (Array.isArray(d.vehicles) ? d.vehicles : [])),
        loadPanelResource(`${API_BASE}/panel/v1/fleet/dashboard`, "Fleet-Dashboard", (d) => ({
          driversOnline: d.driversOnline,
          vehiclesActive: d.vehiclesActive,
          driversTotal: d.driversTotal,
          vehiclesTotal: d.vehiclesTotal,
        })),
        loadPanelResource(`${API_BASE}/panel/v1/rides`, "Fahrten", (d) => (Array.isArray(d.rides) ? d.rides : [])),
      ]);

      if (cancelled) return;

      if (cRes.ok) setCompanyData(cRes.data);
      else setCompanyError(cRes.error);

      if (mRes.ok) setMetrics(mRes.data);
      else setMetricsError(mRes.error);

      if (dRes.ok) setDrivers(dRes.data);
      else setDrivers([]);

      if (vRes.ok) setVehicles(vRes.data);
      else setVehicles([]);

      if (fdRes.ok) setFleetDash(fdRes.data);
      else setFleetDashError(fdRes.error);

      if (rRes.ok) setRides(rRes.data);
      else setRidesError(rRes.error);
      setRidesLoaded(true);

      setLoadComplete(true);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayCompanyName = companyData?.name || company?.name || "Taxi-Unternehmer";
  const currentCompany = companyData || {};

  const medicalOpenCount = useMemo(() => medicalOpenOperationsCount(rides), [rides]);

  const goModule = useCallback(
    (key, opts) => {
      if (typeof onNavigateModule === "function") onNavigateModule(key, opts);
    },
    [onNavigateModule],
  );

  const quick = useCallback(
    (id) => {
      if (typeof onQuickCreate === "function") onQuickCreate(id);
    },
    [onQuickCreate],
  );

  return (
    <DashboardOverviewPage
      user={user}
      displayCompanyName={displayCompanyName}
      companyData={companyData}
      companyError={companyError}
      metrics={metrics}
      metricsError={metricsError}
      fleetDash={fleetDash}
      fleetDashError={fleetDashError}
      rides={rides}
      ridesError={ridesError}
      ridesLoaded={ridesLoaded}
      drivers={drivers}
      vehicles={vehicles}
      medicalOpenCount={medicalOpenCount}
      loadComplete={loadComplete}
      onNavigateModule={goModule}
      onQuickCreate={quick}
    />
  );
}
