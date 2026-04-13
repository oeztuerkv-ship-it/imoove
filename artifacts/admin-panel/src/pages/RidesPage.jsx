import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const RIDES_URL = `${API_BASE}/admin/rides`;
const STATS_URL = `${API_BASE}/admin/stats`;
const COMPANIES_URL = `${API_BASE}/admin/companies`;
const PAGE_SIZE = 20;

function rideKindLabel(k) {
  const m = {
    standard: "Normal",
    medical: "Krankenfahrt",
    voucher: "Gutschein",
    company: "Firma",
  };
  return m[k] ?? k ?? "—";
}

function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Firma",
    insurance: "KV",
    voucher: "Gutschein",
    third_party: "Dritt",
  };
  return m[k] ?? k ?? "—";
}

function accessCodeTypeDe(t) {
  const m = { voucher: "Gutschein", hotel: "Hotel", company: "Firma", general: "Fahrcode" };
  return m[t] ?? t ?? "—";
}

function authorizationSummary(ride) {
  if (ride.authorizationSource === "access_code" && ride.accessCodeSummary?.label) {
    return `${ride.accessCodeSummary.label} (${accessCodeTypeDe(ride.accessCodeSummary.codeType)})`;
  }
  if (ride.authorizationSource === "access_code") return "Zugangscode";
  return "Direktbuchung";
}

function rideStatusDe(status) {
  const s = String(status || "");
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
    rejected: "Abgelehnt",
  };
  return m[s] || (s || "—");
}

/** Status-Filter: „Alle“ zuerst, danach A–Z nach deutscher Bezeichnung. */
const RIDE_STATUS_FILTER_OPTIONS = (() => {
  const ids = ["pending", "accepted", "arrived", "in_progress", "completed", "cancelled", "rejected"];
  const rest = ids.map((value) => ({ value, label: rideStatusDe(value) }));
  rest.sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
  return [{ value: "all", label: "Alle" }, ...rest];
})();

function rideTripType(ride) {
  return ride.scheduledAt ? "Termin" : "Sofort";
}

function rideStatusToneClass(status) {
  const s = String(status || "");
  if (s === "completed") return "admin-status-pill admin-status-pill--ok";
  if (s === "cancelled" || s === "rejected") return "admin-status-pill admin-status-pill--bad";
  if (s === "pending") return "admin-status-pill admin-status-pill--pending";
  return "admin-status-pill admin-status-pill--active";
}

function csvEscapeCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rideSourceLabel(ride) {
  if (ride?.createdByPanelUserId) return "Partner-Portal";
  return "—";
}

function paymentMethodLabel(method) {
  const m = String(method || "").trim().toLowerCase();
  if (!m) return "—";
  if (m === "bar" || m === "cash") return "Bar";
  if (m === "access_code" || m === "voucher" || m === "gutschein / code") return "Gutschein";
  if (m === "card") return "Karte";
  if (m === "paypal") return "PayPal";
  return method;
}

