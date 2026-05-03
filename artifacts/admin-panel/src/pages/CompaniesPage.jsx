import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import CompanyWorkspaceForm from "../components/CompanyWorkspaceForm.jsx";
import CompanyMandateDetailPage from "./CompanyMandateDetailPage.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { matchesCompanyKindListTab } from "../utils/panelModulesByCompanyKind.js";

const KIND_COLORS = {
  taxi: { bg: "#eff6ff", border: "#93c5fd", text: "#1e3a8a", label: "Taxi" },
  hotel: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490", label: "Hotel" },
  insurer: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Krankenkasse" },
  medical: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Krankenkasse" },
  general: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155", label: "Sonstige" },
};

const VERIFY_BADGE = {
  pending: { label: "Verifizierung: ausstehend", short: "Ausstehend", cl: "admin-c-badge admin-c-badge--neutral" },
  in_review: { label: "Verifizierung: in Prüfung", short: "In Prüfung", cl: "admin-c-badge admin-c-badge--info" },
  verified: { label: "Verifizierung: bestätigt", short: "Verifiziert", cl: "admin-c-badge admin-c-badge--ok" },
  rejected: { label: "Verifizierung: abgelehnt", short: "Abgelehnt", cl: "admin-c-badge admin-c-badge--err" },
};

const COMPL_BADGE = {
  pending: { label: "Compliance: offen", short: "Offen", cl: "admin-c-badge admin-c-badge--neutral" },
  in_review: { label: "Compliance: in Prüfung", short: "In Prüfung", cl: "admin-c-badge admin-c-badge--info" },
  compliant: { label: "Compliance: erfüllt", short: "Erfüllt", cl: "admin-c-badge admin-c-badge--ok" },
  non_compliant: { label: "Compliance: nicht erfüllt", short: "Nicht erfüllt", cl: "admin-c-badge admin-c-badge--err" },
};

const CONTRACT_BADGE = {
  inactive: { label: "Vertrag: inaktiv", short: "Inaktiv", cl: "admin-c-badge admin-c-badge--neutral" },
  active: { label: "Vertrag: aktiv", short: "Aktiv", cl: "admin-c-badge admin-c-badge--ok" },
  suspended: { label: "Vertrag: ausgesetzt", short: "Ausgesetzt", cl: "admin-c-badge admin-c-badge--warn" },
  terminated: { label: "Vertrag: beendet", short: "Beendet", cl: "admin-c-badge admin-c-badge--err" },
};

const CONTRACT_ORDER = { active: 0, suspended: 1, terminated: 2, inactive: 3 };
const VERIF_ORDER = { pending: 0, in_review: 1, verified: 2, rejected: 3 };
const COMPL_ORDER = { pending: 0, in_review: 1, non_compliant: 2, compliant: 3 };

const INITIAL_EXTRA = {
  active: false,
  blocked: false,
  contractOn: false,
  contractOff: false,
  verifOpen: false,
  verifOk: false,
  complOpen: false,
  complOk: false,
};

function kindLabelForItem(item) {
  const c = item.company_kind || "general";
  return (KIND_COLORS[c] || KIND_COLORS.general).label;
}

function getLastChangeMs(item) {
  const raw = item.updatedAt ?? item.updated_at;
  if (raw == null) return null;
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? null : ms;
}

function getSortableVal(item, sortKey) {
  const name = (item.name || "").toLowerCase();
  const city = (item.city || "").toLowerCase();
  const kind = item.company_kind || "";
  const contract = item.contract_status || "inactive";
  const ver = item.verification_status || "pending";
  const compl = item.compliance_status || "pending";
  const iban = (item.bank_iban && String(item.bank_iban)) || "";
  const statusBundle = [ver, compl, contract].join("\t");

  switch (sortKey) {
    case "name":
      return { primary: name, secondary: item.id || "" };
    case "city":
      return { primary: city, secondary: name };
    case "kind":
      return { primary: kind, secondary: name };
    case "contract":
      return { primary: CONTRACT_ORDER[contract] ?? 9, secondary: name };
    case "verif":
      return { primary: VERIF_ORDER[ver] ?? 9, secondary: name };
    case "compliance":
      return { primary: COMPL_ORDER[compl] ?? 9, secondary: name };
    case "statusBundle":
      return { primary: statusBundle, secondary: name };
    case "lastChange": {
      const t = getLastChangeMs(item);
      if (t != null) return { primary: t, secondary: item.id || name };
      return { primary: 0, secondary: item.id || name };
    }
    case "iban":
      return { primary: iban.toLowerCase(), secondary: name };
    default:
      return { primary: name, secondary: item.id || "" };
  }
}

