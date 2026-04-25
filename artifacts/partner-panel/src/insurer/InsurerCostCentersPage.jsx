import { useCallback, useEffect, useState } from "react";

/**
 * Interne Kostenstellen-Referenzen; Zuordnung pro Fahrt in der Fahrtenliste.
 */
export default function InsurerCostCentersPage({ token, apiBase }) {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setErr("");
    fetch(`${apiBase}/panel/v1/insurer/cost-centers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (!j?.ok) {
          setErr(String(j?.error || "Fehler"));
          return;
        }
        setList(j.costCenters || []);
      })
      .catch(() => setErr("Netzwerkfehler"));
  }, [token, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!token) return;
    setErr("");
    const res = await fetch(`${apiBase}/panel/v1/insurer/cost-centers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), label: label.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(String(j?.error || "Speichern fehlgeschlagen"));
      return;
    }
    setCode("");
    setLabel("");
    load();
  }

  async function toggle(id, isActive) {
    if (!token) return;
    setErr("");
    const res = await fetch(`${apiBase}/panel/v1/insurer/cost-centers/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(String(j?.error || "Aktualisieren fehlgeschlagen"));
      return;
    }
    load();
  }

  if (!token) {
    return <p style={{ margin: 16 }}>Nicht angemeldet.</p>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Kostenstellen</h2>
      <p style={{ color: "var(--onroda-dim, #666)", fontSize: 14, margin: "0 0 16px" }}>
        Interne Referenzen (Code + Bezeichnung) zur Verknüpfung mit Fahrten — kein klinischer Inhalt.
      </p>
      {err ? <div style={{ padding: 8, background: "#fff0ee", borderRadius: 6, marginBottom: 12 }}>{err}</div> : null}
      <form
        onSubmit={add}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 8,
          alignItems: "end",
          marginBottom: 20,
        }}
      >
        <label>
          <span className="panel-field__label" style={{ display: "block", fontSize: 12 }}>
            Code
          </span>
          <input
            className="panel-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="z. B. KS-OP-01"
          />
        </label>
        <label>
          <span className="panel-field__label" style={{ display: "block", fontSize: 12 }}>
            Bezeichnung
          </span>
          <input
            className="panel-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Kurzbeschreibung"
          />
        </label>
        <button type="submit" className="panel-btn-primary">
          Hinzufügen
        </button>
      </form>
      <div style={{ overflow: "auto", border: "1px solid var(--onroda-border, #ddd)", borderRadius: 8 }}>
        <table className="panel-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Bezeichnung</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: "#666" }}>
                  Noch keine Kostenstelle angelegt.
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: 8 }}>{c.code}</td>
                  <td style={{ padding: 8 }}>{c.label}</td>
                  <td style={{ padding: 8 }}>{c.isActive ? "Aktiv" : "Inaktiv"}</td>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void toggle(c.id, c.isActive)}
                    >
                      {c.isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