function driverDisplayName(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return text;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function rideInternalNote(ride) {
  const direct = typeof ride?.internalNote === "string" ? ride.internalNote.trim() : "";
  if (direct) return direct;
  const fromMeta = typeof ride?.partnerBookingMeta?.internalNote === "string"
    ? ride.partnerBookingMeta.internalNote.trim()
    : "";
  if (fromMeta) return fromMeta;
  const hotelRef = typeof ride?.partnerBookingMeta?.hotel?.reservationRef === "string"
    ? ride.partnerBookingMeta.hotel.reservationRef.trim()
    : "";
  if (hotelRef) return `Reservierung: ${hotelRef}`;
  return "";
}

function emptyStats() {
  return {
    rides: {
      total: 0,
      pending: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    },
  };
}

export default function RidesPage({ initialDetailRideId, onInitialDetailRideConsumed }) {
  const [rides, setRides] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(emptyStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [ridesSort, setRidesSort] = useState("desc");
  const [exportBusy, setExportBusy] = useState(false);

  const [companies, setCompanies] = useState([]);

  const companiesAz = useMemo(
    () => [...companies].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" })),
    [companies],
  );

  const [detailId, setDetailId] = useState(null);
  const [detailRide, setDetailRide] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.items)) {
          setCompanies(data.items);
        }
      } catch {
        /* Firmen-Dropdown optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(STATS_URL, { headers: adminApiHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok || !data?.stats?.rides) return;
      const s = data.stats.rides;
      setStats({
        rides: {
          total: s.total ?? 0,
          pending: s.pending ?? 0,
          active: s.active ?? 0,
          completed: s.completed ?? 0,
          cancelled: s.cancelled ?? 0,
          rejected: s.rejected ?? 0,
        },
      });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const iv = setInterval(() => void loadStats(), 15000);
    return () => clearInterval(iv);
  }, [loadStats]);

  const loadRides = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);
        setError("");

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        if (debouncedQ) params.set("q", debouncedQ);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (companyFilter !== "all") params.set("companyId", companyFilter);
        if (createdFrom.trim()) params.set("createdFrom", createdFrom.trim());
        if (createdTo.trim()) params.set("createdTo", createdTo.trim());
        if (driverFilter.trim()) params.set("driverId", driverFilter.trim());
        params.set("sortCreated", ridesSort === "asc" ? "asc" : "desc");

        const res = await fetch(`${RIDES_URL}?${params.toString()}`, {
          headers: adminApiHeaders(),
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 503) {
            throw new Error("Zugriff verweigert. Bitte prüfen Sie die Anmeldung an der Plattform.");
          }
          throw new Error(`Fahrten konnten nicht geladen werden (${res.status}).`);
        }

        const data = await res.json();

        if (!data?.ok || !Array.isArray(data.items)) {
          throw new Error("Ungültige Antwort");
        }

        setRides(data.items);
        setTotal(typeof data.total === "number" ? data.total : data.items.length);
      } catch (err) {
        setError(err.message || "Fahrten konnten nicht geladen werden.");
        setRides([]);
        setTotal(0);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [page, debouncedQ, statusFilter, companyFilter, createdFrom, createdTo, driverFilter, ridesSort],
  );

  useEffect(() => {
    void loadRides(true);
  }, [loadRides]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadRides(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadRides]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, companyFilter, createdFrom, createdTo, driverFilter, ridesSort]);

  async function exportRidesCsv() {
    setExportBusy(true);
    setError("");
    try {
      const collected = [];
      let p = 1;
      const pageSize = 100;
      const maxPages = 50;
      let totalExpected = Infinity;
      while (p <= maxPages && collected.length < totalExpected) {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("pageSize", String(pageSize));
        if (debouncedQ) params.set("q", debouncedQ);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (companyFilter !== "all") params.set("companyId", companyFilter);
        if (createdFrom.trim()) params.set("createdFrom", createdFrom.trim());
        if (createdTo.trim()) params.set("createdTo", createdTo.trim());
        if (driverFilter.trim()) params.set("driverId", driverFilter.trim());
        params.set("sortCreated", ridesSort === "asc" ? "asc" : "desc");
        const res = await fetch(`${RIDES_URL}?${params.toString()}`, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
          throw new Error("Export: Fahrten konnten nicht geladen werden.");
        }
        totalExpected = typeof data.total === "number" ? data.total : collected.length + data.items.length;
        collected.push(...data.items);
        if (data.items.length < pageSize) break;
        p += 1;
      }
      const header = [
        "Zeitpunkt",
        "Fahrt-Typ",
        "Unternehmen",
        "Fahrzeug",
        "Fahrtart",
        "Fahrt-ID",
        "Kunde",
        "Status",
        "Von",
        "Nach",
      ];
      const lines = [header.map(csvEscapeCell).join(",")];
      for (const ride of collected) {
        const when = ride.scheduledAt || ride.createdAt;
        lines.push(
          [
            formatDate(when),
            rideTripType(ride),
            ride.companyName || ride.companyId || "",
            ride.vehicle || "",
            rideKindLabel(ride.rideKind),
            ride.id || "",
            ride.customerName || "",
            rideStatusDe(ride.status),
            ride.from || "",
            ride.to || "",
          ]
            .map(csvEscapeCell)
            .join(","),
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onroda-fahrten-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV-Export fehlgeschlagen.");
    } finally {
      setExportBusy(false);
    }
  }

  async function loadDetail(id) {
    setDetailId(id);
    setDetailRide(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const res = await fetch(`${RIDES_URL}/${encodeURIComponent(id)}`, {
        headers: adminApiHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.ride) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setDetailRide(data.ride);
    } catch (e) {
      setDetailError(e.message || "Detail konnte nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!initialDetailRideId) return;
    void loadDetail(initialDetailRideId);
    onInitialDetailRideConsumed?.();
    // Nur Intent aus dem Dashboard; loadDetail absichtlich nicht in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetailRideId]);

  function closeDetail() {
    setDetailId(null);
    setDetailRide(null);
    setDetailError("");
  }

  async function releaseRide(id) {
    try {
      setBusyId(id);
      setError("");

      const res = await fetch(`${RIDES_URL}/${encodeURIComponent(id)}/release`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Freigeben fehlgeschlagen (${res.status})`);
      }

      await loadRides(false);
      if (detailId === id && data?.ride) {
        setDetailRide(data.ride);
      }
    } catch (err) {
      setError(err.message || "Fahrt konnte nicht freigegeben werden.");
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("de-DE");
    } catch {
      return String(value);
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return "—";
    return `${num.toFixed(2)} €`;
  }

  function canRelease(ride) {
    if (ride?.driverId) return true;
    const s = ride?.status;
    return s === "accepted" || s === "arrived" || s === "in_progress";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function copyRideId(id) {
    if (!id || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function renderPagination() {
    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (page > 1) {
      buttons.push(
        <button key="prev" type="button" className="admin-page-btn" onClick={() => setPage(page - 1)}>
          Zurück
        </button>,
      );
    }

    if (start > 1) {
      buttons.push(
        <button key={1} type="button" className="admin-page-btn" onClick={() => setPage(1)}>
          1
        </button>,
      );
      if (start > 2) {
        buttons.push(
          <span key="startDots" className="admin-page-dots">
            ...
          </span>,
        );
      }
    }

    for (let i = start; i <= end; i += 1) {
      buttons.push(
        <button
          key={i}
          type="button"
          className={i === page ? "admin-page-btn admin-page-btn--active" : "admin-page-btn"}
          onClick={() => setPage(i)}
        >
          {i}
        </button>,
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(
          <span key="endDots" className="admin-page-dots">
            ...
          </span>,
        );
      }
      buttons.push(
        <button
          key={totalPages}
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(totalPages)}
        >
          {totalPages}
        </button>,
      );
    }

    if (page < totalPages) {
      buttons.push(
        <button key="next" type="button" className="admin-page-btn" onClick={() => setPage(page + 1)}>
          Weiter
        </button>,
      );
    }

    return buttons;
  }

  const s = stats.rides;

  if (loading && rides.length === 0) {
    return <div className="admin-info-banner">Fahrten werden geladen …</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Alle Fahrten</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Offen</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Abgeschlossen</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.completed}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Storniert</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.cancelled}</div>
        </div>
      </div>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item">
            <label className="admin-field-label">Suche</label>
            <input
              type="text"
              className="admin-input"
              placeholder="ID, Kunde, Route, Fahrer …"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Status</label>
            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {RIDE_STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Unternehmen (A–Z)</label>
            <select className="admin-select" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">Alle</option>
              {companiesAz.map((c) => (
                <option key={c.id} value={c.id} title={c.id}>
                  {c.name}
                  {!c.is_active ? " (inaktiv)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Sortierung (Erstellzeit)</label>
            <select className="admin-select" value={ridesSort} onChange={(e) => setRidesSort(e.target.value)}>
              <option value="desc">Neueste zuerst</option>
              <option value="asc">Älteste zuerst</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Fahrer</label>
            <input
              type="text"
              className="admin-input"
              placeholder="Kennung des Fahrers"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Erstellt von</label>
            <input
              type="date"
              className="admin-input"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Erstellt bis</label>
            <input
              type="date"
              className="admin-input"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">&nbsp;</label>
            <div className="admin-filter-actions">
              <button type="button" className="admin-btn-refresh" onClick={() => void loadRides(true)}>
                Neu laden
              </button>
              <button type="button" className="admin-page-btn" disabled={exportBusy} onClick={() => void exportRidesCsv()}>
                {exportBusy ? "Export …" : "CSV exportieren"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          {total} Treffer · Seite {page} von {totalPages} · {PAGE_SIZE} pro Seite
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      <div className="admin-table-card admin-table-card--flush">
        {rides.length === 0 ? (
          <div className="admin-info-banner">Keine Fahrten gefunden.</div>
        ) : (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Fahrt-Typ</th>
                  <th>Unternehmen</th>
                  <th>Fahrzeug / Kategorie</th>
                  <th>Fahrt-ID</th>
                  <th>Kunde</th>
                  <th>Status</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((ride) => {
                  const releaseAllowed = canRelease(ride);
                  const firmenLabel = ride.companyName || ride.companyId || "—";
                  const noteText = rideInternalNote(ride);
                  const hasNote = noteText.length > 0;
                  const isExpanded = expandedNoteId === ride.id;
                  const driverLabel = driverDisplayName(ride.driverName || ride.driverId);
                  const when = ride.scheduledAt || ride.createdAt;
                  const vehCat = [ride.vehicle || "—", rideKindLabel(ride.rideKind)].join(" · ");

                  return (
                    <Fragment key={ride.id}>
                      <tr className="admin-rides-table__row">
                        <td className="admin-crisp-numeric admin-rides-table__nowrap">{formatDate(when)}</td>
                        <td>{rideTripType(ride)}</td>
                        <td>
                          <div className="admin-ellipsis" title={firmenLabel}>
                            {firmenLabel}
                          </div>
                        </td>
                        <td>
                          <div className="admin-ellipsis" title={vehCat}>
                            {vehCat}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-link-mono admin-crisp-numeric"
                            onClick={() => void loadDetail(ride.id)}
                            title="Details öffnen"
                          >
                            {ride.id || "—"}
                          </button>
                        </td>
                        <td>
                          <div className="admin-ellipsis" title={ride.customerName || ""}>
                            {ride.customerName || "—"}
                          </div>
                          {driverLabel ? (
                            <div className="admin-table-sub admin-ellipsis" title={ride.driverId || ""}>
                              Fahrer: {driverLabel}
                            </div>
                          ) : (
                            <div className="admin-driver-searching">Fahrer: Suche…</div>
                          )}
                        </td>
                        <td>
                          <span className={rideStatusToneClass(ride.status)}>{rideStatusDe(ride.status)}</span>
                          <div className="admin-table-sub">{formatMoney(ride.estimatedFare)}</div>
                        </td>
                        <td className="admin-rides-table__actions">
                          {hasNote ? (
                            <button
                              type="button"
                              className="admin-note-icon-btn"
                              title="Interne Notiz"
                              aria-label="Interne Notiz"
                              onClick={() => setExpandedNoteId((prev) => (prev === ride.id ? null : ride.id))}
                            >
                              💬
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={
                              "admin-btn-action admin-btn-action--table" +
                              (!releaseAllowed || busyId === ride.id ? " admin-btn-action--disabled" : "")
                            }
                            onClick={() => releaseRide(ride.id)}
                            disabled={!releaseAllowed || busyId === ride.id}
                          >
                            {busyId === ride.id ? "…" : "Zuweisen"}
                          </button>
                          <details className="admin-overflow-menu">
                            <summary className="admin-overflow-menu__trigger" aria-label="Weitere Aktionen">
                              ⋯
                            </summary>
                            <div className="admin-overflow-menu__panel">
                              <button type="button" className="admin-overflow-menu__item" onClick={() => void loadDetail(ride.id)}>
                                Details
                              </button>
                              <button type="button" className="admin-overflow-menu__item" onClick={() => void copyRideId(ride.id)}>
                                ID kopieren
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="admin-rides-table__note-row">
                          <td colSpan={8}>
                            <strong>Notiz:</strong> {noteText}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info" />
        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      {detailId ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDetail}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-ride-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="admin-ride-detail-title" className="admin-modal__title">
                Fahrt {detailId}
              </h2>
              <button type="button" className="admin-modal__close" onClick={closeDetail} aria-label="Schließen">
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {detailLoading ? <p>Lade Detail …</p> : null}
              {detailError ? <div className="admin-error-banner">{detailError}</div> : null}
              {!detailLoading && detailRide ? (
                <dl className="admin-detail-grid">
                  <div>
                    <dt>Auftrag</dt>
                    <dd className="admin-mono">{detailRide.id}</dd>
                  </div>
                  <div>
                    <dt>Kunde</dt>
                    <dd>{detailRide.customerName || "—"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{rideStatusDe(detailRide.status)}</dd>
                  </div>
                  <div>
                    <dt>Unternehmen</dt>
                    <dd>{detailRide.companyName || detailRide.companyId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Abholung</dt>
                    <dd>{detailRide.from || "—"}</dd>
                  </div>
                  <div>
                    <dt>Ziel</dt>
                    <dd>{detailRide.to || "—"}</dd>
                  </div>
                  <div>
                    <dt>Fahrtart</dt>
                    <dd>{rideKindLabel(detailRide.rideKind)}</dd>
                  </div>
                  <div>
                    <dt>Zahlung</dt>
                    <dd>{payerKindLabel(detailRide.payerKind)}</dd>
                  </div>
                  <div>
                    <dt>Freigabe</dt>
                    <dd>{authorizationSummary(detailRide)}</dd>
                  </div>
                  <div>
                    <dt>Fahrer</dt>
                    <dd className="admin-mono">{detailRide.driverId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Preis (geschätzt / final)</dt>
                    <dd>
                      {formatMoney(detailRide.estimatedFare)}
                      {detailRide.finalFare != null && detailRide.finalFare !== ""
                        ? ` / ${formatMoney(detailRide.finalFare)}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Erstellt</dt>
                    <dd>{formatDate(detailRide.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Geplant</dt>
                    <dd>{formatDate(detailRide.scheduledAt)}</dd>
                  </div>
                  <div>
                    <dt>Quelle</dt>
                    <dd>{rideSourceLabel(detailRide)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