function companyMatchesSearch(item, q) {
  if (!q || !String(q).trim()) return true;
  const s = String(q).trim().toLowerCase();
  const phoneBits = [item.phone, item.dispo_phone, item.support_email]
    .map((x) => (x == null ? "" : String(x).toLowerCase()));
  const hay = [
    item.name,
    item.city,
    item.email,
    item.contact_name,
    ...phoneBits,
  ]
    .map((x) => (x == null ? "" : String(x).toLowerCase()))
    .join(" ");
  return hay.includes(s);
}

function applyExtraFilters(item, f) {
  if (f.active && !item.is_active) return false;
  if (f.blocked && !item.is_blocked) return false;
  if (f.contractOn && item.contract_status !== "active") return false;
  if (f.contractOff && item.contract_status === "active") return false;
  const v = item.verification_status || "pending";
  if (f.verifOpen && !["pending", "in_review"].includes(v)) return false;
  if (f.verifOk && v !== "verified") return false;
  const c = item.compliance_status || "pending";
  if (f.complOpen && !["pending", "in_review", "non_compliant"].includes(c)) return false;
  if (f.complOk && c !== "compliant") return false;
  return true;
}

function hasExtraFiltersOn(f) {
  return Object.values(f).some(Boolean);
}

function StatusBadgeGroup({ v, c, t }) {
  const vb = VERIFY_BADGE[v] || VERIFY_BADGE.pending;
  const cb = COMPL_BADGE[c] || COMPL_BADGE.pending;
  const kb = CONTRACT_BADGE[t] || CONTRACT_BADGE.inactive;
  return (
    <div className="admin-c-statuscol" role="group" aria-label="Status">
      <span className={vb.cl} title={vb.label}>
        {vb.short}
      </span>
      <span className={cb.cl} title={cb.label}>
        {cb.short}
      </span>
      <span className={kb.cl} title={kb.label}>
        {kb.short}
      </span>
    </div>
  );
}

const SORT_PRESETS = [
  { v: "name+asc", label: "Firmenname A–Z" },
  { v: "name+desc", label: "Firmenname Z–A" },
  { v: "city+asc", label: "Ort A–Z" },
  { v: "city+desc", label: "Ort Z–A" },
  { v: "kind+asc", label: "Unternehmensart (A–Z)" },
  { v: "kind+desc", label: "Unternehmensart (Z–A)" },
  { v: "contract+asc", label: "Vertrag: aktiv zuerst" },
  { v: "contract+desc", label: "Vertrag: inaktiv / übrige zuerst" },
  { v: "verif+asc", label: "Verifizierung: ausstehend zuerst" },
  { v: "verif+desc", label: "Verifizierung: bestätigt zuerst" },
  { v: "compliance+asc", label: "Compliance: offen zuerst" },
  { v: "compliance+desc", label: "Compliance: erfüllt zuerst" },
  { v: "statusBundle+asc", label: "Status: kombiniert (aufsteigend)" },
  { v: "statusBundle+desc", label: "Status: kombiniert (absteigend)" },
  { v: "lastChange+desc", label: "Letzte Änderung (neu zuerst, sonst ID)" },
  { v: "lastChange+asc", label: "Letzte Änderung (alt zuerst, sonst ID)" },
  { v: "iban+asc", label: "IBAN A–Z" },
  { v: "iban+desc", label: "IBAN Z–A" },
];

