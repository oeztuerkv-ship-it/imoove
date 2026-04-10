import { useEffect, useMemo, useState } from "react";

const RIDES_URL = "https://onroda.de/api/rides";
const ITEMS_PER_PAGE = 10;

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

      const res = await fetch(`https://onroda.de/api/rides/${id}/release`, {
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
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString("de-DE");
    } catch {
      return value;
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "-";
    const num = Number(value);
    if (Number.isNaN(num)) return "-";
    return `${num.toFixed(2)} €`;
  }

  function canRelease(ride) {
    return Boolean(
      ride.company_id ||
        ride.assigned_driver_id ||
        ride.driver_id ||
        ride.priority_company_id
    );
  }

  function badgeStyle(kind, value) {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      padding: "4px 10px",
      fontSize: 12,
      fontWeight: 500,
      border: "1px solid var(--onroda-border-outline)",
      background: "var(--onroda-bg-light)",
      color: "var(--onroda-text-dark)",
      whiteSpace: "nowrap",
    };

    if (kind === "status") {
      if (value === "pending") {
        return {
          ...base,
          background: "var(--onroda-badge-warn-bg)",
          color: "var(--onroda-badge-warn-fg)",
        };
      }
      if (value === "cancelled") {
        return {
          ...base,
          background: "var(--onroda-badge-danger-bg)",
          color: "var(--onroda-badge-danger-fg)",
        };
      }
      if (value === "completed") {
        return {
          ...base,
          background: "var(--onroda-badge-success-bg)",
          color: "var(--onroda-badge-success-fg)",
        };
      }
      if (value === "accepted" || value === "assigned") {
        return {
          ...base,
          background: "var(--onroda-badge-info-bg)",
          color: "var(--onroda-badge-info-fg)",
        };
      }
    }

    if (kind === "dispatch") {
      if (value === "open_market") {
        return {
          ...base,
          background: "var(--onroda-badge-success-bg)",
          color: "var(--onroda-badge-success-fg)",
        };
      }
      return {
        ...base,
        background: "var(--onroda-badge-neutral-bg)",
        color: "var(--onroda-badge-neutral-fg)",
      };
    }

    if (kind === "mode") {
      if (value === "reservation") {
        return {
          ...base,
          background: "var(--onroda-badge-info-bg)",
          color: "var(--onroda-badge-info-fg)",
        };
      }
      if (value === "live") {
        return {
          ...base,
          background: "var(--onroda-badge-accent-bg)",
          color: "var(--onroda-badge-accent-fg)",
        };
      }
    }

    return base;
  }

  const companyOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        rides
          .map((ride) => ride.company_id)
          .filter((value) => value !== null && value !== undefined && value !== "")
          .map(String)
      )
    );

    values.sort((a, b) => Number(a) - Number(b));
    return values;
  }, [rides]);

  const filteredRides = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rides.filter((ride) => {
      const matchesStatus =
        statusFilter === "all" ? true : ride.status === statusFilter;

      const matchesCompany =
        companyFilter === "all"
          ? true
          : String(ride.company_id ?? "") === companyFilter;

      const haystack = [
        ride.id,
        ride.customer_name,
        ride.from_location,
        ride.to_location,
        ride.payment_type,
        ride.payment_method,
        ride.voucher_code,
        ride.status,
        ride.dispatch_status,
        ride.ride_mode,
        ride.company_id,
        ride.assigned_driver_id,
        ride.driver_id,
        ride.priority_company_id,
      ]
        .filter(Boolean)
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
      cancelled: rides.filter((r) => r.status === "cancelled").length,
      completed: rides.filter((r) => r.status === "completed").length,
      openMarket: rides.filter((r) => r.dispatch_status === "open_market").length,
    };
  }, [rides]);

  function renderPagination() {
    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (page > 1) {
      buttons.push(
        <button
          key="prev"
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(page - 1)}
        >
          Zurück
        </button>
      );
    }

    if (start > 1) {
      buttons.push(
        <button key={1} type="button" className="admin-page-btn" onClick={() => setPage(1)}>
          1
        </button>
      );
      if (start > 2) {
        buttons.push(
          <span key="startDots" className="admin-page-dots">
            ...
          </span>
        );
      }
    }

    for (let i = start; i <= end; i += 1) {
      buttons.push(
        <button
          key={i}
          type="button"
          className={
            i === page ? "admin-page-btn admin-page-btn--active" : "admin-page-btn"
          }
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(
          <span key="endDots" className="admin-page-dots">
            ...
          </span>
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
        </button>
      );
    }

    if (page < totalPages) {
      buttons.push(
        <button
          key="next"
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(page + 1)}
        >
          Weiter
        </button>
      );
    }

    return buttons;
  }

  if (loading) {
    return <div className="admin-info-banner">Fahrten werden geladen ...</div>;
  }

  const rideRowGrid =
    "220px 160px 220px 220px 110px 130px 100px 90px 90px 100px 170px 170px 120px";

  return (
    <div className="admin-page">
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gesamt</div>
          <div className="admin-stat-value">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Pending</div>
          <div className="admin-stat-value">{stats.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Cancelled</div>
          <div className="admin-stat-value">{stats.cancelled}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Completed</div>
          <div className="admin-stat-value">{stats.completed}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Open Market</div>
          <div className="admin-stat-value">{stats.openMarket}</div>
        </div>
      </div>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item">
            <label className="admin-field-label">Suche</label>
            <input
              type="text"
              className="admin-input"
              placeholder="ID, Kunde, Start, Ziel, Voucher ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Status</label>
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="accepted">Accepted</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">Firma</label>
            <select
              className="admin-select"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="all">Alle Firmen</option>
              {companyOptions.map((companyId) => (
                <option key={companyId} value={companyId}>
                  Firma {companyId}
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
          {" - "}
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
            <div
              className="admin-table-row admin-table-row--head"
              style={{ gridTemplateColumns: rideRowGrid, minWidth: 1950 }}
            >
              <div>ID</div>
              <div>Kunde</div>
              <div>Von</div>
              <div>Nach</div>
              <div>Status</div>
              <div>Dispatch</div>
              <div>Modus</div>
              <div>Firma</div>
              <div>Fahrer</div>
              <div>Preis</div>
              <div>Erstellt</div>
              <div>Freigegeben</div>
              <div>Aktion</div>
            </div>

            {paginatedRides.map((ride) => {
              const releaseAllowed = canRelease(ride);

              return (
                <div
                  key={ride.id}
                  className="admin-table-row"
                  style={{ gridTemplateColumns: rideRowGrid, minWidth: 1950 }}
                >
                  <div className="admin-mono">{ride.id || "-"}</div>
                  <div>{ride.customer_name || "-"}</div>
                  <div>{ride.from_location || "-"}</div>
                  <div>{ride.to_location || "-"}</div>

                  <div>
                    <span style={badgeStyle("status", ride.status || "-")}>
                      {ride.status || "-"}
                    </span>
                  </div>

                  <div>
                    <span style={badgeStyle("dispatch", ride.dispatch_status || "-")}>
                      {ride.dispatch_status || "-"}
                    </span>
                  </div>

                  <div>
                    <span style={badgeStyle("mode", ride.ride_mode || "-")}>
                      {ride.ride_mode || "-"}
                    </span>
                  </div>

                  <div>{ride.company_id || "-"}</div>
                  <div>{ride.assigned_driver_id || ride.driver_id || "-"}</div>
                  <div>{formatMoney(ride.estimated_fare)}</div>
                  <div>{formatDate(ride.created_at)}</div>
                  <div>{formatDate(ride.released_at)}</div>

                  <div>
                    <button
                      type="button"
                      className={
                        "admin-btn-action" +
                        (!releaseAllowed || busyId === ride.id
                          ? " admin-btn-action--disabled"
                          : "")
                      }
                      onClick={() => releaseRide(ride.id)}
                      disabled={!releaseAllowed || busyId === ride.id}
                    >
                      {busyId === ride.id ? "..." : "Freigeben"}
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
