import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import FleetDocumentsTab from "./fleet/FleetDocumentsTab.jsx";
import FleetDriversTab from "./fleet/FleetDriversTab.jsx";
import FleetTabs from "./fleet/FleetTabs.jsx";
import FleetVehiclesTab from "./fleet/FleetVehiclesTab.jsx";
import { messageForFleetDriverCreateError, vehicleDocumentUploadUrl } from "./fleet/fleetPanelHelpers.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

/**
 * @param {{
 *   fleetIntent?: { tab: "drivers" | "vehicles" | "documents"; focus?: "driver" | "vehicle" } | null;
 *   onFleetIntentConsumed?: () => void;
 * }} props
 */
export default function FleetPage({ fleetIntent = null, onFleetIntentConsumed }) {
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

  const [companyBrief, setCompanyBrief] = useState(null);
  const [loadingCompanyBrief, setLoadingCompanyBrief] = useState(false);

  const driverCreateSectionRef = useRef(null);
  const vehicleCreateSectionRef = useRef(null);

  const [driverForm, setDriverForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    initialPassword: "",
    pScheinNumber: "",
    pScheinExpiry: "",
    homeAddress: "",
    driversLicenseNumber: "",
    driversLicenseExpiry: "",
  });
  const [editDriverId, setEditDriverId] = useState(null);
  const [editDriverForm, setEditDriverForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    newPassword: "",
    pScheinNumber: "",
    pScheinExpiry: "",
    homeAddress: "",
    driversLicenseNumber: "",
    driversLicenseExpiry: "",
  });
  const [driverEditError, setDriverEditError] = useState("");
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
  const vehicleCreateConcessionPdfRef = useRef(null);
  const vehicleCreateRegistrationPdfRef = useRef(null);
  const [assignForm, setAssignForm] = useState({ driverId: "", vehicleId: "" });

  useEffect(() => {
    if (!fleetIntent?.tab) return;
    setTab(fleetIntent.tab);
  }, [fleetIntent]);

  useLayoutEffect(() => {
    if (!fleetIntent) return;
    if (tab !== fleetIntent.tab) return;
    if (fleetIntent.focus === "driver") {
      driverCreateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      driverCreateSectionRef.current?.querySelector?.("input")?.focus?.({ preventScroll: true });
    } else if (fleetIntent.focus === "vehicle") {
      vehicleCreateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      vehicleCreateSectionRef.current?.querySelector?.("input")?.focus?.({ preventScroll: true });
    }
    if (typeof onFleetIntentConsumed === "function") onFleetIntentConsumed();
  }, [fleetIntent, tab, onFleetIntentConsumed]);

  const loadCompanyBrief = useCallback(async () => {
    if (!token || !canRead) return;
    setLoadingCompanyBrief(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      setCompanyBrief(res.ok && data?.ok && data.company ? data.company : null);
    } catch {
      setCompanyBrief(null);
    } finally {
      setLoadingCompanyBrief(false);
    }
  }, [token, canRead]);

  useEffect(() => {
    if (tab !== "documents") return;
    void loadCompanyBrief();
  }, [tab, loadCompanyBrief]);

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
          pScheinNumber: driverForm.pScheinNumber.trim() || undefined,
          pScheinExpiry: driverForm.pScheinExpiry.trim() || undefined,
          homeAddress: driverForm.homeAddress.trim() || undefined,
          driversLicenseNumber: driverForm.driversLicenseNumber.trim() || undefined,
          driversLicenseExpiry: driverForm.driversLicenseExpiry.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDriverCreateError(messageForFleetDriverCreateError(data));
        return;
      }
      setMsg(
        data.initialPassword ? `Fahrer angelegt. Initiales Passwort: ${data.initialPassword}` : "Fahrer angelegt.",
      );
      setDriverForm({
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
        initialPassword: "",
        pScheinNumber: "",
        pScheinExpiry: "",
        homeAddress: "",
        driversLicenseNumber: "",
        driversLicenseExpiry: "",
      });
      await loadAll();
    } catch {
      setDriverCreateError("Fehler beim Erstellen des Fahrers.");
    }
  }

  async function createVehicle(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setMsg("");
    const pdfConc = vehicleCreateConcessionPdfRef.current?.files?.[0];
    const pdfReg = vehicleCreateRegistrationPdfRef.current?.files?.[0];
    if (!pdfConc || !pdfReg) {
      setMsg("Bitte jeweils ein PDF für Konzession und für Fahrzeugschein/Zulassung auswählen.");
      return;
    }
    if (pdfConc.type !== "application/pdf" || pdfReg.type !== "application/pdf") {
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
      const uploadOne = async (file, kind) => {
        const buf = await file.arrayBuffer();
        const res = await fetch(vehicleDocumentUploadUrl(API_BASE, newId, kind), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/pdf",
          },
          body: buf,
        });
        const j = await res.json().catch(() => ({}));
        return { ok: res.ok && j?.ok, error: j?.error };
      };
      const upConc = await uploadOne(pdfConc, "concession");
      if (!upConc.ok) {
        setMsg("Fahrzeug angelegt, aber Upload „Konzession“ fehlgeschlagen. Bitte in der Fahrzeugliste nachladen und nachreichen.");
        if (vehicleCreateConcessionPdfRef.current) vehicleCreateConcessionPdfRef.current.value = "";
        if (vehicleCreateRegistrationPdfRef.current) vehicleCreateRegistrationPdfRef.current.value = "";
        await loadAll();
        return;
      }
      const upReg = await uploadOne(pdfReg, "registration");
      if (!upReg.ok) {
        setMsg("Konzession gespeichert; Upload „Fahrzeugschein“ fehlgeschlagen. Bitte in der Liste nachreichen.");
        if (vehicleCreateConcessionPdfRef.current) vehicleCreateConcessionPdfRef.current.value = "";
        if (vehicleCreateRegistrationPdfRef.current) vehicleCreateRegistrationPdfRef.current.value = "";
        await loadAll();
        return;
      }
      const sub = await fetch(`${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(newId)}/submit-for-approval`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
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
      if (vehicleCreateConcessionPdfRef.current) vehicleCreateConcessionPdfRef.current.value = "";
      if (vehicleCreateRegistrationPdfRef.current) vehicleCreateRegistrationPdfRef.current.value = "";
      await loadAll();
    } catch {
      setMsg("Fahrzeug konnte nicht angelegt werden.");
    }
  }

  async function uploadVehicleDocument(vehicleId, kind, ev) {
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
      const res = await fetch(vehicleDocumentUploadUrl(API_BASE, vehicleId, kind), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: buf,
      });
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
      const res = await fetch(`${API_BASE}/panel/v1/fleet/vehicles/${encodeURIComponent(vehicleId)}/submit-for-approval`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(
          "Einreichen fehlgeschlagen: Kennzeichen, Konzessionsnummer sowie PDFs „Konzession“ und „Fahrzeugschein“ erforderlich (oder ältere Bestände ohne Dokumenttyp).",
        );
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

  async function patchFleetDriver(driverId, body) {
    const res = await fetch(`${API_BASE}/panel/v1/fleet/drivers/${encodeURIComponent(driverId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok, error: data?.error, status: res.status };
  }

  function sliceIsoDate(v) {
    if (v == null || v === "") return "";
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  function openDriverEditor(d) {
    setDriverEditError("");
    setEditDriverId(d.id);
    setEditDriverForm({
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      newPassword: "",
      pScheinNumber: d.pScheinNumber ?? "",
      pScheinExpiry: sliceIsoDate(d.pScheinExpiry),
      homeAddress: d.homeAddress ?? "",
      driversLicenseNumber: d.driversLicenseNumber ?? "",
      driversLicenseExpiry: sliceIsoDate(d.driversLicenseExpiry),
    });
  }

  function closeDriverEditor() {
    setEditDriverId(null);
    setDriverEditError("");
  }

  async function saveEditedDriver(e) {
    e.preventDefault();
    if (!token || !canManage || !editDriverId) return;
    setMsg("");
    setDriverEditError("");
    const body = {
      firstName: editDriverForm.firstName,
      lastName: editDriverForm.lastName,
      email: editDriverForm.email,
      phone: editDriverForm.phone,
      pScheinNumber: editDriverForm.pScheinNumber,
      pScheinExpiry: editDriverForm.pScheinExpiry.trim() ? editDriverForm.pScheinExpiry.trim() : null,
      homeAddress: editDriverForm.homeAddress,
      driversLicenseNumber: editDriverForm.driversLicenseNumber,
      driversLicenseExpiry: editDriverForm.driversLicenseExpiry.trim() ? editDriverForm.driversLicenseExpiry.trim() : null,
    };
    if (editDriverForm.newPassword.trim().length >= 10) {
      body.newPassword = editDriverForm.newPassword.trim();
    }
    const r = await patchFleetDriver(editDriverId, body);
    if (!r.ok) {
      setDriverEditError(
        r.error === "email_taken"
          ? "Diese E-Mail ist bereits vergeben."
          : r.error === "email_invalid"
            ? "Bitte eine gültige E-Mail eingeben."
            : typeof r.error === "string"
              ? `Speichern fehlgeschlagen (${r.error}).`
              : "Speichern fehlgeschlagen.",
      );
      return;
    }
    setMsg("Fahrerdaten gespeichert.");
    closeDriverEditor();
    await loadAll();
  }

  async function deactivateDriverAccount(id) {
    if (!token || !canManage) return;
    if (!window.confirm("Fahrer „außer Dienst“ setzen? Der Login ist dann nicht möglich (ohne Plattform-Sperre).")) return;
    setMsg("");
    const r = await patchFleetDriver(id, { isActive: false });
    if (!r.ok) {
      setMsg("Konto konnte nicht deaktiviert werden.");
      return;
    }
    setMsg("Fahrer ist außer Dienst.");
    await loadAll();
  }

  async function activateDriverAccountOnly(id) {
    if (!token || !canManage) return;
    setMsg("");
    const r = await patchFleetDriver(id, { isActive: true });
    if (!r.ok) {
      setMsg("Konto konnte nicht aktiviert werden.");
      return;
    }
    setMsg("Fahrer ist wieder im Dienst.");
    await loadAll();
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
        <h1 className="partner-page-title">Fahrer, Fahrzeuge &amp; Dokumente</h1>
        <p className="partner-page-lead">
          Fahrer legen Sie selbst an und pflegen Stammdaten inklusive Aktivierung; die Betreiber-Konsole legt nur Ihr Unternehmen an. Fahrzeuge, Zuweisungen und
          Unternehmensnachweise bleiben wie gewohnt in den anderen Bereichen bzw. unter „Dokumente“.
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
      {driverEditError ? <p className="partner-state-error">{driverEditError}</p> : null}
      {msg ? <p className="partner-state-ok">{msg}</p> : null}

      <FleetTabs tab={tab} onTabChange={setTab} />

      {tab === "drivers" ? (
        <FleetDriversTab
          driverCreateSectionRef={driverCreateSectionRef}
          canManage={canManage}
          filterExpiring={filterExpiring}
          setFilterExpiring={setFilterExpiring}
          driverForm={driverForm}
          setDriverForm={setDriverForm}
          createDriver={createDriver}
          loading={loading}
          drivers={drivers}
          suspendDriver={suspendDriver}
          activateDriver={activateDriver}
          resetDriverPassword={resetDriverPassword}
          uploadPScheinDoc={uploadPScheinDoc}
          editDriverId={editDriverId}
          editDriverForm={editDriverForm}
          setEditDriverForm={setEditDriverForm}
          openDriverEditor={openDriverEditor}
          closeDriverEditor={closeDriverEditor}
          saveEditedDriver={saveEditedDriver}
          deactivateDriverAccount={deactivateDriverAccount}
          activateDriverAccountOnly={activateDriverAccountOnly}
        />
      ) : null}

      {tab === "vehicles" ? (
        <FleetVehiclesTab
          vehicleCreateSectionRef={vehicleCreateSectionRef}
          canManage={canManage}
          vehiclesActiveOnly={vehiclesActiveOnly}
          setVehiclesActiveOnly={setVehiclesActiveOnly}
          vehicleForm={vehicleForm}
          setVehicleForm={setVehicleForm}
          vehicleCreateConcessionPdfRef={vehicleCreateConcessionPdfRef}
          vehicleCreateRegistrationPdfRef={vehicleCreateRegistrationPdfRef}
          createVehicle={createVehicle}
          assignForm={assignForm}
          setAssignForm={setAssignForm}
          submitAssignment={submitAssignment}
          loading={loading}
          drivers={drivers}
          vehicles={vehicles}
          assignments={assignments}
          uploadVehicleDocument={uploadVehicleDocument}
          submitVehicleApproval={submitVehicleApproval}
          clearAssignment={clearAssignment}
        />
      ) : null}

      {tab === "documents" ? (
        <FleetDocumentsTab
          dash={dash}
          drivers={drivers}
          vehicles={vehicles}
          company={companyBrief}
          loadingCompany={loadingCompanyBrief}
        />
      ) : null}
    </div>
  );
}
