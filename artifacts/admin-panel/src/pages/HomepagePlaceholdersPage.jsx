import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/homepage-placeholders`;
const CREATE_URL = `${API_BASE}/admin/homepage-placeholders`;

const HINT_TYPE_OPTIONS = [
  { value: "info", label: "ℹ️ Info (neutral)" },
  { value: "success", label: "✅ Erfolg (grün)" },
  { value: "warning", label: "⚠️ Warnung (gelb)" },
  { value: "important", label: "❗ Wichtig (rot)" },
];

function normalizeForm(form) {
  return {
    title: form.title.trim(),
    message: form.message.trim(),
    ctaLabel: form.ctaLabel.trim(),
    ctaUrl: form.ctaUrl.trim(),
    type: form.type,
    isActive: !!form.isActive,
    sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
    visibleFrom: form.visibleFrom.trim(),
    visibleUntil: form.visibleUntil.trim(),
    dismissKey: form.dismissKey.trim(),
  };
}

function toDatetimeLocalInput(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function coerceHintType(item) {
  const r = String(item.type || item.tone || "info")
    .trim()
    .toLowerCase();
  if (r === "success") return "success";
  if (r === "warning") return "warning";
  if (r === "important") return "important";
  return "info";
}

export default function HomepagePlaceholdersPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState({
    title: "",
    message: "",
    ctaLabel: "",
    ctaUrl: "",
    type: "info",
    isActive: true,
    sortOrder: "0",
    visibleFrom: "",
    visibleUntil: "",
    dismissKey: "",
  });

  const mode = useMemo(() => (editingId ? "edit" : "create"), [editingId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(LIST_URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Liste konnte nicht geladen werden (${res.status}).`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const normalized = normalizeForm(form);
      if (!normalized.title || !normalized.message) {
        throw new Error("Titel und Nachricht sind Pflichtfelder.");
      }
      const body = {
        title: normalized.title,
        message: normalized.message,
        type: normalized.type,
        isActive: normalized.isActive,
        sortOrder: normalized.sortOrder,
        ctaLabel: normalized.ctaLabel || null,
        ctaUrl: normalized.ctaUrl || null,
        visibleFrom: normalized.visibleFrom ? new Date(normalized.visibleFrom).toISOString() : null,
        visibleUntil: normalized.visibleUntil ? new Date(normalized.visibleUntil).toISOString() : null,
        dismissKey: normalized.dismissKey || null,
      };
      const url = editingId ? `${LIST_URL}/${encodeURIComponent(editingId)}` : CREATE_URL;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern fehlgeschlagen (${res.status}).`);
      await loadItems();
      setEditingId("");
      setForm({
        title: "",
        message: "",
        ctaLabel: "",
        ctaUrl: "",
        type: "info",
        isActive: true,
        sortOrder: "0",
        visibleFrom: "",
        visibleUntil: "",
        dismissKey: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      message: item.message || "",
      ctaLabel: item.ctaLabel || "",
      ctaUrl: item.ctaUrl || "",
      type: coerceHintType(item),
      isActive: item.isActive !== false,
      sortOrder: String(item.sortOrder ?? 0),
      visibleFrom: toDatetimeLocalInput(item.visibleFrom),
      visibleUntil: toDatetimeLocalInput(item.visibleUntil),
      dismissKey: item.dismissKey || "",
    });
  }

  function resetForm() {
    setEditingId("");
    setForm({
      title: "",
      message: "",
      ctaLabel: "",
      ctaUrl: "",
      type: "info",
      isActive: true,
      sortOrder: "0",
      visibleFrom: "",
      visibleUntil: "",
      dismissKey: "",
    });
  }

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">
          {mode === "edit" ? "Homepage-Hinweis bearbeiten" : "Homepage-Hinweis erstellen"}
        </div>
        <form className="admin-form-vertical" onSubmit={onSubmit}>
          <label className="admin-form-pair">
            <span className="admin-field-label">Titel *</span>
            <input className="admin-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Nachricht *</span>
            <textarea
              className="admin-textarea"
              rows={3}
              value={form.message}
              onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
            />
          </label>
          <label className="admin-inline-check" style={{ marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
            />
            <span style={{ fontWeight: 600 }}>Aktiv (auf der Homepage sichtbar)</span>
          </label>
          <p className="admin-table-sub" style={{ margin: "0 0 12px" }}>
            Wenn inaktiv, erscheint der Hinweis nicht — kein Löschen nötig. Optional unten den Zeitraum einschränken.
          </p>
          <div className="admin-form-grid-2">
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA-Label</span>
              <input className="admin-input" value={form.ctaLabel} onChange={(e) => setForm((p) => ({ ...p, ctaLabel: e.target.value }))} />
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA-URL</span>
              <input className="admin-input" value={form.ctaUrl} onChange={(e) => setForm((p) => ({ ...p, ctaUrl: e.target.value }))} />
            </label>
          </div>
          <div className="admin-form-grid-2">
            <label className="admin-form-pair">
              <span className="admin-field-label">Typ</span>
              <select className="admin-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                {HINT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">Sortierung</span>
              <input className="admin-input" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} />
            </label>
          </div>
          <div className="admin-form-grid-2">
            <label className="admin-form-pair">
              <span className="admin-field-label">Sichtbar ab</span>
              <input
                className="admin-input"
                type="datetime-local"
                value={form.visibleFrom}
                onChange={(e) => setForm((p) => ({ ...p, visibleFrom: e.target.value }))}
              />
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">Sichtbar bis</span>
              <input
                className="admin-input"
                type="datetime-local"
                value={form.visibleUntil}
                onChange={(e) => setForm((p) => ({ ...p, visibleUntil: e.target.value }))}
              />
            </label>
          </div>
          <label className="admin-form-pair">
            <span className="admin-field-label">Dismiss-Key (optional)</span>
            <input className="admin-input" value={form.dismissKey} onChange={(e) => setForm((p) => ({ ...p, dismissKey: e.target.value }))} />
          </label>
          <div className="admin-toolbar-row">
            <button className="admin-btn-primary" type="submit" disabled={saving}>
              {saving ? "Speichern …" : mode === "edit" ? "Änderung speichern" : "Hinweis erstellen"}
            </button>
            {mode === "edit" ? (
              <button className="admin-btn-refresh" type="button" onClick={resetForm}>
                Abbrechen
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Aktuelle Hinweise</div>
        <div className="admin-toolbar-row">
          <button className="admin-btn-refresh" type="button" onClick={() => void loadItems()} disabled={loading}>
            Aktualisieren
          </button>
        </div>
        <div className="admin-data-table">
          <div className="admin-data-table__head" style={{ gridTemplateColumns: "1.3fr 2fr 0.7fr 0.6fr 0.9fr 0.8fr" }}>
            <div>Titel</div>
            <div>Nachricht</div>
            <div>Ton</div>
            <div>Status</div>
            <div>Sichtfenster</div>
            <div>Aktion</div>
          </div>
          {items.map((item) => (
            <div key={item.id} className="admin-data-table__row" style={{ gridTemplateColumns: "1.3fr 2fr 0.7fr 0.6fr 0.9fr 0.8fr" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div className="admin-table-sub">#{item.id}</div>
              </div>
              <div>{item.message}</div>
              <div>{item.type || "info"}</div>
              <div>{item.isActive ? "aktiv" : "inaktiv"}</div>
              <div className="admin-table-sub">
                {item.visibleFrom || "sofort"} - {item.visibleUntil || "offen"}
              </div>
              <div>
                <button className="admin-btn-refresh" type="button" onClick={() => startEdit(item)}>
                  Bearbeiten
                </button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 ? <div className="admin-data-table__empty">Keine Hinweise vorhanden.</div> : null}
        </div>
      </div>
    </div>
  );
}
