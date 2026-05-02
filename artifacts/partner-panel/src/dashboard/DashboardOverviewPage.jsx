import DashboardKpiGrid from "./DashboardKpiGrid.jsx";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import DashboardTodaySection from "./DashboardTodaySection.jsx";

function BlockError({ text }) {
  if (!text) return null;
  return <p className="partner-state-error">{text}</p>;
}

/**
 * @param {{
 *   user: object;
 *   displayCompanyName: string;
 *   companyData: object | null;
 *   companyError: string | null;
 *   metrics: object | null;
 *   metricsError: string | null;
 *   fleetDash: object | null;
 *   fleetDashError: string | null;
 *   rides: Record<string, unknown>[];
 *   ridesError: string | null;
 *   ridesLoaded: boolean;
 *   drivers: Record<string, unknown>[];
 *   vehicles: Record<string, unknown>[];
 *   medicalOpenCount: number;
 *   loadComplete: boolean;
 *   onNavigateModule: (k: string, opts?: { settingsTab?: string }) => void;
 *   onQuickCreate: (id: string) => void;
 * }} props
 */
export default function DashboardOverviewPage({
  user,
  displayCompanyName,
  companyData,
  companyError,
  metrics,
  metricsError,
  fleetDash,
  fleetDashError,
  rides,
  ridesError,
  ridesLoaded,
  drivers,
  vehicles,
  medicalOpenCount,
  loadComplete,
  onNavigateModule,
  onQuickCreate,
}) {
  return (
    <div className="partner-stack partner-stack--tight">
      {!loadComplete && <p className="partner-state-loading">Daten werden geladen …</p>}

      {loadComplete && (
        <>
          <div className="partner-page-hero">
            <p className="partner-page-eyebrow">Dashboard</p>
            <h1 className="partner-page-title">Betriebsübersicht</h1>
            <p className="partner-page-lead">
              Guten Tag, {displayCompanyName} — Kennzahlen und der Fahrplan für heute. Details finden Sie unter Flotte, Finanzen und Krankenfahrten.
            </p>
          </div>

          {companyError ? <BlockError text={companyError} /> : null}
          {!companyData && !companyError ? <BlockError text="Firmenstammdaten sind derzeit nicht verfügbar." /> : null}

          {companyData ? (
            <>
              <DashboardKpiGrid
                metrics={metrics}
                metricsError={metricsError}
                fleetDash={fleetDash}
                fleetDashError={fleetDashError}
                medicalOpen={medicalOpenCount}
                ridesLoaded={ridesLoaded}
                onNavigateMedical={() => onNavigateModule("krankenfahrten")}
              />

              <DashboardTodaySection
                rides={rides}
                ridesError={ridesError}
                ridesLoaded={ridesLoaded}
                drivers={drivers}
                vehicles={vehicles}
                onNavigateModule={onNavigateModule}
              />

              <DashboardQuickActions user={user} onQuickCreate={onQuickCreate} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
