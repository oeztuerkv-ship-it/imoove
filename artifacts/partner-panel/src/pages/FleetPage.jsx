import { useCallback, useEffect, useRef, useState } from "react";
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
      return "Pflichtnachweise fehlen (z. B. Gewerbe oder Versicherung). Bitte im Bereich „Dokumente“ prüfen.";
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
    case "timeout":
      return "Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.";
    case "network_error":
      return "Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.";
    default:
      return code ? `Ein unbekannter Fehler ist aufgetreten (Technisch: ${code}).` : "Ein unbekannter Fehler ist aufgetreten.";
  }
}

const VEHICLE_TYPES = [
  { value: "sedan", label: "Limousine" },
  { value: "station_wagon", label: "Kombi" },
  { value: "van", label: "Großraum / V-Klasse" },
  { value: "wheelchair", label: "Rollstuhlgerecht" },
];

const VEHICLE_LEGAL_HINT =
  "Onroda arbeitet nur mit Taxi-Schätzpreis. Alle Fahrzeuge werden als Taxi geführt; die Zuordnung erfolgt weiterhin über Fahrzeugklasse (Standard, XL, Rollstuhl).";

function vehicleStatusDe(v) {
  const s = v?.approvalStatus;
  if (s === "draft") return "Entwurf";
  if (s === "pending_approval") return "In Prüfung";
  if (s === "approved") return "Freigegeben";
  if (s === "rejected") return "Abgelehnt";
  if (s === "blocked") return "Gesperrt";
  return "—";
}

function vehicleStatusTone(v) {
  const s = v?.approvalStatus;
  if (s === "approved") return "ok";
  if (s === "pending_approval") return "warn";
  if (s === "rejected" || s === "blocked") return "danger";
  return "soft";
}

function formatDateDe(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("de-DE");
}

function pScheinMeta(isoDate) {
  if (!isoDate) return { label: "Kein Datum", tone: "warn" };
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { label: String(isoDate), tone: "warn" };
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expiryUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (expiryUtc < todayUtc) {
    return { label: `abgelaufen (${formatDateDe(isoDate)})`, tone: "danger" };
  }
  return { label: formatDateDe(isoDate), tone: "ok" };
}

function workflowPill(driver) {
  const w = driver?.workflow;
  if (w?.label) {
    return { label: w.label, tone: workflowKeyToTone(w.key) };
  }
  const st = String(driver?.approvalStatus ?? "approved").toLowerCase();
  if (driver && (!driver.isActive || driver.accessStatus === "suspended")) {
    return { label: "Gesperrt", tone: "missing" };
  }
  if (st === "rejected") return { label: "Abgelehnt", tone: "missing" };
  if (st === "in_review") return { label: "In Prüfung", tone: "review" };
  if (st === "pending") return { label: "Angelegt", tone: "review" };
  if (st === "approved") return { label: "Freigegeben", tone: "neutral" };
  return { label: "—", tone: "soft" };
}

