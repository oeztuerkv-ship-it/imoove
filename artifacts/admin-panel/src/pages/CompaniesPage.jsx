import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import CompanyWorkspaceForm from "../components/CompanyWorkspaceForm.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { matchesCompanyKindListTab } from "../utils/panelModulesByCompanyKind.js";

const KIND_COLORS = {
  taxi: { bg: '#fff9c4', text: '#856404', label: 'TAXI' },
  hotel: { bg: '#e1f5fe', text: '#01579b', label: 'HOTEL' },
  insurer: { bg: '#c8e6c9', text: '#1b5e20', label: 'MEDICAL' },
  general: { bg: '#f5f5f5', text: '#616161', label: 'SONSTIGE' }
};

function compStatusDe(verification, compliance, contract) {
  return `${verification || "—"} · ${compliance || "—"} · ${contract || "—"}`;
}

export default function CompaniesPage({ initialOpenCompanyId, onInitialOpenCompanyConsumed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
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
    if (!initialOpenCompanyId || items.length === 0) return;
    const row = items.find((c) => c.id === initialOpenCompanyId);
    if (!row) return;
    setActiveTab("all");
    setSelectedId(initialOpenCompanyId);
    onInitialOpenCompanyConsumed?.();
  }, [items, initialOpenCompanyId, onInitialOpenCompanyConsumed]);

  const filteredItems = useMemo(() => {
    const list = (items || []).filter(item => matchesCompanyKindListTab(item, activeTab));
    return list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
  }, [items, activeTab]);

  return (
    <div className="admin-page" style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Mandantenverwaltung</h1>
      <p style={{ color: "#64748b", maxWidth: 720, lineHeight: 1.5, marginBottom: 16 }}>
        <strong>Operativer Mandanten-Stand</strong> — IBAN, Verifizierung, Compliance und Vertrag gelten für den
        laufenden Betrieb (Zahlungsverkehr, Freigaben). Nicht mit der Registrierungs-Queue (Onboarding) vermischen; dort die
        Anfrage-Historie.
      </p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        {['all', 'taxi', 'hotel', 'insurer', 'other'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 20px', cursor: 'pointer', background: activeTab === t ? '#333' : '#eee', color: activeTab === t ? '#fff' : '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? <p className="admin-table-sub">Lade …</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "10px" }}>NAME</th>
            <th>MODUS</th>
            <th>STADT</th>
            <th>IBAN (Auszahlung)</th>
            <th>STATUS (Verif. / Compl. / Vertrag)</th>
            <th style={{ textAlign: "right" }}>AKTION</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item) => {
            const color = KIND_COLORS[item.company_kind] || KIND_COLORS.general;
            const iban = (item.bank_iban && String(item.bank_iban).trim()) || "";
            return (
              <Fragment key={item.id}>
                <tr style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "15px 10px" }}>
                    <strong>{item.name}</strong>
                    {item.is_blocked ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#b91c1c",
                        }}
                      >
                        GESPERRT
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        background: color.bg,
                        color: color.text,
                        fontWeight: "bold",
                        fontSize: "11px",
                      }}
                    >
                      {color.label}
                    </span>
                  </td>
                  <td>{item.city || "-"}</td>
                  <td
                    style={{
                      fontSize: 12,
                      fontFamily: "ui-monospace, monospace",
                      wordBreak: "break-all",
                      maxWidth: 220,
                    }}
                    title={iban || "Keine IBAN hinterlegt"}
                  >
                    {iban || <span style={{ color: "#b45309" }}>— fehlt</span>}
                  </td>
                  <td style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {compStatusDe(item.verification_status, item.compliance_status, item.contract_status)}
                    <div style={{ color: "#64748b", marginTop: 4 }}>
                      {item.is_active ? "aktiv" : "inaktiv"}
                      {item.partner_panel_profile_locked ? " · Panel-Stammdaten offen" : ""}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                      style={{ padding: "5px 10px" }}
                    >
                      {selectedId === item.id ? "ZU" : "BEARBEITEN"}
                    </button>
                  </td>
                </tr>
                {selectedId === item.id && (
                  <tr>
                    <td colSpan="6" style={{ padding: "20px", background: "#fcfcfc", border: "2px solid #ddd" }}>
                      <CompanyWorkspaceForm company={item} onUpdate={loadData} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
