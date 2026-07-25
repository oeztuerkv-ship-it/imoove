import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
const PROVISION_URL = `${API_BASE}/admin/fleet-provision`;

function emptyRow() {
  return {
    key: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    vehicleMode: "none", // none | existing | create
    vehicleId: "",
    licensePlate: "",
    insuranceNumber: "",
    nextInspectionDate: "",
    konzessionNumber: "",
    vehicleClass: "standard",
    driverMode: "none", // none | existing | create
    driverId: "",
    driverName: "",
    pScheinNumber: "",
    driverEmail: "",
    driverPhone: "",
    driverPassword: "",
    sendWelcomeEmail: true,
  };
}

function taxiCompanies(items) {
  return (Array.isArray(items) ? items : []).filter((c) => c.company_kind === "taxi" && c.is_active !== false);
}

export default function FleetProvisionPage() {
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companyMode, setCompanyMode] = useState("existing");
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState({
    name: "",
    concessionNumber: "",
    phone: "",
    contactName: "",
  });
  const [notes, setNotes] = useState("");

  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portal, setPortal] = useState({
    username: "",
    email: "",
    password: "",
    role: "owner",
    sendWelcomeEmail: true,
  });

  const [ownerMode, setOwnerMode] = useState("none"); // none | existing | create_name | create_user
  const [ownerPanelUserId, setOwnerPanelUserId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerUser, setOwnerUser] = useState({
    username: "",
    email: "",
    password: "",
    sendWelcomeEmail: true,
  });

  const [panelUsers, setPanelUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [rows, setRows] = useState([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await adminFetch(COMPANIES_URL);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("load_failed");
      setCompanies(taxiCompanies(data.items));
    } catch {
      setCompanies([]);
      setError("Taxi-Unternehmen konnten nicht geladen werden.");
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const effectiveCompanyId = companyMode === "existing" ? companyId : "";

  const loadCompanyLists = useCallback(async (cid) => {
    if (!cid) {
      setPanelUsers([]);
      setVehicles([]);
      setDrivers([]);
      return;
    }
    setListsLoading(true);
    try {
      const [uRes, vRes, dRes] = await Promise.all([
        adminFetch(`${COMPANIES_URL}/${encodeURIComponent(cid)}/panel-users`),
        adminFetch(`${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(cid)}/vehicles`),
        adminFetch(`${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(cid)}/drivers`),
      ]);
      const [uJ, vJ, dJ] = await Promise.all([uRes.json(), vRes.json(), dRes.json()]);
      setPanelUsers(uRes.ok && uJ?.ok && Array.isArray(uJ.users) ? uJ.users : []);
      const rawVeh = vRes.ok && vJ?.ok && Array.isArray(vJ.items) ? vJ.items : [];
      setVehicles(
        rawVeh.map((row) => {
          const v = row.vehicle || row;
          return {
            id: v.id,
            licensePlate: v.licensePlate || v.license_plate || "",
            konzessionNumber: v.konzessionNumber || v.konzession_number || "",
          };
        }),
      );
      setDrivers(dRes.ok && dJ?.ok && Array.isArray(dJ.drivers) ? dJ.drivers : []);
    } catch {
      setPanelUsers([]);
      setVehicles([]);
      setDrivers([]);
    } finally {
      setListsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanyLists(effectiveCompanyId);
  }, [effectiveCompanyId, loadCompanyLists]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId],
  );

  function updateRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function buildPayload() {
    const company =
      companyMode === "existing"
        ? { mode: "existing", companyId }
        : {
            mode: "create",
            name: newCompany.name.trim(),
            concessionNumber: newCompany.concessionNumber.trim(),
            phone: newCompany.phone.trim(),
            contactName: newCompany.contactName.trim(),
          };

    const payload = { company, notes: notes.trim() || undefined, rows: [] };

    if (portalEnabled && (portal.username.trim() || portal.email.trim())) {
      payload.portalAccess = {
        username: portal.username.trim() || undefined,
        email: portal.email.trim(),
        password: portal.password.trim() || undefined,
        role: portal.role,
        sendWelcomeEmail: portal.sendWelcomeEmail === true,
      };
    }

    if (ownerMode === "existing" && ownerPanelUserId) {
      payload.owner = { mode: "existing", panelUserId: ownerPanelUserId };
    } else if (ownerMode === "create_name" && ownerName.trim()) {
      payload.owner = { mode: "create_name", ownerName: ownerName.trim() };
    } else if (ownerMode === "create_user" && (ownerUser.email.trim() || ownerUser.username.trim())) {
      payload.owner = {
        mode: "create_user",
        ownerName: ownerName.trim() || undefined,
        username: ownerUser.username.trim() || undefined,
        email: ownerUser.email.trim(),
        password: ownerUser.password.trim() || undefined,
        sendWelcomeEmail: ownerUser.sendWelcomeEmail === true,
      };
    }

    for (const r of rows) {
      const entry = {};
      if (r.vehicleMode === "existing" && r.vehicleId) {
        entry.vehicle = { mode: "existing", vehicleId: r.vehicleId };
      } else if (r.vehicleMode === "create") {
        entry.vehicle = {
          mode: "create",
          licensePlate: r.licensePlate.trim(),
          insuranceNumber: r.insuranceNumber.trim() || undefined,
          nextInspectionDate: r.nextInspectionDate.trim() || null,
          konzessionNumber: r.konzessionNumber.trim() || undefined,
          vehicleClass: r.vehicleClass || "standard",
        };
      }
      if (r.driverMode === "existing" && r.driverId) {
        entry.driver = { mode: "existing", driverId: r.driverId };
      } else if (r.driverMode === "create") {
        entry.driver = {
          mode: "create",
          name: r.driverName.trim(),
          pScheinNumber: r.pScheinNumber.trim() || undefined,
          email: r.driverEmail.trim(),
          phone: r.driverPhone.trim() || undefined,
          password: r.driverPassword.trim() || undefined,
          sendWelcomeEmail: r.sendWelcomeEmail !== false,
        };
      }
      if (entry.vehicle || entry.driver) payload.rows.push(entry);
    }

    return payload;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (companyMode === "existing" && !companyId) {
      setError("Bitte ein bestehendes Taxi-Unternehmen wählen.");
      return;
    }
    if (companyMode === "create" && !newCompany.name.trim()) {
      setError("Firmenname für neues Unternehmen fehlt.");
      return;
    }
    const payload = buildPayload();
    if (!payload.rows.length && !payload.portalAccess && !payload.owner && companyMode === "existing" && !notes.trim()) {
      setError("Mindestens eine Zeile (Fahrzeug und/oder Fahrer) oder Portal/Owner/Notizen angeben.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(PROVISION_URL, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || `Speichern fehlgeschlagen (HTTP ${res.status}).`);
        return;
      }
      setResult(data);
      await loadCompanies();
      if (data.companyId) {
        setCompanyMode("existing");
        setCompanyId(data.companyId);
        await loadCompanyLists(data.companyId);
      }
      setRows([emptyRow()]);
    } catch {
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <header className="admin-page-header" style={{ marginBottom: 16 }}>
        <h1 className="admin-page-title">Flotten-Erfassung</h1>
        <p className="admin-page-lead" style={{ maxWidth: 640 }}>
          Plattform-Konsole: Taxi-Unternehmen wählen oder anlegen, optional Portal-Zugang und Owner, dann beliebig
          viele Zeilen mit Fahrzeug und/oder Fahrer (auch einzeln). Zuordnung und Fahrer-Willkommens-Mail laufen
          serverseitig.
        </p>
      </header>

      {error ? (
        <p className="admin-c-badge admin-c-badge--err" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {result?.ok ? (
        <AdminCollapsibleSection title="Ergebnis" subtitle="Letzter Speichervorgang" defaultOpen>
          <p>
            Unternehmen <code>{result.companyId}</code>
            {result.companyCreated ? " (neu angelegt)" : ""} — Zeilen OK:{" "}
            {(result.rows || []).filter((r) => r.ok).length}/{(result.rows || []).length}
          </p>
          {result.portalUser ? (
            <p>
              Portal: <strong>{result.portalUser.username}</strong> / {result.portalUser.email}
              {result.portalUser.initialPassword ? (
                <>
                  {" "}
                  — Passwort: <code>{result.portalUser.initialPassword}</code>
                </>
              ) : null}
              {result.portalUser.welcomeEmail
                ? ` — Mail: ${result.portalUser.welcomeEmail.sent ? "gesendet" : result.portalUser.welcomeEmail.reason}`
                : null}
            </p>
          ) : null}
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {(result.rows || []).map((r) => (
              <li key={r.index}>
                Zeile {r.index + 1}: {r.ok ? "OK" : `Fehler (${r.error})`}
                {r.vehicleId ? ` · Fzg ${r.vehicleId}` : ""}
                {r.driverId ? ` · Fahrer ${r.driverId}` : ""}
                {r.assigned ? " · verknüpft" : ""}
                {r.initialPassword ? (
                  <>
                    {" "}
                    · PW <code>{r.initialPassword}</code>
                  </>
                ) : null}
                {r.driverWelcomeEmail
                  ? ` · Mail: ${r.driverWelcomeEmail.sent ? "gesendet" : r.driverWelcomeEmail.reason || "—"}`
                  : null}
              </li>
            ))}
          </ul>
        </AdminCollapsibleSection>
      ) : null}

      <form onSubmit={onSubmit}>
        <AdminCollapsibleSection
          title="Unternehmen"
          subtitle="Bestehendes wählen oder neues Taxi-Unternehmen anlegen"
          defaultOpen
        >
          <div className="admin-m-form-grid" style={{ display: "grid", gap: 12, maxWidth: 720 }}>
            <label className="admin-field">
              <span className="admin-field__label">Modus</span>
              <select
                className="admin-input"
                value={companyMode}
                onChange={(e) => setCompanyMode(e.target.value)}
                disabled={loadingCompanies || submitting}
              >
                <option value="existing">Bestehendes Unternehmen</option>
                <option value="create">Neues Unternehmen anlegen</option>
              </select>
            </label>

            {companyMode === "existing" ? (
              <label className="admin-field">
                <span className="admin-field__label">Taxi-Unternehmen</span>
                <select
                  className="admin-input"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  disabled={loadingCompanies || submitting}
                  required
                >
                  <option value="">— wählen —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.city ? ` · ${c.city}` : ""}
                    </option>
                  ))}
                </select>
                {selectedCompany?.concession_number ? (
                  <span className="admin-field__hint">Konzession: {selectedCompany.concession_number}</span>
                ) : null}
              </label>
            ) : (
              <>
                <label className="admin-field">
                  <span className="admin-field__label">Firmenname</span>
                  <input
                    className="admin-input"
                    value={newCompany.name}
                    onChange={(e) => setNewCompany((p) => ({ ...p, name: e.target.value }))}
                    required
                    disabled={submitting}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Konzessionsnummer</span>
                  <input
                    className="admin-input"
                    value={newCompany.concessionNumber}
                    onChange={(e) => setNewCompany((p) => ({ ...p, concessionNumber: e.target.value }))}
                    disabled={submitting}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Telefon</span>
                  <input
                    className="admin-input"
                    value={newCompany.phone}
                    onChange={(e) => setNewCompany((p) => ({ ...p, phone: e.target.value }))}
                    disabled={submitting}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Ansprechpartner (Stammdaten)</span>
                  <input
                    className="admin-input"
                    value={newCompany.contactName}
                    onChange={(e) => setNewCompany((p) => ({ ...p, contactName: e.target.value }))}
                    disabled={submitting}
                  />
                </label>
              </>
            )}

            <label className="admin-field">
              <span className="admin-field__label">Notizen (optional)</span>
              <textarea
                className="admin-input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          title="Portal-Zugang (optional)"
          subtitle="Nur anlegen, wenn aktiviert und Felder ausgefüllt — kein Nebeneffekt bei reinen Flotten-Zeilen"
          defaultOpen={false}
        >
          <label className="admin-field" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={portalEnabled}
              onChange={(e) => setPortalEnabled(e.target.checked)}
              disabled={submitting}
            />
            <span>Partner-Portal-Zugang in diesem Vorgang anlegen</span>
          </label>
          {portalEnabled ? (
            <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
              <label className="admin-field">
                <span className="admin-field__label">Benutzername</span>
                <input
                  className="admin-input"
                  value={portal.username}
                  onChange={(e) => setPortal((p) => ({ ...p, username: e.target.value }))}
                  disabled={submitting}
                  placeholder="leer = aus E-Mail ableiten"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">E-Mail</span>
                <input
                  className="admin-input"
                  type="email"
                  value={portal.email}
                  onChange={(e) => setPortal((p) => ({ ...p, email: e.target.value }))}
                  disabled={submitting}
                  required={portalEnabled}
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Passwort</span>
                <input
                  className="admin-input"
                  value={portal.password}
                  onChange={(e) => setPortal((p) => ({ ...p, password: e.target.value }))}
                  disabled={submitting}
                  placeholder="leer = automatisch generieren"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Rolle</span>
                <select
                  className="admin-input"
                  value={portal.role}
                  onChange={(e) => setPortal((p) => ({ ...p, role: e.target.value }))}
                  disabled={submitting}
                >
                  <option value="owner">Inhaber</option>
                  <option value="manager">Verwaltung</option>
                  <option value="staff">Mitarbeiter</option>
                  <option value="readonly">Nur lesen</option>
                </select>
              </label>
              <label className="admin-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={portal.sendWelcomeEmail}
                  onChange={(e) => setPortal((p) => ({ ...p, sendWelcomeEmail: e.target.checked }))}
                  disabled={submitting}
                />
                <span>Willkommens-Mail an Portal-E-Mail senden</span>
              </label>
            </div>
          ) : null}
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          title="Owner / Ansprechpartner (optional)"
          subtitle="Bestehenden Panel-User wählen, nur Anzeigename setzen, oder neuen Owner-Login anlegen"
          defaultOpen={false}
        >
          <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
            <label className="admin-field">
              <span className="admin-field__label">Modus</span>
              <select
                className="admin-input"
                value={ownerMode}
                onChange={(e) => setOwnerMode(e.target.value)}
                disabled={submitting}
              >
                <option value="none">— nicht setzen —</option>
                <option value="existing" disabled={companyMode !== "existing"}>
                  Bestehenden Panel-User zuordnen
                </option>
                <option value="create_name">Nur Anzeigename (owner_name)</option>
                <option value="create_user">Neuen Owner-Login anlegen</option>
              </select>
            </label>
            {ownerMode === "existing" ? (
              <label className="admin-field">
                <span className="admin-field__label">Panel-User</span>
                <select
                  className="admin-input"
                  value={ownerPanelUserId}
                  onChange={(e) => setOwnerPanelUserId(e.target.value)}
                  disabled={submitting || listsLoading || !effectiveCompanyId}
                >
                  <option value="">— wählen —</option>
                  {panelUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role}){u.email ? ` · ${u.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {ownerMode === "create_name" || ownerMode === "create_user" ? (
              <label className="admin-field">
                <span className="admin-field__label">Anzeigename Owner</span>
                <input
                  className="admin-input"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  disabled={submitting}
                />
              </label>
            ) : null}
            {ownerMode === "create_user" ? (
              <>
                <label className="admin-field">
                  <span className="admin-field__label">Username</span>
                  <input
                    className="admin-input"
                    value={ownerUser.username}
                    onChange={(e) => setOwnerUser((p) => ({ ...p, username: e.target.value }))}
                    disabled={submitting}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">E-Mail</span>
                  <input
                    className="admin-input"
                    type="email"
                    value={ownerUser.email}
                    onChange={(e) => setOwnerUser((p) => ({ ...p, email: e.target.value }))}
                    disabled={submitting}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Passwort</span>
                  <input
                    className="admin-input"
                    value={ownerUser.password}
                    onChange={(e) => setOwnerUser((p) => ({ ...p, password: e.target.value }))}
                    disabled={submitting}
                    placeholder="leer = generieren"
                  />
                </label>
                <label className="admin-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={ownerUser.sendWelcomeEmail}
                    onChange={(e) => setOwnerUser((p) => ({ ...p, sendWelcomeEmail: e.target.checked }))}
                    disabled={submitting}
                  />
                  <span>Willkommens-Mail senden</span>
                </label>
              </>
            ) : null}
          </div>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          title="Fahrzeuge & Fahrer"
          subtitle="Pro Zeile: nur Fahrzeug, nur Fahrer, oder beides (dann automatische Verknüpfung)"
          defaultOpen
        >
          {companyMode === "create" ? (
            <p className="admin-field__hint" style={{ marginBottom: 12 }}>
              Bei neuem Unternehmen sind „bestehend wählen“-Listen erst nach dem Speichern verfügbar — Zeilen
              daher als Neu-Anlage ausfüllen.
            </p>
          ) : null}

          {rows.map((r, idx) => (
            <div
              key={r.key}
              className="admin-m-card admin-m-card--unified"
              style={{ marginBottom: 12, padding: 16 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <strong>Zeile {idx + 1}</strong>
                <button
                  type="button"
                  className="admin-m-btn-gh"
                  onClick={() => removeRow(r.key)}
                  disabled={submitting || rows.length <= 1}
                >
                  Entfernen
                </button>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <h3 style={{ fontSize: "var(--admin-type-footnote)", margin: "0 0 8px" }}>Fahrzeug</h3>
                  <label className="admin-field">
                    <span className="admin-field__label">Modus</span>
                    <select
                      className="admin-input"
                      value={r.vehicleMode}
                      onChange={(e) => updateRow(r.key, { vehicleMode: e.target.value })}
                      disabled={submitting}
                    >
                      <option value="none">— keines —</option>
                      <option value="existing" disabled={companyMode !== "existing"}>
                        Bestehendes wählen
                      </option>
                      <option value="create">Neu anlegen</option>
                    </select>
                  </label>
                  {r.vehicleMode === "existing" ? (
                    <label className="admin-field">
                      <span className="admin-field__label">Fahrzeug</span>
                      <select
                        className="admin-input"
                        value={r.vehicleId}
                        onChange={(e) => updateRow(r.key, { vehicleId: e.target.value })}
                        disabled={submitting || listsLoading}
                      >
                        <option value="">— wählen —</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.licensePlate || v.id}
                            {v.konzessionNumber ? ` · ${v.konzessionNumber}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {r.vehicleMode === "create" ? (
                    <>
                      <label className="admin-field">
                        <span className="admin-field__label">Kennzeichen</span>
                        <input
                          className="admin-input"
                          value={r.licensePlate}
                          onChange={(e) => updateRow(r.key, { licensePlate: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Fahrzeugtyp</span>
                        <select
                          className="admin-input"
                          value={r.vehicleClass || "standard"}
                          onChange={(e) => updateRow(r.key, { vehicleClass: e.target.value })}
                          disabled={submitting}
                        >
                          <option value="standard">Standard</option>
                          <option value="xl">XL</option>
                          <option value="wheelchair">Rollstuhl</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Versicherungsnummer</span>
                        <input
                          className="admin-input"
                          value={r.insuranceNumber}
                          onChange={(e) => updateRow(r.key, { insuranceNumber: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">TÜV / HU-Datum</span>
                        <input
                          className="admin-input"
                          type="date"
                          value={r.nextInspectionDate}
                          onChange={(e) => updateRow(r.key, { nextInspectionDate: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Konzession (optional)</span>
                        <input
                          className="admin-input"
                          value={r.konzessionNumber}
                          onChange={(e) => updateRow(r.key, { konzessionNumber: e.target.value })}
                          disabled={submitting}
                          placeholder="sonst Unternehmens-Konzession / Kennzeichen"
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                <div>
                  <h3 style={{ fontSize: "var(--admin-type-footnote)", margin: "0 0 8px" }}>Fahrer</h3>
                  <label className="admin-field">
                    <span className="admin-field__label">Modus</span>
                    <select
                      className="admin-input"
                      value={r.driverMode}
                      onChange={(e) => updateRow(r.key, { driverMode: e.target.value })}
                      disabled={submitting}
                    >
                      <option value="none">— keiner —</option>
                      <option value="existing" disabled={companyMode !== "existing"}>
                        Bestehenden wählen
                      </option>
                      <option value="create">Neu anlegen</option>
                    </select>
                  </label>
                  {r.driverMode === "existing" ? (
                    <label className="admin-field">
                      <span className="admin-field__label">Fahrer</span>
                      <select
                        className="admin-input"
                        value={r.driverId}
                        onChange={(e) => updateRow(r.key, { driverId: e.target.value })}
                        disabled={submitting || listsLoading}
                      >
                        <option value="">— wählen —</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {[d.firstName, d.lastName].filter(Boolean).join(" ") || d.id}
                            {d.email ? ` · ${d.email}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {r.driverMode === "create" ? (
                    <>
                      <label className="admin-field">
                        <span className="admin-field__label">Name</span>
                        <input
                          className="admin-input"
                          value={r.driverName}
                          onChange={(e) => updateRow(r.key, { driverName: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">P-Schein-Nummer</span>
                        <input
                          className="admin-input"
                          value={r.pScheinNumber}
                          onChange={(e) => updateRow(r.key, { pScheinNumber: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">E-Mail (Fahrer-Login)</span>
                        <input
                          className="admin-input"
                          type="email"
                          value={r.driverEmail}
                          onChange={(e) => updateRow(r.key, { driverEmail: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Telefon</span>
                        <input
                          className="admin-input"
                          value={r.driverPhone}
                          onChange={(e) => updateRow(r.key, { driverPhone: e.target.value })}
                          disabled={submitting}
                        />
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Passwort</span>
                        <input
                          className="admin-input"
                          value={r.driverPassword}
                          onChange={(e) => updateRow(r.key, { driverPassword: e.target.value })}
                          disabled={submitting}
                          placeholder="leer = generieren"
                        />
                      </label>
                      <label className="admin-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={r.sendWelcomeEmail}
                          onChange={(e) => updateRow(r.key, { sendWelcomeEmail: e.target.checked })}
                          disabled={submitting}
                        />
                        <span>Willkommens-Mail an Fahrer</span>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          <button type="button" className="admin-c-btn-sec" onClick={addRow} disabled={submitting}>
            + weiteres Fahrzeug/Fahrer hinzufügen
          </button>
        </AdminCollapsibleSection>

        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" className="admin-m-btn-pri" disabled={submitting}>
            {submitting ? "Speichern…" : "Erfassung speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
