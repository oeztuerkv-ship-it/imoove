import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const BLOCK_REASON_PRESETS = [
  { id: "missing_doc", label: "Dokument fehlt" },
  { id: "violation", label: "Verstoß" },
  { id: "company_blocked", label: "Unternehmen gesperrt" },
  { id: "manual_admin", label: "Manuell durch Admin" },
  { id: "other", label: "Sonstiges" },
];

const WORKFLOW_FILTER_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "approved", label: "Freigegeben" },
  { value: "pending", label: "Angelegt / wartet" },
  { value: "in_review", label: "In Prüfung" },
  { value: "missing_documents", label: "Unterlagen fehlen" },
  { value: "suspended", label: "Gesperrt" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "inactive", label: "Deaktiviert" },
];

function fmtTs(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function presencePill(presence) {
  if (presence === "online") return <span className="admin-status-pill admin-status-pill--ok">Online</span>;
  if (presence === "offline") return <span className="admin-status-pill admin-status-pill--active">Offline</span>;
  return <span className="admin-status-pill admin-status-pill--pending">—</span>;
}

function accountPill(row) {
  if (row.accessStatus === "suspended") {
    return <span className="admin-status-pill admin-status-pill--bad">Gesperrt</span>;
  }
  if (row.approvalStatus !== "approved" || !row.isActive) {
    return <span className="admin-status-pill admin-status-pill--pending">{row.accountStatusLabel}</span>;
  }
  return <span className="admin-status-pill admin-status-pill--ok">{row.accountStatusLabel}</span>;
}

function docsPill(row) {
  if (row.documentsComplete) {
    return <span className="admin-status-pill admin-status-pill--ok">Vollständig</span>;
  }
  return <span className="admin-status-pill admin-status-pill--bad">Fehlt</span>;
}

const INITIAL_FILTERS = {
  q: "",
  companyId: "",
  workflowKey: "",
  online: "all",
  blocked: "all",
  documents: "all",
  hasActiveRide: "all",
  sort: "name",
};

function hasDriverSearchCriteria(filters) {
  if (filters.q.trim().length >= 2) return true;
  if (filters.companyId) return true;
  if (filters.workflowKey) return true;
  if (filters.online !== "all") return true;
  if (filters.blocked !== "all") return true;
  if (filters.documents !== "all") return true;
  if (filters.hasActiveRide !== "all") return true;
  return false;
}

function buildQueryParams(filters) {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.companyId) p.set("companyId", filters.companyId);
  if (filters.workflowKey) p.set("workflowKey", filters.workflowKey);
  if (filters.online !== "all") p.set("online", filters.online);
  if (filters.blocked !== "all") p.set("blocked", filters.blocked);
  if (filters.documents !== "all") p.set("documents", filters.documents);
  if (filters.hasActiveRide !== "all") p.set("hasActiveRide", filters.hasActiveRide);
  if (filters.sort === "activity") p.set("sort", "activity");
  return p;
}