function workflowKeyToTone(key) {
  if (key === "inactive" || key === "suspended") return "missing";
  if (key === "rejected") return "missing";
  if (key === "in_review" || key === "pending") return "review";
  if (key === "approved") return "neutral";
  return "soft";
}

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
  const [driverCreateError, setDriverCreateError] = useState("");
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
    konzessionNumber: "",
    nextInspectionDate: "",
  });
  const vehicleCreatePdfRef = useRef(null);
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
    setDriverCreateError("");
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
        setDriverCreateError(messageForFleetDriverCreateError(data));
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
      setDriverCreateError("Fehler beim Erstellen des Fahrers.");
    }
  }

  async function createVehicle(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setMsg("");
    const pdfFile = vehicleCreatePdfRef.current?.files?.[0];
    if (!pdfFile) {
      setMsg("Bitte mindestens ein PDF-Nachweis (z. B. Konzession) auswählen.");
      return;
    }
    if (pdfFile.type !== "application/pdf") {
      setMsg("Nur PDF-Dateien sind erlaubt.");
      return;
    }
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
          vehicleLegalType: "taxi",
          vehicleClass: vehicleForm.vehicleClass,
          konzessionNumber: vehicleForm.konzessionNumber,
          nextInspectionDate: vehicleForm.nextInspectionDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(
          typeof data?.error === "string" && data.error === "konzession_number_required"
            ? "Konzessionsnummer ist erforderlich."
            : "Fahrzeug konnte nicht angelegt werden.",
        );
        return;
      }
      const newId = data.id;
      const buf = await pdfFile.arrayBuffer();
      const up = await fetch(`${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(newId)}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: buf,
      });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || !upData?.ok) {
        setMsg("Fahrzeug angelegt, aber PDF-Upload fehlgeschlagen. Bitte in der Liste nachladen (Entwurf).");
        if (vehicleCreatePdfRef.current) vehicleCreatePdfRef.current.value = "";
        await loadAll();
        return;
      }
      const sub = await fetch(
        `${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(newId)}/submit-for-approval`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const subData = await sub.json().catch(() => ({}));
      if (!sub.ok || !subData?.ok) {
        const code = subData?.error;
        setMsg(
          code === "documents_required"
            ? "Dokument fehlt. Bitte PDF erneut hochladen und einreichen."
            : "Einreichung an Onroda fehlgeschlagen.",
        );
        await loadAll();
        return;
      }
      setMsg("Fahrzeug eingereicht – wartet auf Freigabe durch Onroda.");
      setVehicleForm({
        licensePlate: "",
        model: "",
        color: "",
        vehicleType: "sedan",
        vehicleLegalType: "taxi",
        vehicleClass: "standard",
        konzessionNumber: "",
        nextInspectionDate: "",
      });
      if (vehicleCreatePdfRef.current) vehicleCreatePdfRef.current.value = "";
      await loadAll();
    } catch {
      setMsg("Fahrzeug konnte nicht angelegt werden.");
    }
  }

  async function uploadVehicleDocument(vehicleId, ev) {
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
      const res = await fetch(
        `${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(vehicleId)}/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/pdf",
          },
          body: buf,
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Dokument-Upload fehlgeschlagen.");
        return;
      }
      setMsg("Dokument gespeichert.");
      await loadAll();
    } catch {
      setMsg("Dokument-Upload fehlgeschlagen.");
    }
  }

  async function submitVehicleApproval(vehicleId) {
    if (!token || !canManage) return;
    setMsg("");
    try {
      const res = await fetch(
        `${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(vehicleId)}/submit-for-approval`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Einreichen fehlgeschlagen (Kennzeichen, Konzession und mindestens ein PDF nötig).");
        return;
      }
      setMsg("Zur Prüfung bei Onroda eingereicht.");
      await loadAll();
    } catch {
      setMsg("Einreichen fehlgeschlagen.");
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
        setMsg(
          data?.error === "vehicle_not_approved"
            ? "Nur freigegebene Fahrzeuge dürfen zugewiesen werden."
            : "Zuweisung fehlgeschlagen.",
        );
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

  if (!canRead) {
    return (
      <p className="partner-state-warn" style={{ margin: 0 }}>
        Keine Berechtigung für die Flottenübersicht.
      </p>
    );
  }

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Flotte</p>
        <h1 className="partner-page-title">Fahrer &amp; Fahrzeuge</h1>
        <p className="partner-page-lead">
          Überblick, Zuweisungen und Stammdaten Ihrer aktiven Fahrer und Fahrzeuge. Unternehmensnachweise finden Sie unter
          „Dokumente“.
        </p>
      </div>

      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title">Auf einen Blick</h2>
        {dash ? (
          <div className="partner-fleet-kpi-bar">
            <div className="partner-fleet-kpi">
              <span className="partner-fleet-kpi__num">{dash.driversOnline ?? 0}</span>
              <span className="partner-fleet-kpi__lbl">Fahrer online (2 Min.)</span>
            </div>
            <div className="partner-fleet-kpi">
              <span className="partner-fleet-kpi__num">{dash.driversTotal ?? 0}</span>
              <span className="partner-fleet-kpi__lbl">Fahrer gesamt</span>
            </div>
            <div className="partner-fleet-kpi">
              <span className="partner-fleet-kpi__num">{dash.vehiclesActive ?? 0}</span>
              <span className="partner-fleet-kpi__lbl">Freigegebene Fahrzeuge</span>
            </div>
            <div className="partner-fleet-kpi">
              <span className="partner-fleet-kpi__num">{dash.pScheinExpiringWithin30Days ?? 0}</span>
              <span className="partner-fleet-kpi__lbl">P-Schein ≤ 30 Tage</span>
            </div>
          </div>
        ) : (
          <p className="partner-muted">Kennzahlen werden geladen …</p>
        )}
      </div>

      {err ? <p className="partner-state-error">{err}</p> : null}
      {driverCreateError ? <p className="partner-state-error">{driverCreateError}</p> : null}
      {msg ? <p className="partner-state-ok">{msg}</p> : null}

      <div className="partner-pill-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "drivers"}
          className={tab === "drivers" ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
          onClick={() => setTab("drivers")}
        >
          Fahrer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "vehicles"}
          className={tab === "vehicles" ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
          onClick={() => setTab("vehicles")}
        >
          Fahrzeuge
        </button>
      </div>

      {tab === "drivers" ? (
        <div className="partner-card partner-card--section">
          <div style={{ marginBottom: 12 }}>
            <label className="partner-fleet-filter">
              <input
                type="checkbox"
                checked={filterExpiring}
                onChange={(ev) => setFilterExpiring(ev.target.checked)}
              />
              Nur P-Schein bald ablaufend (30 Tage)
            </label>
          </div>
          {canManage ? (
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
                        <span
                          className={
                            ready ? "partner-pill partner-pill--ok" : "partner-pill partner-pill--missing"
                          }
                        >
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
                              <button
                                type="button"
                                className="partner-btn-secondary partner-btn-secondary--sm"
                                onClick={() => void activateDriver(d.id)}
                              >
                                Aktivieren
                              </button>
                            )}
                            <button
                              type="button"
                              className="partner-btn-secondary partner-btn-secondary--sm"
                              onClick={() => void resetDriverPassword(d.id)}
                            >
                              Passwort zurücksetzen
                            </button>
                            <label className="partner-btn-secondary partner-btn-secondary--sm" style={{ cursor: "pointer" }}>
                              P-Schein PDF
                              <input
                                type="file"
                                accept="application/pdf"
                                style={{ display: "none" }}
                                onChange={(ev) => void uploadPScheinDoc(d.id, ev)}
                              />
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
      ) : null}

      {tab === "vehicles" ? (
        <div className="partner-card partner-card--section">
          <div style={{ marginBottom: 12 }}>
            <label className="partner-fleet-filter">
              <input
                type="checkbox"
                checked={vehiclesActiveOnly}
                onChange={(ev) => setVehiclesActiveOnly(ev.target.checked)}
              />
              Nur freigegebene Fahrzeuge
            </label>
          </div>
          {canManage ? (
            <form className="partner-form" onSubmit={createVehicle} style={{ marginBottom: 20 }}>
              <h3 className="partner-card__title" style={{ marginTop: 0 }}>
                Neues Fahrzeug
              </h3>
              <div className="partner-form-grid">
                <label className="partner-form-field">
                  <span>Kennzeichen</span>
                  <input
                    className="partner-input"
                    value={vehicleForm.licensePlate}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, licensePlate: ev.target.value }))}
                    required
                  />
                </label>
                <label className="partner-form-field">
                  <span>Hersteller / Modell</span>
                  <input
                    className="partner-input"
                    value={vehicleForm.model}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, model: ev.target.value }))}
                  />
                </label>
                <label className="partner-form-field">
                  <span>Farbe</span>
                  <input
                    className="partner-input"
                    value={vehicleForm.color}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, color: ev.target.value }))}
                  />
                </label>
                <label className="partner-form-field">
                  <span>Typ</span>
                  <select
                    className="partner-input"
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
                <label className="partner-form-field">
                  <span>Fahrzeugklasse</span>
                  <select
                    className="partner-input"
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
                <label className="partner-form-field">
                  <span>Konzessionsnummer (Pflicht)</span>
                  <input
                    className="partner-input"
                    value={vehicleForm.konzessionNumber}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, konzessionNumber: ev.target.value }))}
                    required
                  />
                </label>
                <label className="partner-form-field partner-form-field--span2">
                  <span>Nachweis / Dokument (PDF, Pflicht)</span>
                  <input ref={vehicleCreatePdfRef} className="partner-input" type="file" accept="application/pdf" />
                </label>
                <label className="partner-form-field">
                  <span>Nächste HU (TÜV)</span>
                  <input
                    className="partner-input"
                    type="date"
                    value={vehicleForm.nextInspectionDate}
                    onChange={(ev) => setVehicleForm((f) => ({ ...f, nextInspectionDate: ev.target.value }))}
                  />
                </label>
              </div>
              <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
                {VEHICLE_LEGAL_HINT}
              </p>
              <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
                Nach dem Speichern wird das Fahrzeug bei Onroda zur Prüfung eingereicht. Sie können Fahrzeuge nicht
                selbst freischalten — die Freigabe erfolgt nur durch Onroda.
              </p>
              <button type="submit" className="partner-btn-primary" style={{ marginTop: 8 }}>
                Fahrzeug anlegen &amp; einreichen
              </button>
            </form>
          ) : null}

          {canManage ? (
            <form className="partner-form partner-assign-card" onSubmit={submitAssignment}>
              <h3 className="partner-assign-card__title">Fahrer zu Fahrzeug zuweisen</h3>
              <div className="partner-form-grid partner-assign-card__grid">
                <label className="partner-form-field">
                  <span>Fahrer</span>
                  <select
                    className="partner-input"
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
                <label className="partner-form-field">
                  <span>Fahrzeug</span>
                  <select
                    className="partner-input"
                    value={assignForm.vehicleId}
                    onChange={(ev) => setAssignForm((f) => ({ ...f, vehicleId: ev.target.value }))}
                    required
                  >
                    <option value="">— wählen —</option>
                    {vehicles
                      .filter((v) => v.approvalStatus === "approved")
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.licensePlate} {v.model ? `· ${v.model}` : ""}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <p className="partner-assign-card__hint">Nur freigegebene Fahrzeuge auswählbar</p>
              <button type="submit" className="partner-btn-primary partner-assign-card__submit">
                Zuweisen
              </button>
            </form>
          ) : null}

          <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
            Fahrzeugliste
          </h3>
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Kennzeichen</th>
                  <th>Status</th>
                  <th>Modell</th>
                  <th>Typ</th>
                  <th>Klasse</th>
                  <th>Konzession</th>
                  <th>HU</th>
                  <th>Aktueller Fahrer</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8}>Laden …</td>
                  </tr>
                ) : vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={8}>Keine Fahrzeuge.</td>
                  </tr>
                ) : (
                  vehicles.map((v) => {
                    const a = assignments.find((x) => x.vehicleId === v.id);
                    const drv = a ? drivers.find((d) => d.id === a.driverId) : null;
                    const kz = v.konzessionNumber ?? v.taxiOrderNumber ?? "—";
                    return (
                      <tr key={v.id}>
                        <td>{v.licensePlate}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span className={`partner-pill partner-pill--${vehicleStatusTone(v)}`} style={{ alignSelf: "flex-start" }}>
                              {vehicleStatusDe(v)}
                            </span>
                            {v.approvalStatus === "pending_approval" ? (
                              <span className="partner-muted" style={{ fontSize: 12, maxWidth: 260, lineHeight: 1.35 }}>
                                Wartet auf Freigabe durch Onroda
                              </span>
                            ) : null}
                            {v.approvalStatus === "rejected" && v.rejectionReason ? (
                              <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                                {v.rejectionReason}
                              </span>
                            ) : null}
                            {v.approvalStatus === "blocked" && v.blockReason ? (
                              <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                                Sperrgrund: {v.blockReason}
                              </span>
                            ) : null}
                            {canManage && (v.approvalStatus === "draft" || v.approvalStatus === "rejected") ? (
                              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                <label className="partner-link-btn partner-link-btn--solid" style={{ cursor: "pointer" }}>
                                  PDF
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    style={{ display: "none" }}
                                    onChange={(ev) => void uploadVehicleDocument(v.id, ev)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="partner-btn-secondary partner-btn-secondary--sm"
                                  onClick={() => void submitVehicleApproval(v.id)}
                                >
                                  Einreichen
                                </button>
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{v.model || "—"}</td>
                        <td>{VEHICLE_TYPES.find((t) => t.value === v.vehicleType)?.label ?? v.vehicleType}</td>
                        <td>{VEHICLE_CLASSES.find((t) => t.value === v.vehicleClass)?.label ?? v.vehicleClass}</td>
                        <td>{kz}</td>
                        <td>{v.nextInspectionDate || "—"}</td>
                        <td>
                          {drv ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className="partner-pill partner-pill--soft">Fahrer</span>
                                <span>
                                  {drv.firstName} {drv.lastName}
                                </span>
                                {canManage ? (
                                  <button
                                    type="button"
                                    className="partner-btn-secondary partner-btn-secondary--sm partner-btn-secondary--muted"
                                    onClick={() => clearAssignment(drv.id)}
                                  >
                                    Zuweisung löschen
                                  </button>
                                ) : null}
                              </div>
                              {v.approvalStatus !== "approved" && drv.readiness?.ready === false ? (
                                <span className="partner-muted" style={{ fontSize: 11, maxWidth: 280, lineHeight: 1.35 }}>
                                  Zugeordneter Fahrer ist nicht einsatzbereit, solange dieses Fahrzeug nicht freigegeben ist oder gesperrt bleibt (Details siehe Fahrerliste, Spalte „Hinweis“).
                                </span>
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

    </div>
  );
}
