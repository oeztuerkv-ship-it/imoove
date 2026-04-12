import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
const ITEMS_PER_PAGE = 10;

function emptyCompanyForm() {
  return {
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "",
    vat_id: "",
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: "25",
    priority_timeout_seconds: "90",
    release_radius_km: "10",
  };
}

function formFromItem(item) {
  return {
    name: item.name ?? "",
    contact_name: item.contact_name ?? "",
    email: item.email ?? "",
    phone: item.phone ?? "",
    address_line1: item.address_line1 ?? "",
    address_line2: item.address_line2 ?? "",
    postal_code: item.postal_code ?? "",
    city: item.city ?? "",
    country: item.country ?? "",
    vat_id: item.vat_id ?? "",
    is_active: !!item.is_active,
    is_priority_company: !!item.is_priority_company,
    priority_for_live_rides: !!item.priority_for_live_rides,
    priority_for_reservations: !!item.priority_for_reservations,
    priority_price_threshold: String(item.priority_price_threshold ?? 25),
    priority_timeout_seconds: String(item.priority_timeout_seconds ?? 90),
    release_radius_km: String(item.release_radius_km ?? 10),
  };
}

export default function CompaniesPage({ initialOpenCompanyId, onInitialOpenCompanyConsumed }) {
  const companyIntentHandled = useRef(null);
  const [items, setItems] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savingModulesId, setSavingModulesId] = useState(null);
  const [editingModulesFor, setEditingModulesFor] = useState(null);
  const [moduleDraft, setModuleDraft] = useState([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [formModalSaving, setFormModalSaving] = useState(false);
  const [formModalError, setFormModalError] = useState("");

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (!initialOpenCompanyId) {
      companyIntentHandled.current = null;
      return;
    }
    if (loading) return;
    if (companyIntentHandled.current === initialOpenCompanyId) return;
    const item = items.find((i) => i.id === initialOpenCompanyId);
    if (!item) {
      onInitialOpenCompanyConsumed?.();
      return;
    }
    companyIntentHandled.current = initialOpenCompanyId;
    openEditCompany(item);
    onInitialOpenCompanyConsumed?.();
  }, [initialOpenCompanyId, loading, items]);

  async function loadCompanies() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !Array.isArray(data.items)) {
        throw new Error("Ungültige Antwort");
      }

      setItems(data.items);
      if (Array.isArray(data.panelModuleCatalog)) {
        setModuleCatalog(data.panelModuleCatalog);
      }
    } catch {
      setError("Unternehmen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  function openCreateCompany() {
    setCompanyForm(emptyCompanyForm());
    setFormModalError("");
    setShowCreateModal(true);
  }

  function openEditCompany(item) {
    setEditingCompanyId(item.id);
    setCompanyForm(formFromItem(item));
    setFormModalError("");
    setShowEditModal(true);
  }

  function closeCompanyModals() {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditingCompanyId(null);
    setFormModalError("");
  }

  function buildCompanyPayload() {
    const pt = Number(companyForm.priority_price_threshold);
    const ts = Number(companyForm.priority_timeout_seconds);
    const rk = Number(companyForm.release_radius_km);
    return {
      name: companyForm.name.trim(),
      contact_name: companyForm.contact_name.trim(),
      email: companyForm.email.trim(),
      phone: companyForm.phone.trim(),
      address_line1: companyForm.address_line1.trim(),
      address_line2: companyForm.address_line2.trim(),
      postal_code: companyForm.postal_code.trim(),
      city: companyForm.city.trim(),
      country: companyForm.country.trim(),
      vat_id: companyForm.vat_id.trim(),
      is_active: companyForm.is_active,
      is_priority_company: companyForm.is_priority_company,
      priority_for_live_rides: companyForm.priority_for_live_rides,
      priority_for_reservations: companyForm.priority_for_reservations,
      priority_price_threshold: Number.isFinite(pt) ? pt : 0,
      priority_timeout_seconds: Number.isFinite(ts) ? Math.floor(ts) : 90,
      release_radius_km: Number.isFinite(rk) ? rk : 10,
    };
  }

  async function saveCreateCompany(e) {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setFormModalError("Name ist Pflicht.");
      return;
    }
    setFormModalSaving(true);
    setFormModalError("");
    try {
      const res = await fetch(COMPANIES_URL, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(buildCompanyPayload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems((prev) => [data.item, ...prev]);
      closeCompanyModals();
    } catch (err) {
      console.error(err);
      setFormModalError(err.message || "Anlegen fehlgeschlagen.");
    } finally {
      setFormModalSaving(false);
    }
  }

  async function saveEditCompany(e) {
    e.preventDefault();
    if (!editingCompanyId) return;
    if (!companyForm.name.trim()) {
      setFormModalError("Name ist Pflicht.");
      return;
    }
    setFormModalSaving(true);
    setFormModalError("");
    try {
      const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(editingCompanyId)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(buildCompanyPayload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems((prev) => prev.map((row) => (row.id === editingCompanyId ? data.item : row)));
      closeCompanyModals();
    } catch (err) {
      console.error(err);
      setFormModalError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setFormModalSaving(false);
    }
  }

  async function toggleCompanyActive(item) {
    if (item.is_active) {
      const ok = window.confirm(
        "Unternehmen deaktivieren? Aktive Panel-Logins für diese Firma werden beim nächsten /me-Check abgewiesen.",
      );
      if (!ok) return;
    }
    setSavingId(item.id);
    setError("");
    try {
      const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? data.item : row)));
    } catch (err) {
      console.error(err);
      setError("Status konnte nicht geändert werden.");
    } finally {
      setSavingId(null);
    }
  }

  function startEditModules(item) {
    setEditingModulesFor(item.id);
    setModuleDraft(
      item.panel_modules == null
        ? moduleCatalog.map((c) => c.id)
        : [...item.panel_modules],
    );
  }

  function toggleModuleDraft(modId, checked) {
    setModuleDraft((prev) => {
      const set = new Set(prev);
      if (checked) set.add(modId);
      else set.delete(modId);
      return [...set];
    });
  }

  async function saveCompanyModules(companyId) {
    const allIds = moduleCatalog.map((c) => c.id);
    if (moduleDraft.length === 0) {
      setError("Mindestens ein Panel-Modul muss aktiv bleiben (oder „Alle“ über Standard).");
      return;
    }
    setSavingModulesId(companyId);
    setError("");
    const body =
      moduleDraft.length >= allIds.length ? { panel_modules: null } : { panel_modules: moduleDraft };
    try {
      const res = await fetch(`${COMPANIES_URL}/${companyId}/panel-modules`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.item) {
        throw new Error(`HTTP ${res.status}`);
      }
      setItems((prev) => prev.map((row) => (row.id === companyId ? data.item : row)));
      setEditingModulesFor(null);
    } catch (err) {
      console.error("panel-modules update:", err);
      setError("Panel-Module konnten nicht gespeichert werden.");
    } finally {
      setSavingModulesId(null);
    }
  }

  async function updateCompanyPriority(companyId, patch) {
    setSavingId(companyId);
    setError("");

    try {
      const res = await fetch(`${COMPANIES_URL}/${companyId}/priority`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
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
    } catch {
      setError("Die Prioritätseinstellungen konnten nicht gespeichert werden.");
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
        item.contact_name,
        item.email,
        item.phone,
        item.city,
        item.postal_code,
        item.country,
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
    return <div className="admin-info-banner">Unternehmen werden geladen …</div>;
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
          <div className="admin-stat-label">Mit Priorität</div>
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
              placeholder="Name, E-Mail, Telefon, Kennung …"
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
            <label className="admin-field-label">Priorität</label>
            <select
              className="admin-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="yes">Mit Priorität</option>
              <option value="no">Ohne Priorität</option>
            </select>
          </div>

          <div className="admin-filter-item">
            <label className="admin-field-label">&nbsp;</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="admin-btn-refresh" onClick={openCreateCompany}>
                + Neues Unternehmen
              </button>
              <button type="button" className="admin-page-btn" onClick={loadCompanies}>
                Neu laden
              </button>
            </div>
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
          <div className="admin-info-banner">Keine Unternehmen gefunden.</div>
        ) : (
          paginatedItems.map((item) => {
            const isSaving = savingId === item.id;

            return (
              <div key={item.id} className="admin-entity-card">
                <div className="admin-entity-card__top">
                  <div>
                    <div className="admin-entity-card__title">{item.name}</div>
                    <div className="admin-entity-card__meta">
                      Kennung {item.id}
                      {item.contact_name ? ` · ${item.contact_name}` : ""} · {item.email || "keine E-Mail"} ·{" "}
                      {item.phone || "kein Telefon"}
                      {item.city || item.postal_code
                        ? ` · ${[item.postal_code, item.city].filter(Boolean).join(" ")}`
                        : ""}
                    </div>
                  </div>

                  <div className="admin-badge-row">
                    <span className={companyStatusBadgeClass(item.is_active)}>
                      {item.is_active ? "Aktiv" : "Inaktiv"}
                    </span>

                    <span
                      className={companyPrioBadgeClass(item.is_priority_company)}
                    >
                      {item.is_priority_company ? "Priorität aktiv" : "Ohne Priorität"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <button type="button" className="admin-btn-refresh" onClick={() => openEditCompany(item)}>
                    Stammdaten bearbeiten
                  </button>
                  <button
                    type="button"
                    className="admin-page-btn"
                    disabled={savingId === item.id}
                    onClick={() => void toggleCompanyActive(item)}
                  >
                    {item.is_active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>

                <div className="admin-controls-grid">
                  <label className="admin-switch-row">
                    <span className="admin-switch-row__label">Priorität aktiv</span>
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
                    <span className="admin-switch-row__label">Sofortfahrten priorisieren</span>
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
                    <span className="admin-switch-row__label">Reservierungen priorisieren</span>
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

                {isSaving ? <div className="admin-saving-hint">Speichert …</div> : null}

                {moduleCatalog.length > 0 ? (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--onroda-border-subtle, #e5e7eb)" }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Partner-Portal</div>
                    <p className="admin-entity-card__meta" style={{ marginBottom: 10 }}>
                      Legt fest, welche Bereiche dieses Unternehmen im Partner-Portal unter panel.onroda.de sieht. Ohne
                      Auswahl sind alle Bereiche aktiv.
                    </p>
                    {editingModulesFor === item.id ? (
                      <>
                        <div className="admin-controls-grid" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {moduleCatalog.map((mod) => (
                            <label key={mod.id} className="admin-switch-row" style={{ alignItems: "flex-start" }}>
                              <span className="admin-switch-row__label" style={{ flex: 1 }}>
                                <strong>{mod.label}</strong>
                                <span style={{ display: "block", fontWeight: 400, fontSize: 12, opacity: 0.85 }}>
                                  {mod.description}
                                </span>
                                {mod.productIntent ? (
                                  <span
                                    style={{
                                      display: "block",
                                      fontWeight: 400,
                                      fontSize: 11,
                                      opacity: 0.78,
                                      marginTop: 6,
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {mod.productIntent}
                                  </span>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={moduleDraft.includes(mod.id)}
                                disabled={savingModulesId === item.id}
                                onChange={(e) => toggleModuleDraft(mod.id, e.target.checked)}
                              />
                            </label>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="admin-btn-refresh"
                            disabled={savingModulesId === item.id}
                            onClick={() => void saveCompanyModules(item.id)}
                          >
                            {savingModulesId === item.id ? "Speichert …" : "Module speichern"}
                          </button>
                          <button
                            type="button"
                            className="admin-page-btn"
                            disabled={savingModulesId === item.id}
                            onClick={() => setEditingModulesFor(null)}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="admin-entity-card__meta">
                        Aktuell:{" "}
                        {item.panel_modules == null
                          ? "alle Bereiche aktiv"
                          : `${item.panel_modules.length} von ${moduleCatalog.length} Bereichen`}
                        {" · "}
                        <button type="button" className="admin-btn-refresh" onClick={() => startEditModules(item)}>
                          Module bearbeiten
                        </button>
                      </p>
                    )}
                  </div>
                ) : null}
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

      {showCreateModal ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeCompanyModals}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-company-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="admin-company-create-title" className="admin-modal__title">
                Neues Unternehmen
              </h2>
              <button type="button" className="admin-modal__close" onClick={closeCompanyModals} aria-label="Schließen">
                ×
              </button>
            </div>
            <form className="admin-modal__body" onSubmit={saveCreateCompany}>
              {formModalError ? <div className="admin-error-banner">{formModalError}</div> : null}
              <CompanyFormBody form={companyForm} setForm={setCompanyForm} />
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="submit" className="admin-btn-refresh" disabled={formModalSaving}>
                  {formModalSaving ? "Speichert …" : "Anlegen"}
                </button>
                <button type="button" className="admin-page-btn" onClick={closeCompanyModals} disabled={formModalSaving}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeCompanyModals}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-company-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="admin-company-edit-title" className="admin-modal__title">
                Unternehmen bearbeiten
              </h2>
              <button type="button" className="admin-modal__close" onClick={closeCompanyModals} aria-label="Schließen">
                ×
              </button>
            </div>
            <form className="admin-modal__body" onSubmit={saveEditCompany}>
              {formModalError ? <div className="admin-error-banner">{formModalError}</div> : null}
              <CompanyFormBody form={companyForm} setForm={setCompanyForm} />
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="submit" className="admin-btn-refresh" disabled={formModalSaving}>
                  {formModalSaving ? "Speichert …" : "Speichern"}
                </button>
                <button type="button" className="admin-page-btn" onClick={closeCompanyModals} disabled={formModalSaving}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompanyFormBody({ form, setForm }) {
  const ch = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const chk = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.checked }));
  return (
    <div className="admin-fields-grid">
      <div className="admin-filter-item">
        <label className="admin-field-label">Name *</label>
        <input className="admin-input" value={form.name} onChange={ch("name")} required />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Ansprechpartner</label>
        <input className="admin-input" value={form.contact_name} onChange={ch("contact_name")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">E-Mail</label>
        <input className="admin-input" type="email" value={form.email} onChange={ch("email")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Telefon</label>
        <input className="admin-input" value={form.phone} onChange={ch("phone")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Adresse Zeile 1</label>
        <input className="admin-input" value={form.address_line1} onChange={ch("address_line1")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Adresse Zeile 2</label>
        <input className="admin-input" value={form.address_line2} onChange={ch("address_line2")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">PLZ</label>
        <input className="admin-input" value={form.postal_code} onChange={ch("postal_code")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Ort</label>
        <input className="admin-input" value={form.city} onChange={ch("city")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Land</label>
        <input className="admin-input" value={form.country} onChange={ch("country")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">USt-IdNr.</label>
        <input className="admin-input" value={form.vat_id} onChange={ch("vat_id")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Preisgrenze Priorität (€)</label>
        <input className="admin-input" value={form.priority_price_threshold} onChange={ch("priority_price_threshold")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Timeout (Sek.)</label>
        <input className="admin-input" value={form.priority_timeout_seconds} onChange={ch("priority_timeout_seconds")} />
      </div>
      <div className="admin-filter-item">
        <label className="admin-field-label">Freigabe-Radius km</label>
        <input className="admin-input" value={form.release_radius_km} onChange={ch("release_radius_km")} />
      </div>
      <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
        <span className="admin-switch-row__label">Aktiv (Panel-Login erlaubt)</span>
        <input type="checkbox" checked={form.is_active} onChange={chk("is_active")} />
      </label>
      <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
        <span className="admin-switch-row__label">PRIO-Unternehmen</span>
        <input type="checkbox" checked={form.is_priority_company} onChange={chk("is_priority_company")} />
      </label>
      <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
        <span className="admin-switch-row__label">Sofortfahrten priorisieren</span>
        <input type="checkbox" checked={form.priority_for_live_rides} onChange={chk("priority_for_live_rides")} />
      </label>
      <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
        <span className="admin-switch-row__label">Reservierungen priorisieren</span>
        <input type="checkbox" checked={form.priority_for_reservations} onChange={chk("priority_for_reservations")} />
      </label>
    </div>
  );
}
