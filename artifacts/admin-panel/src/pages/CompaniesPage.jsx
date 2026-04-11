import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
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

  function companyStatusBadgeClass(isActive) {
    return isActive
      ? "admin-badge admin-badge--company-status-active"
      : "admin-badge admin-badge--company-status-inactive";
  }

  function companyPrioBadgeClass(isPrio) {
    return isPrio
      ? "admin-badge admin-badge--company-prio-yes"
      : "admin-badge admin-badge--company-prio-no";
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
    return <div className="admin-info-banner">Unternehmer werden geladen ...</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gesamt</div>
          <div className="admin-stat-value">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value">{stats.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Inaktiv</div>
          <div className="admin-stat-value">{stats.inactive}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">PRIO aktiv</div>
          <div className="admin-stat-value">{stats.priority}</div>
        </div>
      </div>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item">
            <label className="admin-field-label">Suche</label>
            <input
              type="text"
              className="admin-input"
              placeholder="Name, E-Mail, Telefon, ID ..."
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
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">PRIO</label>
            <select
              className="admin-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="yes">PRIO aktiv</option>
              <option value="no">Keine PRIO</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">&nbsp;</label>
            <button type="button" className="admin-btn-refresh" onClick={loadCompanies}>
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
          {Math.min(page * ITEMS_PER_PAGE, filteredItems.length)}
          {" von "}
          {filteredItems.length}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      <div className="admin-entity-list">
        {paginatedItems.length === 0 ? (
          <div className="admin-info-banner">Keine Unternehmer gefunden.</div>
        ) : (
          paginatedItems.map((item) => {
            const isSaving = savingId === item.id;

            return (
              <div key={item.id} className="admin-entity-card">
                <div className="admin-entity-card__top">
                  <div>
                    <div className="admin-entity-card__title">{item.name}</div>
                    <div className="admin-entity-card__meta">
                      ID: {item.id} · {item.email || "keine E-Mail"} ·{" "}
                      {item.phone || "kein Telefon"}
                    </div>
                  </div>

                  <div className="admin-badge-row">
                    <span className={companyStatusBadgeClass(item.is_active)}>
                      {item.is_active ? "Aktiv" : "Inaktiv"}
                    </span>

                    <span
                      className={companyPrioBadgeClass(item.is_priority_company)}
                    >
                      {item.is_priority_company ? "PRIO aktiv" : "Keine PRIO"}
                    </span>
                  </div>
                </div>

                <div className="admin-controls-grid">
                  <label className="admin-switch-row">
                    <span className="admin-switch-row__label">PRIO aktiv</span>
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

                  <label className="admin-switch-row">
                    <span className="admin-switch-row__label">Live-Fahrten PRIO</span>
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

                  <label className="admin-switch-row">
                    <span className="admin-switch-row__label">Reservierungen PRIO</span>
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

                <div className="admin-fields-grid">
                  <div className="admin-field-tile">
                    <div className="admin-field-tile__label">Ab Preis</div>
                    <div className="admin-field-tile__value">
                      {item.priority_price_threshold} €
                    </div>
                  </div>

                  <div className="admin-field-tile">
                    <div className="admin-field-tile__label">Timeout</div>
                    <div className="admin-field-tile__value">
                      {item.priority_timeout_seconds} Sek.
                    </div>
                  </div>

                  <div className="admin-field-tile">
                    <div className="admin-field-tile__label">Radius</div>
                    <div className="admin-field-tile__value">
                      {item.release_radius_km} km
                    </div>
                  </div>
                </div>

                {isSaving ? <div className="admin-saving-hint">Speichert ...</div> : null}
              </div>
            );
          })
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
