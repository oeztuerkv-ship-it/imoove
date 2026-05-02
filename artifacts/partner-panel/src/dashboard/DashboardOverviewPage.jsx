import DashboardActivitySection from "./DashboardActivitySection.jsx";
import DashboardKpiGrid from "./DashboardKpiGrid.jsx";
import DashboardMedicalSection from "./DashboardMedicalSection.jsx";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import DashboardTodaySection from "./DashboardTodaySection.jsx";

function BlockError({ text }) {
  if (!text) return null;
  return <p className="partner-state-error">{text}</p>;
}

function money(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} €`;
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
 *   series: Record<string, unknown>[];
 *   seriesError: string | null;
 *   seriesLoaded: boolean;
 *   drivers: Record<string, unknown>[];
 *   cockpitAlerts: object[];
 *   medicalOpenCount: number;
 *   loadComplete: boolean;
 *   onNavigateModule: (k: string) => void;
 *   onQuickCreate: (id: string) => void;
 *   isTaxiCompany: boolean;
 *   exportFrom: string;
 *   exportTo: string;
 *   exportBusy: boolean;
 *   exportErr: string;
 *   setExportFrom: (v: string) => void;
 *   setExportTo: (v: string) => void;
 *   onDownloadRevenueCsv: () => void;
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
  series,
  seriesError,
  seriesLoaded,
  drivers,
  cockpitAlerts,
  medicalOpenCount,
  loadComplete,
  onNavigateModule,
  onQuickCreate,
  isTaxiCompany,
  exportFrom,
  exportTo,
  exportBusy,
  exportErr,
  setExportFrom,
  setExportTo,
  onDownloadRevenueCsv,
}) {
  const docWarnings = cockpitAlerts.length;

  return (
    <div className="partner-stack partner-stack--tight">
      {!loadComplete && <p className="partner-state-loading">Daten werden geladen …</p>}

      {loadComplete && (
        <>
          <div className="partner-page-hero">
            <p className="partner-page-eyebrow">Dashboard</p>
            <h1 className="partner-page-title">Betriebsübersicht</h1>
            <p className="partner-page-lead">
              Guten Tag, {displayCompanyName} — kompakte Fleet-Kennzahlen, der heutige Tagesplan und Schnellaktionen. Details bearbeiten Sie in den Modulen der
              oberen Leiste.
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
                docWarnings={docWarnings}
                ridesLoaded={ridesLoaded}
              />

              <DashboardTodaySection
                rides={rides}
                ridesError={ridesError}
                ridesLoaded={ridesLoaded}
                fleetDash={fleetDash}
                fleetDashError={fleetDashError}
                drivers={drivers}
                cockpitAlerts={cockpitAlerts}
                onNavigateModule={onNavigateModule}
              />

              <DashboardQuickActions user={user} onQuickCreate={onQuickCreate} />

              <DashboardMedicalSection
                rides={rides}
                ridesLoaded={ridesLoaded}
                series={series}
                seriesLoaded={seriesLoaded}
                seriesError={seriesError}
                onNavigateModule={onNavigateModule}
              />

              <DashboardActivitySection onNavigateModule={onNavigateModule} />

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Betrieb &amp; Umsatz
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Rollierende Kennzahlen aus der bestehenden Übersicht — unveränderte API.
                </p>
                {metricsError ? (
                  <BlockError text={metricsError} />
                ) : metrics ? (
                  <div className="partner-metrics partner-metrics--embedded partner-metrics--dashboard-compact">
                    <div>
                      <p className="partner-metrics__label">Geplant heute</p>
                      <p className="partner-metrics__value">{String(metrics.scheduled?.todayCount ?? 0)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Umsatz 7 Tage</p>
                      <p className="partner-metrics__value">{money(metrics?.week?.revenue)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Umsatz 30 Tage</p>
                      <p className="partner-metrics__value">{money(metrics?.rolling30?.revenue)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Kalendermonat</p>
                      <p className="partner-metrics__value partner-metrics__value--sub">{money(metrics?.month?.revenue)}</p>
                      <p className="partner-metrics__sub">Europe/Berlin</p>
                    </div>
                  </div>
                ) : (
                  <BlockError text="Kennzahlen sind derzeit nicht verfügbar." />
                )}

                {isTaxiCompany ? (
                  <div className="partner-cockpit-csv partner-stack partner-stack--tight" style={{ marginTop: 20 }}>
                    <h3 className="partner-card__title" style={{ marginBottom: 4 }}>
                      Umsatz-Export (CSV)
                    </h3>
                    <p className="partner-muted" style={{ margin: "0 0 12px" }}>
                      Zeitraum wählen, dann CSV herunterladen (bestehender Taxi-Export).
                    </p>
                    <div className="partner-cockpit-csv__row">
                      <label className="partner-form-field partner-form-field--inline">
                        <span>Von</span>
                        <input
                          className="partner-input"
                          type="date"
                          value={exportFrom}
                          onChange={(ev) => setExportFrom(ev.target.value)}
                          disabled={exportBusy}
                        />
                      </label>
                      <label className="partner-form-field partner-form-field--inline">
                        <span>Bis</span>
                        <input
                          className="partner-input"
                          type="date"
                          value={exportTo}
                          onChange={(ev) => setExportTo(ev.target.value)}
                          disabled={exportBusy}
                        />
                      </label>
                      <button
                        type="button"
                        className="partner-btn-primary"
                        disabled={exportBusy || !exportFrom || !exportTo}
                        onClick={() => void onDownloadRevenueCsv()}
                      >
                        {exportBusy ? "Export …" : "CSV herunterladen"}
                      </button>
                    </div>
                    {exportErr ? <p className="partner-state-error" style={{ margin: "8px 0 0" }}>{exportErr}</p> : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
