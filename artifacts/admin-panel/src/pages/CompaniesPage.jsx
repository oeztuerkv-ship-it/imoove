import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import CompanyWorkspaceForm from "../components/CompanyWorkspaceForm.jsx";
import CompanyMandateDetailPage from "./CompanyMandateDetailPage.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";
import { matchesCompanyKindListTab } from "../utils/panelModulesByCompanyKind.js";

const KIND_COLORS = {
  taxi: { bg: "#eff6ff", border: "#93c5fd", text: "#1e3a8a", label: "Taxi", tableLabel: "Taxi" },
  hotel: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490", label: "Hotel", tableLabel: "Hotel" },
  insurer: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Krankenkasse", tableLabel: "Kasse" },
  medical: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Krankenkasse", tableLabel: "Kasse" },
  general: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155", label: "Sonstige", tableLabel: "Sonst." },
};

const VERIFY_BADGE = {
  pending: { label: "Verifizierung: ausstehend", short: "Ausstehend", cl: "admin-status-pill admin-status-pill--pending" },
  in_review: { label: "Verifizierung: in Prüfung", short: "In Prüfung", cl: "admin-status-pill admin-status-pill--active" },
  verified: { label: "Verifizierung: bestätigt", short: "Verifiziert", cl: "admin-status-pill admin-status-pill--ok" },
  rejected: { label: "Verifizierung: abgelehnt", short: "Abgelehnt", cl: "admin-status-pill admin-status-pill--bad" },
};

const COMPL_BADGE = {
  pending: { label: "Compliance: offen", short: "Offen", cl: "admin-status-pill admin-status-pill--pending" },
  in_review: { label: "Compliance: in Prüfung", short: "In Prüfung", cl: "admin-status-pill admin-status-pill--active" },
  compliant: { label: "Compliance: erfüllt", short: "Erfüllt", cl: "admin-status-pill admin-status-pill--ok" },
  non_compliant: { label: "Compliance: nicht erfüllt", short: "N. erfüllt", cl: "admin-status-pill admin-status-pill--bad" },
};

const CONTRACT_BADGE = {
  inactive: { label: "Vertrag: inaktiv", short: "Inaktiv", cl: "admin-status-pill admin-status-pill--pending" },
  active: { label: "Vertrag: aktiv", short: "Aktiv", cl: "admin-status-pill admin-status-pill--ok" },
  suspended: { label: "Vertrag: ausgesetzt", short: "Ausgesetzt", cl: "admin-status-pill admin-status-pill--active" },
  terminated: { label: "Vertrag: beendet", short: "Beendet", cl: "admin-status-pill admin-status-pill--bad" },
};

const CONTRACT_ORDER = { active: 0, suspended: 1, terminated: 2, inactive: 3 };
const VERIF_ORDER = { pending: 0, in_review: 1, verified: 2, rejected: 3 };
const COMPL_ORDER = { pending: 0, in_review: 1, non_compliant: 2, compliant: 3 };

