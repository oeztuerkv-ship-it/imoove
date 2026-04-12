import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const RIDES_URL = `${API_BASE}/rides`;
const ITEMS_PER_PAGE = 10;

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
  if (ride.authorizationSource === "access_code") return "Zugangscode (gültig)";
  return "Direkt";
}

/** GET /rides liefert RideRequest (camelCase), keine snake_case-/Legacy-Felder. */
export default function RidesPage() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadRides();
    const interval = setInterval(() => {
      loadRides(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadRides(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setError("");

      const res = await fetch(RIDES_URL);

      if (!res.ok) {
        throw new Error(`Fehler beim Laden (${res.status})`);
      }

      const data = await res.json();

      if (Array.isArray(data)) {
        setRides(data);
      } else if (Array.isArray(data?.rides)) {
        setRides(data.rides);
      } else {
        setRides([]);
      }
    } catch (err) {
      console.error("loadRides error:", err);
      setError(err.message || "Fahrten konnten nicht geladen werden.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function releaseRide(id) {
    try {
      setBusyId(id);
      setError("");

      const res = await fetch(`${API_BASE}/rides/${id}/release`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Freigeben fehlgeschlagen (${res.status})`);
      }

      await loadRides(false);
    } catch (err) {
      console.error("releaseRide error:", err);
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

  /** Freigabe sinnvoll, wenn Fahrt einem Fahrer zugeordnet ist oder in aktiver Fahr-Phase. */
  function canRelease(ride) {
    if (ride?.driverId) return true;
    const s = ride?.status;
    return s === "accepted" || s === "arrived" || s === "in_progress";
  }

  function rideStatusBadgeClass(status) {
    const s = String(status || "—");
    if (s === "pending") return "admin-badge admin-badge--ride-status-pending";
    if (s === "cancelled") return "admin-badge admin-badge--ride-status-cancelled";
    if (s === "completed") return "admin-badge admin-badge--ride-status-completed";
    if (s === "accepted") return "admin-badge admin-badge--ride-status-accepted";
    if (s === "in_progress") return "admin-badge admin-badge--ride-status-assigned";
    if (s === "arrived") return "admin-badge admin-badge--ride-status-accepted";
    if (s === "rejected") return "admin-badge admin-badge--ride-status-cancelled";
    return "admin-badge";
  }

  const companyOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        rides
          .map((ride) => ride.companyId)
          .filter((value) => value !== null && value !== undefined && value !== "")
          .map(String),
      ),
    );
    values.sort((a, b) => a.localeCompare(b, "de"));
    return values;
  }, [rides]);

  const filteredRides = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rides.filter((ride) => {
      const matchesStatus = statusFilter === "all" ? true : ride.status === statusFilter;

      const matchesCompany =
        companyFilter === "all" ? true : String(ride.companyId ?? "") === companyFilter;

      const haystack = [
        ride.id,
        ride.customerName,
        ride.from,
        ride.fromFull,
        ride.to,
        ride.toFull,
        ride.paymentMethod,
        ride.vehicle,
        ride.status,
        ride.companyId,
        ride.driverId,
        ride.passengerId,
        ride.createdByPanelUserId,
        ride.rideKind,
        ride.payerKind,
        ride.voucherCode,
        ride.billingReference,
      ]
        .filter((v) => v !== null && v !== undefined && v !== "")
        .join(" ")
        .toLowerCase();

      const matchesSearch = q ? haystack.includes(q) : true;

      return matchesStatus && matchesCompany && matchesSearch;
    });
  }, [rides, search, statusFilter, companyFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRides.length / ITEMS_PER_PAGE));

  const paginatedRides = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredRides.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRides, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, companyFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const stats = useMemo(() => {
    return {
      total: rides.length,
      pending: rides.filter((r) => r.status === "pending").length,
      active: rides.filter((r) =>
        ["accepted", "arrived", "in_progress"].includes(r.status),
      ).length,
      completed: rides.filter((r) => r.status === "completed").length,
      cancelled: rides.filter((r) => r.status === "cancelled").length,
    };
  }, [rides]);

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

  if (loading) {
    return <div className="admin-info-banner">Fahrten werden geladen …</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gesamt</div>
          <div className="admin-stat-value">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Offen</div>
          <div className="admin-stat-value">{stats.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value">{stats.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Abgeschlossen</div>
          <div className="admin-stat-value">{stats.completed}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Storniert</div>
          <div className="admin-stat-value">{stats.cancelled}</div>
        </div>
      </div>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item">
            <label className="admin-field-label">Suche</label>
            <input
              type="text"
              className="admin-input"
              placeholder="ID, Kunde, Route, Firma, Fahrer …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Status</label>
            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Alle</option>
              <option value="pending">Offen</option>
              <option value="accepted">Angenommen</option>
              <option value="arrived">Vor Ort</option>
              <option value="in_progress">Unterwegs</option>
              <option value="completed">Abgeschlossen</option>
              <option value="cancelled">Storniert</option>
              <option value="rejected">Abgelehnt</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Unternehmen (companyId)</label>
            <select className="admin-select" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">Alle</option>
              {companyOptions.map((companyId) => (
                <option key={companyId} value={companyId}>
                  {companyId}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">&nbsp;</label>
            <button type="button" className="admin-btn-refresh" onClick={() => loadRides()}>
              Neu laden
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          Zeige {(page - 1) * ITEMS_PER_PAGE + 1}
          {" – "}
          {Math.min(page * ITEMS_PER_PAGE, filteredRides.length)}
          {" von "}
          {filteredRides.length}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      <div className="admin-table-card">
        {paginatedRides.length === 0 ? (
          <div className="admin-info-banner">Keine Fahrten gefunden.</div>
        ) : (
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head admin-cs-grid admin-cs-grid--rides admin-cs-grid--rides-min">
              <div>ID</div>
              <div>Kunde</div>
              <div>Typ</div>
              <div>Zahler</div>
              <div>Freigabe</div>
              <div>Von</div>
              <div>Nach</div>
              <div>Status</div>
              <div>Firma</div>
              <div>Fahrer</div>
              <div>Preis</div>
              <div>Erstellt</div>
              <div>Geplant</div>
              <div>Panel</div>
              <div>Aktion</div>
            </div>

            {paginatedRides.map((ride) => {
              const releaseAllowed = canRelease(ride);
              const panelHint = ride.createdByPanelUserId
                ? String(ride.createdByPanelUserId).slice(0, 8) + "…"
                : "—";

              return (
                <div key={ride.id} className="admin-table-row admin-cs-grid admin-cs-grid--rides admin-cs-grid--rides-min">
                  <div className="admin-mono">{ride.id || "—"}</div>
                  <div>{ride.customerName || "—"}</div>
                  <div title={[ride.voucherCode, ride.billingReference].filter(Boolean).join(" · ") || ""}>
                    {rideKindLabel(ride.rideKind)}
                  </div>
                  <div>{payerKindLabel(ride.payerKind)}</div>
                  <div title={ride.authorizationSource === "access_code" ? "Digital über Zugangscode" : ""}>
                    {authorizationSummary(ride)}
                  </div>
                  <div>{ride.from || "—"}</div>
                  <div>{ride.to || "—"}</div>

                  <div>
                    <span className={rideStatusBadgeClass(ride.status)}>{ride.status || "—"}</span>
                  </div>

                  <div>{ride.companyId || "—"}</div>
                  <div>{ride.driverId || "—"}</div>
                  <div>
                    {formatMoney(ride.estimatedFare)}
                    {ride.finalFare != null && ride.finalFare !== "" ? (
                      <span className="admin-table-sub"> / {formatMoney(ride.finalFare)}</span>
                    ) : null}
                  </div>
                  <div>{formatDate(ride.createdAt)}</div>
                  <div>{formatDate(ride.scheduledAt)}</div>
                  <div className="admin-mono" title={ride.createdByPanelUserId || ""}>
                    {panelHint}
                  </div>

                  <div>
                    <button
                      type="button"
                      className={
                        "admin-btn-action" +
                        (!releaseAllowed || busyId === ride.id ? " admin-btn-action--disabled" : "")
                      }
                      onClick={() => releaseRide(ride.id)}
                      disabled={!releaseAllowed || busyId === ride.id}
                    >
                      {busyId === ride.id ? "…" : "Freigeben"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          Seite {page} von {totalPages}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>
    </div>
  );
}
