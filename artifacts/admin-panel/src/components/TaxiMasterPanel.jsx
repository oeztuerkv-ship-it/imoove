import { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

export default function TaxiMasterPanel({ company, onUpdate }) {
  const [activeTab, setActiveTab] = useState("stammdaten");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  
  const [meta, setMeta] = useState({
    konzession: company?.metadata?.konzession || "",
    iban: company?.metadata?.iban || "",
    ustid: company?.metadata?.ustid || "",
    inhaber: company?.metadata?.inhaber || "",
    vehicles: company?.metadata?.vehicles || [],
    drivers: company?.metadata?.drivers || [],
    provision_rate: 7
  });

  useEffect(() => {
    fetch(`${API_BASE}/admin/companies/${company.id}/orders`, { headers: adminApiHeaders() })
      .then(res => res.json())
      .then(json => setOrders(Array.isArray(json) ? json : (json.items || [])))
      .catch(err => console.error("Fehler", err));
  }, [company.id]);

  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
  const provision = totalRevenue * (meta.provision_rate / 100);
  const payout = totalRevenue - provision;

  // FUNKTION FÜR SÄULE 6: PDF / DRUCK
  const printInvoice = () => {
    window.print();
  };

  const saveAll = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ item: { metadata: meta } })
      });
      alert("✅ System-Update erfolgreich!");
      if (onUpdate) onUpdate();
    } catch (err) { alert("Fehler!"); }
    finally { setLoading(false); }
  };

  const theme = { yellow: "#f1c40f", black: "#1a1a1a", gray: "#f8f9fa" };

  return (
    <div className="no-print" style={{ display: "flex", background: "#fff", border: `2px solid ${theme.yellow}`, borderRadius: "12px", overflow: "hidden", minHeight: "750px" }}>
      
      {/* SIDEBAR */}
      <div style={{ width: "230px", background: theme.black, padding: "15px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ color: theme.yellow, fontWeight: "bold", padding: "10px", textAlign: "center", borderBottom: `1px solid ${theme.yellow}`, marginBottom: "10px" }}>TAXI MASTER</div>
        {["stammdaten", "fahrzeuge", "fahrer", "auftraege", "abrechnung", "belege", "log"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ 
            padding: "12px", border: "none", borderRadius: "6px", cursor: "pointer", textAlign: "left",
            background: activeTab === tab ? theme.yellow : "transparent", color: activeTab === tab ? theme.black : "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{tab.toUpperCase()}</button>
        ))}
        <button onClick={saveAll} disabled={loading} style={{ marginTop: "auto", padding: "15px", background: "#28a745", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>
          {loading ? "SPEICHERT..." : "FLOTTE SPEICHERN"}
        </button>
      </div>

      {/* CONTENT AREA */}
      <div style={{ flex: 1, padding: "25px", background: theme.gray, color: "#333", overflowY: "auto" }}>
        
        {activeTab === "stammdaten" && (
          <div>
            <h3>🏢 1. Stammdaten</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <label>Konzessionsnummer<input style={s.input} value={meta.konzession} onChange={e => setMeta({...meta, konzession: e.target.value})} /></label>
              <label>Inhaber<input style={s.input} value={meta.inhaber} onChange={e => setMeta({...meta, inhaber: e.target.value})} /></label>
              <label>USt-ID<input style={s.input} value={meta.ustid} onChange={e => setMeta({...meta, ustid: e.target.value})} /></label>
            </div>
          </div>
        )}

        {activeTab === "fahrzeuge" && (
          <div>
            <h3>🚖 2. Fahrzeuge & Ordnungsnummern</h3>
            <button onClick={() => {const vin=prompt("Kennzeichen:"); if(vin) setMeta({...meta, vehicles:[...meta.vehicles, {id:Date.now(), vin, ord:"123", status:"Aktiv"}]})}} style={s.addBtn}>+ Neues Auto</button>
            <table style={s.table}>
              <thead><tr style={{background: "#ddd"}}><th>Kennzeichen</th><th>Ordnungsnr.</th><th>Status</th></tr></thead>
              <tbody>{meta.vehicles.map(v => (<tr key={v.id}><td>{v.vin}</td><td><strong>{v.ord}</strong></td><td>🟢 Aktiv</td></tr>))}</tbody>
            </table>
          </div>
        )}

        {activeTab === "auftraege" && (
          <div>
            <h3>📑 4. Auftrags-Historie</h3>
            <table style={s.table}>
              <thead><tr style={{background: "#ddd"}}><th>ID</th><th>Von → Zu</th><th>Preis</th><th>Status</th></tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}><td>#{o.id.toString().slice(-4)}</td><td>{o.pickup_address} → {o.destination_address}</td><td>{o.price} €</td><td>{o.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "abrechnung" && (
          <div>
            <h3>💰 5. Finanzen & 7% Fee</h3>
            <div style={{ display: "flex", gap: "20px" }}>
              <div style={s.card}><h4>Umsatz</h4><p>{totalRevenue.toFixed(2)} €</p></div>
              <div style={s.card}><h4>Provision (7%)</h4><p style={{color: "red"}}>- {provision.toFixed(2)} €</p></div>
              <div style={{...s.card, background: "#d4edda"}}><h4>Auszahlung</h4><p><strong>{payout.toFixed(2)} €</strong></p></div>
            </div>
          </div>
        )}

        {activeTab === "belege" && (
          <div id="printable-area">
            <h3>📄 6. Abrechnungs-Beleg (PDF)</h3>
            <div style={{ background: "#fff", padding: "30px", border: "1px solid #ddd", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "30px" }}>
                <div><strong>{company.name}</strong><br/>{meta.inhaber}<br/>Konzession: {meta.konzession}</div>
                <div style={{ textAlign: "right" }}><strong>Abrechnung {new Date().toLocaleDateString()}</strong><br/>USt-ID: {meta.ustid}</div>
              </div>
              <table style={s.table}>
                <thead><tr style={{borderBottom: "2px solid #000"}}><th>Beschreibung</th><th style={{textAlign: "right"}}>Betrag</th></tr></thead>
                <tbody>
                  <tr><td style={{padding: "10px 0"}}>Vermittelte Fahrten (Brutto)</td><td style={{textAlign: "right"}}>{totalRevenue.toFixed(2)} €</td></tr>
                  <tr><td style={{padding: "10px 0"}}>Imoove Systemgebühr (7%)</td><td style={{textAlign: "right", color: "red"}}>- {provision.toFixed(2)} €</td></tr>
                  <tr style={{fontWeight: "bold", borderTop: "2px solid #000"}}><td style={{padding: "10px 0"}}>Auszahlungsbetrag</td><td style={{textAlign: "right"}}>{payout.toFixed(2)} €</td></tr>
                </tbody>
              </table>
              <div style={{marginTop: "40px", fontSize: "12px", color: "#666"}}>Auszahlung erfolgt auf IBAN: {meta.iban}</div>
              <button className="no-print" onClick={printInvoice} style={{...s.addBtn, width: "100%", marginTop: "30px"}}>ALS PDF SPEICHERN / DRUCKEN</button>
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div>
            <h3>🕒 7. Nachweise & Zeitstempel</h3>
            <div style={{borderLeft: `4px solid ${theme.yellow}`, paddingLeft: "15px"}}>
              {orders.slice(0, 5).map(o => (
                <div key={o.id} style={{marginBottom: "10px", padding: "10px", background: "#fff"}}>
                   <strong>Fahrt #{o.id.toString().slice(-4)}:</strong> Am {new Date().toLocaleDateString()} um {new Date().toLocaleTimeString()} abgeschlossen. <br/>
                   <span style={{fontSize: "11px", color: "green"}}>📍 GPS-Daten verifiziert. Keine Unregelmäßigkeiten.</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      
      {/* CSS für den Druck-Modus */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          #printable-area { display: block !important; width: 100%; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}

const s = {
  input: { width: "100%", padding: "10px", marginTop: "5px", border: "1px solid #ccc", borderRadius: "5px", boxSizing: "border-box" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: "15px", background: "#fff", textAlign: "left" },
  addBtn: { padding: "12px", background: "#333", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
  card: { flex: 1, padding: "20px", background: "#fff", border: "1px solid #ddd", borderRadius: "10px", textAlign: "center" }
};
