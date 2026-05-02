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
 *   editDriverId: string | null;
 *   editDriverForm: Record<string, string>;
 *   setEditDriverForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 *   openDriverEditor: (d: Record<string, unknown>) => void;
 *   closeDriverEditor: () => void;
 *   saveEditedDriver: (e: React.FormEvent) => void | Promise<void>;
 *   deactivateDriverAccount: (id: string) => void | Promise<void>;
 *   activateDriverAccountOnly: (id: string) => void | Promise<void>;
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
  editDriverId,
  editDriverForm,
  setEditDriverForm,
  openDriverEditor,
  closeDriverEditor,
  saveEditedDriver,
  deactivateDriverAccount,
  activateDriverAccountOnly,
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
            <p className="partner-muted" style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.45 }}>
              Pflicht sind nur E-Mail, Vor- und Nachname. P-Schein, Führerschein und Anschrift sind optional und können später ergänzt werden.
            </p>
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
              <label className="partner-form-field">
                <span>P-Schein-Nr. (optional)</span>
                <input
                  className="partner-input"
                  value={driverForm.pScheinNumber ?? ""}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, pScheinNumber: ev.target.value }))}
                />
              </label>
              <label className="partner-form-field">
                <span>P-Schein gültig bis (optional)</span>
                <input
                  className="partner-input"
                  type="date"
                  value={driverForm.pScheinExpiry ?? ""}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, pScheinExpiry: ev.target.value }))}
                />
              </label>
              <label className="partner-form-field partner-form-field--span2">
                <span>Anschrift (optional)</span>
                <input
                  className="partner-input"
                  value={driverForm.homeAddress ?? ""}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, homeAddress: ev.target.value }))}
                  placeholder="Straße, PLZ Ort"
                />
              </label>
              <label className="partner-form-field">
                <span>Führerschein-Nr. (optional)</span>
                <input
                  className="partner-input"
                  value={driverForm.driversLicenseNumber ?? ""}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, driversLicenseNumber: ev.target.value }))}
                />
              </label>
              <label className="partner-form-field">
                <span>Führerschein gültig bis (optional)</span>
                <input
                  className="partner-input"
                  type="date"
                  value={driverForm.driversLicenseExpiry ?? ""}
                  onChange={(ev) => setDriverForm((f) => ({ ...f, driversLicenseExpiry: ev.target.value }))}
                />
              </label>
            </div>
            <button type="submit" className="partner-btn-primary" style={{ marginTop: 12 }}>
              Fahrer speichern
            </button>
          </form>
        </div>
      ) : null}

      {canManage && editDriverId ? (
        <form className="partner-form" onSubmit={saveEditedDriver} style={{ marginBottom: 24, padding: 16, border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <h3 className="partner-card__title" style={{ marginTop: 0 }}>
            Fahrer bearbeiten
          </h3>
          <p className="partner-muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
            Stammdaten und optionale Nachweise. Neues Passwort nur ausfüllen, wenn Sie es ändern möchten (min. 10 Zeichen).
          </p>
          <div className="partner-form-grid">
            <label className="partner-form-field">
              <span>Vorname</span>
              <input
                className="partner-input"
                value={editDriverForm.firstName}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, firstName: ev.target.value }))}
                required
              />
            </label>
            <label className="partner-form-field">
              <span>Nachname</span>
              <input
                className="partner-input"
                value={editDriverForm.lastName}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, lastName: ev.target.value }))}
                required
              />
            </label>
            <label className="partner-form-field">
              <span>E-Mail (Login)</span>
              <input
                className="partner-input"
                type="email"
                value={editDriverForm.email}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, email: ev.target.value }))}
                required
              />
            </label>
            <label className="partner-form-field">
              <span>Mobilnummer</span>
              <input
                className="partner-input"
                value={editDriverForm.phone}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, phone: ev.target.value }))}
              />
            </label>
            <label className="partner-form-field partner-form-field--span2">
              <span>Neues Passwort (optional)</span>
              <input
                className="partner-input"
                type="password"
                autoComplete="new-password"
                value={editDriverForm.newPassword}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, newPassword: ev.target.value }))}
                minLength={10}
              />
            </label>
            <label className="partner-form-field">
              <span>P-Schein-Nr.</span>
              <input
                className="partner-input"
                value={editDriverForm.pScheinNumber}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, pScheinNumber: ev.target.value }))}
              />
            </label>
            <label className="partner-form-field">
              <span>P-Schein gültig bis</span>
              <input
                className="partner-input"
                type="date"
                value={editDriverForm.pScheinExpiry}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, pScheinExpiry: ev.target.value }))}
              />
            </label>
            <label className="partner-form-field partner-form-field--span2">
              <span>Anschrift</span>
              <input
                className="partner-input"
                value={editDriverForm.homeAddress}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, homeAddress: ev.target.value }))}
              />
            </label>
            <label className="partner-form-field">
              <span>Führerschein-Nr.</span>
              <input
                className="partner-input"
                value={editDriverForm.driversLicenseNumber}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, driversLicenseNumber: ev.target.value }))}
              />
            </label>
            <label className="partner-form-field">
              <span>Führerschein gültig bis</span>
              <input
                className="partner-input"
                type="date"
                value={editDriverForm.driversLicenseExpiry}
                onChange={(ev) => setEditDriverForm((f) => ({ ...f, driversLicenseExpiry: ev.target.value }))}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="submit" className="partner-btn-primary">
              Änderungen speichern
            </button>
            <button type="button" className="partner-btn-secondary" onClick={closeDriverEditor}>
              Abbrechen
            </button>
          </div>
        </form>
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
                const suspended = d.accessStatus === "suspended";
                const activeAccount = Boolean(d.isActive);
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
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 420 }}>
                          <button
                            type="button"
                            className="partner-btn-secondary partner-btn-secondary--sm"
                            onClick={() => openDriverEditor(d)}
                          >
                            Bearbeiten
                          </button>
                          {suspended ? (
                            <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void activateDriver(d.id)}>
                              Entsperren
                            </button>
                          ) : null}
                          {!suspended && activeAccount ? (
                            <button
                              type="button"
                              className="partner-btn-secondary partner-btn-secondary--sm"
                              onClick={() => void deactivateDriverAccount(d.id)}
                            >
                              Außer Dienst
                            </button>
                          ) : null}
                          {!suspended && !activeAccount ? (
                            <button
                              type="button"
                              className="partner-btn-primary partner-btn-primary--sm"
                              onClick={() => void activateDriverAccountOnly(d.id)}
                            >
                              Im Dienst
                            </button>
                          ) : null}
                          {!suspended && activeAccount ? (
                            <button type="button" className="partner-btn-primary partner-btn-primary--sm" onClick={() => void suspendDriver(d.id)}>
                              Sperren
                            </button>
                          ) : null}
                          <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void resetDriverPassword(d.id)}>
                            Passwort
                          </button>
                          <label className="partner-btn-secondary partner-btn-secondary--sm" style={{ cursor: "pointer" }}>
                            P-Schein PDF
                            <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={(ev) => void uploadPScheinDoc(d.id, ev)} />
                          </label>
                        </div>
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
