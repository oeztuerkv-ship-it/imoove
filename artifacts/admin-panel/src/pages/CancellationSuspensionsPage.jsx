import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/cancellation-suspensions`;
const FLEET_BASE = `${API_BASE}/admin/fleet/drivers`;

const BLOCK_REASON_PRESETS = [
  { id: "missing_doc", label: "Dokument fehlt" },
  { id: "violation", label: "Verstoß" },
  { id: "company_blocked", label: "Unternehmen gesperrt" },
  { id: "manual_admin", label: "Manuell durch Admin" },
  { id: "other", label: "Sonstiges" },
];

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function authProviderLabel(provider) {
  if (provider === "email") return "E-Mail";
  if (provider === "apple") return "Apple";
  if (provider === "google") return "Google";
  return provider || "—";
}

async function readJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }
  return { data, text };
}

function StornoCountBadge({ count, threshold, windowLabel }) {
  const atLimit = Number(count) >= Number(threshold);
  return (
    <span
      className={`admin-c-badge ${atLimit ? "admin-c-badge--err" : "admin-c-badge--warn"}`}
      title={`${count} Stornos im Messfenster`}
    >
      {count} / {threshold} · {windowLabel}
    </span>
  );
}

function SuspensionTableState({ loading, empty, emptyLabel }) {
  if (loading) {
    return (
      <div className="admin-section-block__inset">
        <p className="admin-muted">Wird geladen …</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="admin-section-block__inset">
        <div className="admin-info-banner admin-info-banner--inline">{emptyLabel}</div>
      </div>
    );
  }
  return null;
}

export default function CancellationSuspensionsPage() {
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [reservationSuspensions, setReservationSuspensions] = useState([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");

  const [manualQ, setManualQ] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualDrivers, setManualDrivers] = useState([]);
  const [manualSearched, setManualSearched] = useState(false);
  const [blockDriverId, setBlockDriverId] = useState("");
  const [blockPreset, setBlockPreset] = useState("manual_admin");
  const [blockNote, setBlockNote] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const u = new URL(BASE);
      if (debouncedQ) u.searchParams.set("q", debouncedQ);
      const res = await adminFetch(u.toString());
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        const detail =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
      setReservationSuspensions(Array.isArray(data.reservationSuspensions) ? data.reservationSuspensions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function liftCustomer(passengerId) {
    if (!window.confirm("Storno-Sperre für diesen Kunden aufheben?")) return;
    setActionBusyId(`c:${passengerId}`);
    try {
      const res = await adminFetch(`${BASE}/customers/${encodeURIComponent(passengerId)}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function liftDriver(fleetDriverId) {
    if (!window.confirm("Storno-Sperre für diesen Fahrer aufheben?")) return;
    setActionBusyId(`d:${fleetDriverId}`);
    try {
      const res = await adminFetch(`${BASE}/drivers/${encodeURIComponent(fleetDriverId)}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function liftReservation(fleetDriverId) {
    if (!window.confirm("24h-Vorbestellungs-Sperre für diesen Fahrer aufheben?")) return;
    setActionBusyId(`r:${fleetDriverId}`);
    try {
      const res = await adminFetch(`${BASE}/drivers/${encodeURIComponent(fleetDriverId)}/lift-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
      if (manualSearched) void searchManualDrivers(manualQ);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function searchManualDrivers(queryOverride) {
    const needle = String(queryOverride ?? manualQ).trim();
    if (needle.length < 2) {
      setManualError("Bitte mind. 2 Zeichen eingeben (Name, E-Mail, Telefon …).");
      return;
    }
    setManualLoading(true);
    setManualError("");
    setManualSearched(true);
    try {
      const u = new URL(FLEET_BASE);
      u.searchParams.set("q", needle);
      const res = await fetch(u.toString(), { headers: adminApiHeaders() });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      setManualDrivers(Array.isArray(data.drivers) ? data.drivers : []);
    } catch (e) {
      setManualDrivers([]);
      setManualError(e instanceof Error ? e.message : "Suche fehlgeschlagen");
    } finally {
      setManualLoading(false);
    }
  }

  async function runManualBlock(driverId) {
    const preset = BLOCK_REASON_PRESETS.find((p) => p.id === blockPreset);
    const reason = [preset?.label ?? "Manuell durch Admin", blockNote.trim()].filter(Boolean).join(" — ").slice(0, 500);
    setActionBusyId(`mb:${driverId}`);
    try {
      const res = await fetch(`${FLEET_BASE}/${encodeURIComponent(driverId)}/block`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason, adminInternalNote: blockNote.trim() || undefined }),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      setBlockDriverId("");
      setBlockNote("");
      await searchManualDrivers(manualQ);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sperren fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function runManualUnblock(driverId) {
    if (!window.confirm("Fahrer-Zugang wirklich entsperren?")) return;
    setActionBusyId(`mu:${driverId}`);
    try {
      const res = await fetch(`${FLEET_BASE}/${encodeURIComponent(driverId)}/unblock`, {
        method: "PATCH",
        headers: adminApiHeaders(),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      await searchManualDrivers(manualQ);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Entsperren fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  return (
    <div className="admin-page admin-page--loose">
      <p className="admin-page-lead">
        <strong>Sperren zentral</strong> — System-Storno-Sperren (Kunde/Fahrer), 24h-Vorbestellungs-Sperren und manuelle
        Fahrer-Suche mit Sperren/Entsperren. Grund jeweils sichtbar.
      </p>

      <div className="admin-stat-grid admin-stat-grid--wide">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Kunden Storno</div>
          <div className="admin-stat-value admin-crisp-numeric">{loading ? "…" : customers.length}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Fahrer Storno</div>
          <div className="admin-stat-value admin-crisp-numeric">{loading ? "…" : drivers.length}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Vorbestellung 24h</div>
          <div className="admin-stat-value admin-crisp-numeric">
            {loading ? "…" : reservationSuspensions.length}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Regeln</div>
          <div className="admin-stat-value admin-crisp-numeric" style={{ fontSize: "1rem", lineHeight: 1.35 }}>
            K ≥4/24h · F ≥5/7d · Vorb. 24h
          </div>
        </div>
      </div>

      <AdminCollapsibleSection
        title="Suche & Aktualisieren"
        subtitle="Name, E-Mail oder Unternehmen — filtert alle Sperr-Listen oben"
        defaultOpen
        flushBody
      >
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
          <label className="admin-filter-field admin-filter-field--search">
            <span className="admin-field-label">Suche</span>
            <input
              className="admin-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="z. B. oeztuerkv@hotmail.com …"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="admin-btn-primary admin-filter-toolbar--modern__refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
      </AdminCollapsibleSection>

      {error ? (
        <div className="admin-info-banner admin-info-banner--err" role="alert">
          {error}
        </div>
      ) : null}

      <AdminCollapsibleSection
        title={`Kunden · Storno-Sperre (${customers.length})`}
        subtitle="≥4 Stornos in 24h — Buchung in der Kunden-App gesperrt"
        icon="👤"
        defaultOpen
        flushBody
      >
        <SuspensionTableState
          loading={loading}
          empty={!loading && customers.length === 0}
          emptyLabel="Keine aktiven Kunden-Storno-Sperren."
        />
        {customers.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Kunde</th>
                  <th>Anmeldung</th>
                  <th>Stornos</th>
                  <th>Grund</th>
                  <th>Gesperrt seit</th>
                  <th>Gesperrt bis</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => {
                  const busy = actionBusyId === `c:${row.passengerId}`;
                  return (
                    <tr key={row.passengerId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.name?.trim() || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {row.email?.trim() || row.passengerId}
                        </div>
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--neutral">
                          {authProviderLabel(row.authProvider)}
                        </span>
                      </td>
                      <td>
                        <StornoCountBadge
                          count={row.cancellationCountInWindow}
                          threshold={row.cancellationThreshold}
                          windowLabel={`${row.windowHours}h`}
                        />
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--err">
                          {row.reasonLabel || row.reason || "—"}
                        </span>
                      </td>
                      <td>{formatDt(row.suspendedAt)}</td>
                      <td>{formatDt(row.suspendedUntil)}</td>
                      <td className="admin-rides-table__actions">
                        <button
                          type="button"
                          className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                          disabled={busy}
                          onClick={() => void liftCustomer(row.passengerId)}
                        >
                          {busy ? "…" : "Entsperren"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title={`Fahrer · Storno nach Annahme (${drivers.length})`}
        subtitle="≥5 Stornos nach Annahme in 7 Tagen — kein Dispatch"
        icon="🚕"
        defaultOpen
        flushBody
      >
        <SuspensionTableState
          loading={loading}
          empty={!loading && drivers.length === 0}
          emptyLabel="Keine aktiven Fahrer-Storno-Sperren."
        />
        {drivers.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Fahrer</th>
                  <th>Unternehmen</th>
                  <th>Stornos</th>
                  <th>Grund</th>
                  <th>Gesperrt seit</th>
                  <th>Gesperrt bis</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((row) => {
                  const busy = actionBusyId === `d:${row.fleetDriverId}`;
                  const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
                  return (
                    <tr key={row.fleetDriverId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fullName || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {row.email?.trim() || row.fleetDriverId}
                        </div>
                      </td>
                      <td>{row.companyName || row.companyId || "—"}</td>
                      <td>
                        <StornoCountBadge
                          count={row.cancellationCountInWindow}
                          threshold={row.cancellationThreshold}
                          windowLabel={`${row.windowDays} Tage`}
                        />
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--err">
                          {row.reasonLabel || row.reason || "—"}
                        </span>
                      </td>
                      <td>{formatDt(row.suspendedAt)}</td>
                      <td>{formatDt(row.suspendedUntil)}</td>
                      <td className="admin-rides-table__actions">
                        <button
                          type="button"
                          className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                          disabled={busy}
                          onClick={() => void liftDriver(row.fleetDriverId)}
                        >
                          {busy ? "…" : "Entsperren"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title={`Fahrer · Vorbestellungs-Sperre 24h (${reservationSuspensions.length})`}
        subtitle="Aktivierung verpasst oder Spät-Storno — hier mit Grund sichtbar und entsperrbar"
        icon="⏱"
        defaultOpen
        flushBody
      >
        <SuspensionTableState
          loading={loading}
          empty={!loading && reservationSuspensions.length === 0}
          emptyLabel="Keine aktiven 24h-Vorbestellungs-Sperren."
        />
        {reservationSuspensions.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Fahrer</th>
                  <th>Unternehmen</th>
                  <th>Zugang</th>
                  <th>Grund</th>
                  <th>Gesperrt bis</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {reservationSuspensions.map((row) => {
                  const busy = actionBusyId === `r:${row.fleetDriverId}`;
                  const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
                  return (
                    <tr key={row.fleetDriverId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fullName || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {row.email?.trim() || row.fleetDriverId}
                        </div>
                      </td>
                      <td>{row.companyName || row.companyId || "—"}</td>
                      <td>
                        <span
                          className={`admin-c-badge ${
                            row.accessStatus === "suspended" ? "admin-c-badge--err" : "admin-c-badge--neutral"
                          }`}
                        >
                          {row.accessStatus === "suspended" ? "Zugang gesperrt" : "Zugang aktiv"}
                        </span>
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--err">
                          {row.reasonLabel || row.reason || "—"}
                        </span>
                      </td>
                      <td>{formatDt(row.suspendedUntil)}</td>
                      <td className="admin-rides-table__actions">
                        <button
                          type="button"
                          className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                          disabled={busy}
                          onClick={() => void liftReservation(row.fleetDriverId)}
                        >
                          {busy ? "…" : "Entsperren"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Fahrer manuell suchen & sperren"
        subtitle="Name/E-Mail suchen, dann Zugang sperren oder entsperren (mit Grund)"
        icon="🔍"
        defaultOpen
        flushBody
      >
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
          <label className="admin-filter-field admin-filter-field--search">
            <span className="admin-field-label">Fahrer suchen</span>
            <input
              className="admin-input"
              type="search"
              value={manualQ}
              onChange={(e) => setManualQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchManualDrivers();
                }
              }}
              placeholder="Mind. 2 Zeichen — z. B. oeztuerkv …"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="admin-btn-primary admin-filter-toolbar--modern__refresh"
            onClick={() => void searchManualDrivers()}
            disabled={manualLoading}
          >
            {manualLoading ? "Suche …" : "Suchen"}
          </button>
        </div>

        {manualError ? (
          <div className="admin-section-block__inset">
            <div className="admin-info-banner admin-info-banner--err" role="alert">
              {manualError}
            </div>
          </div>
        ) : null}

        {manualSearched && !manualLoading && manualDrivers.length === 0 && !manualError ? (
          <div className="admin-section-block__inset">
            <div className="admin-info-banner admin-info-banner--inline">Keine Fahrer gefunden.</div>
          </div>
        ) : null}

        {manualDrivers.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Fahrer</th>
                  <th>Unternehmen</th>
                  <th>Status</th>
                  <th>Sperrgrund</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {manualDrivers.map((d) => {
                  const busy = actionBusyId === `mb:${d.id}` || actionBusyId === `mu:${d.id}`;
                  const suspended = d.accessStatus === "suspended";
                  const showBlockForm = blockDriverId === d.id;
                  return (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.displayName || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {d.email?.trim() || d.id}
                        </div>
                      </td>
                      <td>{d.companyName || d.companyId || "—"}</td>
                      <td>
                        <span className={`admin-c-badge ${suspended ? "admin-c-badge--err" : "admin-c-badge--ok"}`}>
                          {suspended ? "Gesperrt" : d.accountStatusLabel || "Aktiv"}
                        </span>
                      </td>
                      <td>
                        {suspended && d.suspensionReason?.trim() ? (
                          <span className="admin-c-badge admin-c-badge--err">{d.suspensionReason}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="admin-rides-table__actions">
                        {suspended ? (
                          <button
                            type="button"
                            className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                            disabled={busy}
                            onClick={() => void runManualUnblock(d.id)}
                          >
                            {busy ? "…" : "Entsperren"}
                          </button>
                        ) : showBlockForm ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
                            <select
                              className="admin-input"
                              value={blockPreset}
                              onChange={(e) => setBlockPreset(e.target.value)}
                            >
                              {BLOCK_REASON_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <input
                              className="admin-input"
                              type="text"
                              value={blockNote}
                              onChange={(e) => setBlockNote(e.target.value)}
                              placeholder="Notiz / Detail (optional)"
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                                disabled={busy}
                                onClick={() => void runManualBlock(d.id)}
                              >
                                {busy ? "…" : "Sperren"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                style={{ fontSize: "0.85rem" }}
                                onClick={() => setBlockDriverId("")}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                            onClick={() => {
                              setBlockDriverId(d.id);
                              setBlockPreset("manual_admin");
                              setBlockNote("");
                            }}
                          >
                            Sperren
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>
    </div>
  );
}
