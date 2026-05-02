import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import DashboardOverviewPage from "../dashboard/DashboardOverviewPage.jsx";
import { medicalOpenOperationsCount } from "../dashboard/dashboardHelpers.js";
import { buildTaxiCockpitAlerts } from "../dashboard/taxiCockpitAlerts.js";

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

function ymdLocal(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultExportRange30() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: ymdLocal(from), to: ymdLocal(to) };
}

/**
 * Taxi-Dashboard — Datenladung hier, Darstellung modular.
 * @param {{ company?: object; user: object; onNavigateModule?: (key: string) => void; onQuickCreate?: (id: string) => void }} props
 */
export default function TaxiMasterPanel({ company, user, onNavigateModule, onQuickCreate }) {
  const defRange = useMemo(() => defaultExportRange30(), []);
  const [exportFrom, setExportFrom] = useState(() => defRange.from);
  const [exportTo, setExportTo] = useState(() => defRange.to);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");

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

  const [series, setSeries] = useState([]);
  const [seriesError, setSeriesError] = useState(null);
  const [seriesLoaded, setSeriesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadComplete(false);
      setCompanyError(null);
      setMetricsError(null);
      setFleetDashError(null);
      setRidesError(null);
      setSeriesError(null);
      setRidesLoaded(false);
      setSeriesLoaded(false);

      setCompanyData(null);
      setMetrics(null);
      setDrivers([]);
      setVehicles([]);
      setFleetDash(null);
      setRides([]);
      setSeries([]);

      const [cRes, mRes, dRes, vRes, fdRes, rRes, sRes] = await Promise.all([
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
        loadPanelResource(`${API_BASE}/panel/v1/partner-ride-series`, "Serienfahrten", (d) => (Array.isArray(d.items) ? d.items : [])),
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

      if (sRes.ok) setSeries(sRes.data);
      else setSeriesError(sRes.error);
      setSeriesLoaded(true);

      setLoadComplete(true);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayCompanyName = companyData?.name || company?.name || "Taxi-Unternehmer";
  const currentCompany = companyData || {};

  const cockpitAlerts = useMemo(
    () => (loadComplete && companyData ? buildTaxiCockpitAlerts(companyData, drivers, vehicles) : []),
    [loadComplete, companyData, drivers, vehicles],
  );

  const medicalOpenCount = useMemo(() => medicalOpenOperationsCount(rides), [rides]);

  const goModule = useCallback(
    (key) => {
      if (typeof onNavigateModule === "function") onNavigateModule(key);
    },
    [onNavigateModule],
  );

  const quick = useCallback(
    (id) => {
      if (typeof onQuickCreate === "function") onQuickCreate(id);
    },
    [onQuickCreate],
  );

  const isTaxiCompany = String(currentCompany?.companyKind ?? "")
    .trim()
    .toLowerCase() === "taxi";

  async function downloadRevenueCsv() {
    setExportErr("");
    const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
    if (!token) {
      setExportErr("Export nicht möglich: keine Anmeldung.");
      return;
    }
    setExportBusy(true);
    try {
      const qs = new URLSearchParams({ createdFrom: exportFrom, createdTo: exportTo });
      const res = await fetch(`${API_BASE}/panel/v1/taxi/revenue-export.csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = String(j.error);
        } catch {
          /* ignore */
        }
        setExportErr(`Export fehlgeschlagen: ${msg}`);
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      let name = `onroda-taxi-umsatz-${exportFrom}-${exportTo}.csv`;
      if (dispo) {
        const m = /filename="([^"]+)"/i.exec(dispo);
        if (m?.[1]) name = m[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportErr("Export fehlgeschlagen (Netzwerk).");
    } finally {
      setExportBusy(false);
    }
  }

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
      series={series}
      seriesError={seriesError}
      seriesLoaded={seriesLoaded}
      drivers={drivers}
      cockpitAlerts={cockpitAlerts}
      medicalOpenCount={medicalOpenCount}
      loadComplete={loadComplete}
      onNavigateModule={goModule}
      onQuickCreate={quick}
      isTaxiCompany={isTaxiCompany}
      exportFrom={exportFrom}
      exportTo={exportTo}
      exportBusy={exportBusy}
      exportErr={exportErr}
      setExportFrom={setExportFrom}
      setExportTo={setExportTo}
      onDownloadRevenueCsv={downloadRevenueCsv}
    />
  );
}
