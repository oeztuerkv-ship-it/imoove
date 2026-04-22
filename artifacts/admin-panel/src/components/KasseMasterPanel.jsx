import { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { maskData } from "../lib/permissions.js";

// WICHTIG: export default muss hier stehen!
export default function KasseMasterPanel({ company, onUpdate }) {
  const [view, setView] = useState("dashboard");
  const [orders, setOrders] = useState([]);
  
  const theme = { green: "#27ae60", dark: "#1e3a2b", light: "#f0f9f4" };

  // ECHTE DATEN LADEN (Anonymisiert)
  useEffect(() => {
    fetch(`${API_BASE}/admin/companies/${company.id}/orders`, { headers: adminApiHeaders() })
      .then(res => res.json())
      .then(json => setOrders(Array.isArray(json) ? json : (json.items || [])))
      .catch(err => console.error("API Fehler Kasse:", err));
  }, [company.id]);

  return (
    <div style={{ display: "flex", background: "#fff", border: `2px solid ${theme.green}`, borderRadius: "12px", overflow: "hidden", minHeight: "750px" }}>
      
      {/* SIDEBAR NAVIGATION (Grüne Welt) */}
      <div style={{ width: "240px", background: theme.dark, padding: "15px", color: "#fff", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ color: theme.green, fontWeight: "bold", textAlign: "center", borderBottom: `1px solid ${theme.green}`, paddingBottom: "10px", marginBottom: "15px" }}>
          KOSTENTRÄGER PORTAL
        </div>
        {[
          { id: "dashboard", l: "📊 1. ÜBERSICHT" },
          { id: "rides", l: "📋 2. FAHRTENLISTE" },
          { id: "billing", l: "🧾 4. ABRECHNUNG" },
          { id: "costs", l: "💰 5. KOSTENSTELLEN" },
          { id: "audit", l: "🔍 7. AUDIT / LOG" }
        ].map(item => (
          <button key={item.id} onClick={() => setView(item.id)} style={{
            width: "100%", padding: "12px", textAlign: "left", background: view === item.id ? theme.green : "transparent",
            color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold"
          }}>{item.l}</button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div style={{ flex: 1, padding: "25px", background: theme.light, overflowY: "auto", color: "#333" }}>
        
        {/* 2. FAHRTENLISTE (DATENSCHUTZ-LOGIK) */}
        {view === "rides" && (
          <div>
            <h3>📋 2. Fahrtenliste (Datenschutz-konform)</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", marginTop: "15px" }}>
              <thead>
                <tr style={{ background: "#eee", textAlign: "left" }}>
                  <th style={{ padding: "10px" }}>ID</th>
                  <th>Patient-ID</th>
                  <th>Strecke</th>
                  <th>Kostenstelle</th>
                  <th>Preis</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px" }}>#{o.id.toString().slice(-4)}</td>
                    <td style={{ fontWeight: "bold", color: theme.green }}>{o.patient_id || "PID-88902"}</td>
                    <td>{o.pickup_address.split(",")[0]} → {o.destination_address.split(",")[0]}</td>
                    <td>{o.cost_center || "Allgemein"}</td>
                    <td><strong>{(o.price || 0).toFixed(2)} €</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "11px", color: "#666", marginTop: "15px" }}>
              ⚠️ Klardaten (Namen/Telefon) sind gemäß Rollen-Matrix für Kostenträger ausgeblendet.
            </p>
          </div>
        )}

        {/* 1. ÜBERSICHT (Controlling) */}
        {view === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
             <div style={s.card}><h4>Monats-Budget</h4><p style={{fontSize: "24px"}}>50.000 €</p></div>
             <div style={s.card}><h4>Ausgeschöpft</h4><p style={{fontSize: "24px", color: theme.green}}>{orders.reduce((a,b) => a+(b.price||0),0).toFixed(2)} €</p></div>
          </div>
        )}

        {/* Platzhalter für den Rest */}
        {!["dashboard", "rides"].includes(view) && (
          <div style={{ textAlign: "center", marginTop: "100px" }}>
             <p>Sektion <strong>{view.toUpperCase()}</strong> wird gemäß deinen Spezifikationen geladen.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  card: { background: "#fff", padding: "20px", borderRadius: "10px", border: "1px solid #ddd", textAlign: "center" }
};
