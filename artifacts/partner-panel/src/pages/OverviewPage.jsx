import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import TaxiDashboardCockpit from "../components/TaxiDashboardCockpit.jsx";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function OverviewPage() {
  const { user, token } = usePanelAuth();
  const [fleetDash, setFleetDash] = useState(null);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [metricsYear, setMetricsYear] = useState(() => new Date().getFullYear());
  const [rides, setRides] = useState([]);
  const [ridesErr, setRidesErr] = useState("");

  useEffect(() => {
    if (!token || !hasPanelModule(user?.panelModules, "taxi_fleet")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/panel/v1/fleet/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setFleetDash(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.panelModules]);

  useEffect(() => {
    if (!token || !hasPerm(user?.permissions, "rides.read")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/panel/v1/overview/metrics?year=${encodeURIComponent(String(metricsYear))}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setRideMetrics(data.metrics ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.permissions, metricsYear]);

  useEffect(() => {
    if (!token || !hasPanelModule(user?.panelModules, "rides_list") || !hasPerm(user?.permissions, "rides.read")) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setRidesErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setRidesErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
          return;
        }
        const list = Array.isArray(data.rides) ? data.rides : [];
        setRides(list.slice(0, 200));
      } catch {
        if (!cancelled) {
          setRidesErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.panelModules, user?.permissions]);

  return (
    <TaxiDashboardCockpit
      variant="legacy"
      user={user}
      metrics={rideMetrics}
      fleetDash={fleetDash}
      rides={rides}
      ridesError={ridesErr}
      ridesLoaded
      loadComplete
      metricsYear={metricsYear}
      onMetricsYearChange={setMetricsYear}
    />
  );
}
