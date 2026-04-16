import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

/** Antwort von `POST /panel/v1/fleet/drivers` bei Fehler — siehe `fleetPanelApi.ts` / `insertFleetDriver`. */
function messageForFleetDriverCreateError(data) {
  const code = typeof data?.error === "string" ? data.error : "";
  const hint = data?.hint;
  const maxDrivers = data?.maxDrivers;
  switch (code) {
    case "email_taken":
      return "Diese E-Mail ist bereits als Fahrer registriert (systemweit eindeutig). Mit bestehendem Konto anmelden oder andere E-Mail wählen.";
    case "email_invalid":
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    case "company_profile_incomplete":
      return "Unternehmensprofil unvollständig. Bitte Stammdaten unter Firmendaten vervollständigen.";
    case "company_not_verified":
      return "Unternehmen ist noch nicht verifiziert. Freigabe abwarten oder Support kontaktieren.";
    case "company_not_compliant":
      return "Compliance-Anforderungen nicht erfüllt. Bitte Status im Panel prüfen.";
    case "contract_not_active":
      return "Kein aktiver Vertrag. Ohne aktiven Vertrag können keine Fahrer angelegt werden.";
    case "required_documents_missing":
      return "Pflichtnachweise fehlen (z. B. Gewerbe oder Versicherung). Unter „Nachweise“ hochladen.";
    case "company_blocked":
      return "Unternehmen ist gesperrt. Bitte Support kontaktieren.";
    case "company_not_found":
      return "Unternehmen wurde nicht gefunden.";
    case "driver_limit_reached":
      return maxDrivers != null
        ? `Maximale Fahreranzahl für Ihr Paket (${maxDrivers}) ist erreicht.`
        : "Maximale Fahreranzahl ist erreicht.";
    case "fleet_only_taxi_company":
      return "Flottenverwaltung steht nur Taxi-Unternehmen zur Verfügung.";
    case "module_not_enabled":
      return "Das Modul „Flotte“ ist für Ihr Konto nicht freigeschaltet.";
    case "forbidden":
      return hint
        ? `Keine Berechtigung (${String(hint)}). Bitte Rolle „Flotte verwalten“ zuweisen oder anderen Benutzer nutzen.`
        : "Keine Berechtigung. Bitte mit einem Benutzer anmelden, der „Flotte verwalten“ darf.";
    case "database_not_configured":
      return "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.";
    case "unauthorized":
    case "user_inactive_or_missing":
    case "token_out_of_sync":
      return "Sitzung abgelaufen oder ungültig. Bitte abmelden und neu anmelden.";
    default:
      return code
        ? `Fahrer konnte nicht angelegt werden (Technisch: ${code}).`
        : "Fahrer konnte nicht angelegt werden.";
  }
}

const VEHICLE_TYPES = [
  { value: "sedan", label: "Limousine" },
  { value: "station_wagon", label: "Kombi" },
  { value: "van", label: "Großraum / V-Klasse" },
  { value: "wheelchair", label: "Rollstuhlgerecht" },
];

const VEHICLE_LEGAL_TYPES = [
  { value: "taxi", label: "Taxi (Pflichtfahrgebiet / Taxitarif)" },
  { value: "rental_car", label: "Mietwagen (Freiverkehr / Fixpreis)" },
];

const VEHICLE_LEGAL_HINT =
  "Kundenbuchungen „Onroda“ außerhalb des Taxitarif-Korridors (App) nutzen Festpreis — dort passen nur Fahrzeuge mit Rechtsart „Mietwagen“. Innerhalb des Korridors gilt Taxameter; dort reicht „Taxi“. Buchungen „Taxi“ / Taxameter matchen nur Taxi-Fahrzeuge.";

const VEHICLE_CLASSES = [
  { value: "standard", label: "Standard" },
  { value: "xl", label: "XL / Großraum" },
  { value: "wheelchair", label: "Rollstuhl / barrierefrei" },
];

