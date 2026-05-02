/**
 * @param {{
 *   driverCreateSectionRef: import("react").RefObject<HTMLDivElement | null>;
 *   canManage: boolean;
 *   driverForm: Record<string, string>;
 *   setDriverForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 *   createDriver: (e: React.FormEvent) => void | Promise<void>;
 *   loading: boolean;
 *   drivers: Record<string, unknown>[];
 *   resetDriverPassword: (id: string) => void | Promise<void>;
 *   uploadPScheinDoc: (driverId: string, ev: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
 *   editDriverId: string | null;
 *   editDriverForm: Record<string, string>;
 *   setEditDriverForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 *   openDriverEditor: (d: Record<string, unknown>) => void;
 *   closeDriverEditor: () => void;
 *   saveEditedDriver: (e: React.FormEvent) => void | Promise<void>;
 *   deactivateDriverAccount: (id: string) => void | Promise<void>;
 *   activateDriverForPartner: (id: string) => void | Promise<void>;
 * }} props
 */

/** Entspricht Login: aktiv im Konto und Zugriff nicht gesperrt. */
function partnerDriverCanLogin(d) {
  return Boolean(d.isActive) && d.accessStatus === "active";
}

export default function FleetDriversTab({
  driverCreateSectionRef,
  canManage,
  driverForm,
  setDriverForm,
  createDriver,
  loading,
  drivers,
  resetDriverPassword,
  uploadPScheinDoc,
  editDriverId,
  editDriverForm,
  setEditDriverForm,
  openDriverEditor,
  closeDriverEditor,
  saveEditedDriver,
  deactivateDriverAccount,
  activateDriverForPartner,
}) {
  const editingDriver = editDriverId ? drivers.find((x) => x.id === editDriverId) : null;
  const readinessBlocks = editingDriver?.readiness?.blockReasons;
  const blockLines = Array.isArray(readinessBlocks) ? readinessBlocks.map((b) => b.message).filter(Boolean) : [];

  return (
    <div className="partner-card partner-card--section">
      {canManage ? (
        <div ref={driverCreateSectionRef}>
          <form className="partner-form" onSubmit={createDriver} style={{ marginBottom: 20 }}>
            <h3 className="partner-card__title" style={{ marginTop: 0 }}>
              Neuen Fahrer anlegen
            </h3>
            <p className="partner-muted" style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.45 }}>
              Nach dem Speichern kann sich der Fahrer mit E-Mail und Passwort in der Fahrer-App anmelden. P-Schein, Führerschein und Anschrift sind optional.
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
            Stammdaten und optionale Nachweise. Passwort: unten eintragen (min. 10 Zeichen) oder „Passwort neu vergeben“ in der Liste nutzen.
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
              <span>P-Schein als PDF (optional)</span>
              <input
                type="file"
                accept="application/pdf"
                className="partner-input"
                onChange={(ev) => void uploadPScheinDoc(editDriverId, ev)}
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

          {blockLines.length > 0 ? (
            <details style={{ marginTop: 12 }} className="partner-muted">
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Technische Hinweise (Fahrer-App)</summary>
              <p style={{ margin: "8px 0 4px", fontSize: 12, lineHeight: 1.45 }}>
                Nur bei Bedarf — betrifft z. B. Aufträge in der App, nicht den Login im Panel.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
                {blockLines.map((line, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

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
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Laden …</td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={4}>Keine Fahrer.</td>
              </tr>
            ) : (
              drivers.map((d) => {
                const loginOk = partnerDriverCanLogin(d);
                return (
                  <tr key={d.id}>
                    <td>
                      {d.firstName} {d.lastName}
                    </td>
                    <td>{d.email}</td>
                    <td>
                      <span className={`partner-pill partner-pill--${loginOk ? "ok" : "missing"}`}>
                        {loginOk ? "Aktiv" : "Deaktiviert"}
                      </span>
                    </td>
                    <td className="partner-table__actions">
                      {canManage ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button
                            type="button"
                            className="partner-btn-secondary partner-btn-secondary--sm"
                            onClick={() => openDriverEditor(d)}
                          >
                            Bearbeiten
                          </button>
                          {loginOk ? (
                            <button
                              type="button"
                              className="partner-btn-secondary partner-btn-secondary--sm"
                              onClick={() => void deactivateDriverAccount(d.id)}
                            >
                              Deaktivieren
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="partner-btn-primary partner-btn-primary--sm"
                              onClick={() => void activateDriverForPartner(d.id)}
                            >
                              Aktivieren
                            </button>
                          )}
                          <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void resetDriverPassword(d.id)}>
                            Passwort ändern
                          </button>
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