const KIND_TABS = [
  { k: "all", label: "Alle" },
  { k: "taxi", label: "Taxi" },
  { k: "hotel", label: "Hotel" },
  { k: "insurer", label: "Krankenkasse" },
  { k: "other", label: "Sonstige" },
];

const EXTRA_CHIPS = [
  { k: "active", label: "Aktiv" },
  { k: "blocked", label: "Gesperrt" },
  { k: "contractOn", label: "Vertrag aktiv" },
  { k: "contractOff", label: "Vertrag inaktiv" },
  { k: "verifOpen", label: "Verif. ausstehend" },
  { k: "verifOk", label: "Verifiziert" },
  { k: "complOpen", label: "Compliance offen" },
  { k: "complOk", label: "Compliance erfüllt" },
];

export default function CompaniesPage({
  initialOpenCompanyId,
  onInitialOpenCompanyConsumed,
  listTab = "all",
  onListTabChange,
  mandateDetailCompanyId = null,
  onOpenMandateDetail,
  onCloseMandateDetail,
  expandWorkspaceCompanyId = null,
  onExpandWorkspaceConsumed,
  onRequestWorkspaceForCompany,
  onNavigateToTaxiFleetDrivers,
  onNavigateToTaxiFleetVehicles,
  onOpenPanelUsersForCompany,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(listTab);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [extra, setExtra] = useState(() => ({ ...INITIAL_EXTRA }));
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const setExtraToggle = (k) => {
    setExtra((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const clearExtra = (k) => {
    setExtra((prev) => ({ ...prev, [k]: false }));
  };

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setExtra({ ...INITIAL_EXTRA });
    setActiveTab("all");
    onListTabChange?.("all");
    setSortKey("name");
    setSortDir("asc");
  }, [onListTabChange]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/admin/companies`, { headers: adminApiHeaders() })
      .then((res) => res.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.items || json.companies || [];
        setItems(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setActiveTab(listTab);
  }, [listTab]);

  useEffect(() => {
    if (expandWorkspaceCompanyId == null || expandWorkspaceCompanyId === "") return;
    setSelectedId(expandWorkspaceCompanyId);
    onExpandWorkspaceConsumed?.();
  }, [expandWorkspaceCompanyId, onExpandWorkspaceConsumed]);

  const setTab = useCallback(
    (t) => {
      setActiveTab(t);
      onListTabChange?.(t);
    },
    [onListTabChange],
  );

  useEffect(() => {
    if (!initialOpenCompanyId || items.length === 0) return;
    const row = items.find((c) => c.id === initialOpenCompanyId);
    if (!row) return;
    setActiveTab("all");
    onListTabChange?.("all");
    onOpenMandateDetail?.(initialOpenCompanyId);
    onInitialOpenCompanyConsumed?.();
  }, [items, initialOpenCompanyId, onInitialOpenCompanyConsumed, onListTabChange, onOpenMandateDetail]);

  const kindFiltered = useMemo(
    () => (items || []).filter((item) => matchesCompanyKindListTab(item, activeTab) && applyExtraFilters(item, extra)),
    [items, activeTab, extra],
  );

  const afterSearch = useMemo(
    () => kindFiltered.filter((item) => companyMatchesSearch(item, searchQuery)),
    [kindFiltered, searchQuery],
  );

  const visibleItems = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const out = [...afterSearch];
    out.sort((a, b) => {
      const A = getSortableVal(a, sortKey);
      const B = getSortableVal(b, sortKey);
      const ap = A.primary;
      const bp = B.primary;
      let cmp = 0;
      if (typeof ap === "number" && typeof bp === "number") cmp = ap < bp ? -1 : ap > bp ? 1 : 0;
      else if (typeof ap === "string" && typeof bp === "string")
        cmp = ap.localeCompare(bp, "de", { sensitivity: "base" });
      else cmp = String(ap).localeCompare(String(bp), "de", { sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
      const as = A.secondary;
      const bs = B.secondary;
      return String(as).localeCompare(String(bs), "de", { sensitivity: "base" }) * dir;
    });
    return out;
  }, [afterSearch, sortKey, sortDir]);

  const hasAnyListFilter = Boolean(searchQuery.trim()) || activeTab !== "all" || hasExtraFiltersOn(extra);
  const hasCustomSort = sortKey !== "name" || sortDir !== "asc";
  const showFilterActions = hasAnyListFilter || hasCustomSort;

  const sortPresetValue = `${sortKey}+${sortDir}`;
  const isPresetKnown = SORT_PRESETS.some((o) => o.v === sortPresetValue);

  const setSortFromColumn = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const onSortPreset = (e) => {
    const v = e.target.value;
    const plus = v.lastIndexOf("+");
    if (plus < 1) return;
    const k = v.slice(0, plus);
    const d = v.slice(plus + 1);
    if (k && (d === "asc" || d === "desc")) {
      setSortKey(k);
      setSortDir(d);
    }
  };

  const sortThProps = (key, extraClass) => {
    const active = sortKey === key;
    const cls = [
      "admin-c-th",
      extraClass,
      "admin-c-th--sortable",
      active ? `admin-c-th--sorted admin-c-th--sorted--${sortDir}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      className: cls,
      "aria-sort": active ? (sortDir === "asc" ? "ascending" : "descending") : "none",
    };
  };

  const onRowClick = (id) => {
    onOpenMandateDetail?.(id);
  };

  const openMandate = (e, id) => {
    e.stopPropagation();
    onOpenMandateDetail?.(id);
  };

  if (mandateDetailCompanyId && onCloseMandateDetail) {
    return (
      <CompanyMandateDetailPage
        companyId={mandateDetailCompanyId}
        onBack={onCloseMandateDetail}
        onRequestFullWorkspace={() => onRequestWorkspaceForCompany?.(mandateDetailCompanyId)}
        onOpenTaxiFleetDrivers={() => onNavigateToTaxiFleetDrivers?.(mandateDetailCompanyId)}
        onOpenTaxiFleetVehicles={() => onNavigateToTaxiFleetVehicles?.(mandateDetailCompanyId)}
        onOpenPanelUsers={
          typeof onOpenPanelUsersForCompany === "function"
            ? () => onOpenPanelUsersForCompany(mandateDetailCompanyId)
            : undefined
        }
      />
    );
  }

  return (
    <div className="admin-companies admin-companies--wide">
      <div className="admin-companies__head">
        <h1 className="admin-companies__title">Mandantenverwaltung</h1>
        <p className="admin-companies__lead">
          <strong>Operativer Mandanten-Stand</strong> — <strong>Zeile oder Firmenname</strong> öffnet die Mandantenzentrale.
          Rechts <strong>Partner-Zugang</strong> öffnet die Partner-Portal-Anlage für genau diesen Mandanten;{" "}
          <strong>Bearbeiten</strong> erweitert Flotte, Kasse und weitere Einstellungen in der Werkstatt.
        </p>
      </div>

      <div className="admin-c-search">
        <div className="admin-c-search__row">
          <div className="admin-c-search__field">
            <label className="admin-c-search__lbl" htmlFor="admin-companies-search">
              Mandanten durchsuchen
            </label>
            <input
              id="admin-companies-search"
              className="admin-c-search__inp"
              type="search"
              autoComplete="off"
              placeholder="Firma, Ansprechpartner, E-Mail, Ort, Telefon …"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery.trim() || hasAnyListFilter ? (
            <div className="admin-c-search__meta" aria-live="polite">
              {visibleItems.length} {visibleItems.length === 1 ? "Treffer" : "Treffer"}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="admin-c-filter-legend" id="companies-type-filter-label">
          Unternehmensart
        </div>
        <div className="admin-companies__chips" role="tablist" aria-labelledby="companies-type-filter-label">
          {KIND_TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={activeTab === t.k}
              className={"admin-c-chip" + (activeTab === t.k ? " admin-c-chip--on" : "")}
              onClick={() => setTab(t.k)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="admin-c-filter-legend">Status & Freigaben</div>
        <div className="admin-companies__chips admin-companies__chips--toggle" aria-label="Zusatzfilter">
          {EXTRA_CHIPS.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              className={"admin-c-fchip" + (extra[k] ? " admin-c-fchip--on" : "")}
              aria-pressed={extra[k]}
              onClick={() => setExtraToggle(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="admin-c-filter-toolbar">
          <div className="admin-c-filter-toolbar__row">
            <label className="admin-c-select-lbl" htmlFor="companies-sort-preset">
              Sortierung
            </label>
            <select
              id="companies-sort-preset"
              className="admin-c-select"
              value={sortPresetValue}
              onChange={onSortPreset}
            >
              {!isPresetKnown ? <option value={sortPresetValue}>Aktuelle Spaltensortierung</option> : null}
              {SORT_PRESETS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="admin-c-hint" title="Nur sinnvoll, sobald die API pro Mandant ein Änderungsdatum liefert.">
              „Letzte Änderung“: Zeitstempel der Liste, sonst Sortierung nach Mandanten-ID.
            </span>
          </div>
          {showFilterActions ? (
            <div className="admin-c-active-filters" aria-label="Aktive Filter und Sortierung">
              {activeTab !== "all" ? (
                <span className="admin-c-pill">
                  {KIND_TABS.find((x) => x.k === activeTab)?.label}
                  <button type="button" className="admin-c-pill__x" onClick={() => setTab("all")} aria-label="Unternehmensart-Filter entfernen">
                    ×
                  </button>
                </span>
              ) : null}
              {Object.entries(extra).map(
                ([k, on]) =>
                  on && (
                    <span key={k} className="admin-c-pill">
                      {EXTRA_CHIPS.find((c) => c.k === k)?.label}
                      <button type="button" className="admin-c-pill__x" onClick={() => clearExtra(k)} aria-label={`${k} entfernen`}>
                        ×
                      </button>
                    </span>
                  ),
              )}
              {searchQuery.trim() ? (
                <span className="admin-c-pill">
                  Suche: &quot;{searchQuery.trim()}&quot;
                  <button type="button" className="admin-c-pill__x" onClick={() => setSearchQuery("")} aria-label="Suche leeren">
                    ×
                  </button>
                </span>
              ) : null}
              {hasCustomSort ? (
                <span className="admin-c-pill admin-c-pill--subtle">
                  Sortierung: {SORT_PRESETS.find((o) => o.v === sortPresetValue)?.label ?? sortPresetValue}
                </span>
              ) : null}
              <button type="button" className="admin-c-btn-sec" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {loading && items.length === 0 ? <p className="admin-c-muted">Lade …</p> : null}
      <div className="admin-c-tablewrap">
        <table className="admin-c-table">
          <thead>
            <tr>
              <th
                scope="col"
                {...sortThProps("name", "admin-c-th--name")}
                onClick={() => setSortFromColumn("name")}
                title="Nach Firmenname sortieren"
              >
                <span className="admin-c-th__txt">Mandant</span>
                {sortKey === "name" ? (
                  <span className="admin-c-sort-ind" aria-hidden>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </th>
              <th
                scope="col"
                {...sortThProps("kind", "admin-c-th--sm")}
                onClick={() => setSortFromColumn("kind")}
                title="Nach Unternehmensart sortieren"
              >
                <span className="admin-c-th__txt">Modus</span>
                {sortKey === "kind" ? (
                  <span className="admin-c-sort-ind" aria-hidden>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </th>
              <th
                scope="col"
                {...sortThProps("city", "")}
                onClick={() => setSortFromColumn("city")}
                title="Nach Ort sortieren"
              >
                <span className="admin-c-th__txt">Ort</span>
                {sortKey === "city" ? (
                  <span className="admin-c-sort-ind" aria-hidden>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </th>
              <th
                scope="col"
                {...sortThProps("iban", "admin-c-th--iban")}
                onClick={() => setSortFromColumn("iban")}
                title="Nach IBAN sortieren"
              >
                <span className="admin-c-th__txt">IBAN</span>
                {sortKey === "iban" ? (
                  <span className="admin-c-sort-ind" aria-hidden>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </th>
              <th
                scope="col"
                {...sortThProps("statusBundle", "admin-c-th--st")}
                onClick={() => setSortFromColumn("statusBundle")}
                title="Kombinierter Status (Verif. · Compliance · Vertrag)"
              >
                <span className="admin-c-th__txt">Status</span>
                {sortKey === "statusBundle" ? (
                  <span className="admin-c-sort-ind" aria-hidden>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </th>
              <th className="admin-c-th admin-c-th--act" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {!loading && visibleItems.length === 0 ? (
              <tr>
                <td colSpan="6" className="admin-c-td admin-c-td--empty">
                  {searchQuery.trim() ? "Keine Mandanten passend zur Suche / Filterkombination." : "Keine Mandanten in diesem Filter."}
                </td>
              </tr>
            ) : null}
            {visibleItems.map((item) => {
              const color = KIND_COLORS[item.company_kind] || KIND_COLORS.general;
              const iban = (item.bank_iban && String(item.bank_iban).trim()) || "";
              const displayKind = item.company_kind ? kindLabelForItem(item) : color.label;
              return (
                <Fragment key={item.id}>
                  <tr
                    className={"admin-c-tr" + (item.is_blocked ? " admin-c-tr--blocked" : "")}
                    onClick={() => onRowClick(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(item.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Mandantenzentrale: ${item.name || item.id}`}
                  >
                    <td className="admin-c-td">
                      <div className="admin-c-mandant">
                        <button
                          type="button"
                          className="admin-c-mandant__name"
                          onClick={(e) => openMandate(e, item.id)}
                        >
                          {item.name}
                        </button>
                        {item.is_blocked ? (
                          <span className="admin-c-mandant__blocked">Gesperrt</span>
                        ) : !item.is_active ? (
                          <span className="admin-c-mandant__off">inaktiv</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="admin-c-td">
                      <span
                        className="admin-c-kind"
                        style={{
                          background: color.bg,
                          borderColor: color.border,
                          color: color.text,
                        }}
                      >
                        {displayKind}
                      </span>
                    </td>
                    <td className="admin-c-td admin-c-td--muted">{item.city || "—"}</td>
                    <td
                      className="admin-c-td admin-c-td--mono"
                      title={iban || "Keine IBAN hinterlegt"}
                    >
                      {iban || <span className="admin-c-iban-miss">fehlt</span>}
                    </td>
                    <td className="admin-c-td">
                      <StatusBadgeGroup
                        v={item.verification_status}
                        c={item.compliance_status}
                        t={item.contract_status}
                      />
                    </td>
                    <td className="admin-c-td admin-c-td--actions" onClick={(e) => e.stopPropagation()}>
                      <div className="admin-c-rowactions">
                        {onOpenMandateDetail ? (
                          <button
                            type="button"
                            className="admin-c-openhint"
                            title="Zur Mandantenzentrale (wie Zeilenklick)"
                            aria-label="Mandantenzentrale in neuem Kontext"
                            onClick={() => onOpenMandateDetail(item.id)}
                          >
                            <span className="admin-c-openhint__i" aria-hidden>
                              ↗
                            </span>
                          </button>
                        ) : null}
                        {typeof onOpenPanelUsersForCompany === "function" ? (
                          <button
                            type="button"
                            className="admin-c-btn-panel-access"
                            title="Partner-Portal-Zugang für diesen Mandanten anlegen (E-Mail optional)"
                            onClick={() => onOpenPanelUsersForCompany(item.id)}
                          >
                            Partner-Zugang
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="admin-c-btn-edit"
                          onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                        >
                          {selectedId === item.id ? "Schließen" : "Bearbeiten"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {selectedId === item.id && (
                    <tr className="admin-c-expand">
                      <td colSpan="6" className="admin-c-expand__cell">
                        <div className="admin-c-workspace">
                          <p className="admin-table-sub" style={{ marginTop: 0 }}>
                            Erweiterte Einstellungen (Flotte, Kasse, Module) — getrennt von der Mandantenzentrale.
                          </p>
                          <CompanyWorkspaceForm company={item} onUpdate={loadData} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
