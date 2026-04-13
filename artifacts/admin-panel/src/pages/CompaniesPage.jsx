import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PanelModuleIcon } from "../components/PanelModuleIcons.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
const AZ_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function firstLetterKey(name) {
  const s = (name ?? "").trim();
  if (!s) return "#";
  const c = s.charAt(0);
  if (/[a-zA-ZäöüÄÖÜ]/.test(c)) return c.toLocaleUpperCase("de-DE");
  return "#";
}
const ITEMS_PER_PAGE = 10;
const COMPANY_DASHBOARD_URL = "https://panel.onroda.de/";

function emptyCompanyForm() {
  return {
    company_type: "service_provider",
    company_kind: "general",
    tax_id: "",
    concession_number: "",
    customer_category: "hotel",
    patient_data_required: false,
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
    company_type: "service_provider",
    company_kind: item.company_kind === "taxi" ? "taxi" : "general",
    tax_id: item.tax_id ?? "",
    concession_number: item.concession_number ?? "",
    customer_category: "hotel",
    patient_data_required: false,
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
  const [kpisByCompany, setKpisByCompany] = useState({});
  const [loadingKpis, setLoadingKpis] = useState({});

  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [letterFilter, setLetterFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);

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
      company_kind: companyForm.company_kind === "taxi" ? "taxi" : "general",
      tax_id: companyForm.tax_id.trim(),
      concession_number: companyForm.concession_number.trim(),
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
      const created = data.item;
      const moduleSet = new Set(moduleCatalog.map((m) => m.id));
      let modulePreset = null;
      if (companyForm.company_type === "client") {
        modulePreset = ["overview", "rides_create", "rides_list", "billing", "access_codes"];
        if (companyForm.customer_category === "hotel") modulePreset.push("hotel_mode");
        if (companyForm.customer_category === "insurance") {
          modulePreset.push("recurring", "medical-round");
        }
      }
      if (Array.isArray(modulePreset) && modulePreset.length > 0) {
        const normalized = [...new Set(modulePreset.filter((id) => moduleSet.has(id)))];
        await fetch(`${COMPANIES_URL}/${encodeURIComponent(created.id)}/panel-modules`, {
          method: "PATCH",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ panel_modules: normalized }),
        }).catch(() => null);
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

  function formatMoneyEUR(n) {
    const value = Number(n ?? 0);
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
      Number.isFinite(value) ? value : 0,
    );
  }

  function voucherLimitLabel(v) {
    if (v == null) return "—";
    if (!Number.isFinite(v)) return "—";
    return v === 0 ? "0" : String(v);
  }

  function openCompanyDashboard(item) {
    const target = `${COMPANY_DASHBOARD_URL}?company=${encodeURIComponent(item.id)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      let matchesList = true;
      if (listFilter === "active") matchesList = !!item.is_active;
      else if (listFilter === "inactive") matchesList = !item.is_active;
      else if (listFilter === "priority") matchesList = !!item.is_priority_company;

      if (letterFilter != null) {
        if (firstLetterKey(item.name) !== letterFilter) return false;
      }

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

      return matchesList && matchesSearch;
    });
  }, [items, search, listFilter, letterFilter]);

  const sortedFilteredItems = useMemo(
    () =>
      [...filteredItems].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" }),
      ),
    [filteredItems],
  );

  const totalPages = Math.max(1, Math.ceil(sortedFilteredItems.length / ITEMS_PER_PAGE));

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedFilteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedFilteredItems, page]);

  useEffect(() => {
    setPage(1);
  }, [search, listFilter, letterFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (paginatedItems.length === 0) return;
    const ids = paginatedItems.map((x) => x.id).filter((id) => !kpisByCompany[id] && !loadingKpis[id]);
    if (ids.length === 0) return;
    ids.forEach((id) => {
      setLoadingKpis((prev) => ({ ...prev, [id]: true }));
      void (async () => {
        try {
          const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(id)}/kpis`, { headers: adminApiHeaders() });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.ok && data?.kpis) {
            setKpisByCompany((prev) => ({ ...prev, [id]: data.kpis }));
          }
        } finally {
          setLoadingKpis((prev) => ({ ...prev, [id]: false }));
        }
      })();
    });
  }, [paginatedItems, kpisByCompany, loadingKpis]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((i) => i.is_active).length,
      inactive: items.filter((i) => !i.is_active).length,
      priority: items.filter((i) => i.is_priority_company).length,
    };
  }, [items]);

  const companyListFilterOptions = useMemo(() => {
    const rest = [
      { value: "active", label: "Nur aktive" },
      { value: "inactive", label: "Nur deaktivierte" },
      { value: "priority", label: "Hohe Priorität" },
    ].sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
    return [{ value: "all", label: "Alle Unternehmen" }, ...rest];
  }, []);

  const moduleCatalogAz = useMemo(
    () =>
      [...moduleCatalog].sort((a, b) =>
        (a.label || "").localeCompare(b.label || "", "de", { sensitivity: "base" }),
      ),
    [moduleCatalog],
  );

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
          <div className="admin-stat-value admin-crisp-numeric">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Inaktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.inactive}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Mit Priorität</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.priority}</div>
        </div>
      </div>

      <div className="admin-companies-sticky-head">
        <div className="admin-filter-card admin-filter-card--flush">
          <div className="admin-filter-grid admin-filter-grid--companies">
            <div className="admin-filter-item">
              <label className="admin-field-label">Suche</label>
              <input
                type="search"
                className="admin-input"
                placeholder="Firmenname, Kennung, E-Mail …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Ansicht</label>
              <select
                className="admin-select"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
              >
                {companyListFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">&nbsp;</label>
              <div className="admin-filter-actions">
                <button type="button" className="admin-btn-refresh" onClick={openCreateCompany}>
                  + Neues Unternehmen
                </button>
                <button type="button" className="admin-page-btn" onClick={loadCompanies}>
                  Neu laden
                </button>
              </div>
            </div>
          </div>
          <div className="admin-az-bar" role="toolbar" aria-label="Schnellwahl A–Z">
            <button
              type="button"
              className={`admin-az-btn${letterFilter === null ? " admin-az-btn--active" : ""}`}
              onClick={() => setLetterFilter(null)}
            >
              Alle
            </button>
            {AZ_LETTERS.map((L) => (
              <button
                key={L}
                type="button"
                className={`admin-az-btn${letterFilter === L ? " admin-az-btn--active" : ""}`}
                onClick={() => setLetterFilter((prev) => (prev === L ? null : L))}
              >
                {L}
              </button>
            ))}
            <button
              type="button"
              className={`admin-az-btn${letterFilter === "#" ? " admin-az-btn--active" : ""}`}
              onClick={() => setLetterFilter((prev) => (prev === "#" ? null : "#"))}
              title="Sonstige Anfangsbuchstaben"
            >
              #
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          Zeige {(page - 1) * ITEMS_PER_PAGE + 1}
          {" - "}
          {Math.min(page * ITEMS_PER_PAGE, sortedFilteredItems.length)}
          {" von "}
          {sortedFilteredItems.length}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      <div className="admin-companies-table-wrap">
        {paginatedItems.length === 0 ? (
          <div className="admin-info-banner">Keine Unternehmen gefunden.</div>
        ) : (
          <table className="admin-companies-table">
            <caption className="admin-companies-table__caption">
              Mandanten — tabellarische Übersicht; Details für Priorität und Partner-Module ausklappbar.
            </caption>
            <thead>
              <tr>
                <th scope="col">Unternehmen</th>
                <th scope="col">Status</th>
                <th scope="col" className="admin-companies-table__num">
                  Monat €
                </th>
                <th scope="col" className="admin-companies-table__num">
                  Offen
                </th>
                <th scope="col" className="admin-companies-table__num">
                  Limit
                </th>
                <th scope="col">Portal</th>
                <th scope="col" className="admin-companies-table__actions">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const isSaving = savingId === item.id;
                const open = expandedCompanyId === item.id;
                const portalLabel =
                  item.panel_modules == null
                    ? "Alle"
                    : `${item.panel_modules.length}/${moduleCatalog.length}`;

                return (
                  <Fragment key={item.id}>
                    <tr className={open ? "admin-companies-table__row admin-companies-table__row--open" : "admin-companies-table__row"}>
                      <td>
                        <div className="admin-companies-table__name">{item.name}</div>
                        <div className="admin-companies-table__id" title={item.id}>
                          {item.id}
                        </div>
                        <div className="admin-companies-table__sub">
                          {[item.contact_name, item.email, item.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td>
                        <div className="admin-companies-table__pills">
                          <span className={`admin-pill${item.is_active ? " admin-pill--success" : " admin-pill--muted"}`}>
                            {item.is_active ? "Aktiv" : "Inaktiv"}
                          </span>
                          <span
                            className={`admin-pill${item.is_priority_company ? " admin-pill--warn" : " admin-pill--muted"}`}
                          >
                            {item.is_priority_company ? "Prio" : "Std"}
                          </span>
                        </div>
                        <div className="admin-companies-table__prio-mini admin-table-sub">
                          Prio {item.is_priority_company ? "ja" : "nein"} · SF {item.priority_for_live_rides ? "ja" : "nein"} · Res{" "}
                          {item.priority_for_reservations ? "ja" : "nein"}
                        </div>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : formatMoneyEUR(kpisByCompany[item.id]?.monthlyRevenue ?? 0)}
                        </span>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : Number(kpisByCompany[item.id]?.openRides ?? 0)}
                        </span>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : voucherLimitLabel(kpisByCompany[item.id]?.voucherLimitAvailable)}
                        </span>
                      </td>
                      <td>
                        <span className="admin-companies-table__portal-label">{portalLabel}</span>
                        <div className="admin-table-sub">Module</div>
                      </td>
                      <td className="admin-companies-table__actions">
                        <div className="admin-companies-table__action-btns">
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-outline--compact"
                            onClick={() => openCompanyDashboard(item)}
                          >
                            Panel
                          </button>
                          <button type="button" className="admin-btn-outline admin-btn-outline--compact" onClick={() => openEditCompany(item)}>
                            Stammdaten
                          </button>
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-outline--compact"
                            disabled={isSaving}
                            onClick={() => void toggleCompanyActive(item)}
                          >
                            {item.is_active ? "Aus" : "An"}
                          </button>
                          <button
                            type="button"
                            className={
                              "admin-page-btn admin-page-btn--compact" +
                              (open ? " admin-page-btn--active" : "")
                            }
                            onClick={() => {
                              setExpandedCompanyId((prev) => {
                                if (prev === item.id) {
                                  setEditingModulesFor(null);
                                  return null;
                                }
                                setEditingModulesFor(null);
                                return item.id;
                              });
                            }}
                            aria-expanded={open}
                          >
                            {open ? "Zu" : "Details"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="admin-companies-table__detail">
                        <td colSpan={7}>
                          <div className="admin-companies-expand">
                            <div className="admin-company-prio-toggles admin-company-prio-toggles--table">
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Priorität aktiv</div>
                                  <div className="admin-company-toggle-hint">Matching bevorzugt dieses Unternehmen.</div>
                                </div>
                                <label className="admin-switch">
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
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Sofortfahrten priorisieren</div>
                                  <div className="admin-company-toggle-hint">Sofortfahrten bevorzugt vermitteln.</div>
                                </div>
                                <label className="admin-switch">
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
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Reservierungen priorisieren</div>
                                  <div className="admin-company-toggle-hint">Terminfahrten in der Vorplanung bevorzugen.</div>
                                </div>
                                <label className="admin-switch">
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
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                            </div>

                            <div className="admin-companies-expand__meta">
                              <span>
                                Ab Preis <strong className="admin-crisp-numeric">{item.priority_price_threshold} €</strong>
                              </span>
                              <span>
                                Timeout <strong className="admin-crisp-numeric">{item.priority_timeout_seconds}s</strong>
                              </span>
                              <span>
                                Radius <strong className="admin-crisp-numeric">{item.release_radius_km} km</strong>
                              </span>
                            </div>

                            {isSaving ? <div className="admin-saving-hint">Speichert …</div> : null}

                            {moduleCatalog.length > 0 ? (
                              <div className="admin-company-portal admin-company-portal--table">
                                <div className="admin-company-portal__title">Partner-Portal (panel.onroda.de)</div>
                                <p className="admin-entity-card__meta admin-company-portal__meta">
                                  Ohne Auswahl sind alle Bereiche aktiv. Änderungen gelten für diesen Mandanten.
                                </p>
                                {editingModulesFor === item.id ? (
                                  <>
                                    <div className="admin-module-grid admin-module-grid--dense">
                                      {moduleCatalogAz.map((mod) => {
                                        const on = moduleDraft.includes(mod.id);
                                        return (
                                          <button
                                            key={mod.id}
                                            type="button"
                                            className={`admin-module-tile${on ? " admin-module-tile--on" : ""}`}
                                            title={mod.description}
                                            disabled={savingModulesId === item.id}
                                            onClick={() => toggleModuleDraft(mod.id, !on)}
                                          >
                                            <span className="admin-module-tile__icon" aria-hidden>
                                              <PanelModuleIcon moduleId={mod.id} />
                                            </span>
                                            <span className="admin-module-tile__text">
                                              <span className="admin-module-tile__label">{mod.label}</span>
                                              <span className="admin-module-tile__desc">{on ? "An" : "Aus"}</span>
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="admin-company-module-actions">
                                      <button
                                        type="button"
                                        className="admin-btn-refresh admin-btn-refresh--compact"
                                        disabled={savingModulesId === item.id}
                                        onClick={() => void saveCompanyModules(item.id)}
                                      >
                                        {savingModulesId === item.id ? "Speichert …" : "Module speichern"}
                                      </button>
                                      <button
                                        type="button"
                                        className="admin-page-btn admin-page-btn--compact"
                                        disabled={savingModulesId === item.id}
                                        onClick={() => setEditingModulesFor(null)}
                                      >
                                        Abbrechen
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div>
                                    <div className="admin-module-grid admin-module-grid--readonly admin-module-grid--dense">
                                      {(item.panel_modules == null
                                        ? moduleCatalogAz
                                        : moduleCatalogAz.filter((m) => item.panel_modules.includes(m.id))
                                      ).map((m) => (
                                        <div
                                          key={m.id}
                                          className="admin-module-tile admin-module-tile--on admin-module-tile--static"
                                          title={m.description}
                                        >
                                          <span className="admin-module-tile__icon" aria-hidden>
                                            <PanelModuleIcon moduleId={m.id} />
                                          </span>
                                          <span className="admin-module-tile__text">
                                            <span className="admin-module-tile__label">{m.label}</span>
                                            <span className="admin-module-tile__desc">An</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      className="admin-btn-refresh admin-btn-refresh--compact"
                                      onClick={() => startEditModules(item)}
                                    >
                                      Module bearbeiten
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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
              <CompanyFormBody form={companyForm} setForm={setCompanyForm} moduleCatalog={moduleCatalog} mode="create" />
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
              <CompanyFormBody form={companyForm} setForm={setCompanyForm} moduleCatalog={moduleCatalog} mode="edit" />
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

function CompanyFormBody({ form, setForm, moduleCatalog = [], mode = "create" }) {
  const ch = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const chk = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.checked }));
  const isClient = form.company_type === "client";
  const supportsHotelModule = moduleCatalog.some((m) => m.id === "hotel_mode");

  function onTypeChange(nextType) {
    setForm((p) => ({
      ...p,
      company_type: nextType,
      ...(nextType === "client" ? { is_priority_company: false, priority_for_live_rides: false, priority_for_reservations: false } : {}),
    }));
  }

  return (
    <div className="admin-fields-grid">
      <div className="admin-filter-item" style={{ gridColumn: "1 / -1" }}>
        <label className="admin-field-label">Typ</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label className="admin-switch-row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="companyType"
              checked={form.company_type === "service_provider"}
              onChange={() => onTypeChange("service_provider")}
            />
            <span className="admin-switch-row__label">Service-Erbringer (Taxi)</span>
          </label>
          <label className="admin-switch-row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="companyType"
              checked={form.company_type === "client"}
              onChange={() => onTypeChange("client")}
            />
            <span className="admin-switch-row__label">Auftraggeber (B2B/Gutschein)</span>
          </label>
        </div>
      </div>
      <div className="admin-filter-item" style={{ gridColumn: "1 / -1" }}>
        <label className="admin-field-label">Mandanten-Art (Plattform)</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label className="admin-switch-row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="companyKind"
              checked={form.company_kind === "general"}
              onChange={() => setForm((p) => ({ ...p, company_kind: "general" }))}
            />
            <span className="admin-switch-row__label">Allgemein</span>
          </label>
          <label className="admin-switch-row" style={{ gap: 8 }}>
            <input
              type="radio"
              name="companyKind"
              checked={form.company_kind === "taxi"}
              onChange={() => setForm((p) => ({ ...p, company_kind: "taxi" }))}
            />
            <span className="admin-switch-row__label">Taxi-Unternehmer (Flotte / Fahrer-Logins)</span>
          </label>
        </div>
      </div>
      {form.company_kind === "taxi" ? (
        <div className="admin-filter-item">
          <label className="admin-field-label">Steuer-ID</label>
          <input className="admin-input" value={form.tax_id} onChange={ch("tax_id")} />
        </div>
      ) : null}
      {form.company_kind === "taxi" ? (
        <div className="admin-filter-item">
          <label className="admin-field-label">Konzessionsnummer</label>
          <input className="admin-input" value={form.concession_number} onChange={ch("concession_number")} />
        </div>
      ) : null}
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
      {isClient ? (
        <>
          <div className="admin-filter-item">
            <label className="admin-field-label">Kunden-Kategorie</label>
            <select className="admin-select" value={form.customer_category} onChange={ch("customer_category")}>
              <option value="hotel">Hotel</option>
              <option value="insurance">Krankenkasse</option>
              <option value="company">Firma</option>
            </select>
          </div>
          {form.customer_category === "hotel" ? (
            <div className="admin-filter-item" style={{ gridColumn: "1 / -1" }}>
              <div className="admin-info-banner">
                Hotel gewählt: Modul „Hotelmodus / Zimmernummer-Erfassung“ wird nach dem Anlegen automatisch aktiviert.
                {supportsHotelModule ? "" : " (Modul-Katalog derzeit nicht verfügbar)."}
              </div>
            </div>
          ) : null}
          {form.customer_category === "insurance" ? (
            <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
              <span className="admin-switch-row__label">
                Patientendaten-Vorgaben aktivieren
                <span className="admin-entity-card__meta" style={{ display: "block" }}>
                  Hinweis für Team: Patientenreferenz und medizinische Angaben bei Buchung verpflichtend erfassen.
                </span>
              </span>
              <input type="checkbox" checked={!!form.patient_data_required} onChange={chk("patient_data_required")} />
            </label>
          ) : null}
        </>
      ) : (
        <>
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
        </>
      )}
      <label className="admin-switch-row" style={{ gridColumn: "1 / -1" }}>
        <span className="admin-switch-row__label">Aktiv (Panel-Login erlaubt)</span>
        <input type="checkbox" checked={form.is_active} onChange={chk("is_active")} />
      </label>
      {isClient ? null : (
        <>
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
        </>
      )}
      {mode === "create" && isClient ? (
        <div className="admin-entity-card__meta" style={{ gridColumn: "1 / -1" }}>
          Für Auftraggeber blenden wir Technikfelder (Preisgrenze, Timeout, Radius) aus — Fokus auf Name, Adresse und
          Abrechnungsart.
        </div>
      ) : null}
    </div>
  );
}
