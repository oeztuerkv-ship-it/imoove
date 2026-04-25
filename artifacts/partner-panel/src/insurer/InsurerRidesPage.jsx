import { useCallback, useEffect, useState } from "react";

/**
 * Fahrten der Krankenkasse: Referenz, Route, Kostenstelle, Leistungserbringer — keine Diagnoseverwaltung.
 */
export default function InsurerRidesPage({ token, apiBase }) {
  const [rides, setRides] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [err, setErr] = useState("");
  const [rowEdit, setRowEdit] = useState({});
  const [docByRide, setDocByRide] = useState({});

  const load = useCallback(() => {
    if (!token) return;
    setErr("");
    Promise.all([
      fetch(`${apiBase}/panel/v1/insurer/rides`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`${apiBase}/panel/v1/insurer/cost-centers`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (!a?.ok) {
          setErr(String(a?.error || "Fahrten"));
          return;
        }
        if (b?.ok) setCostCenters(b.costCenters || []);
        setRides(a.rides || []);
      })
      .catch(() => setErr("Netzwerkfehler"));
  }, [token, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  async function fetchDocs(rideId) {
    if (!token) return;
    const r = await fetch(
      `${apiBase}/panel/v1/insurer/rides/${encodeURIComponent(rideId)}/transport-documents`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const j = await r.json().catch(() => ({}));
    if (j?.ok) setDocByRide((c) => ({ ...c, [rideId]: j.documents || [] }));
  }

  async function openDoc(docId) {
    if (!token) return;
    const res = await fetch(`${apiBase}/panel/v1/insurer/transport-documents/${encodeURIComponent(docId)}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setErr("Datei nicht lesbar (Rechte oder Ablage).");
      return;
    }
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    window.open(u, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(u), 6e4);
  }

  async function saveRow(rideId) {
    const ed = rowEdit[rideId] || {};
    if (!token) return;
    setErr("");
    const res = await fetch(`${apiBase}/panel/v1/insurer/rides/${encodeURIComponent(rideId)}/organization`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        costCenterId: ed.costCenterId === "" || ed.costCenterId === undefined ? null : ed.costCenterId,
        passengerRef: ed.passengerRef ?? null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(String(j?.error || "Speichern fehlgeschlagen"));
      return;
    }
    load();
  }

  if (!token) {
    return <p style={{ margin: 16 }}>Nicht angemeldet.</p>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Fahrten</h2>
      <p style={{ color: "var(--onroda-dim, #666)", fontSize: 14, margin: "0 0 12px" }}>
        Personen: nur <strong>interne Referenzen / Kostenträgerkürzel</strong> (kein Befundtext). Zugewiesener Betrieb
        = Leistungserbringer-Kontext, soweit in der Abrechnung erfasst.
      </p>
      {err ? <div style={{ padding: 8, background: "#fff0ee", borderRadius: 6, marginBottom: 12 }}>{err}</div> : null}
      <div style={{ overflow: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table className="panel-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th>Referenz (intern)</th>
              <th>Strecke</th>
              <th>Termin / Erfasst</th>
              <th>Status</th>
              <th>Kostenstelle</th>
              <th>Leistungserbringer</th>
            </tr>
          </thead>
          <tbody>
            {rides.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  Keine Fahrten.
                </td>
              </tr>
            ) : (
              rides.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 8, verticalAlign: "top" }}>
                    <input
                      className="panel-input"
                      style={{ maxWidth: 200 }}
                      placeholder="Interne Ref."
                      value={
                        rowEdit[r.id]?.passengerRef !== undefined
                          ? rowEdit[r.id].passengerRef
                          : (r.passengerLabel ?? "")
                      }
                      onChange={(e) =>
                        setRowEdit((p) => ({ ...p, [r.id]: { ...p[r.id], passengerRef: e.target.value } }))
                      }
                    />
                    <FileUpload
                      token={token}
                      apiBase={apiBase}
                      rideId={r.id}
                      onDone={() => {
                        void fetchDocs(r.id);
                        void load();
                      }}
                    />
                    <button
                      type="button"
                      className="link-button"
                      style={{ display: "block", marginTop: 6, fontSize: 12 }}
                      onClick={() => void saveRow(r.id)}
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      style={{ display: "block", fontSize: 12, marginTop: 4 }}
                      onClick={() => void fetchDocs(r.id)}
                    >
                      Liste Transportnachweise
                    </button>
                    <ul style={{ margin: "4px 0 0 16px", fontSize: 11, maxWidth: 220 }}>
                      {(docByRide[r.id] || []).map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => void openDoc(d.id)}
                            style={{ fontSize: 11, padding: 0 }}
                          >
                            {d.originalFilename}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td style={{ padding: 8 }}>
                    <div>{r.fromLabel}</div>
                    <div>→ {r.toLabel}</div>
                  </td>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                    {r.scheduledAt
                      ? new Date(r.scheduledAt).toLocaleString("de-DE")
                      : new Date(r.createdAt).toLocaleString("de-DE")}
                  </td>
                  <td style={{ padding: 8 }}>{r.status}</td>
                  <td style={{ padding: 8, verticalAlign: "top" }}>
                    <select
                      className="panel-input"
                      value={rowEdit[r.id]?.costCenterId ?? (r.costCenterId ?? "")}
                      onChange={(e) =>
                        setRowEdit((p) => ({
                          ...p,
                          [r.id]: { ...p[r.id], costCenterId: e.target.value },
                        }))
                      }
                    >
                      <option value="">— keine —</option>
                      {costCenters
                        .filter((c) => c.isActive)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} {c.label ? "– " + c.label : ""}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td style={{ padding: 8, fontSize: 12 }}>{r.serviceProviderCompanyName || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileUpload({ token, apiBase, rideId, onDone }) {
  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 11 }}>Transportschein (PDF/JPG/PNG):</span>{" "}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !token) return;
          const buf = await f.arrayBuffer();
          const res = await fetch(
            `${apiBase}/panel/v1/insurer/rides/${encodeURIComponent(rideId)}/transport-documents`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": f.type || "application/pdf",
                "X-File-Name": f.name,
              },
              body: buf,
            },
          );
          if (res.ok) onDone();
        }}
      />
    </div>
  );
}
