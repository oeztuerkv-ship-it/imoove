import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE ?? "https://api.onroda.de";

function getToken() {
  return localStorage.getItem("onroda_admin_token") ?? "";
}

export default function Fail2BanPage() {
  const [jails, setJails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banIp, setBanIp] = useState("");
  const [banJail, setBanJail] = useState("sshd");
  const [msg, setMsg] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/fail2ban/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok) setJails(data.jails);
      else setError(data.error);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const unban = async (ip, jail) => {
    setMsg(null);
    const res = await fetch(`${API}/admin/fail2ban/unban`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ip, jail }),
    });
    const data = await res.json();
    setMsg(data.message ?? data.error);
    void fetchStatus();
  };

  const ban = async () => {
    if (!banIp.trim()) return;
    setMsg(null);
    const res = await fetch(`${API}/admin/fail2ban/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ip: banIp.trim(), jail: banJail }),
    });
    const data = await res.json();
    setMsg(data.message ?? data.error);
    setBanIp("");
    void fetchStatus();
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🛡️ Fail2Ban — Gesperrte IPs</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Übersicht aller aktiv gesperrten IP-Adressen. Klick auf „Entsperren" hebt die Sperre sofort auf.
      </p>

      {msg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 14, color: "#166534" }}>
          {msg}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>IP manuell sperren</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={banIp}
            onChange={e => setBanIp(e.target.value)}
            placeholder="IP-Adresse z.B. 1.2.3.4"
            style={{ flex: 1, minWidth: 200, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          />
          <select
            value={banJail}
            onChange={e => setBanJail(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          >
            {jails.map(j => <option key={j.jail} value={j.jail}>{j.jail}</option>)}
          </select>
          <button
            onClick={ban}
            style={{ padding: "8px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            Sperren
          </button>
          <button
            onClick={fetchStatus}
            style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
          >
            ↻ Aktualisieren
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#666" }}>Lädt...</p>
      ) : error ? (
        <p style={{ color: "#dc2626" }}>Fehler: {error}</p>
      ) : (
        jails.map(({ jail, totalBanned, currentBanned, bannedIps }) => (
          <div key={jail} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{jail}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>
                  Aktuell gesperrt: <b style={{ color: currentBanned > 0 ? "#dc2626" : "#16a34a" }}>{currentBanned}</b>
                  {" · "}Gesamt: {totalBanned}
                </span>
              </div>
            </div>
            {bannedIps.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Keine gesperrten IPs</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>IP-Adresse</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedIps.map(ip => (
                    <tr key={ip} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", fontSize: 14, fontFamily: "monospace" }}>{ip}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button
                          onClick={() => unban(ip, jail)}
                          style={{ padding: "4px 14px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                          Entsperren
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
    </div>
  );
}
