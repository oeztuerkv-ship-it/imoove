import { maskData } from "../lib/permissions.js";

export default function FinanceMasterPanel({ orders, role = "BUCHHALTUNG" }) {
  return (
    <div style={{ padding: "20px", background: "#f8f9fa", borderRadius: "10px" }}>
      <h3>🧾 6. Buchhaltungs-Zentrale</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead>
          <tr style={{ background: "#333", color: "#fff" }}>
            <th style={{ padding: "10px" }}>Rechnung #</th>
            <th>Referenz</th>
            <th>IBAN (Verschlüsselt)</th>
            <th>Betrag</th>
            <th>Gast-Kontakt</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "10px" }}>{o.invoice_id || o.id}</td>
              <td>{o.billing_reference}</td>
              <td>{maskData(role, "iban", o.iban || "DE123...")}</td>
              <td style={{ fontWeight: "bold" }}>{o.price} €</td>
              <td style={{ color: "red" }}>{maskData(role, "phone", o.phone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
