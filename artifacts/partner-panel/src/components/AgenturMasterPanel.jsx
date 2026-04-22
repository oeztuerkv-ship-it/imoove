import { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

export default function AgenturMasterPanel({ company, onUpdate }) {
  const [activeTab, setActiveTab] = useState("booking");
  const [loading, setLoading] = useState(false);
  
  // Einheitliches Metadata für alle Agentur-Typen
  const [meta, setMeta] = useState({
    standard_pickup: company?.metadata?.standard_pickup || company?.address || "",
    billing_type: company?.metadata?.billing_type || "rechnung",
    cost_centers: company?.metadata?.cost_centers || ["Zentrale", "VIP", "Marketing"],
    vouchers: company?.metadata?.vouchers || []
  });

  const theme = { blue: "#2980b9", dark: "#2c3e50", light: "#ecf0f1" };

  const tabs = [
    { id: "dashboard", l: "📊 DASHBOARD" },
    { id: "booking", l: "🚕 SCHNELL-BUCHUNG" },
    { id: "reservations", l: "📅 RESERVIERUNGEN" },
    { id: "finance", l: "💰 ABRECHNUNG" },
    { id: "vouchers", l: "🎟️ GUTSCHEINE" },
    { id: "log", l: "🔍 KILLER-LOG" }
  ];

  return (
    <div style={{ display: "flex", background: "#fff", border: `2px solid ${theme.blue}`, borderRadius: "12px", overflow: "hidden", minHeight: "750px" }}>
      
      {/* SIDEBAR (Einheitlich Blau) */}
      <div style={{ width: "230px", background: theme.dark, padding: "15px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ color: theme.blue, fontWeight: "bold", padding: "10px", textAlign: "center", borderBottom: `1px solid ${theme.blue}`, marginBottom: "10px" }}>
          AGENTUR-PORTAL
        </div>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ 
            padding: "12px", border: "none", borderRadius: "6px", cursor: "pointer", textAlign: "left",
            background: activeTab === tab.id ? theme.blue : "transparent", color: "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{tab.l}</button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div style={{ flex: 1, padding: "25px", background: theme.light, overflowY: "auto", color: "#333" }}>
        
        {/* DASHBOARD (Punkt 1) */}
        {activeTab === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "15px" }}>
            <div style={s.card}><h4>Aktive Fahrten</h4><p style={{fontSize: "24px"}}>3</p></div>
            <div style={s.card}><h4>Buchungen heute</h4><p style={{fontSize: "24px"}}>12</p></div>
            <div style={{...s.card, background: "#d4edda"}}><h4>Monats-Budget</h4><p style={{fontSize: "24px"}}>1.450 €</p></div>
          </div>
        )}

        {/* SCHNELL-BUCHUNG (Punkt 2 - Kernfunktion) */}
        {activeTab === "booking" && (
          <div style={{maxWidth: "600px"}}>
            <h3>🚕 Neue Buchung erstellen</h3>
            <div style={s.card}>
               <label>Gast-Name / Referenz:<input style={s.input} placeholder="z.B. Schmidt / Flug-Nr. LH123" /></label>
               <label style={{marginTop: "10px", display: "block"}}>Abholort:<input style={s.input} defaultValue={meta.standard_pickup} /></label>
               <label style={{marginTop: "10px", display: "block"}}>Ziel:<input style={s.input} placeholder="Zieladresse..." /></label>
               
               <div style={{display: "flex", gap: "10px", marginTop: "15px"}}>
                  <label style={{flex: 1}}>Typ: <select style={s.input}><option>Limousine</option><option>Kombi</option><option>Bus</option></select></label>
                  <label style={{flex: 1}}>Kostenstelle: <select style={s.input}>
                    {meta.cost_centers.map(c => <option key={c}>{c}</option>)}
                  </select></label>
               </div>

               <div style={{marginTop: "20px"}}>
                  <strong>Wer zahlt?</strong>
                  <div style={{display: "flex", gap: "10px", marginTop: "5px"}}>
                    <button style={s.btnAlt}>Gast zahlt im Auto</button>
                    <button style={{...s.btnAlt, background: theme.blue, color: "#fff"}}>Agentur auf Rechnung</button>
                  </div>
               </div>

               <button style={{...s.btn, background: "#27ae60", marginTop: "20px", fontSize: "16px"}}>KOSTENPFLICHTIG BUCHEN</button>
            </div>
          </div>
        )}

        {/* FINANZEN (Punkt 6, 7, 8) */}
        {activeTab === "finance" && (
          <div>
            <h3>💰 Abrechnung & Kostenstellen</h3>
            <button style={s.addBtn}>PDF Sammelrechnung exportieren</button>
            <table style={s.table}>
              <thead><tr style={{background: "#ddd"}}><th>Datum</th><th>Referenz</th><th>Kostenstelle</th><th>Betrag</th></tr></thead>
              <tbody>
                <tr><td>22.04.26</td><td>Schmidt</td><td>VIP-Gäste</td><td>45,00 €</td></tr>
                <tr><td>22.04.26</td><td>Müller</td><td>Zentrale</td><td>12,50 €</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* KILLER-LOG (Punkt 12) */}
        {activeTab === "log" && (
          <div>
            <h3>🔍 Lückenlose Nachvollziehbarkeit</h3>
            <div style={{borderLeft: `4px solid ${theme.blue}`, paddingLeft: "15px"}}>
              <div style={s.logItem}><strong>10:00:</strong> Buchung durch Mitarbeiter <i>Sarah</i> erfolgt.</div>
              <div style={s.logItem}><strong>10:05:</strong> Taxi "M-TX 123" hat Auftrag übernommen.</div>
              <div style={s.logItem}><strong>10:15:</strong> Gast eingestiegen (Zeitstempel verifiziert).</div>
              <div style={s.logItem}><strong>10:45:</strong> Fahrt beendet. Zahlungsart: Rechnung Agentur.</div>
            </div>
          </div>
        )}

        {/* Platzhalter für Vouchers & Reservations */}
        {["vouchers", "reservations"].includes(activeTab) && <p>Bereich {activeTab} wird geladen...</p>}

      </div>
    </div>
  );
}

const s = {
  input: { width: "100%", padding: "10px", marginTop: "5px", border: "1px solid #ccc", borderRadius: "6px", boxSizing: "border-box" },
  btn: { width: "100%", padding: "15px", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "bold", cursor: "pointer" },
  btnAlt: { flex: 1, padding: "10px", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", background: "#fff" },
  card: { padding: "20px", background: "#fff", borderRadius: "10px", border: "1px solid #eee", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: "15px", background: "#fff", textAlign: "left" },
  addBtn: { padding: "10px 20px", background: "#333", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", marginBottom: "15px" },
  logItem: { marginBottom: "10px", padding: "8px", borderBottom: "1px solid #eee", fontSize: "14px" }
};
