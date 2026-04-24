import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const PENDING_URL = `${API_BASE}/admin/fleet-vehicles/pending`;

function vehicleDetailUrl(id) {
  return `${API_BASE}/admin/fleet-vehicles/${encodeURIComponent(id)}`;
}

function docFileUrl(vehicleId, storageKey) {
  const u = new URL(
    `${API_BASE}/admin/fleet-vehicles/${encodeURIComponent(vehicleId)}/documents/file`,
  );
  u.searchParams.set("storageKey", storageKey);
  return u.toString();
}

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function FleetVehiclesReviewPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(PENDING_URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailErr("");
    try {
      const res = await fetch(vehicleDetailUrl(id), { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetail(null);
        setDetailErr(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
        return;
      }
      setDetail({ vehicle: data.vehicle, companyName: data.companyName ?? "" });
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function openPdf(vehicleId, storageKey) {
    try {
      const res = await fetch(docFileUrl(vehicleId, storageKey), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("PDF konnte nicht geladen werden.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.alert("PDF konnte nicht geöffnet werden.");
    }
  }

  async function postAction(path, body) {
    setBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Aktion fehlgeschlagen.");
        return;
      }
      setSelectedId(null);
      setDetail(null);
      setRejectReason("");
      await loadList();
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  const v = detail?.vehicle;

  return (
    <div className="admin-app--control" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <p className="admin-page-eyebrow" style={{ marginBottom: 6 }}>
        Plattform · Taxi-Flotte
      </p>
      <h1 className="admin-page-title" style={{ marginTop: 0, marginBottom: 8 }}>
        Fahrzeuge prüfen
      </h1>
      <p className="admin-text-muted" style={{ marginBottom: 24, maxWidth: 720, lineHeight: 1.5 }}>
        Fahrzeuge in der Warteschlange „Zur Prüfung“ (Mandant hat Unterlagen eingereicht). Freigabe verbindlich durch die
        Plattform — Partner können Fahrzeuge nicht selbst aktivieren.
      </p>

      {err ? (
        <p className="admin-state-error" style={{ marginBottom: 12 }}>
          {err}
        </p>
      ) : null}
      {detailErr ? (
        <p className="admin-state-error" style={{ marginBottom: 12 }}>
          {detailErr}
        </p>
      ) : null}

      <div
        className="admin-card"
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 20 }}
      >
        <div>
          <h2 className="admin-section-title" style={{ marginTop: 0 }}>
            Warteschlange
          </h2>
          {loading ? (
            <p className="admin-text-muted">Laden …</p>
          ) : items.length === 0 ? (
            <p className="admin-text-muted">Keine offenen Fahrzeuge zur Prüfung.</p>
          ) : (
            <ul className="admin-list-plain" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((row) => {
                const veh = row.vehicle;
                const id = veh?.id;
                const active = selectedId === id;
                return (
                  <li key={id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(id);
                        setRejectReason("");
                      }}
                      className={active ? "admin-pill admin-pill--active" : "admin-pill"}
                      style={{ width: "100%", textAlign: "left" }}
                    >
                      <div style={{ fontWeight: 700 }}>{veh?.licensePlate ?? id}</div>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>{row.companyName ?? "—"}</div>
                      <div style={{ fontSize: 11, opacity: 0.8 }}>Eingereicht: {fmt(veh?.updatedAt)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h2 className="admin-section-title" style={{ marginTop: 0 }}>
            Detail
          </h2>
          {!selectedId || !v ? (
            <p className="admin-text-muted">Eintrag in der Liste wählen.</p>
          ) : (
            <div className="admin-stack" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--onroda-text-muted, #6b6b6b)" }}>Unternehmen</div>
                <div style={{ fontWeight: 600 }}>{detail.companyName || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--onroda-text-muted, #6b6b6b)" }}>Kennzeichen</div>
                <div style={{ fontWeight: 600 }}>{v.licensePlate}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--onroda-text-muted, #6b6b6b)" }}>Konzession</div>
                <div style={{ fontWeight: 600 }}>{v.konzessionNumber || v.taxiOrderNumber || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--onroda-text-muted, #6b6b6b)" }}>Dokumente (PDF)</div>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {Array.isArray(v.vehicleDocuments) && v.vehicleDocuments.length > 0 ? (
                    v.vehicleDocuments.map((d, i) => (
                      <li key={d.storageKey + i} style={{ marginBottom: 4 }}>
                        <button
                          type="button"
                          className="admin-link"
                          onClick={() => void openPdf(v.id, d.storageKey)}
                        >
                          Anzeigen {i + 1}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div>
                <label className="admin-field" style={{ display: "block" }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Ablehnungsgrund (Pflicht bei Ablehnen)</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Kurz begründen, z. B. unleserliches Dokument …"
                  />
                </label>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void postAction(`${API_BASE}/admin/fleet-vehicles/${encodeURIComponent(v.id)}/approve`)
                  }
                >
                  Freigeben
                </button>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!rejectReason.trim()) {
                      setDetailErr("Grund für Ablehnung fehlt.");
                      return;
                    }
                    void postAction(`${API_BASE}/admin/fleet-vehicles/${encodeURIComponent(v.id)}/reject`, {
                      reason: rejectReason.trim(),
                    });
                  }}
                >
                  Ablehnen
                </button>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Fahrzeug sperren? (Kein Fahrbetrieb mehr)")) return;
                    void postAction(`${API_BASE}/admin/fleet-vehicles/${encodeURIComponent(v.id)}/block`);
                  }}
                >
                  Sperren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
