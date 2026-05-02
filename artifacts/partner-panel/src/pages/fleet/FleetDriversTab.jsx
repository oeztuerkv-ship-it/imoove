import { pScheinMeta, workflowPill } from "./fleetPanelHelpers.js";

/**
 * @param {{
 *   driverCreateSectionRef: import("react").RefObject<HTMLDivElement | null>;
 *   canManage: boolean;
 *   filterExpiring: boolean;
 *   setFilterExpiring: (v: boolean | ((p: boolean) => boolean)) => void;
 *   driverForm: Record<string, string>;
 *   setDriverForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 *   createDriver: (e: React.FormEvent) => void | Promise<void>;
 *   loading: boolean;
 *   drivers: Record<string, unknown>[];
 *   suspendDriver: (id: string) => void | Promise<void>;
 *   activateDriver: (id: string) => void | Promise<void>;
 *   resetDriverPassword: (id: string) => void | Promise<void>;
 *   uploadPScheinDoc: (driverId: string, ev: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
 * }} props
 */
export default function FleetDriversTab({
  driverCreateSectionRef,
  canManage,
  filterExpiring,
  setFilterExpiring,
  driverForm,
  setDriverForm,
  createDriver,
  loading,
  drivers,
  suspendDriver,
  activateDriver,
  resetDriverPassword,
  uploadPScheinDoc,
}) {
  return (
    <div className="partner-card partner-card--section">
      <div style={{ marginBottom: 12 }}>
        <label className="partner-fleet-filter">
          <input type="checkbox" checked={filterExpiring} onChange={(ev) => setFilterExpiring(ev.target.checked)} />
          Nur P-Schein bald ablaufend (30 Tage)
        </label>
      </div>
      {canManage ? (
        <div ref={driverCreateSectionRef}>
          <form className="partner-form" onSubmit={createDriver} style={{ marginBottom: 20 }}>
            <h3 className="partner-card__title" style={{ marginTop: 0 }}>
              Neuen Fahrer anlegen
            </h3>
            <div className="partner-form-grid">
              <label className="partner-form-field">
                <span>E-Mail (Login)</span>
                <input
                  className="partner-input"
                  type="email"
                  value={driverForm.email}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, email: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-form-field">
                <span>Vorname</span>
                <input
                  className="partner-input"
                  value={driverForm.firstName}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, firstName: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-form-field">
                <span>Nachname</span>
                <input
                  className="partner-input"
                  value={driverForm.lastName}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, lastName: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-form-field">
                <span>Mobilnummer</span>
                <input
                  className="partner-input"
                  value={driverForm.phone}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, phone: ev.target.value }))}
                />
              </label>
              <label className="partner-form-field partner-form-field--span2">
                <span>Initiales Passwort (optional, sonst generiert)</span>
                <input
                  className="partner-input"
                  type="password"
                  autoComplete="new-password"
                  value={driverForm.initialPassword}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, initialPassword: ev.target.value }))}
                  minLength={10}
                />
              </label>
            </div>
            <button type="submit" className="partner-btn-primary" style={{ marginTop: 12 }}>
              Fahrer speichern
            </button>
          </form>
        </div>
      ) : null}
      <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
        Fahrerliste
      </h3>
      <div className="partner-table-wrap">
        <table className="partner-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Fahrer-Status</th>
              <th>Einsatzbereit</th>
              <th>Hinweis</th>
              <th>P-Schein bis</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Laden …</td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={7}>Keine Fahrer.</td>
              </tr>
            ) : (
              drivers.map((d) => {
                const wMeta = workflowPill(d);
                const ready = Boolean(d.readiness?.ready);
                const blockLines = (d.readiness?.blockReasons ?? []).map((b) => b.message).filter(Boolean);
                const pSchein = pScheinMeta(d.pScheinExpiry);
                return (
                  <tr key={d.id}>
                    <td>
                      {d.firstName} {d.lastName}
                    </td>
                    <td>{d.email}</td>
                    <td>
                      <span className={`partner-pill partner-pill--${wMeta.tone}`}>{wMeta.label}</span>
                    </td>
                    <td>
                      <span className={ready ? "partner-pill partner-pill--ok" : "partner-pill partner-pill--missing"}>
                        {ready ? "Ja" : "Nein"}
                      </span>
                    </td>
                    <td
                      className="partner-muted"
                      style={{ maxWidth: 360, fontSize: 12, lineHeight: 1.4 }}
                      title={blockLines.join("\n") || ""}
                    >
                      {ready ? (
                        "—"
                      ) : blockLines.length ? (
                        <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 340 }}>
                          {blockLines.map((line, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "Nicht einsatzbereit."
                      )}
                    </td>
                    <td>
                      <span className={`partner-pill partner-pill--${pSchein.tone}`}>{pSchein.label}</span>
                    </td>
                    <td className="partner-table__actions">
                      {canManage ? (
                        <>
                          {d.accessStatus === "active" && d.isActive ? (
                            <button type="button" className="partner-btn-primary partner-btn-primary--sm" onClick={() => void suspendDriver(d.id)}>
                              Sperren
                            </button>
                          ) : (
                            <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void activateDriver(d.id)}>
                              Aktivieren
                            </button>
                          )}
                          <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void resetDriverPassword(d.id)}>
                            Passwort zurücksetzen
                          </button>
                          <label className="partner-btn-secondary partner-btn-secondary--sm" style={{ cursor: "pointer" }}>
                            P-Schein PDF
                            <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={(ev) => void uploadPScheinDoc(d.id, ev)} />
                          </label>
                        </>
                      ) : (
                        <span className="partner-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
