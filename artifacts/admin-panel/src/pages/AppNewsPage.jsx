import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/app-news`;

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "customer", label: "Kunden" },
  { value: "driver", label: "Fahrer" },
  { value: "taxi_partner", label: "Taxi-Partner" },
  { value: "hotel", label: "Hotel" },
  { value: "insurer", label: "Krankenkasse" },
];

const TARGET_OPTIONS = [
  { value: "none", label: "Kein Link (Detail in App)" },
  { value: "internal_screen", label: "Interner Screen (Pfad)" },
  { value: "external_url", label: "Externe URL (https)" },
];

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm() {
  return {
    title: "",
    body: "",
    imageUrl: "",
    buttonText: "",
    targetType: "none",
    targetValue: "",
    audience: "customer",
    isActive: true,
    sortOrder: "0",
    startsAt: "",
    endsAt: "",
  };
}

export default function AppNewsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm());

  const mode = useMemo(() => (editingId ? "edit" : "create"), [editingId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(BASE, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Liste (${res.status})`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  function startEdit(it) {
    setEditingId(it.id);
    setForm({
      title: it.title ?? "",
      body: it.body ?? "",
      imageUrl: it.imageUrl ?? "",
      buttonText: it.buttonText ?? "",
      targetType: it.targetType ?? "none",
      targetValue: it.targetValue ?? "",
      audience: it.audience ?? "customer",
      isActive: !!it.isActive,
      sortOrder: String(it.sortOrder ?? 0),
      startsAt: toLocalDatetimeValue(it.startsAt),
      endsAt: toLocalDatetimeValue(it.endsAt),
    });
    setError("");
  }

  function cancelEdit() {
    setEditingId("");
    setForm(emptyForm());
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const title = form.title.trim();
      const body = form.body.trim();
      if (!title || !body) throw new Error("Titel und Kurztext sind Pflicht.");
      const bodyJson = {
        title,
        body,
        imageUrl: form.imageUrl.trim() || null,
        buttonText: form.buttonText.trim() || null,
        targetType: form.targetType,
        targetValue: form.targetValue.trim() || null,
        audience: form.audience,
        isActive: form.isActive,
        sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      const url = editingId ? `${BASE}/${encodeURIComponent(editingId)}` : BASE;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(bodyJson),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern (${res.status})`);
      await loadItems();
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(id) {
    if (!window.confirm("Eintrag deaktivieren? In der App verschwindet er nach kurzer Cache-Zeit.")) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Deaktivieren (${res.status})`);
      await loadItems();
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  const previewItem = useMemo(
    () => ({
      title: form.title.trim() || "Titel",
      body: form.body.trim() || "Kurztext …",
      imageUrl: form.imageUrl.trim() || null,
      buttonText: form.buttonText.trim() || null,
      targetType: form.targetType,
    }),
    [form],
  );

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">App-Neuigkeiten</div>
        <p className="admin-panel-card__subtitle" style={{ marginTop: 0, color: "var(--admin-muted)" }}>
          Inhalte für die Kunden-App (Startseite). Öffentlicher Endpunkt:{" "}
          <code style={{ fontSize: "0.85em" }}>GET /api/app/news</code> — ohne App-Update.
        </p>
        {error ? (
          <div className="admin-panel-alert admin-panel-alert--error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>{mode === "edit" ? "Eintrag bearbeiten" : "Neue Neuigkeit"}</h3>
            <form onSubmit={onSubmit} className="admin-panel-form" style={{ gap: 12 }}>
              <label className="admin-panel-field">
                <span>Titel</span>
                <input value={form.title} onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))} />
              </label>
              <label className="admin-panel-field">
                <span>Kurztext</span>
                <textarea rows={4} value={form.body} onChange={(ev) => setForm((f) => ({ ...f, body: ev.target.value }))} />
              </label>
              <label className="admin-panel-field">
                <span>Bild-URL (optional)</span>
                <input value={form.imageUrl} onChange={(ev) => setForm((f) => ({ ...f, imageUrl: ev.target.value }))} placeholder="https://…" />
              </label>
              <label className="admin-panel-field">
                <span>Button-Text (optional)</span>
                <input value={form.buttonText} onChange={(ev) => setForm((f) => ({ ...f, buttonText: ev.target.value }))} />
              </label>
              <label className="admin-panel-field">
                <span>Ziel-Typ</span>
                <select value={form.targetType} onChange={(ev) => setForm((f) => ({ ...f, targetType: ev.target.value }))}>
                  {TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-panel-field">
                <span>Ziel (Pfad z. B. /help oder https-URL)</span>
                <input value={form.targetValue} onChange={(ev) => setForm((f) => ({ ...f, targetValue: ev.target.value }))} disabled={form.targetType === "none"} />
              </label>
              <label className="admin-panel-field">
                <span>Zielgruppe</span>
                <select value={form.audience} onChange={(ev) => setForm((f) => ({ ...f, audience: ev.target.value }))}>
                  {AUDIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-panel-field">
                <span>Sortierung (aufsteigend)</span>
                <input type="number" value={form.sortOrder} onChange={(ev) => setForm((f) => ({ ...f, sortOrder: ev.target.value }))} />
              </label>
              <label className="admin-panel-field">
                <span>Sichtbar ab (optional)</span>
                <input type="datetime-local" value={form.startsAt} onChange={(ev) => setForm((f) => ({ ...f, startsAt: ev.target.value }))} />
              </label>
              <label className="admin-panel-field">
                <span>Sichtbar bis (optional)</span>
                <input type="datetime-local" value={form.endsAt} onChange={(ev) => setForm((f) => ({ ...f, endsAt: ev.target.value }))} />
              </label>
              <label className="admin-panel-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.isActive} onChange={(ev) => setForm((f) => ({ ...f, isActive: ev.target.checked }))} />
                <span>Aktiv</span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="btn btn-red" disabled={saving}>
                  {saving ? "…" : mode === "edit" ? "Speichern" : "Anlegen"}
                </button>
                {editingId ? (
                  <button type="button" className="btn btn-outline" onClick={cancelEdit} disabled={saving}>
                    Abbrechen
                  </button>
                ) : null}
              </div>
            </form>

            <h3 style={{ margin: "24px 0 8px", fontSize: "1rem" }}>Alle Einträge</h3>
            {loading ? <p>Lädt…</p> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    border: "1px solid var(--admin-border)",
                    borderRadius: 10,
                    padding: 12,
                    opacity: it.isActive ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{it.title || "(ohne Titel)"}</strong>
                    <span style={{ fontSize: "0.85em", color: "var(--admin-muted)" }}>
                      #{it.sortOrder} · {it.audience} · {it.isActive ? "aktiv" : "inaktiv"}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "0.9em", color: "var(--admin-muted)" }}>{it.body}</p>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-outline" onClick={() => startEdit(it)}>
                      Bearbeiten
                    </button>
                    {it.isActive ? (
                      <button type="button" className="btn btn-outline" onClick={() => void onDeactivate(it.id)}>
                        Deaktivieren
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Vorschau (Karte)</h3>
            <div
              style={{
                border: "1px solid var(--admin-border)",
                borderRadius: 14,
                overflow: "hidden",
                background: "var(--admin-surface)",
              }}
            >
              {previewItem.imageUrl ? (
                <div style={{ height: 120, background: "#e5e7eb", backgroundImage: `url(${previewItem.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              ) : null}
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{previewItem.title}</div>
                <div style={{ fontSize: "0.9rem", color: "var(--admin-muted)", lineHeight: 1.4 }}>{previewItem.body}</div>
                {previewItem.buttonText ? (
                  <div style={{ marginTop: 10 }}>
                    <span className="btn btn-red" style={{ pointerEvents: "none", display: "inline-block", fontSize: "0.85rem", padding: "6px 12px" }}>
                      {previewItem.buttonText}
                    </span>
                  </div>
                ) : null}
                <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--admin-muted)" }}>Typ: {previewItem.targetType}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
