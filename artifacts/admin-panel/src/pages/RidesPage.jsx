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
      border: "1px solid var(--onroda-border)",
      background: "var(--onroda-bg-control)",
      color: "var(--onroda-text-primary)",
      whiteSpace: "nowrap",
    };

    if (kind === "status") {
      if (value === "pending") {
        return { ...base, background: "#2d2618", color: "#f3d08b" };
      }
      if (value === "cancelled") {
        return { ...base, background: "#341919", color: "#f0a3a3" };
      }
      if (value === "completed") {
        return { ...base, background: "#17311f", color: "#9ed9af" };
      }
      if (value === "accepted" || value === "assigned") {
        return { ...base, background: "#172334", color: "#a8c7fa" };
      }
    }

    if (kind === "dispatch") {
      if (value === "open_market") {
        return { ...base, background: "#17311f", color: "#9ed9af" };
      }
      return { ...base, background: "var(--onroda-bg-control)", color: "var(--onroda-text-secondary)" };
    }

    if (kind === "mode") {
      if (value === "reservation") {
        return { ...base, background: "#261c31", color: "#d8b5ff" };
      }
      if (value === "live") {
        return { ...base, background: "#172334", color: "#a8c7fa" };
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
        <button key="prev" style={styles.pageButton} onClick={() => setPage(page - 1)}>
          Zurück
        </button>
      );
    }

    if (start > 1) {
      buttons.push(
        <button key={1} style={styles.pageButton} onClick={() => setPage(1)}>
          1
        </button>
      );
      if (start > 2) {
        buttons.push(
          <span key="startDots" style={styles.pageDots}>
            ...
          </span>
        );
      }
    }

    for (let i = start; i <= end; i += 1) {
      buttons.push(
        <button
          key={i}
          style={i === page ? styles.pageButtonActive : styles.pageButton}
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(
          <span key="endDots" style={styles.pageDots}>
            ...
          </span>
        );
      }
      buttons.push(
        <button
          key={totalPages}
          style={styles.pageButton}
          onClick={() => setPage(totalPages)}
        >
          {totalPages}
        </button>
      );
    }

    if (page < totalPages) {
      buttons.push(
        <button key="next" style={styles.pageButton} onClick={() => setPage(page + 1)}>
          Weiter
        </button>
      );
    }

    return buttons;
  }

  if (loading) {
    return <div style={styles.infoBox}>Fahrten werden geladen ...</div>;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Gesamt</div>
          <div style={styles.statValue}>{stats.total}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Pending</div>
          <div style={styles.statValue}>{stats.pending}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Cancelled</div>
          <div style={styles.statValue}>{stats.cancelled}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Completed</div>
          <div style={styles.statValue}>{stats.completed}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Open Market</div>
          <div style={styles.statValue}>{stats.openMarket}</div>
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          <div style={styles.filterItem}>
            <label style={styles.label}>Suche</label>
            <input
              type="text"
              placeholder="ID, Kunde, Start, Ziel, Voucher ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Alle</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="accepted">Accepted</option>
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>Firma</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Alle Firmen</option>
              {companyOptions.map((companyId) => (
                <option key={companyId} value={companyId}>
                  Firma {companyId}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>&nbsp;</label>
            <button style={styles.refreshBtn} onClick={() => loadRides()}>
              Neu laden
            </button>
          </div>
        </div>
      </div>

      {error ? <div style={styles.errorBox}>{error}</div> : null}

      <div style={styles.tableTopBar}>
        <div style={styles.tableInfo}>
          Zeige {(page - 1) * ITEMS_PER_PAGE + 1}
          {" - "}
          {Math.min(page * ITEMS_PER_PAGE, filteredRides.length)}
          {" von "}
          {filteredRides.length}
        </div>

        <div style={styles.pagination}>{renderPagination()}</div>
      </div>

      <div style={styles.tableCard}>
        {paginatedRides.length === 0 ? (
          <div style={styles.infoBox}>Keine Fahrten gefunden.</div>
        ) : (
          <div style={styles.tableWrap}>
            <div style={{ ...styles.row, ...styles.headRow }}>
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
                <div key={ride.id} style={styles.row}>
                  <div style={styles.idCell}>{ride.id || "-"}</div>
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
                      style={{
                        ...styles.actionButton,
                        ...(releaseAllowed ? {} : styles.actionButtonDisabled),
                        ...(busyId === ride.id ? styles.actionButtonDisabled : {}),
                      }}
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

      <div style={styles.tableBottomBar}>
        <div style={styles.tableInfo}>
          Seite {page} von {totalPages}
        </div>

        <div style={styles.pagination}>{renderPagination()}</div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },

  statCard: {
    background: "var(--onroda-bg-elevated)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 18,
    padding: 18,
  },

  statLabel: {
    color: "var(--onroda-text-secondary)",
    fontSize: 13,
    marginBottom: 8,
  },

  statValue: {
    fontSize: 28,
    fontWeight: 600,
    color: "var(--onroda-text-primary)",
  },

  filterCard: {
    background: "var(--onroda-bg-elevated)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 18,
    padding: 18,
  },

  filterGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 180px",
    gap: 12,
  },

  filterItem: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  label: {
    fontSize: 13,
    color: "var(--onroda-text-secondary)",
    fontWeight: 500,
  },

  input: {
    height: 42,
    borderRadius: 14,
    border: "1px solid var(--onroda-border)",
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-primary)",
    padding: "0 12px",
    outline: "none",
  },

  select: {
    height: 42,
    borderRadius: 14,
    border: "1px solid var(--onroda-border)",
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-primary)",
    padding: "0 12px",
    outline: "none",
  },

  refreshBtn: {
    height: 42,
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-primary)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 500,
  },

  tableTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  tableBottomBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  tableInfo: {
    color: "var(--onroda-text-secondary)",
    fontSize: 13,
  },

  pagination: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  pageButton: {
    minWidth: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid var(--onroda-border)",
    background: "var(--onroda-bg-elevated)",
    color: "var(--onroda-text-primary)",
    cursor: "pointer",
    padding: "0 12px",
    fontWeight: 500,
  },

  pageButtonActive: {
    minWidth: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid var(--onroda-border)",
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-primary)",
    cursor: "pointer",
    padding: "0 12px",
    fontWeight: 600,
  },

  pageDots: {
    color: "var(--onroda-text-muted)",
    padding: "0 4px",
  },

  tableCard: {
    background: "var(--onroda-bg-elevated)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 18,
    overflow: "hidden",
  },

  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },

  row: {
    display: "grid",
    gridTemplateColumns:
      "220px 160px 220px 220px 110px 130px 100px 90px 90px 100px 170px 170px 120px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid var(--onroda-border)",
    minWidth: 1950,
    fontSize: 14,
    color: "var(--onroda-text-primary)",
  },

  headRow: {
    background: "#232425",
    fontWeight: 600,
    color: "var(--onroda-text-secondary)",
  },

  idCell: {
    fontFamily: "monospace",
    fontSize: 12,
  },

  actionButton: {
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-primary)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 14,
    padding: "8px 12px",
    fontWeight: 500,
    cursor: "pointer",
  },

  actionButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  infoBox: {
    padding: 22,
    color: "var(--onroda-text-secondary)",
    background: "var(--onroda-bg-elevated)",
    borderRadius: 18,
  },

  errorBox: {
    padding: 22,
    color: "#f0a3a3",
    background: "#341919",
    border: "1px solid var(--onroda-border)",
    borderRadius: 18,
  },
};
