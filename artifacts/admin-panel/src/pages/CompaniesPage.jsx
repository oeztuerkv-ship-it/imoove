import { useEffect, useMemo, useState } from "react";

const COMPANIES_URL = "https://onroda.de/api/admin/companies";
const ITEMS_PER_PAGE = 10;

export default function CompaniesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(COMPANIES_URL);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !Array.isArray(data.items)) {
        throw new Error("Ungültige Antwort");
      }

      setItems(data.items);
    } catch (err) {
      console.error("Companies load error:", err);
      setError("Unternehmer konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function updateCompanyPriority(companyId, patch) {
    setSavingId(companyId);
    setError("");

    try {
      const res = await fetch(`${COMPANIES_URL}/${companyId}/priority`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !data?.item) {
        throw new Error("Ungültige Antwort");
      }

      setItems((prev) =>
        prev.map((item) => (item.id === companyId ? data.item : item))
      );
    } catch (err) {
      console.error("Company priority update error:", err);
      setError("PRIO konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
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
      border: "1px solid rgba(255,255,255,0.05)",
      background: "#282a2d",
      color: "#e3e3e3",
      whiteSpace: "nowrap",
    };

    if (kind === "status") {
      if (value === "active") {
        return { ...base, background: "#17311f", color: "#9ed9af" };
      }
      return { ...base, background: "#341919", color: "#f0a3a3" };
    }

    if (kind === "priority") {
      if (value === "yes") {
        return { ...base, background: "#172334", color: "#a8c7fa" };
      }
      return { ...base, background: "#282a2d", color: "#c4c7c5" };
    }

    return base;
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      const statusValue = item.is_active ? "active" : "inactive";
      const priorityValue = item.is_priority_company ? "yes" : "no";

      const matchesStatus =
        statusFilter === "all" ? true : statusValue === statusFilter;

      const matchesPriority =
        priorityFilter === "all" ? true : priorityValue === priorityFilter;

      const haystack = [
        item.id,
        item.name,
        item.email,
        item.phone,
        item.priority_price_threshold,
        item.priority_timeout_seconds,
        item.release_radius_km,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = q ? haystack.includes(q) : true;

      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [items, search, statusFilter, priorityFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
  );

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((i) => i.is_active).length,
      inactive: items.filter((i) => !i.is_active).length,
      priority: items.filter((i) => i.is_priority_company).length,
    };
  }, [items]);

  function renderPagination() {
    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (page > 1) {
      buttons.push(
        <button
          key="prev"
          style={styles.pageButton}
          onClick={() => setPage(page - 1)}
        >
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
        <button
          key="next"
          style={styles.pageButton}
          onClick={() => setPage(page + 1)}
        >
          Weiter
        </button>
      );
    }

    return buttons;
  }

  if (loading) {
    return <div style={styles.infoBox}>Unternehmer werden geladen ...</div>;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Gesamt</div>
          <div style={styles.statValue}>{stats.total}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Aktiv</div>
          <div style={styles.statValue}>{stats.active}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Inaktiv</div>
          <div style={styles.statValue}>{stats.inactive}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>PRIO aktiv</div>
          <div style={styles.statValue}>{stats.priority}</div>
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          <div style={styles.filterItem}>
            <label style={styles.label}>Suche</label>
            <input
              type="text"
              placeholder="Name, E-Mail, Telefon, ID ..."
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
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>PRIO</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Alle</option>
              <option value="yes">PRIO aktiv</option>
              <option value="no">Keine PRIO</option>
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>&nbsp;</label>
            <button onClick={loadCompanies} style={styles.refreshBtn}>
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
          {Math.min(page * ITEMS_PER_PAGE, filteredItems.length)}
          {" von "}
          {filteredItems.length}
        </div>

        <div style={styles.pagination}>{renderPagination()}</div>
      </div>

      <div style={styles.list}>
        {paginatedItems.length === 0 ? (
          <div style={styles.infoBox}>Keine Unternehmer gefunden.</div>
        ) : (
          paginatedItems.map((item) => {
            const isSaving = savingId === item.id;

            return (
              <div key={item.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div>
                    <div style={styles.companyName}>{item.name}</div>
                    <div style={styles.companyMeta}>
                      ID: {item.id} · {item.email || "keine E-Mail"} ·{" "}
                      {item.phone || "kein Telefon"}
                    </div>
                  </div>

                  <div style={styles.badgeRow}>
                    <span
                      style={badgeStyle(
                        "status",
                        item.is_active ? "active" : "inactive"
                      )}
                    >
                      {item.is_active ? "Aktiv" : "Inaktiv"}
                    </span>

                    <span
                      style={badgeStyle(
                        "priority",
                        item.is_priority_company ? "yes" : "no"
                      )}
                    >
                      {item.is_priority_company ? "PRIO aktiv" : "Keine PRIO"}
                    </span>
                  </div>
                </div>

                <div style={styles.controlsGrid}>
                  <label style={styles.switchRow}>
                    <span style={styles.labelText}>PRIO aktiv</span>
                    <input
                      type="checkbox"
                      checked={!!item.is_priority_company}
                      disabled={isSaving}
                      onChange={(e) =>
                        updateCompanyPriority(item.id, {
                          is_priority_company: e.target.checked,
                        })
                      }
                    />
                  </label>

                  <label style={styles.switchRow}>
                    <span style={styles.labelText}>Live-Fahrten PRIO</span>
                    <input
                      type="checkbox"
                      checked={!!item.priority_for_live_rides}
                      disabled={isSaving}
                      onChange={(e) =>
                        updateCompanyPriority(item.id, {
                          priority_for_live_rides: e.target.checked,
                        })
                      }
                    />
                  </label>

                  <label style={styles.switchRow}>
                    <span style={styles.labelText}>Reservierungen PRIO</span>
                    <input
                      type="checkbox"
                      checked={!!item.priority_for_reservations}
                      disabled={isSaving}
                      onChange={(e) =>
                        updateCompanyPriority(item.id, {
                          priority_for_reservations: e.target.checked,
                        })
                      }
                    />
                  </label>
                </div>

                <div style={styles.fieldsGrid}>
                  <div style={styles.fieldBox}>
                    <div style={styles.fieldLabel}>Ab Preis</div>
                    <div style={styles.fieldValue}>
                      {item.priority_price_threshold} €
                    </div>
                  </div>

                  <div style={styles.fieldBox}>
                    <div style={styles.fieldLabel}>Timeout</div>
                    <div style={styles.fieldValue}>
                      {item.priority_timeout_seconds} Sek.
                    </div>
                  </div>

                  <div style={styles.fieldBox}>
                    <div style={styles.fieldLabel}>Radius</div>
                    <div style={styles.fieldValue}>
                      {item.release_radius_km} km
                    </div>
                  </div>
                </div>

                {isSaving ? (
                  <div style={styles.savingText}>Speichert ...</div>
                ) : null}
              </div>
            );
          })
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
    background: "#1e1f20",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    color: "#c4c7c5",
    fontSize: 13,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 600,
    color: "#e3e3e3",
  },

  filterCard: {
    background: "#1e1f20",
    border: "1px solid rgba(255,255,255,0.05)",
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
    color: "#c4c7c5",
    fontWeight: 500,
  },
  input: {
    height: 42,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "#282a2d",
    color: "#e3e3e3",
    padding: "0 12px",
    outline: "none",
  },
  select: {
    height: 42,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "#282a2d",
    color: "#e3e3e3",
    padding: "0 12px",
    outline: "none",
  },
  refreshBtn: {
    height: 42,
    background: "#282a2d",
    color: "#e3e3e3",
    border: "1px solid rgba(255,255,255,0.05)",
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
    color: "#c4c7c5",
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
    border: "1px solid rgba(255,255,255,0.05)",
    background: "#1e1f20",
    color: "#e3e3e3",
    cursor: "pointer",
    padding: "0 12px",
    fontWeight: 500,
  },
  pageButtonActive: {
    minWidth: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "#282a2d",
    color: "#e3e3e3",
    cursor: "pointer",
    padding: "0 12px",
    fontWeight: 600,
  },
  pageDots: {
    color: "#8e918f",
    padding: "0 4px",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  card: {
    background: "#1e1f20",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.05)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  companyName: {
    fontSize: 22,
    fontWeight: 600,
    color: "#e3e3e3",
    marginBottom: 6,
  },
  companyMeta: {
    color: "#c4c7c5",
    fontSize: 14,
    lineHeight: 1.5,
  },

  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  switchRow: {
    background: "#282a2d",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  labelText: {
    color: "#e3e3e3",
    fontWeight: 500,
  },

  fieldsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  fieldBox: {
    background: "#282a2d",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
  },
  fieldLabel: {
    color: "#c4c7c5",
    fontSize: 13,
    marginBottom: 8,
  },
  fieldValue: {
    color: "#e3e3e3",
    fontSize: 20,
    fontWeight: 600,
  },

  savingText: {
    color: "#a8c7fa",
    fontSize: 13,
  },

  infoBox: {
    padding: 22,
    color: "#c4c7c5",
    background: "#1e1f20",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 18,
  },
  errorBox: {
    padding: 22,
    color: "#f0a3a3",
    background: "#341919",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 18,
  },
};
