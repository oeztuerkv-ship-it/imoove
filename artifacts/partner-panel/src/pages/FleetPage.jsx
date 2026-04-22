import { useCallback, useEffect, useMemo, useState } from "react";
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

const VEHICLE_LEGAL_HINT =
  "Onroda arbeitet nur mit Taxi-Schätzpreis. Alle Fahrzeuge werden als Taxi geführt; die Zuordnung erfolgt weiterhin über Fahrzeugklasse (Standard, XL, Rollstuhl).";

const VEHICLE_CLASSES = [
  { value: "standard", label: "Standard" },
  { value: "xl", label: "XL / Großraum" },
  { value: "wheelchair", label: "Rollstuhl / barrierefrei" },
];

const REQUEST_TIMEOUT_MS = 12000;

function statusClass(ok) {
  return ok ? "panel-pill panel-pill--ok" : "panel-pill panel-pill--warn";
}

function asSafeList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object");
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, status: 408, data: { error: "timeout" } };
    }
    return { ok: false, status: 0, data: { error: "network_error" } };
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function FleetPage() {
  const { token, user } = usePanelAuth();
  const canManage = hasPerm(user?.permissions, "fleet.manage");
  const canRead = hasPerm(user?.permissions, "fleet.read");

  const [tab, setTab] = useState("drivers");
  const [dash, setDash] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [filterExpiring, setFilterExpiring] = useState(false);
  const [driversActiveOnly, setDriversActiveOnly] = useState(false);
  const [vehiclesActiveOnly, setVehiclesActiveOnly] = useState(true);
  const [driverQuery, setDriverQuery] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");

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
    vehicleClass: "standard",
    taxiOrderNumber: "",
    nextInspectionDate: "",
  });
  const [assignForm, setAssignForm] = useState({ driverId: "", vehicleId: "" });
  const [editDriverId, setEditDriverId] = useState("");
  const [editDriverForm, setEditDriverForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    pScheinNumber: "",
    pScheinExpiry: "",
    vehicleClass: "standard",
  });
  const [editVehicleId, setEditVehicleId] = useState("");
  const [editVehicleForm, setEditVehicleForm] = useState({
    licensePlate: "",
    model: "",
    color: "",
    vehicleType: "sedan",
    vehicleClass: "standard",
    taxiOrderNumber: "",
    nextInspectionDate: "",
    isActive: true,
  });

  const loadAll = useCallback(async () => {
    if (!token || !canRead) return;
    setErr("");
    setLoading(true);
    try {
      const qDrivers = filterExpiring ? "?pScheinExpiring=1" : "";
      const qVeh = vehiclesActiveOnly ? "?activeOnly=1" : "";
      const [driversReq, vehiclesReq, assignmentsReq, dashReq, companyReq] = await Promise.all([
        fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/drivers${qDrivers}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/vehicles${qVeh}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchJsonWithTimeout(`${API_BASE}/panel/v1/company`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!driversReq.ok || !driversReq.data?.ok) {
        const code = driversReq.data?.error;
        if (driversReq.status === 403 && code === "module_not_enabled") {
          setErr("Flottenmodul ist für dieses Konto nicht freigeschaltet.");
        } else if (driversReq.status === 403 && code === "fleet_only_taxi_company") {
          setErr("Flottenmodul ist nur für Taxi-Unternehmen verfügbar.");
        } else if (driversReq.status === 401) {
          setErr("Sitzung abgelaufen. Bitte neu anmelden.");
        } else if (driversReq.status === 408 || code === "timeout") {
          setErr("API reagiert zu langsam. Bitte erneut laden.");
        } else {
          setErr("Flotten-Daten konnten nicht geladen werden.");
        }
        return;
      }
      setDrivers(asSafeList(driversReq.data.drivers));
      setVehicles(vehiclesReq.ok && vehiclesReq.data?.ok ? asSafeList(vehiclesReq.data.vehicles) : []);
      setAssignments(
        assignmentsReq.ok && assignmentsReq.data?.ok ? asSafeList(assignmentsReq.data.assignments) : [],
      );
      setDash(dashReq.ok && dashReq.data?.ok ? dashReq.data : null);
      setCompany(companyReq.ok && companyReq.data?.ok ? companyReq.data.company ?? null : null);

      if (!vehiclesReq.ok || !assignmentsReq.ok || !dashReq.ok) {
        setErr("Teilweise Daten konnten nicht geladen werden. Fahrerbereich bleibt nutzbar.");
      }
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
      const { ok, status, data } = await fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/vehicles`, {
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
          taxiOrderNumber: vehicleForm.taxiOrderNumber,
          nextInspectionDate: vehicleForm.nextInspectionDate || null,
        }),
      });
      if (!ok || !data?.ok) {
        if (status === 403 && data?.error === "vehicle_limit_reached") {
          setMsg(`Maximale Fahrzeuganzahl erreicht${data?.maxVehicles ? ` (${data.maxVehicles})` : ""}.`);
        } else if (status === 403) {
          setMsg("Fahrzeug kann aktuell nicht angelegt werden (Freigabe/Profil prüfen).");
        } else if (status === 408 || data?.error === "timeout") {
          setMsg("API-Zeitüberschreitung. Bitte erneut versuchen.");
        } else {
          setMsg("Fahrzeug konnte nicht angelegt werden.");
        }
        return;
      }
      setMsg("Fahrzeug angelegt.");
      setVehicleForm({
        licensePlate: "",
        model: "",
        color: "",
        vehicleType: "sedan",
        vehicleClass: "standard",
        taxiOrderNumber: "",
        nextInspectionDate: "",
      });
      await loadAll();
    } catch {
      setMsg("Fahrzeug konnte nicht angelegt werden.");
    }
  }

  function startEditDriver(d) {
    setEditDriverId(d.id);
    setEditDriverForm({
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      phone: d.phone ?? "",
      pScheinNumber: d.pScheinNumber ?? "",
      pScheinExpiry: d.pScheinExpiry ?? "",
      vehicleClass: d.vehicleClass ?? "standard",
    });
    setMsg("");
  }

  async function saveDriverEdit(e) {
    e.preventDefault();
    if (!token || !canManage || !editDriverId) return;
    setBusyAction(`driver-edit-${editDriverId}`);
    setMsg("");
    try {
      const { ok, status, data } = await fetchJsonWithTimeout(
        `${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(editDriverId)}`,
        {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: editDriverForm.firstName,
          lastName: editDriverForm.lastName,
          phone: editDriverForm.phone,
          pScheinNumber: editDriverForm.pScheinNumber,
          pScheinExpiry: editDriverForm.pScheinExpiry || null,
          vehicleClass: editDriverForm.vehicleClass,
          vehicleLegalType: "taxi",
        }),
      },
      );
      if (!ok || !data?.ok) {
        if (status === 404) setMsg("Fahrer wurde nicht gefunden (evtl. bereits gelöscht).");
        else if (status === 403) setMsg("Keine Berechtigung zum Bearbeiten.");
        else if (status === 408 || data?.error === "timeout") setMsg("API-Zeitüberschreitung. Bitte erneut versuchen.");
        else setMsg("Fahrer konnte nicht aktualisiert werden.");
        return;
      }
      setMsg("Fahrerdaten aktualisiert.");
      setEditDriverId("");
      await loadAll();
    } catch {
      setMsg("Fahrer konnte nicht aktualisiert werden.");
    } finally {
      setBusyAction("");
    }
  }

  function startEditVehicle(v) {
    setEditVehicleId(v.id);
    setEditVehicleForm({
      licensePlate: v.licensePlate ?? "",
      model: v.model ?? "",
      color: v.color ?? "",
      vehicleType: v.vehicleType ?? "sedan",
      vehicleClass: v.vehicleClass ?? "standard",
      taxiOrderNumber: v.taxiOrderNumber ?? "",
      nextInspectionDate: v.nextInspectionDate ?? "",
      isActive: Boolean(v.isActive),
    });
    setMsg("");
  }

  async function saveVehicleEdit(e) {
    e.preventDefault();
    if (!token || !canManage || !editVehicleId) return;
    setBusyAction(`vehicle-edit-${editVehicleId}`);
    setMsg("");
    try {
      const { ok, status, data } = await fetchJsonWithTimeout(
        `${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(editVehicleId)}`,
        {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          licensePlate: editVehicleForm.licensePlate,
          model: editVehicleForm.model,
          color: editVehicleForm.color,
          vehicleType: editVehicleForm.vehicleType,
          vehicleClass: editVehicleForm.vehicleClass,
          vehicleLegalType: "taxi",
          taxiOrderNumber: editVehicleForm.taxiOrderNumber,
          nextInspectionDate: editVehicleForm.nextInspectionDate || null,
          isActive: editVehicleForm.isActive,
        }),
      },
      );
      if (!ok || !data?.ok) {
        if (status === 404) setMsg("Fahrzeug wurde nicht gefunden.");
        else if (status === 403) setMsg("Keine Berechtigung zum Bearbeiten.");
        else if (status === 408 || data?.error === "timeout") setMsg("API-Zeitüberschreitung. Bitte erneut versuchen.");
        else setMsg("Fahrzeug konnte nicht aktualisiert werden.");
        return;
      }
      setMsg("Fahrzeug aktualisiert.");
      setEditVehicleId("");
      await loadAll();
    } catch {
      setMsg("Fahrzeug konnte nicht aktualisiert werden.");
    } finally {
      setBusyAction("");
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
    setBusyAction(`driver-suspend-${id}`);
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
    } finally {
      setBusyAction("");
    }
  }

  async function activateDriver(id) {
    if (!token || !canManage) return;
    setMsg("");
    setBusyAction(`driver-activate-${id}`);
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
    } finally {
      setBusyAction("");
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
      const { ok, status, data } = await fetchJsonWithTimeout(`${API_BASE}/panel/v1/fleet/assignments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driverId: assignForm.driverId, vehicleId: assignForm.vehicleId }),
      });
      if (!ok || !data?.ok) {
        if (status === 404 || data?.error === "driver_or_vehicle_not_found") {
          setMsg("Fahrer oder Fahrzeug nicht gefunden.");
        } else if (status === 403) {
          setMsg("Keine Berechtigung für Zuweisungen.");
        } else if (status === 408 || data?.error === "timeout") {
          setMsg("API-Zeitüberschreitung. Bitte erneut versuchen.");
        } else {
          setMsg("Zuweisung fehlgeschlagen.");
        }
        return;
      }
      setMsg("Zuweisung gespeichert.");
      setAssignForm({ driverId: "", vehicleId: "" });
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

  const assignmentByDriver = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (a?.driverId) map.set(a.driverId, a);
    }
    return map;
  }, [assignments]);

  const assignmentByVehicle = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (a?.vehicleId) map.set(a.vehicleId, a);
    }
    return map;
  }, [assignments]);

  const normalizedDriverQuery = driverQuery.trim().toLowerCase();
  const normalizedVehicleQuery = vehicleQuery.trim().toLowerCase();
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (driversActiveOnly && !(d.accessStatus === "active" && d.isActive)) return false;
      if (!normalizedDriverQuery) return true;
      const hay = `${d.firstName ?? ""} ${d.lastName ?? ""} ${d.email ?? ""} ${d.phone ?? ""} ${d.pScheinNumber ?? ""}`
        .toLowerCase()
        .trim();
      return hay.includes(normalizedDriverQuery);
    });
  }, [drivers, driversActiveOnly, normalizedDriverQuery]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (vehiclesActiveOnly && !v.isActive) return false;
      if (!normalizedVehicleQuery) return true;
      const hay =
        `${v.licensePlate ?? ""} ${v.model ?? ""} ${v.color ?? ""} ${v.taxiOrderNumber ?? ""} ${v.vehicleClass ?? ""}`.toLowerCase();
      return hay.includes(normalizedVehicleQuery);
    });
  }, [vehicles, vehiclesActiveOnly, normalizedVehicleQuery]);

  const canManageFleet = canManage;
  const showDriverCreateForm = canManageFleet && tab === "drivers";
  const showVehicleCreateForm = canManageFleet && tab === "vehicles";
  const showAssignmentForm = canManageFleet && tab === "assignments";
  const basicsComplete = company
    ? Boolean(
        company.name &&
          company.contactName &&
          company.email &&
          company.phone &&
          company.addressLine1 &&
          company.postalCode &&
          company.city &&
          company.country &&
          company.legalForm &&
          company.ownerName,
      )
    : false;

  return (
    <div className="panel-page">
      <div
        className="panel-card panel-card--wide"
        style={{ marginBottom: 12, borderColor: "#f59e0b", background: "#fffbeb" }}
      >
        <h3 className="panel-card__title" style={{ color: "#92400e" }}>
          Debug (temporär)
        </h3>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 12,
            lineHeight: 1.45,
            color: "#78350f",
          }}
        >
          {JSON.stringify(
            {
              permissions: Array.isArray(user?.permissions) ? user.permissions : [],
              canRead,
              canManageFleet,
              tab,
              showDriverCreateForm,
              showVehicleCreateForm,
              showAssignmentForm,
            },
            null,
            2,
          )}
        </pre>
      </div>
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
              <span className="panel-fleet-dash__num">{dash.vehiclesTotal ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Fahrzeuge gesamt</span>
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
      {company ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Taxi-Stammdaten & Freigabe</h3>
          <div className="panel-fleet-status-grid">
            <p className="panel-card__row">
              <span className="panel-card__k">Stammdaten</span>
              <span className={statusClass(basicsComplete)}>{basicsComplete ? "vollständig" : "unvollständig"}</span>
            </p>
            <p className="panel-card__row">
              <span className="panel-card__k">Profil-Lock</span>
              <span className={statusClass(company.profileLocked)}>{company.profileLocked ? "aktiv" : "offen"}</span>
            </p>
            <p className="panel-card__row">
              <span className="panel-card__k">Freigabe</span>
              <span className={statusClass(company.verificationStatus === "verified")}>{company.verificationStatus}</span>
            </p>
            <p className="panel-card__row">
              <span className="panel-card__k">Compliance</span>
              <span className={statusClass(company.complianceStatus === "compliant")}>{company.complianceStatus}</span>
            </p>
          </div>
          {!canManageFleet ? <p className="panel-page__muted">Keine Berechtigung für Flotten-Bearbeitung.</p> : null}
        </div>
      ) : null}

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
          className={tab === "assignments" ? "panel-fleet-tab panel-fleet-tab--on" : "panel-fleet-tab"}
          onClick={() => setTab("assignments")}
        >
          Zuweisungen
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
            <label className="panel-fleet-filter">
              <input
                type="checkbox"
                checked={driversActiveOnly}
                onChange={(ev) => setDriversActiveOnly(ev.target.checked)}
              />
              Nur aktive Fahrer
            </label>
            <input
              className="panel-fleet-search"
              value={driverQuery}
              onChange={(ev) => setDriverQuery(ev.target.value)}
              placeholder="Fahrer suchen (Name, E-Mail, Telefon, P-Schein)"
            />
          </div>
          {canManageFleet ? (
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
                  <th>Fahrzeug</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Laden …</td>
                  </tr>
                ) : filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Keine Fahrer.</td>
                  </tr>
                ) : (
                  filteredDrivers.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.firstName} {d.lastName}
                      </td>
                      <td>{d.email}</td>
                      <td>
                        <span className={statusClass(d.accessStatus === "active" && d.isActive)}>
                          {d.accessStatus === "active" && d.isActive ? "aktiv" : "gesperrt"}
                        </span>
                      </td>
                      <td>{d.pScheinExpiry || "—"}</td>
                      <td>
                        {assignmentByDriver.get(d.id)
                          ? vehicles.find((v) => v.id === assignmentByDriver.get(d.id)?.vehicleId)?.licensePlate ?? "zugewiesen"
                          : "—"}
                      </td>
                      <td className="panel-fleet-table__actions">
                        {canManageFleet ? (
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
                            <button
                              type="button"
                              className="panel-fleet-btn panel-fleet-btn--blue"
                              onClick={() => startEditDriver(d)}
                            >
                              Bearbeiten
                            </button>
                            {d.accessStatus === "active" && d.isActive ? (
                              <button
                                type="button"
                                className="panel-fleet-btn panel-fleet-btn--red"
                                disabled={busyAction === `driver-suspend-${d.id}`}
                                onClick={() => void suspendDriver(d.id)}
                              >
                                Sperren
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="panel-btn-secondary"
                                disabled={busyAction === `driver-activate-${d.id}`}
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
          {editDriverId ? (
            <form className="panel-rides-form" onSubmit={saveDriverEdit} style={{ marginTop: 18 }}>
              <h4 className="panel-card__title">Fahrer bearbeiten</h4>
              <div className="panel-rides-form__grid">
                <label className="panel-rides-form__field">
                  <span>Vorname</span>
                  <input
                    value={editDriverForm.firstName}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, firstName: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Nachname</span>
                  <input
                    value={editDriverForm.lastName}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, lastName: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Mobilnummer</span>
                  <input
                    value={editDriverForm.phone}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, phone: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>P-Schein Nummer</span>
                  <input
                    value={editDriverForm.pScheinNumber}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, pScheinNumber: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>P-Schein Ablaufdatum</span>
                  <input
                    type="date"
                    value={editDriverForm.pScheinExpiry}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, pScheinExpiry: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Fahrzeugklasse</span>
                  <select
                    value={editDriverForm.vehicleClass}
                    onChange={(ev) => setEditDriverForm((f) => ({ ...f, vehicleClass: ev.target.value }))}
                  >
                    {VEHICLE_CLASSES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="panel-profile-actions">
                <button type="submit" className="panel-btn-primary" disabled={busyAction === `driver-edit-${editDriverId}`}>
                  {busyAction === `driver-edit-${editDriverId}` ? "Speichern …" : "Änderungen speichern"}
                </button>
                <button type="button" className="panel-btn-secondary" onClick={() => setEditDriverId("")}>
                  Abbrechen
                </button>
              </div>
            </form>
          ) : null}
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
            <input
              className="panel-fleet-search"
              value={vehicleQuery}
              onChange={(ev) => setVehicleQuery(ev.target.value)}
              placeholder="Fahrzeug suchen (Kennzeichen, Modell, Farbe, Ordnungsnr.)"
            />
          </div>
          {canManageFleet ? (
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

          <div style={{ overflowX: "auto" }}>
            <table className="panel-fleet-table">
              <thead>
                <tr>
                  <th>Kennzeichen</th>
                  <th>Modell</th>
                  <th>Typ</th>
                  <th>Klasse</th>
                  <th>Taxi-Nr.</th>
                  <th>HU</th>
                  <th>Status</th>
                  <th>Aktueller Fahrer</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9}>Laden …</td>
                  </tr>
                ) : filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={9}>Keine Fahrzeuge.</td>
                  </tr>
                ) : (
                  filteredVehicles.map((v) => {
                    const a = assignmentByVehicle.get(v.id);
                    const drv = a ? drivers.find((d) => d.id === a.driverId) : null;
                    return (
                      <tr key={v.id}>
                        <td>{v.licensePlate}</td>
                        <td>{v.model || "—"}</td>
                        <td>{VEHICLE_TYPES.find((t) => t.value === v.vehicleType)?.label ?? v.vehicleType}</td>
                        <td>{VEHICLE_CLASSES.find((t) => t.value === v.vehicleClass)?.label ?? v.vehicleClass}</td>
                        <td>{v.taxiOrderNumber || "—"}</td>
                        <td>{v.nextInspectionDate || "—"}</td>
                        <td>
                          <span className={statusClass(v.isActive)}>{v.isActive ? "aktiv" : "inaktiv"}</span>
                        </td>
                        <td>
                          {drv ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span>
                                {drv.firstName} {drv.lastName}
                              </span>
                              {canManageFleet ? (
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
                        <td className="panel-fleet-table__actions">
                          {canManageFleet ? (
                            <button type="button" className="panel-fleet-btn panel-fleet-btn--blue" onClick={() => startEditVehicle(v)}>
                              Bearbeiten
                            </button>
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
          {editVehicleId ? (
            <form className="panel-rides-form" onSubmit={saveVehicleEdit} style={{ marginTop: 18 }}>
              <h4 className="panel-card__title">Fahrzeug bearbeiten</h4>
              <div className="panel-rides-form__grid">
                <label className="panel-rides-form__field">
                  <span>Kennzeichen</span>
                  <input
                    value={editVehicleForm.licensePlate}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, licensePlate: ev.target.value }))}
                    required
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Hersteller / Modell</span>
                  <input
                    value={editVehicleForm.model}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, model: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Farbe</span>
                  <input
                    value={editVehicleForm.color}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, color: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Typ</span>
                  <select
                    value={editVehicleForm.vehicleType}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, vehicleType: ev.target.value }))}
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-rides-form__field">
                  <span>Fahrzeugklasse</span>
                  <select
                    value={editVehicleForm.vehicleClass}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, vehicleClass: ev.target.value }))}
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
                    value={editVehicleForm.taxiOrderNumber}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, taxiOrderNumber: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Nächste HU (TÜV)</span>
                  <input
                    type="date"
                    value={editVehicleForm.nextInspectionDate}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, nextInspectionDate: ev.target.value }))}
                  />
                </label>
                <label className="panel-rides-form__field">
                  <span>Status</span>
                  <select
                    value={editVehicleForm.isActive ? "active" : "inactive"}
                    onChange={(ev) => setEditVehicleForm((f) => ({ ...f, isActive: ev.target.value === "active" }))}
                  >
                    <option value="active">Aktiv</option>
                    <option value="inactive">Inaktiv</option>
                  </select>
                </label>
              </div>
              <div className="panel-profile-actions">
                <button type="submit" className="panel-btn-primary" disabled={busyAction === `vehicle-edit-${editVehicleId}`}>
                  {busyAction === `vehicle-edit-${editVehicleId}` ? "Speichern …" : "Änderungen speichern"}
                </button>
                <button type="button" className="panel-btn-secondary" onClick={() => setEditVehicleId("")}>
                  Abbrechen
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "assignments" ? (
        <div className="panel-card panel-card--wide">
          {canManageFleet ? (
            <form className="panel-rides-form" onSubmit={submitAssignment} style={{ marginBottom: 18 }}>
              <h4 className="panel-card__title">Fahrer ↔ Fahrzeug zuweisen</h4>
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
                Zuweisung speichern
              </button>
            </form>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table className="panel-fleet-table">
              <thead>
                <tr>
                  <th>Fahrer</th>
                  <th>Fahrzeug</th>
                  <th>Zuletzt aktualisiert</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Laden …</td>
                  </tr>
                ) : assignments.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Keine Zuweisungen.</td>
                  </tr>
                ) : (
                  assignments.map((a) => {
                    const drv = drivers.find((d) => d.id === a.driverId);
                    const veh = vehicles.find((v) => v.id === a.vehicleId);
                    return (
                      <tr key={`${a.driverId}-${a.vehicleId}`}>
                        <td>{drv ? `${drv.firstName} ${drv.lastName}` : a.driverId}</td>
                        <td>{veh ? `${veh.licensePlate}${veh.model ? ` · ${veh.model}` : ""}` : a.vehicleId}</td>
                        <td>{a.assignedAt || "—"}</td>
                        <td>
                          {canManageFleet ? (
                            <button
                              type="button"
                              className="panel-btn-secondary"
                              style={{ padding: "4px 8px", fontSize: 12 }}
                              onClick={() => clearAssignment(a.driverId)}
                            >
                              Zuweisung lösen
                            </button>
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
          {canManageFleet ? (
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