const INITIAL_EXTRA = {
  active: false,
  blocked: false,
  archived: false,
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

function kindTableLabel(item) {
  const c = item.company_kind || "general";
  const row = KIND_COLORS[c] || KIND_COLORS.general;
  return row.tableLabel ?? row.label;
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
  if (f.archived && item.is_active !== false) return false;
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
    <div className="admin-companies-table__statuses" role="group" aria-label="Status">
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
  { k: "archived", label: "Archiviert" },
  { k: "blocked", label: "Gesperrt" },
  { k: "contractOn", label: "Vertrag aktiv" },
  { k: "contractOff", label: "Vertrag inaktiv" },
  { k: "verifOpen", label: "Verif. ausstehend" },
  { k: "verifOk", label: "Verifiziert" },
  { k: "complOpen", label: "Compliance offen" },
  { k: "complOk", label: "Compliance erfüllt" },
];

const QUICK_CREATE_KIND_OPTIONS = [
  { value: "taxi", label: "Taxi" },
  { value: "hotel", label: "Hotel" },
  { value: "travel_agency", label: "Reisebüro" },
  { value: "voucher_client", label: "Gutscheinfirma" },
  { value: "corporate", label: "Corporate" },
  { value: "insurer", label: "Versicherung" },
];

const EMPTY_CREATE_FORM = {
  name: "",
  company_kind: "taxi",
  email: "",
  password: "",
  autoGeneratePassword: true,
};

export default function CompaniesPage({
  userRole = "",
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
  const [createForm, setCreateForm] = useState(() => ({ ...EMPTY_CREATE_FORM }));
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [createOnboarding, setCreateOnboarding] = useState(null);
  const [createOwnerWarning, setCreateOwnerWarning] = useState("");
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState(null);

  const canCreateCompany = userRole === "admin" || userRole === "service";

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

  const patchCompanyStatus = useCallback(async (companyId, body) => {
    const res = await adminFetch(
      `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/sections/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.message || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  const archiveCompany = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Mandant „${item.name || item.id}" archivieren? Partner-Zugang wird deaktiviert.`)) return;
    setArchiveBusyId(item.id);
    try {
      await patchCompanyStatus(item.id, {
        is_active: false,
        panel_access_enabled: false,
        contract_status: "inactive",
      });
      loadData();
    } catch (err) {
      window.alert(err?.message || "Archivieren fehlgeschlagen.");
    } finally {
      setArchiveBusyId(null);
    }
  };

  const reactivateCompany = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Mandant „${item.name || item.id}" reaktivieren?`)) return;
    setArchiveBusyId(item.id);
    try {
      await patchCompanyStatus(item.id, {
        is_active: true,
        panel_access_enabled: true,
        contract_status: "active",
      });
      loadData();
    } catch (err) {
      window.alert(err?.message || "Reaktivieren fehlgeschlagen.");
    } finally {
      setArchiveBusyId(null);
    }
  };

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
    const cls = ["admin-rides-table__sortable", extraClass].filter(Boolean).join(" ");
    return {
      className: cls || undefined,
      "aria-sort": active ? (sortDir === "asc" ? "ascending" : "descending") : "none",
    };
  };

  const sortThIndicator = (key) => {
    if (sortKey !== key) return null;
    return (
      <span className="admin-rides-table__sort-ind" aria-hidden>
        {sortDir === "asc" ? " ▲" : " ▼"}
      </span>
    );
  };

  const onRowClick = (id) => {
    onOpenMandateDetail?.(id);
  };

  const openMandate = (e, id) => {
    e.stopPropagation();
    onOpenMandateDetail?.(id);
  };

  const onCreateField = (k) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setCreateForm((prev) => ({ ...prev, [k]: value }));
  };

  const onCreateCompany = () => {
    const name = String(createForm.name ?? "").trim();
    const email = String(createForm.email ?? "").trim();
    if (!name) {
      setCreateErr("Unternehmensname ist Pflicht.");
      return;
    }
    if (!email || !email.includes("@")) {
      setCreateErr("Gültige E-Mail für den Partner-Login ist Pflicht.");
      return;
    }
    if (!createForm.autoGeneratePassword) {
      const pw = String(createForm.password ?? "");
      if (pw.length < 10) {
        setCreateErr("Passwort mindestens 10 Zeichen — oder Auto-Generierung aktivieren.");
        return;
      }
    }
    setCreateErr("");
    setCreateOwnerWarning("");
    setCreateOnboarding(null);
    setCreateBusy(true);
    const body = {
      name,
      company_kind: createForm.company_kind || "taxi",
      email,
      ...(createForm.autoGeneratePassword ? {} : { password: String(createForm.password ?? "") }),
    };
    fetch(`${API_BASE}/admin/companies/quick-onboard`, {
      method: "POST",
      headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const raw = await res.text();
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        if (!res.ok) {
          const code = json && typeof json.error === "string" ? json.error : "";
          const hint = json && typeof json.hint === "string" ? json.hint : "";
          if (res.status === 403) {
            setCreateErr("Keine Berechtigung (nur Plattform-Admin oder Service).");
            return;
          }
          if (code === "name_required") {
            setCreateErr("Unternehmensname ist Pflicht.");
            return;
          }
          if (code === "email_required") {
            setCreateErr("Gültige E-Mail ist Pflicht.");
            return;
          }
          if (code === "password_invalid") {
            setCreateErr(hint || "Passwort ungültig (min. 10 Zeichen).");
            return;
          }
          setCreateErr(
            [code && `API: ${code}`, hint || (!code && (raw || `HTTP ${res.status}`))].filter(Boolean).join(" — ") ||
              "Anlage fehlgeschlagen.",
          );
          return;
        }
        const item = json && json.item ? json.item : null;
        const newId = item && item.id ? item.id : null;
        setCreateForm({ ...EMPTY_CREATE_FORM });
        setShowCreateCompany(false);
        setCreateErr("");
        setCreateOnboarding(json?.onboarding ?? null);
        setCreateOwnerWarning(typeof json?.ownerProvisioningWarning === "string" ? json.ownerProvisioningWarning : "");
        loadData();
        if (newId) onOpenMandateDetail?.(newId);
      })
      .catch(() => setCreateErr("Netzwerkfehler."))
      .finally(() => setCreateBusy(false));
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
    <div className="admin-page admin-companies">
      <div className="admin-companies__head">
        <div className="admin-companies__head-row">
          <h1 className="admin-page-section-title">Mandantenverwaltung</h1>
          {canCreateCompany ? (
            <button
              type="button"
              className="admin-companies__create-toggle"
              aria-expanded={showCreateCompany}
              aria-controls="admin-companies-create-panel"
              id="admin-companies-create-toggle"
              onClick={() => {
                setShowCreateCompany((v) => {
                  const next = !v;
                  if (!next) setCreateErr("");
                  return next;
                });
              }}
            >
              <span className="admin-companies__create-toggle-plus" aria-hidden>
                {showCreateCompany ? "−" : "+"}
              </span>
              <span className="admin-companies__create-toggle-label">
                {showCreateCompany ? "Formular ausblenden" : "Unternehmen anlegen"}
              </span>
            </button>
          ) : null}
        </div>
        <p className="admin-page-section-sub">
          <strong>Operativer Mandanten-Stand</strong> — <strong>Zeile oder Firmenname</strong> öffnet die Mandantenzentrale.
          Rechts <strong>Partner-Zugang</strong> öffnet die Partner-Portal-Anlage für genau diesen Mandanten;{" "}
          <strong>Bearbeiten</strong> erweitert Flotte, Kasse und weitere Einstellungen in der Werkstatt.
        </p>
      </div>

      {canCreateCompany && showCreateCompany ? (
        <section
          id="admin-companies-create-panel"
          className="admin-companies__create"
          aria-labelledby="admin-companies-create-title"
          role="region"
        >
          <div className="admin-companies__create-head">
            <h2 id="admin-companies-create-title" className="admin-companies__create-title">
              Neues Unternehmen
            </h2>
            <p className="admin-companies__create-lead">
              Schnell-Onboarding: Mandant + Partner-Login in einem Schritt. Steuernummer, Konzession, Bankdaten und
              Provision können Sie danach in der Mandantenzentrale oder vom Partner im Profil ergänzen.
            </p>
          </div>
          {createErr ? (
            <div className="admin-companies__create-err" role="alert">
              {createErr}
            </div>
          ) : null}
          <div className="admin-companies__create-grid">
            <div className="admin-companies__create-field admin-companies__create-field--span2">
              <label className="admin-c-search__lbl" htmlFor="admin-create-name">
                Unternehmensname <span className="admin-companies__req">*</span>
              </label>
              <input
                id="admin-create-name"
                className="admin-c-search__inp"
                autoComplete="organization"
                value={createForm.name}
                onChange={onCreateField("name")}
                placeholder="z. B. Muster Taxi GmbH"
              />
            </div>
            <div className="admin-companies__create-field">
              <label className="admin-c-search__lbl" htmlFor="admin-create-kind">
                Unternehmensart <span className="admin-companies__req">*</span>
              </label>
              <select
                id="admin-create-kind"
                className="admin-c-select admin-companies__create-select"
                value={createForm.company_kind}
                onChange={onCreateField("company_kind")}
              >
                {QUICK_CREATE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-companies__create-field">
              <label className="admin-c-search__lbl" htmlFor="admin-create-email">
                E-Mail (Login) <span className="admin-companies__req">*</span>
              </label>
              <input
                id="admin-create-email"
                className="admin-c-search__inp"
                type="email"
                autoComplete="email"
                value={createForm.email}
                onChange={onCreateField("email")}
                placeholder="partner@…"
              />
            </div>
            <div className="admin-companies__create-field admin-companies__create-field--span2">
              <label className="admin-c-search__lbl" htmlFor="admin-create-password">
                Startpasswort
              </label>
              <input
                id="admin-create-password"
                className="admin-c-search__inp"
                type="password"
                autoComplete="new-password"
                value={createForm.password}
                onChange={onCreateField("password")}
                disabled={createForm.autoGeneratePassword}
                placeholder={createForm.autoGeneratePassword ? "Wird automatisch generiert" : "Mind. 10 Zeichen"}
              />
            </div>
            <div className="admin-companies__create-field admin-companies__create-field--span2">
              <label className="admin-c-search__lbl admin-companies__create-check">
                <input
                  type="checkbox"
                  checked={createForm.autoGeneratePassword}
                  onChange={onCreateField("autoGeneratePassword")}
                />
                Passwort automatisch generieren (empfohlen)
              </label>
              <p className="admin-companies__create-hint">
                Beim ersten Login im Partner-Panel muss das Passwort geändert werden.
              </p>
            </div>
          </div>
          <div className="admin-companies__create-actions">
            <button type="button" className="admin-btn-primary" disabled={createBusy} onClick={() => void onCreateCompany()}>
              {createBusy ? "Wird angelegt …" : "Mandant anlegen & Zugang erstellen"}
            </button>
            <button
              type="button"
              className="admin-c-btn-sec"
              disabled={createBusy}
              onClick={() => {
                setCreateForm({ ...EMPTY_CREATE_FORM });
                setCreateErr("");
              }}
            >
              Formular leeren
            </button>
          </div>
        </section>
      ) : null}

      {createOnboarding?.username ? (
        <div className="admin-companies__create-ok" role="status">
          Partner-Zugang erstellt: <strong>{createOnboarding.username}</strong>
          {createOnboarding.initialPassword ? (
            <>
              {" "}
              / Startpasswort: <strong>{createOnboarding.initialPassword}</strong>
            </>
          ) : null}
          . Login:{" "}
          <a href={createOnboarding.panelLoginUrl || "https://panel.onroda.de"} target="_blank" rel="noreferrer">
            {createOnboarding.panelLoginUrl || "panel.onroda.de"}
          </a>
          . Beim ersten Login ist Passwortwechsel Pflicht.
        </div>
      ) : null}
      {createOwnerWarning ? (
        <div className="admin-companies__create-err" role="alert">
          {createOwnerWarning}
        </div>
      ) : null}

      <div className="admin-filter-card">
        <div className="admin-filter-grid admin-filter-grid--companies">
          <div className="admin-filter-item">
            <label className="admin-field-label" htmlFor="admin-companies-search">
              Mandanten durchsuchen
            </label>
            <input
              id="admin-companies-search"
              className="admin-input"
              type="search"
              autoComplete="off"
              placeholder="Firma, Ansprechpartner, E-Mail, Ort, Telefon …"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery.trim() || hasAnyListFilter ? (
            <div className="admin-filter-item admin-filter-item--meta" aria-live="polite">
              <label className="admin-field-label">&nbsp;</label>
              <div className="admin-table-toolbar__info">
                {visibleItems.length} {visibleItems.length === 1 ? "Treffer" : "Treffer"}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <section className="admin-filter-card" aria-label="Filter und Sortierung">
        <div className="admin-c-filter-panel__grid">
          <div className="admin-c-filter-panel__block">
            <div className="admin-c-filter-legend" id="companies-type-filter-label">
              Unternehmensart
            </div>
            <div className="admin-companies__chips admin-companies__chips--segment" role="tablist" aria-labelledby="companies-type-filter-label">
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
          </div>
          <div className="admin-c-filter-panel__block">
            <div className="admin-c-filter-legend">Status & Freigaben</div>
            <div className="admin-companies__chips admin-companies__chips--toggle admin-companies__chips--dense" aria-label="Zusatzfilter">
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
          </div>
        </div>
        <div className="admin-c-filter-toolbar admin-c-filter-toolbar--in-panel">
          <div className="admin-c-filter-toolbar__row">
            <label className="admin-c-select-lbl" htmlFor="companies-sort-preset">
              Sortierung
            </label>
            <select
              id="companies-sort-preset"
              className="admin-c-select admin-c-select--modern"
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
      </section>

      {loading && items.length === 0 ? <div className="admin-info-banner">Lade …</div> : null}

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info" aria-live="polite">
          {visibleItems.length > 0
            ? `Mandantenliste · Nr. 1–${visibleItems.length} · ${visibleItems.length} ${visibleItems.length === 1 ? "Eintrag" : "Einträge"}`
            : "Mandantenliste · Keine Einträge"}
          {items.length > 0 && visibleItems.length !== items.length
            ? ` (gefiltert von ${items.length})`
            : null}
        </div>
      </div>

      <div className="admin-table-card admin-table-card--flush">
        <div className="admin-rides-table-wrap">
          <table className="admin-rides-table admin-companies-table">
            <colgroup>
              <col className="admin-companies-table__col-num" />
              <col className="admin-companies-table__col-name" />
              <col className="admin-companies-table__col-kind" />
              <col className="admin-companies-table__col-city" />
              <col className="admin-companies-table__col-iban" />
              <col className="admin-companies-table__col-status" />
              <col className="admin-companies-table__col-actions" />
            </colgroup>
          <thead>
            <tr>
              <th className="admin-companies-table__col-num" scope="col" aria-label="Laufende Nummer">
                #
              </th>
              <th
                scope="col"
                {...sortThProps("name", "admin-companies-table__col-name")}
                onClick={() => setSortFromColumn("name")}
                title="Nach Firmenname sortieren"
              >
                Mandant
                {sortThIndicator("name")}
              </th>
              <th
                scope="col"
                {...sortThProps("kind", "admin-companies-table__col-kind")}
                onClick={() => setSortFromColumn("kind")}
                title="Nach Unternehmensart sortieren"
              >
                Modus
                {sortThIndicator("kind")}
              </th>
              <th
                scope="col"
                {...sortThProps("city", "admin-companies-table__col-city")}
                onClick={() => setSortFromColumn("city")}
                title="Nach Ort sortieren"
              >
                Ort
                {sortThIndicator("city")}
              </th>
              <th
                scope="col"
                {...sortThProps("iban", "admin-companies-table__col-iban")}
                onClick={() => setSortFromColumn("iban")}
                title="Nach IBAN sortieren"
              >
                IBAN
                {sortThIndicator("iban")}
              </th>
              <th
                scope="col"
                {...sortThProps("statusBundle", "admin-companies-table__col-status")}
                onClick={() => setSortFromColumn("statusBundle")}
                title="Kombinierter Status (Verif. · Compliance · Vertrag)"
              >
                Status
                {sortThIndicator("statusBundle")}
              </th>
              <th className="admin-rides-table__col-actions" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {!loading && visibleItems.length === 0 ? (
              <tr>
                <td colSpan="7" className="admin-companies-table__empty">
                  {searchQuery.trim() ? "Keine Mandanten passend zur Suche / Filterkombination." : "Keine Mandanten in diesem Filter."}
                </td>
              </tr>
            ) : null}
            {visibleItems.map((item, rowIndex) => {
              const rowNum = rowIndex + 1;
              const color = KIND_COLORS[item.company_kind] || KIND_COLORS.general;
              const iban = (item.bank_iban && String(item.bank_iban).trim()) || "";
              const displayKind = kindTableLabel(item);
              return (
                <Fragment key={item.id}>
                  <tr
                    className={
                      "admin-rides-table__row admin-companies-table__row" +
                      (item.is_blocked ? " admin-companies-table__row--blocked" : "")
                    }
                    onClick={() => onRowClick(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(item.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Nr. ${rowNum}, Mandantenzentrale: ${item.name || item.id}`}
                  >
                    <td className="admin-companies-table__col-num admin-crisp-numeric admin-table-sub">
                      {rowNum}
                      <span className="admin-visually-hidden">Zeile {rowNum}</span>
                    </td>
                    <td className="admin-companies-table__col-name">
                      <div className="admin-companies-table__mandant">
                        <button
                          type="button"
                          className="admin-companies-table__name"
                          onClick={(e) => openMandate(e, item.id)}
                        >
                          <span className="admin-ellipsis" title={item.name || item.id}>
                            {item.name}
                          </span>
                        </button>
                        {item.is_blocked ? (
                          <span className="admin-status-pill admin-status-pill--bad">Gesperrt</span>
                        ) : !item.is_active ? (
                          <span className="admin-status-pill admin-status-pill--pending">Archiviert</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="admin-companies-table__col-kind">
                      <span
                        className="admin-companies-table__kind"
                        style={{
                          background: color.bg,
                          borderColor: color.border,
                          color: color.text,
                        }}
                      >
                        {displayKind}
                      </span>
                    </td>
                    <td className="admin-companies-table__col-city admin-companies-table__muted admin-ellipsis" title={item.city || ""}>
                      {item.city || "—"}
                    </td>
                    <td
                      className="admin-companies-table__col-iban admin-companies-table__mono admin-crisp-numeric"
                      title={iban || "Keine IBAN hinterlegt"}
                    >
                      {iban || <span className="admin-companies-table__missing">fehlt</span>}
                    </td>
                    <td className="admin-companies-table__col-status">
                      <StatusBadgeGroup
                        v={item.verification_status}
                        c={item.compliance_status}
                        t={item.contract_status}
                      />
                    </td>
                    <td className="admin-rides-table__col-actions admin-companies-table__col-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="admin-rides-table__actions">
                        {onOpenMandateDetail ? (
                          <button
                            type="button"
                            className="admin-btn-action admin-btn-action--table"
                            title="Zur Mandantenzentrale (wie Zeilenklick)"
                            aria-label="Mandantenzentrale in neuem Kontext"
                            onClick={() => onOpenMandateDetail(item.id)}
                          >
                            ↗
                          </button>
                        ) : null}
                        {typeof onOpenPanelUsersForCompany === "function" ? (
                          <button
                            type="button"
                            className="admin-btn-action admin-btn-action--table"
                            title="Partner-Portal-Zugang für diesen Mandanten anlegen (E-Mail optional)"
                            onClick={() => onOpenPanelUsersForCompany(item.id)}
                          >
                            Zugang
                          </button>
                        ) : null}
                        {!item.is_active ? (
                          <button
                            type="button"
                            className="admin-btn-action admin-btn-action--table"
                            title="Mandant reaktivieren"
                            disabled={archiveBusyId === item.id}
                            onClick={(e) => reactivateCompany(e, item)}
                          >
                            {archiveBusyId === item.id ? "…" : "Reaktivieren"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn-action admin-btn-action--table"
                            title="Mandant archivieren (Partner-Zugang aus)"
                            disabled={archiveBusyId === item.id}
                            onClick={(e) => archiveCompany(e, item)}
                          >
                            {archiveBusyId === item.id ? "…" : "Archivieren"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-btn-action admin-btn-action--table"
                          onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                        >
                          {selectedId === item.id ? "Schließen" : "Bearbeiten"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {selectedId === item.id && (
                    <tr className="admin-rides-table__note-row">
                      <td colSpan="7">
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
    </div>
  );
}