export default function FleetPage() {
  const { token, user } = usePanelAuth();
  const canManage = hasPerm(user?.permissions, "fleet.manage");
  const canRead = hasPerm(user?.permissions, "fleet.read");

  const [tab, setTab] = useState("drivers");
  const [dash, setDash] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [filterExpiring, setFilterExpiring] = useState(false);
  const [vehiclesActiveOnly, setVehiclesActiveOnly] = useState(false);

  const [driverForm, setDriverForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    initialPassword: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    licensePlate: "",
    model: "",
    color: "",
    vehicleType: "sedan",
    vehicleLegalType: "taxi",
    vehicleClass: "standard",
    taxiOrderNumber: "",
    nextInspectionDate: "",
  });
  const [assignForm, setAssignForm] = useState({ driverId: "", vehicleId: "" });

  const loadAll = useCallback(async () => {
    if (!token || !canRead) return;
    setErr("");
    setLoading(true);
    try {
      const qDrivers = filterExpiring ? "?pScheinExpiring=1" : "";
      const qVeh = vehiclesActiveOnly ? "?activeOnly=1" : "";
      const [dRes, vRes, aRes, dashRes] = await Promise.all([
        fetch(`${API_BASE}/panel/v1/fleet/drivers${qDrivers}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/panel/v1/fleet/vehicles${qVeh}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/panel/v1/fleet/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/panel/v1/fleet/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [dData, vData, aData, dashData] = await Promise.all([
        dRes.json().catch(() => ({})),
        vRes.json().catch(() => ({})),
        aRes.json().catch(() => ({})),
        dashRes.json().catch(() => ({})),
      ]);
      if (!dRes.ok || !dData?.ok) {
        setErr("Flotten-Daten konnten nicht geladen werden.");
        return;
      }
      setDrivers(Array.isArray(dData.drivers) ? dData.drivers : []);
      setVehicles(vRes.ok && vData?.ok && Array.isArray(vData.vehicles) ? vData.vehicles : []);
      setAssignments(aRes.ok && aData?.ok && Array.isArray(aData.assignments) ? aData.assignments : []);
      setDash(dashRes.ok && dashData?.ok ? dashData : null);
    } catch {
      setErr("Flotten-Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token, canRead, filterExpiring, vehiclesActiveOnly]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function createDriver(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: driverForm.email,
          firstName: driverForm.firstName,
          lastName: driverForm.lastName,
          phone: driverForm.phone,
          initialPassword: driverForm.initialPassword || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(messageForFleetDriverCreateError(data));
        return;
      }
      setMsg(
        data.initialPassword
          ? `Fahrer angelegt. Initiales Passwort: ${data.initialPassword}`
          : "Fahrer angelegt.",
      );
      setDriverForm({ email: "", firstName: "", lastName: "", phone: "", initialPassword: "" });
      await loadAll();
    } catch {
      setMsg("Fahrer konnte nicht angelegt werden.");
    }
  }

  async function createVehicle(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/vehicles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          licensePlate: vehicleForm.licensePlate,
          model: vehicleForm.model,
          color: vehicleForm.color,
          vehicleType: vehicleForm.vehicleType,
          vehicleLegalType: vehicleForm.vehicleLegalType,
          vehicleClass: vehicleForm.vehicleClass,
          taxiOrderNumber: vehicleForm.taxiOrderNumber,
          nextInspectionDate: vehicleForm.nextInspectionDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Fahrzeug konnte nicht angelegt werden.");
        return;
      }
      setMsg("Fahrzeug angelegt.");
      setVehicleForm({
        licensePlate: "",
        model: "",
        color: "",
        vehicleType: "sedan",
        vehicleLegalType: "taxi",
        vehicleClass: "standard",
        taxiOrderNumber: "",
        nextInspectionDate: "",
      });
      await loadAll();
    } catch {
      setMsg("Fahrzeug konnte nicht angelegt werden.");
    }
  }

  async function clearAssignment(driverId) {
    if (!token || !canManage) return;
    if (!driverId) return;
    if (!window.confirm("Zuweisung für diesen Fahrer wirklich entfernen? Der Fahrer hat dann kein aktives Fahrzeug.")) {
      return;
    }
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/assignments/${encodeURIComponent(driverId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Zuweisung konnte nicht entfernt werden.");
        return;
      }
      await loadAll();
    } catch {
      setMsg("Zuweisung konnte nicht entfernt werden.");
    }
  }

  async function suspendDriver(id) {
    if (!token || !canManage) return;
    if (!window.confirm("Fahrer sperren? Der Login wird sofort ungültig.")) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(id)}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Sperren fehlgeschlagen.");
        return;
      }
      setMsg("Fahrer gesperrt.");
      await loadAll();
    } catch {
      setMsg("Sperren fehlgeschlagen.");
    }
  }

  async function activateDriver(id) {
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(id)}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Aktivierung fehlgeschlagen.");
        return;
      }
      setMsg("Fahrer wieder aktiv.");
      await loadAll();
    } catch {
      setMsg("Aktivierung fehlgeschlagen.");
    }
  }

  async function resetDriverPassword(id) {
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Passwort-Reset fehlgeschlagen.");
        return;
      }
      window.alert(`Neues Passwort: ${data.newPassword}`);
      setMsg("Neues Passwort vergeben (siehe Dialog).");
    } catch {
      setMsg("Passwort-Reset fehlgeschlagen.");
    }
  }

  async function submitAssignment(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/fleet/assignments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driverId: assignForm.driverId, vehicleId: assignForm.vehicleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Zuweisung fehlgeschlagen.");
        return;
      }
      setMsg("Zuweisung gespeichert.");
      await loadAll();
    } catch {
      setMsg("Zuweisung fehlgeschlagen.");
    }
  }

  async function uploadPScheinDoc(driverId, ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !token || !canManage) return;
    if (file.type !== "application/pdf") {
      setMsg("Bitte eine PDF-Datei wählen.");
      return;
    }
    setMsg("");
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(driverId)}/p-schein-doc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("P-Schein-Upload fehlgeschlagen.");
        return;
      }
      setMsg("P-Schein-Dokument gespeichert.");
      await loadAll();
    } catch {
      setMsg("P-Schein-Upload fehlgeschlagen.");
    }
  }

  async function uploadCompliance(kind, ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !token || !canManage) return;
    if (file.type !== "application/pdf") {
      setMsg("Bitte eine PDF-Datei wählen.");
      return;
    }
    setMsg("");
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API_BASE}/panel/v1/fleet/compliance/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Upload fehlgeschlagen.");
        return;
      }
      setMsg(kind === "gewerbe" ? "Gewerbeanmeldung hochgeladen." : "Versicherung hochgeladen.");
    } catch {
      setMsg("Upload fehlgeschlagen.");
    }
  }

  if (!canRead) {
    return (
      <div className="panel-page">
        <p className="panel-page__warn">Keine Berechtigung für die Flottenübersicht.</p>
      </div>
    );
  }

  return (
    <div className="panel-page">
      <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
        <h3 className="panel-card__title">Flotte auf einen Blick</h3>
        {dash ? (
          <div className="panel-fleet-dash">
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{dash.driversOnline ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Fahrer online (2 Min.)</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{dash.driversTotal ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Fahrer gesamt</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{dash.vehiclesActive ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Aktive Fahrzeuge</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{dash.pScheinExpiringWithin30Days ?? 0}</span>
              <span className="panel-fleet-dash__lbl">P-Schein ≤ 30 Tage</span>
            </div>
          </div>
        ) : (
          <p className="panel-page__muted">Kennzahlen werden geladen …</p>
        )}
      </div>

      {err ? <p className="panel-page__warn">{err}</p> : null}
      {msg ? <p className="panel-page__ok">{msg}</p> : null}

      <div className="panel-fleet-tabs">
        <button
          type="button"
          className={tab === "drivers" ? "panel-fleet-tab panel-fleet-tab--on" : "panel-fleet-tab"}
          onClick={() => setTab("drivers")}
        >
          Fahrer
        </button>
        <button
          type="button"
          className={tab === "vehicles" ? "panel-fleet-tab panel-fleet-tab--on" : "panel-fleet-tab"}
          onClick={() => setTab("vehicles")}
        >
          Fahrzeuge
        </button>
        <button
          type="button"
          className={tab === "compliance" ? "panel-fleet-tab panel-fleet-tab--on" : "panel-fleet-tab"}
          onClick={() => setTab("compliance")}
        >
          Nachweise
        </button>
      </div>

      {tab === "drivers" ? (
        <div className="panel-card panel-card--wide">
          <div className="panel-fleet-toolbar">
            <label className="panel-fleet-filter">
              <input
                type="checkbox"
                checked={filterExpiring}
                onChange={(ev) => setFilterExpiring(ev.target.checked)}
              />
              Nur P-Schein bald ablaufend (30 Tage)
            </label>
          </div>
          {canManage ? (
            <form className="panel-rides-form" onSubmit={createDriver} style={{ marginBottom: 18 }}>
              <h4 className="panel-card__title">Neuen Fahrer anlegen</h4>
              <div className="panel-rides-form__grid">
                <label className="panel-rides-form__field">
                  <span>E-Mail (Login)</span>
                  <input
                    type="email"
                    value={driverForm.email}
                    onChange={(ev) => setDriverForm((f) => ({ ...f, email: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Vorname</span>
                  <input
                    value={driverForm.firstName}
                    onChange={(ev) => setDriverForm((f) => ({ ...f, firstName: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Nachname</span>
                  <input
                    value={driverForm.lastName}
                    onChange={(ev) => setDriverForm((f) => ({ ...f, lastName: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Mobilnummer</span>
                  <input
                    value={driverForm.phone}
                    onChange={(ev) => setDriverForm((f) => ({ ...f, phone: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Initiales Passwort (optional, sonst generiert)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={driverForm.initialPassword}
                    onChange={(ev) => setDriverForm((f) => ({ ...f, initialPassword: ev.target.value }))}
                    minLength={10}
                  />
                </label>
              </div>
              <button type="submit" className="panel-btn-primary" style={{ marginTop: 10 }}>
                Fahrer speichern
              </button>
            </form>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table className="panel-fleet-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Status</th>
                  <th>P-Schein bis</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Laden …</td>
                  </tr>
                ) : drivers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Keine Fahrer.</td>
                  </tr>
                ) : (
                  drivers.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.firstName} {d.lastName}
                      </td>
                      <td>{d.email}</td>
                      <td>{d.accessStatus === "active" && d.isActive ? "aktiv" : "gesperrt"}</td>
                      <td>{d.pScheinExpiry || "—"}</td>
                      <td className="panel-fleet-table__actions">
                        {canManage ? (
                          <>
                            <label className="panel-fleet-btn panel-fleet-btn--blue" style={{ cursor: "pointer" }}>
                              P-Schein PDF
                              <input
                                type="file"
                                accept="application/pdf"
                                style={{ display: "none" }}
                                onChange={(ev) => void uploadPScheinDoc(d.id, ev)}
                              />
                            </label>
                            <button
                              type="button"
                              className="panel-fleet-btn panel-fleet-btn--blue"
                              onClick={() => void resetDriverPassword(d.id)}
                            >
                              Passwort zurücksetzen
                            </button>
                            {d.accessStatus === "active" && d.isActive ? (
                              <button
                                type="button"
                                className="panel-fleet-btn panel-fleet-btn--red"
                                onClick={() => void suspendDriver(d.id)}
                              >
                                Sperren
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="panel-btn-secondary"
                                onClick={() => void activateDriver(d.id)}
                              >
                                Aktivieren
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="panel-page__muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "vehicles" ? (
        <div className="panel-card panel-card--wide">
          <div className="panel-fleet-toolbar">
            <label className="panel-fleet-filter">
              <input
                type="checkbox"
                checked={vehiclesActiveOnly}
                onChange={(ev) => setVehiclesActiveOnly(ev.target.checked)}
              />
              Nur aktive Fahrzeuge
            </label>
          </div>
          {canManage ? (
            <form className="panel-rides-form" onSubmit={createVehicle} style={{ marginBottom: 18 }}>
              <h4 className="panel-card__title">Neues Fahrzeug</h4>
              <div className="panel-rides-form__grid">
                <label className="panel-rides-form__field">
                  <span>Kennzeichen</span>
                  <input
                    value={vehicleForm.licensePlate}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, licensePlate: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Hersteller / Modell</span>
                  <input
                    value={vehicleForm.model}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, model: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Farbe</span>
                  <input
                    value={vehicleForm.color}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, color: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Typ</span>
                  <select
                    value={vehicleForm.vehicleType}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, vehicleType: ev.target.value }))}
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-rides-form__field">
                  <span>Rechtsart</span>
                  <select
                    value={vehicleForm.vehicleLegalType}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, vehicleLegalType: ev.target.value }))}
                  >
                    {VEHICLE_LEGAL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-rides-form__field">
                  <span>Fahrzeugklasse</span>
                  <select
                    value={vehicleForm.vehicleClass}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, vehicleClass: ev.target.value }))}
                  >
                    {VEHICLE_CLASSES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-rides-form__field">
                  <span>Taxi-Ordnungsnr.</span>
                  <input
                    value={vehicleForm.taxiOrderNumber}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, taxiOrderNumber: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Nächste HU (TÜV)</span>
                  <input
                    type="date"
                    value={vehicleForm.nextInspectionDate}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, nextInspectionDate: ev.target.value }))}
                  />
                </label>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.45,
                  marginTop: 4,
                  marginBottom: 4,
                  maxWidth: 720,
                }}
              >
                {VEHICLE_LEGAL_HINT}
              </p>
              <button type="submit" className="panel-btn-primary" style={{ marginTop: 10 }}>
                Fahrzeug speichern
              </button>
            </form>
          ) : null}

          {canManage ? (
            <form className="panel-rides-form" onSubmit={submitAssignment} style={{ marginBottom: 18 }}>
              <h4 className="panel-card__title">Fahrer ↔ Fahrzeug (aktuell)</h4>
              <div className="panel-rides-form__grid">
                <label className="panel-rides-form__field">
                  <span>Fahrer</span>
                  <select
                    value={assignForm.driverId}
                    onChange={(ev) => setAssignForm((f) => ({ ...f, driverId: ev.target.value }))}
                    required
                  >
                    <option value="">— wählen —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.firstName} {d.lastName} ({d.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-rides-form__field">
                  <span>Fahrzeug</span>
                  <select
                    value={assignForm.vehicleId}
                    onChange={(ev) => setAssignForm((f) => ({ ...f, vehicleId: ev.target.value }))}
                    required
                  >
                    <option value="">— wählen —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.licensePlate} {v.model ? `· ${v.model}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="panel-btn-primary" style={{ marginTop: 10 }}>
                Zuweisen
              </button>
            </form>
          ) : null}

          <div style={{ overflowX: "auto" }}>
            <table className="panel-fleet-table">
              <thead>
                <tr>
                  <th>Kennzeichen</th>
                  <th>Modell</th>
                  <th>Typ</th>
                  <th>Rechtsart</th>
                  <th>Klasse</th>
                  <th>Taxi-Nr.</th>
                  <th>HU</th>
                  <th>Aktueller Fahrer</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Laden …</td>
                  </tr>
                ) : vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Keine Fahrzeuge.</td>
                  </tr>
                ) : (
                  vehicles.map((v) => {
                    const a = assignments.find((x) => x.vehicleId === v.id);
                    const drv = a ? drivers.find((d) => d.id === a.driverId) : null;
                    return (
                      <tr key={v.id}>
                        <td>{v.licensePlate}</td>
                        <td>{v.model || "—"}</td>
                        <td>{VEHICLE_TYPES.find((t) => t.value === v.vehicleType)?.label ?? v.vehicleType}</td>
                        <td>{VEHICLE_LEGAL_TYPES.find((t) => t.value === v.vehicleLegalType)?.label ?? v.vehicleLegalType}</td>
                        <td>{VEHICLE_CLASSES.find((t) => t.value === v.vehicleClass)?.label ?? v.vehicleClass}</td>
                        <td>{v.taxiOrderNumber || "—"}</td>
                        <td>{v.nextInspectionDate || "—"}</td>
                        <td>
                          {drv ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span>
                                {drv.firstName} {drv.lastName}
                              </span>
                              {canManage ? (
                                <button
                                  type="button"
                                  className="panel-btn-secondary"
                                  style={{ padding: "4px 8px", fontSize: 12 }}
                                  onClick={() => clearAssignment(drv.id)}
                                >
                                  Zuweisung löschen
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            "—"
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
      ) : null}

      {tab === "compliance" ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Gewerbe & Versicherung (PDF)</h3>
          <p className="panel-page__muted">
            Laden Sie hier die Gewerbeanmeldung und die Versicherungspolice als PDF hoch (max. ca. 6–8 MB).
          </p>
          {canManage ? (
            <div className="panel-fleet-uploads">
              <label className="panel-fleet-upload">
                <span className="panel-fleet-upload__lbl">Gewerbeanmeldung</span>
                <input type="file" accept="application/pdf" onChange={(ev) => void uploadCompliance("gewerbe", ev)} />
              </label>
              <label className="panel-fleet-upload">
                <span className="panel-fleet-upload__lbl">Versicherungspolice</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(ev) => void uploadCompliance("insurance", ev)}
                />
              </label>
            </div>
          ) : (
            <p className="panel-page__muted">Nur Inhaber/Manager können Dateien hochladen.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