export default function DriversOverviewPage({ userRole = "admin" }) {
  const canSuspend = userRole === "admin" || userRole === "service";

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [searchedFilters, setSearchedFilters] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [taxiCompanies, setTaxiCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const hasSearched = searchedFilters != null;

  const [selId, setSelId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteIn, setNoteIn] = useState("");
  const [actBusy, setActBusy] = useState(false);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockPreset, setBlockPreset] = useState("manual_admin");
  const [blockCustom, setBlockCustom] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/taxi-fleet-drivers/taxi-companies`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => setTaxiCompanies(Array.isArray(j.items) ? j.items : []))
      .catch(() => setTaxiCompanies([]));
  }, []);

  const fetchDrivers = useCallback((criteria) => {
    setLoading(true);
    setLoadError("");
    const qs = buildQueryParams(criteria);
    const url = `${API_BASE}/admin/fleet/drivers?${qs}`;
    return fetch(url, { headers: adminApiHeaders() })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          setDrivers([]);
          setLoadError(j.error || "Laden fehlgeschlagen");
          setLoading(false);
          return;
        }
        setDrivers(Array.isArray(j.drivers) ? j.drivers : []);
        setLoading(false);
      })
      .catch(() => {
        setDrivers([]);
        setLoadError("Netzwerkfehler");
        setLoading(false);
      });
  }, []);

  const runSearch = useCallback(() => {
    if (!hasDriverSearchCriteria(filters)) {
      setSearchedFilters(null);
      setDrivers([]);
      setLoadError(
        "Bitte mindestens 2 Zeichen in der Suche eingeben oder einen Filter setzen (z. B. Unternehmen), dann „Suchen“.",
      );
      return;
    }
    const snapshot = { ...filters };
    setSearchedFilters(snapshot);
    void fetchDrivers(snapshot);
  }, [filters, fetchDrivers]);

  const reloadLastSearch = useCallback(() => {
    if (!searchedFilters) return;
    void fetchDrivers(searchedFilters);
  }, [searchedFilters, fetchDrivers]);

  const companiesAz = useMemo(() => {
    return [...taxiCompanies]
      .filter((c) => c?.id)
      .map((c) => ({ id: c.id, name: c.name || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [taxiCompanies]);

  const driversSorted = useMemo(() => {
    const list = [...drivers];
    if (searchedFilters?.sort === "activity") return list;
    list.sort((a, b) => {
      const last = (a.lastName || "").localeCompare(b.lastName || "", "de", { sensitivity: "base" });
      if (last !== 0) return last;
      const first = (a.firstName || "").localeCompare(b.firstName || "", "de", { sensitivity: "base" });
      if (first !== 0) return first;
      return (a.companyName || "").localeCompare(b.companyName || "", "de", { sensitivity: "base" });
    });
    return list;
  }, [drivers, searchedFilters?.sort]);

  const stats = useMemo(() => {
    let online = 0;
    let blocked = 0;
    let activeRide = 0;
    for (const d of drivers) {
      if (d.presenceStatus === "online") online += 1;
      if (d.accessStatus === "suspended") blocked += 1;
      if (d.hasActiveRide) activeRide += 1;
    }
    return { total: drivers.length, online, blocked, activeRide };
  }, [drivers]);

  const loadDetail = useCallback((driverId) => {
    if (!driverId) return;
    setDetailLoading(true);
    setDetail(null);
    fetch(`${API_BASE}/admin/fleet/drivers/${encodeURIComponent(driverId)}`, { headers: adminApiHeaders() })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          setDetail(null);
          setDetailLoading(false);
          return;
        }
        setDetail(j);
        setNoteIn(j.driver?.adminInternalNote || "");
        setDetailLoading(false);
      })
      .catch(() => {
        setDetail(null);
        setDetailLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selId) loadDetail(selId);
    else setDetail(null);
  }, [selId, loadDetail]);

  function openDriver(id) {
    setSelId(id);
  }

  function closeDetail() {
    setSelId(null);
    setBlockOpen(false);
  }

  async function patchNotes() {
    if (!detail?.driver) return;
    setActBusy("notes");
    try {
      const { companyId, id } = detail.driver;
      const r = await fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(id)}/notes`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ adminInternalNote: noteIn }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      loadDetail(id);
    } finally {
      setActBusy(false);
    }
  }

  async function runBlock() {
    if (!detail?.driver || !canSuspend) return;
    const preset = BLOCK_REASON_PRESETS.find((p) => p.id === blockPreset);
    const reason =
      blockPreset === "other"
        ? blockCustom.trim()
        : [preset?.label, blockCustom.trim()].filter(Boolean).join(": ");
    if (!reason.trim()) {
      window.alert("Bitte einen Sperrgrund angeben.");
      return;
    }
    setActBusy("block");
    try {
      const r = await fetch(
        `${API_BASE}/admin/fleet/drivers/${encodeURIComponent(detail.driver.id)}/block`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim(), adminInternalNote: noteIn || undefined }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      setBlockOpen(false);
      reloadLastSearch();
      loadDetail(detail.driver.id);
    } finally {
      setActBusy(false);
    }
  }

  async function runUnblockForId(driverId) {
    if (!driverId || !canSuspend) return;
    if (!window.confirm("Fahrer wirklich entsperren?")) return;
    setActBusy("unblock");
    try {
      const r = await fetch(`${API_BASE}/admin/fleet/drivers/${encodeURIComponent(driverId)}/unblock`, {
        method: "PATCH",
        headers: adminApiHeaders(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      reloadLastSearch();
      if (selId === driverId) loadDetail(driverId);
    } finally {
      setActBusy(false);
    }
  }

  const selectedRow = driversSorted.find((d) => d.id === selId);

  return (
    <div className="admin-page">
      <p className="admin-table-sub" style={{ marginTop: 0, maxWidth: 720 }}>
        <strong>Plattform-Übersicht</strong> — Fahrer erscheinen nach der Suche (mind. 2 Zeichen oder Filter),
        sortiert A–Z. Gesperrte Fahrer können nicht online gehen und erscheinen nicht im Markt/Dispatch.
      </p>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Fahrer (Filter)</div>
          <div className="admin-stat-value admin-crisp-numeric">
            {!hasSearched ? "—" : loading ? "…" : stats.total}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Online</div>
          <div className="admin-stat-value admin-crisp-numeric">
            {!hasSearched ? "—" : loading ? "…" : stats.online}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gesperrt</div>
          <div className="admin-stat-value admin-crisp-numeric">
            {!hasSearched ? "—" : loading ? "…" : stats.blocked}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktive Fahrt</div>
          <div className="admin-stat-value admin-crisp-numeric">
            {!hasSearched ? "—" : loading ? "…" : stats.activeRide}
          </div>
        </div>
      </div>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item admin-filter-item--wide">
            <label className="admin-field-label">Suche</label>
            <input
              type="text"
              className="admin-input"
              placeholder="Name, E-Mail, Telefon, Unternehmen, Kennzeichen, Fahrer-ID …"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Unternehmen</label>
            <select
              className="admin-select"
              value={filters.companyId}
              onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value }))}
            >
              <option value="">Alle</option>
              {companiesAz.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Freigabe / Status</label>
            <select
              className="admin-select"
              value={filters.workflowKey}
              onChange={(e) => setFilters((f) => ({ ...f, workflowKey: e.target.value }))}
            >
              {WORKFLOW_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Online</label>
            <select
              className="admin-select"
              value={filters.online}
              onChange={(e) => setFilters((f) => ({ ...f, online: e.target.value }))}
            >
              <option value="all">Alle</option>
              <option value="yes">Nur online</option>
              <option value="no">Nur offline</option>
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Sperre</label>
            <select
              className="admin-select"
              value={filters.blocked}
              onChange={(e) => setFilters((f) => ({ ...f, blocked: e.target.value }))}
            >
              <option value="all">Alle</option>
              <option value="yes">Gesperrt</option>
              <option value="no">Nicht gesperrt</option>
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Dokumente</label>
            <select
              className="admin-select"
              value={filters.documents}
              onChange={(e) => setFilters((f) => ({ ...f, documents: e.target.value }))}
            >
              <option value="all">Alle</option>
              <option value="complete">Vollständig</option>
              <option value="incomplete">Fehlen</option>
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Aktive Fahrt</label>
            <select
              className="admin-select"
              value={filters.hasActiveRide}
              onChange={(e) => setFilters((f) => ({ ...f, hasActiveRide: e.target.value }))}
            >
              <option value="all">Alle</option>
              <option value="yes">Mit aktiver Fahrt</option>
              <option value="no">Ohne aktive Fahrt</option>
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Sortierung</label>
            <select
              className="admin-select"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
            >
              <option value="name">Name (A–Z)</option>
              <option value="activity">Letzte Aktivität</option>
            </select>
          </div>
          <div className="admin-filter-item" style={{ alignSelf: "end" }}>
            <button type="button" className="admin-btn-primary" onClick={() => runSearch()}>
              Suchen
            </button>
          </div>
        </div>
      </div>

      {!hasSearched && !loading && !loadError ? (
        <div className="admin-info-banner">
          Bitte Suchbegriff (mind. 2 Zeichen) oder Filter wählen und auf <strong>Suchen</strong> klicken. Die Liste
          wird alphabetisch nach Name sortiert.
        </div>
      ) : null}
      {loadError ? <div className="admin-info-banner admin-info-banner--warn">{loadError}</div> : null}
      {loading ? <div className="admin-info-banner">Fahrer werden geladen …</div> : null}

      <div className="admin-rides-table-wrap">
        <table className="admin-rides-table admin-drivers-overview-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col className="admin-rides-table__col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Fahrer</th>
              <th>Unternehmen</th>
              <th>Kontakt</th>
              <th>Status</th>
              <th>Präsenz</th>
              <th>Fahrzeug</th>
              <th className="admin-crisp-numeric">Fahrten</th>
              <th>Letzte Aktivität</th>
              <th>Dokumente</th>
              <th className="admin-rides-table__col-actions">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {hasSearched && !loading && driversSorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  Keine Fahrer für die aktuelle Filterung.
                </td>
              </tr>
            ) : null}
            {!hasSearched && !loading ? (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  Noch keine Suche ausgeführt.
                </td>
              </tr>
            ) : null}
            {driversSorted.map((d) => (
              <tr key={d.id} className="admin-rides-table__row">
                <td>
                  <button type="button" className="admin-link-btn" onClick={() => openDriver(d.id)}>
                    <strong>{d.displayName}</strong>
                  </button>
                  <div className="admin-table-sub admin-crisp-numeric">{d.id}</div>
                </td>
                <td>
                  <span className="admin-drivers-overview__company">Unternehmen: {d.companyName}</span>
                </td>
                <td className="admin-rides-table__nowrap">
                  <div>{d.phone || "—"}</div>
                  <div className="admin-table-sub">{d.email}</div>
                </td>
                <td>{accountPill(d)}</td>
                <td>{presencePill(d.presenceStatus)}</td>
                <td>
                  {d.assignedVehicle
                    ? `${d.assignedVehicle.licensePlate} · ${d.assignedVehicle.model}`
                    : "—"}
                </td>
                <td className="admin-crisp-numeric">
                  {d.rideCount}
                  {d.hasActiveRide ? (
                    <span className="admin-status-pill admin-status-pill--active" style={{ marginLeft: 6 }}>
                      Aktiv
                    </span>
                  ) : null}
                </td>
                <td className="admin-rides-table__nowrap admin-crisp-numeric">{fmtTs(d.lastActivityAt)}</td>
                <td>{docsPill(d)}</td>
                <td className="admin-rides-table__actions">
                  <button type="button" className="admin-btn-action" onClick={() => openDriver(d.id)}>
                    Details
                  </button>
                  {canSuspend && d.accessStatus !== "suspended" ? (
                    <button
                      type="button"
                      className="admin-btn-action"
                      onClick={() => {
                        openDriver(d.id);
                        setBlockOpen(true);
                      }}
                    >
                      Sperren
                    </button>
                  ) : null}
                  {canSuspend && d.accessStatus === "suspended" ? (
                    <button
                      type="button"
                      className="admin-btn-action"
                      disabled={!!actBusy}
                      onClick={() => void runUnblockForId(d.id)}
                    >
                      Entsperren
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selId ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDetail}>
          <div
            className="admin-modal admin-modal--company-workspace"
            role="dialog"
            aria-labelledby="admin-driver-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="admin-driver-detail-title" className="admin-modal__title">
                {selectedRow?.displayName || "Fahrer"}
              </h2>
              <button type="button" className="admin-modal__close" onClick={closeDetail} aria-label="Schließen">
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {detailLoading ? <p className="admin-table-sub">Detail wird geladen …</p> : null}
              {detail?.driver ? (
                <>
                  <p className="admin-drivers-overview__company" style={{ marginTop: 0 }}>
                    <strong>Unternehmen:</strong> {detail.companyName}
                  </p>
                  <div className="admin-modal__meta">
                    <div>
                      <strong>E-Mail</strong> {detail.driver.email}
                    </div>
                    <div>
                      <strong>Telefon</strong> {detail.driver.phone || "—"}
                    </div>
                    <div>
                      <strong>Fahrer-ID</strong>{" "}
                      <span className="admin-crisp-numeric">{detail.driver.id}</span>
                    </div>
                    <div>
                      <strong>Freigabe</strong> {detail.driver.workflow?.label}
                    </div>
                    <div>
                      <strong>Sperrstatus</strong>{" "}
                      {detail.driver.accessStatus === "suspended" ? "Gesperrt" : "Nicht gesperrt"}
                      {detail.driver.suspensionReason ? ` — ${detail.driver.suspensionReason}` : ""}
                    </div>
                    <div>
                      <strong>Fahrzeug</strong>{" "}
                      {detail.driver.assignedVehicle
                        ? `${detail.driver.assignedVehicle.model} · ${detail.driver.assignedVehicle.licensePlate}`
                        : "—"}
                    </div>
                    <div>
                      <strong>Einsatzbereit</strong> {detail.driver.readiness?.ready ? "Ja" : "Nein"}
                    </div>
                    <div>
                      <strong>Letzte Aktivität</strong> {fmtTs(detail.driver.lastHeartbeatAt || detail.driver.lastLoginAt)}
                    </div>
                  </div>

                  {detail.driver.readiness && !detail.driver.readiness.ready ? (
                    <ul style={{ color: "#b45309", fontSize: 13 }}>
                      {(detail.driver.readiness.blockReasons || []).map((b, i) => (
                        <li key={i}>{b.message}</li>
                      ))}
                    </ul>
                  ) : null}

                  <label className="admin-field-label" style={{ display: "block", marginTop: 12 }}>
                    Admin-Notiz (intern)
                  </label>
                  <textarea
                    className="admin-input"
                    rows={3}
                    style={{ width: "100%", resize: "vertical" }}
                    value={noteIn}
                    onChange={(e) => setNoteIn(e.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-btn-primary"
                    style={{ marginTop: 8 }}
                    disabled={!!actBusy}
                    onClick={() => void patchNotes()}
                  >
                    Notiz speichern
                  </button>

                  <h3 style={{ fontSize: 15, marginTop: 20 }}>Letzte Fahrten</h3>
                  {Array.isArray(detail.recentRides) && detail.recentRides.length > 0 ? (
                    <ul className="admin-table-sub" style={{ paddingLeft: 18 }}>
                      {detail.recentRides.slice(0, 15).map((r) => (
                        <li key={r.id}>
                          <span className="admin-crisp-numeric">{fmtTs(r.createdAt)}</span> — {r.status} —{" "}
                          {r.from} → {r.to}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-table-sub">Keine Fahrten in der Historie.</p>
                  )}

                  {canSuspend ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                      {detail.driver.accessStatus !== "suspended" ? (
                        <button
                          type="button"
                          className="admin-btn-danger"
                          disabled={!!actBusy}
                          onClick={() => setBlockOpen(true)}
                        >
                          Fahrer sperren
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn-primary"
                          disabled={!!actBusy}
                          onClick={() => void runUnblockForId(detail.driver.id)}
                        >
                          Fahrer entsperren
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="admin-table-sub" style={{ marginTop: 16 }}>
                      Sperren/Entsperren ist nur für Plattform-Administratoren (admin/service) verfügbar.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {blockOpen && detail?.driver ? (
        <div className="admin-modal-backdrop" role="presentation" style={{ zIndex: 60 }} onClick={() => setBlockOpen(false)}>
          <div
            className="admin-modal"
            role="alertdialog"
            aria-labelledby="block-driver-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="block-driver-title" className="admin-modal__title">
                Fahrer wirklich sperren?
              </h2>
            </div>
            <div className="admin-modal__body">
              <p className="admin-table-sub">
                {detail.driver.firstName} {detail.driver.lastName} ({detail.companyName}) — nach der Sperre kein
                Online-Modus, keine Fahrten, kein Markt.
              </p>
              <label className="admin-field-label">Grund (optional Kategorie)</label>
              <select
                className="admin-select"
                style={{ width: "100%", marginBottom: 10 }}
                value={blockPreset}
                onChange={(e) => setBlockPreset(e.target.value)}
              >
                {BLOCK_REASON_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label className="admin-field-label">Ergänzung / Freitext</label>
              <input
                className="admin-input"
                style={{ width: "100%" }}
                value={blockCustom}
                onChange={(e) => setBlockCustom(e.target.value)}
                placeholder="z. B. Aktenzeichen oder Details"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button type="button" className="admin-btn-action" onClick={() => setBlockOpen(false)}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="admin-btn-danger"
                  disabled={!!actBusy}
                  onClick={() => void runBlock()}
                >
                  Sperren bestätigen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
