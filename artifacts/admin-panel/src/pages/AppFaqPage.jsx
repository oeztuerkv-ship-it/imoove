import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/faq`;

const CATEGORY_OPTIONS = [
  { value: "general", label: "Allgemein" },
  { value: "payment", label: "Zahlung" },
  { value: "driver", label: "Fahrer" },
  { value: "booking", label: "Buchung" },
  { value: "account", label: "Konto" },
];

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function emptyForm() {
  return { question: "", answer: "", category: "general", active: true };
}

async function readJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }
  return { data, text };
}

function formatFailure(res, data) {
  if (typeof data?.error === "string") return data.error;
  return `HTTP ${res.status}`;
}

export default function AppFaqPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [filterCategory, setFilterCategory] = useState("all");

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [items],
  );

  const visibleItems = useMemo(() => {
    if (filterCategory === "all") return sortedItems;
    return sortedItems.filter((it) => it.category === filterCategory);
  }, [sortedItems, filterCategory]);

  const mode = editingId ? "edit" : "create";

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(BASE);
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  function cancelEdit() {
    setEditingId("");
    setForm(emptyForm());
  }

  function startEdit(it) {
    setEditingId(it.id);
    setForm({
      question: it.question || "",
      answer: it.answer || "",
      category: it.category || "general",
      active: it.active !== false,
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        question: form.question.trim(),
        answer: form.answer.trim(),
        category: form.category,
        active: form.active,
      };
      if (!payload.question || !payload.answer) {
        throw new Error("question_answer_required");
      }
      if (mode === "edit") {
        const res = await adminFetch(`${BASE}/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const { data } = await readJson(res);
        if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      } else {
        const maxOrder = items.reduce((m, it) => Math.max(m, it.sortOrder ?? 0), 0);
        const res = await adminFetch(BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, sortOrder: maxOrder + 10 }),
        });
        const { data } = await readJson(res);
        if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
        cancelEdit();
      }
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("FAQ-Eintrag wirklich löschen?")) return;
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      if (editingId === id) cancelEdit();
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function moveItem(id, direction) {
    const list = sortedItems;
    const idx = list.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    setSaving(true);
    setError("");
    try {
      const [resA, resB] = await Promise.all([
        adminFetch(`${BASE}/${encodeURIComponent(a.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: b.sortOrder }),
        }),
        adminFetch(`${BASE}/${encodeURIComponent(b.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: a.sortOrder }),
        }),
      ]);
      const { data: dataA } = await readJson(resA);
      const { data: dataB } = await readJson(resB);
      if (!resA.ok || !dataA?.ok || !resB.ok || !dataB?.ok) throw new Error("Reihenfolge konnte nicht gespeichert werden");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  const preview = {
    question: form.question.trim() || "Beispielfrage?",
    answer: form.answer.trim() || "Beispielantwort …",
  };

  return (
    <div className="admin-page admin-page--loose app-news-page">
      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="app-news-hero">
        <h1 className="app-news-hero__title">App-FAQ</h1>
        <p className="app-news-hero__sub">
          Fragen &amp; Antworten für den Hilfe-Screen in der Kunden-App. Öffentlich:{" "}
          <code className="app-news-hero__code">GET /api/app/faq</code>
        </p>
      </div>

      <div className="app-news-layout">
        <div className="app-news-main">
          <div className="app-news-preview-card" aria-label="Vorschau App">
            <div className="app-news-preview-card__badge">Vorschau (App)</div>
            <div className="app-news-preview-card__body">
              <div className="app-news-preview-card__title">{preview.question}</div>
              <p className="app-news-preview-card__text">{preview.answer}</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="app-news-form">
            <div className="app-news-form__head">
              <h2 className="app-news-form__title">{mode === "edit" ? "FAQ bearbeiten" : "Neue FAQ"}</h2>
              <div className="app-news-form__actions">
                <button type="submit" className="btn btn-red" disabled={saving}>
                  {saving ? "…" : mode === "edit" ? "Speichern" : "Anlegen"}
                </button>
                {editingId ? (
                  <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                    Abbrechen
                  </button>
                ) : null}
              </div>
            </div>
            <div className="app-news-section__grid">
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Frage</span>
                <input
                  className="admin-input"
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Antwort</span>
                <textarea
                  className="admin-textarea"
                  rows={5}
                  value={form.answer}
                  onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Kategorie</span>
                <select
                  className="admin-select"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form-pair" style={{ alignSelf: "end" }}>
                <span className="admin-field-label">Aktiv in App</span>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
              </label>
            </div>
          </form>
        </div>

        <aside className="app-news-sidebar">
          <h2 className="app-news-sidebar__title">Alle Einträge</h2>
          <label className="admin-form-pair" style={{ marginBottom: 10 }}>
            <span className="admin-field-label">Filter Kategorie</span>
            <select className="admin-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">Alle</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {loading ? <p className="admin-muted">Lädt…</p> : null}
          <div className="app-news-list">
            {visibleItems.map((it, idx) => (
              <article key={it.id} className={`app-news-list-card ${it.active ? "app-news-list-card--active" : ""}`}>
                <div className="app-news-list-card__top">
                  <div className="app-news-list-card__title">{it.question || "(ohne Frage)"}</div>
                  <span className={`app-news-pill ${it.active ? "app-news-pill--on" : "app-news-pill--off"}`}>
                    {it.active ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>
                <p className="app-news-list-card__body">{it.answer}</p>
                <dl className="app-news-list-card__meta">
                  <div>
                    <dt>Kategorie</dt>
                    <dd>{categoryLabel(it.category)}</dd>
                  </div>
                  <div>
                    <dt>Reihenfolge</dt>
                    <dd>{it.sortOrder ?? 0}</dd>
                  </div>
                </dl>
                <div className="app-news-list-card__actions">
                  <button type="button" className="btn btn-outline" disabled={saving || idx === 0} onClick={() => void moveItem(it.id, "up")} title="Nach oben">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={saving || idx === visibleItems.length - 1}
                    onClick={() => void moveItem(it.id, "down")}
                    title="Nach unten"
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => startEdit(it)}>
                    Bearbeiten
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => void onDelete(it.id)}>
                    Löschen
                  </button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}