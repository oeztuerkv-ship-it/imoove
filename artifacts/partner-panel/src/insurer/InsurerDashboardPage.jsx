import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

/**
 * Kennzahlen: offen / laufend / abgeschlossen (ohne medizinische Inhalte).
 */
export default function InsurerDashboardPage({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    setErr("");
    fetch(`${API_BASE}/panel/v1/insurer/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (!j?.ok) {
          setErr(String(j?.error || "Fehler"));
          return;
        }
        setData({
          openRides: j.openRides ?? 0,
          activeRides: j.activeRides ?? 0,
          completedRides: j.completedRides ?? 0,
        });
      })
      .catch(() => setErr("Netzwerkfehler"));
  }, [token]);

  if (!token) {
    return <p style={{ margin: 16 }}>Nicht angemeldet.</p>;
  }

  if (err) {
    return (
      <div style={{ margin: 16, padding: 12, background: "#fff3f0", border: "1px solid #eaa" }}>
        <strong>Dashboard</strong> konnte nicht geladen werden: {err}
      </div>
    );
  }

  if (!data) {
    return <p style={{ margin: 16 }}>Lade Kennzahlen…</p>;
  }

  const box = (title, n, sub) => (
    <div
      style={{
        background: "var(--panel-surface, #fff)",
        border: "1px solid var(--onroda-border, #ddd)",
        borderRadius: 10,
        padding: 20,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--onroda-dim, #666)" }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "var(--onroda-teal, #1b7a7a)" }}>{n}</div>
      {sub ? <p style={{ fontSize: 12, margin: "6px 0 0" }}>{sub}</p> : null}
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h2 className="panel-h2" style={{ margin: "0 0 6px" }}>
        Übersicht
      </h2>
      <p className="panel-p" style={{ margin: "0 0 20px" }}>
        Fokus: Auftragslage und Status — ohne Erfassung medizinischer Befunde. Personenangaben ggf. nur als interne Referenz (siehe Fahrtenliste).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {box("Offene Fahrten", data.openRides, "Vor Fahrtantritt / Disposition (noch nicht in Ausführung)")}
        {box("Laufende Fahrten", data.activeRides, "Aktive Ausführung / unterwegs")}
        {box("Abgeschlossene Fahrten", data.completedRides, "Gesamtzahl, Stand Datenbank (alle Zeiten)")}
      </div>
    </div>
  );
}
