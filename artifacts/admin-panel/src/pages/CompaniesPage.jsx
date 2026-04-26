import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import CompanyWorkspaceForm from "../components/CompanyWorkspaceForm.jsx";
import CompanyMandateDetailPage from "./CompanyMandateDetailPage.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { matchesCompanyKindListTab } from "../utils/panelModulesByCompanyKind.js";

const KIND_COLORS = {
  taxi: { bg: "#eff6ff", border: "#93c5fd", text: "#1e3a8a", label: "Taxi" },
  hotel: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490", label: "Hotel" },
  insurer: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Kasse" },
  medical: { bg: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Medizin" },
  general: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155", label: "Allgemein" },
};

const VERIFY_BADGE = {
  pending: { label: "Verif. ausstehend", cl: "admin-c-badge admin-c-badge--neutral" },
  in_review: { label: "Verif. in Prüfung", cl: "admin-c-badge admin-c-badge--info" },
  verified: { label: "Verifiziert", cl: "admin-c-badge admin-c-badge--ok" },
  rejected: { label: "Verif. abgelehnt", cl: "admin-c-badge admin-c-badge--err" },
};

const COMPL_BADGE = {
  pending: { label: "Compl. offen", cl: "admin-c-badge admin-c-badge--neutral" },
  in_review: { label: "Compl. in Prüfung", cl: "admin-c-badge admin-c-badge--info" },
  compliant: { label: "Compliant", cl: "admin-c-badge admin-c-badge--ok" },
  non_compliant: { label: "Nicht compliant", cl: "admin-c-badge admin-c-badge--err" },
};

const CONTRACT_BADGE = {
  inactive: { label: "Vertrag inaktiv", cl: "admin-c-badge admin-c-badge--neutral" },
  active: { label: "Vertrag aktiv", cl: "admin-c-badge admin-c-badge--ok" },
  suspended: { label: "Vertrag ausgesetzt", cl: "admin-c-badge admin-c-badge--warn" },
  terminated: { label: "Vertrag beendet", cl: "admin-c-badge admin-c-badge--err" },
};

function StatusBadgeGroup({ v, c, t }) {
  const vb = VERIFY_BADGE[v] || VERIFY_BADGE.pending;
  const cb = COMPL_BADGE[c] || COMPL_BADGE.pending;
  const kb = CONTRACT_BADGE[t] || CONTRACT_BADGE.inactive;
  return (
    <div className="admin-c-statusline">
      <span className={vb.cl} title="Verifizierungsstatus">
        {vb.label}
      </span>
      <span className={cb.cl} title="Compliance">
        {cb.label}
      </span>
      <span className={kb.cl} title="Vertrag">
        {kb.label}
      </span>
    </div>
  );
}

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
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(listTab);
  const [selectedId, setSelectedId] = useState(null);

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

  const filteredItems = useMemo(() => {
    const list = (items || []).filter((item) => matchesCompanyKindListTab(item, activeTab));
    return list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
  }, [items, activeTab]);

  const openMandate = (e, id) => {
    e.stopPropagation();
    onOpenMandateDetail?.(id);
  };

  const onRowClick = (id) => {
    onOpenMandateDetail?.(id);
  };

  if (mandateDetailCompanyId && onCloseMandateDetail) {
    return (
      <CompanyMandateDetailPage
        companyId={mandateDetailCompanyId}
        onBack={onCloseMandateDetail}
        onRequestFullWorkspace={() => onRequestWorkspaceForCompany?.(mandateDetailCompanyId)}
      />
    );
  }

  const TABS = [
    { k: "all", label: "Alle" },
    { k: "taxi", label: "Taxi" },
    { k: "hotel", label: "Hotel" },
    { k: "insurer", label: "Kasse" },
    { k: "other", label: "Weitere" },
  ];

  return (
    <div className="admin-companies">
      <div className="admin-companies__head">
        <h1 className="admin-companies__title">Mandantenverwaltung</h1>
        <p className="admin-companies__lead">
          <strong>Operativer Mandanten-Stand</strong> — klicken Sie auf eine Zeile oder den Firmennamen für die
          <strong> Mandantenzentrale</strong>. Werkzeug-Menü: erweiterte Flotten-/Kassen-Formulare in der Tabelle
          &quot;Werkstatt öffnen&quot; (getrennt von der Zentrale).
        </p>
      </div>

      <div className="admin-companies__tabs" role="tablist" aria-label="Mandantentyp-Filter">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={activeTab === t.k}
            className={"admin-c-tab" + (activeTab === t.k ? " admin-c-tab--on" : "")}
            onClick={() => setTab(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? <p className="admin-table-sub">Lade …</p> : null}
      <div className="admin-c-tablewrap">
        <table className="admin-c-table">
          <thead>
            <tr>
              <th className="admin-c-th admin-c-th--name">Mandant</th>
              <th className="admin-c-th admin-c-th--sm">Modus</th>
              <th className="admin-c-th">Ort</th>
              <th className="admin-c-th admin-c-th--iban">IBAN</th>
              <th className="admin-c-th admin-c-th--st">Status</th>
              <th className="admin-c-th admin-c-th--act" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const color = KIND_COLORS[item.company_kind] || KIND_COLORS.general;
              const iban = (item.bank_iban && String(item.bank_iban).trim()) || "";
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
                        {color.label}
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
                            className="admin-c-icow"
                            title="Mandantenzentrale (gleiche Aktion wie Zeile)"
                            aria-label="Zentrale"
                            onClick={() => onOpenMandateDetail(item.id)}
                          >
                            <span className="admin-c-icow__sym" aria-hidden>
                              ⎘
                            </span>
                            <span className="admin-c-icow__txt">Zentrale</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="admin-c-btn-sec"
                          onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                        >
                          {selectedId === item.id ? "Werkstatt schließen" : "Werkstatt öffnen"}
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
