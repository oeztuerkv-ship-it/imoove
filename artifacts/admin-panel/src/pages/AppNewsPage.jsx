import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/app-news`;
const MAX_ACTIVE_APP_NEWS = 5;

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

const API_ERROR_HINTS = {
  unauthorized: "Nicht angemeldet oder Sitzung ungültig — bitte abmelden und erneut anmelden.",
  forbidden: "Keine Berechtigung (nur Admin/Service).",
  title_and_body_required: "Titel und Kurztext sind Pflicht.",
  invalid_internal_path: "Interner Pfad ungültig (z. B. /help, /wallet, ohne ..).",
  invalid_external_url: "Externe URL muss mit https:// beginnen (lokal: http://localhost …).",
  invalid_starts_at: "„Sichtbar ab“ ist kein gültiges Datum.",
  invalid_ends_at: "„Sichtbar bis“ ist kein gültiges Datum.",
  database_not_configured: "API ohne Datenbankverbindung.",
  create_failed: "Speichern fehlgeschlagen (Datenbank oder fehlende Tabelle app_news_items).",
};

function audienceLabel(value) {
  return AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function targetTypeLabel(value) {
  return TARGET_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function formatDeDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

async function readAdminApiJson(res) {
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

function formatAdminApiFailure(res, data, text) {
  const code = typeof data?.error === "string" ? data.error : "";
  if (code && API_ERROR_HINTS[code]) return `${code}: ${API_ERROR_HINTS[code]}`;
  if (code) return code;
  if (data?._raw && typeof data._raw === "string") {
    const snippet = data._raw.trim().slice(0, 280);
    return snippet ? `Antwort (${res.status}): ${snippet}` : `HTTP ${res.status}`;
  }
  return `HTTP ${res.status}`;
}

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
    homepageSlot: "",
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

  const activeCount = useMemo(() => items.filter((i) => i.isActive).length, [items]);
  const atActiveCap = activeCount >= MAX_ACTIVE_APP_NEWS;
  const editingRow = useMemo(() => (editingId ? items.find((i) => i.id === editingId) : null), [items, editingId]);
  /** DB-Zustand des bearbeiteten Datensatzes (für Limit beim Aktiv-Schalter). */
  const rowActiveInDb = !!editingRow?.isActive;
  const activeSwitchDisabled = (!editingId && atActiveCap) || (!!editingId && atActiveCap && !rowActiveInDb);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(BASE);
      const { data, text } = await readAdminApiJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatAdminApiFailure(res, data, text));
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

  /** Neue Einträge bei vollem Kontingent: „Aktiv“ zurücknehmen, sobald die Liste das Limit meldet. */
  useEffect(() => {
    if (!editingId && atActiveCap) {
      setForm((f) => (f.isActive ? { ...f, isActive: false } : f));
    }
  }, [atActiveCap, editingId, items]);

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
      homepageSlot:
        Number.isFinite(Number(it.sortOrder)) && Number(it.sortOrder) >= 1 && Number(it.sortOrder) <= 5
          ? String(Number(it.sortOrder))
          : "",
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
      if (form.isActive && atActiveCap && !rowActiveInDb) {
        throw new Error(
          `Es sind bereits ${MAX_ACTIVE_APP_NEWS} Neuigkeiten aktiv. Bitte zuerst eine deaktivieren oder als „Inaktiv“ speichern.`,
        );
      }
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
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyJson),
      });
      const { data, text } = await readAdminApiJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatAdminApiFailure(res, data, text));
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
      const res = await adminFetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const { data, text } = await readAdminApiJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatAdminApiFailure(res, data, text));
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
    <div className="admin-page admin-page--loose app-news-page">
      <div className="app-news-hero">
        <h1 className="app-news-hero__title">App-Neuigkeiten</h1>
        <p className="app-news-hero__sub">
          Karten auf der Startseite der App (Kunde/Fahrer). Öffentlich lesbar:{" "}
          <code className="app-news-hero__code">GET /api/app/news</code> — ohne App-Update.
        </p>
        <div className="app-news-quota" aria-live="polite">
          <span className="app-news-quota__value">
            {activeCount}/{MAX_ACTIVE_APP_NEWS}
          </span>
          <span className="app-news-quota__label">aktiv in der App (max. {MAX_ACTIVE_APP_NEWS})</span>
        </div>
      </div>

      {atActiveCap ? (
        <div className="app-news-cap-banner" role="status">
          <strong>Kontingent voll.</strong> Es sind bereits {MAX_ACTIVE_APP_NEWS} Einträge aktiv. Neue Einträge werden
          als <em>inaktiv</em> angelegt, bis Sie eine andere Neuigkeit deaktivieren oder das Zeitfenster anpassen.
        </div>
      ) : null}

      {error ? (
        <div className="admin-error-banner" style={{ marginBottom: 0 }}>
          {error}
        </div>
      ) : null}

      <div className="app-news-layout">
        <div className="app-news-main">
          <div className="app-news-preview-card" aria-label="Vorschau">
            <div className="app-news-preview-card__badge">Vorschau</div>
            {previewItem.imageUrl ? (
              <div
                className="app-news-preview-card__image"
                style={{ backgroundImage: `url(${previewItem.imageUrl})` }}
              />
            ) : (
              <div className="app-news-preview-card__image app-news-preview-card__image--placeholder" />
            )}
            <div className="app-news-preview-card__body">
              <div className="app-news-preview-card__title">{previewItem.title}</div>
              <p className="app-news-preview-card__text">{previewItem.body}</p>
              {previewItem.buttonText ? (
                <span className="app-news-preview-card__btn-pill">{previewItem.buttonText}</span>
              ) : null}
              <div className="app-news-preview-card__meta">Ziel: {targetTypeLabel(previewItem.targetType)}</div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="app-news-form">
            <div className="app-news-form__head">
              <h2 className="app-news-form__title">{mode === "edit" ? "Eintrag bearbeiten" : "Neue Neuigkeit"}</h2>
              <div className="app-news-form__actions">
                <button type="submit" className="btn btn-red" disabled={saving}>
                  {saving ? "…" : mode === "edit" ? "Speichern" : "Anlegen"}
                </button>
                {editingId ? (
                  <button type="button" className="btn btn-outline" onClick={cancelEdit} disabled={saving}>
                    Abbrechen
                  </button>
                ) : null}
              </div>
            </div>

            <section className="app-news-section" aria-labelledby="app-news-sec-content">
              <h3 id="app-news-sec-content" className="app-news-section__title">
                <span className="app-news-section__num">1</span>
                Inhalt
              </h3>
              <div className="app-news-section__grid">
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Titel</span>
                  <input className="admin-input" value={form.title} onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))} />
                </label>
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Kurztext</span>
                  <textarea
                    className="admin-textarea"
                    rows={4}
                    value={form.body}
                    onChange={(ev) => setForm((f) => ({ ...f, body: ev.target.value }))}
                  />
                </label>
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Bild-URL (optional)</span>
                  <input
                    className="admin-input"
                    value={form.imageUrl}
                    onChange={(ev) => setForm((f) => ({ ...f, imageUrl: ev.target.value }))}
                    placeholder="https://…"
                  />
                </label>
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Button-Beschriftung (optional)</span>
                  <input
                    className="admin-input"
                    value={form.buttonText}
                    onChange={(ev) => setForm((f) => ({ ...f, buttonText: ev.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="app-news-section" aria-labelledby="app-news-sec-target">
              <h3 id="app-news-sec-target" className="app-news-section__title">
                <span className="app-news-section__num">2</span>
                Ziel / Link
              </h3>
              <div className="app-news-section__grid app-news-section__grid--2">
                <label className="admin-form-pair">
                  <span className="admin-field-label">Ziel-Typ</span>
                  <select className="admin-select" value={form.targetType} onChange={(ev) => setForm((f) => ({ ...f, targetType: ev.target.value }))}>
                    {TARGET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Zielgruppe</span>
                  <select className="admin-select" value={form.audience} onChange={(ev) => setForm((f) => ({ ...f, audience: ev.target.value }))}>
                    {AUDIENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Pfad (z. B. /help) oder https-URL</span>
                  <input
                    className="admin-input"
                    value={form.targetValue}
                    onChange={(ev) => setForm((f) => ({ ...f, targetValue: ev.target.value }))}
                    disabled={form.targetType === "none"}
                    placeholder={form.targetType === "none" ? "—" : "/help oder https://…"}
                  />
                </label>
              </div>
            </section>

            <section className="app-news-section" aria-labelledby="app-news-sec-vis">
              <h3 id="app-news-sec-vis" className="app-news-section__title">
                <span className="app-news-section__num">3</span>
                Sichtbarkeit
              </h3>
              <div className="app-news-section__grid app-news-section__grid--2">
                <label className="admin-form-pair">
                  <span className="admin-field-label">Homepage-Platz (1-5)</span>
                  <select
                    className="admin-select"
                    value={form.homepageSlot}
                    onChange={(ev) =>
                      setForm((f) => ({
                        ...f,
                        homepageSlot: ev.target.value,
                        sortOrder: ev.target.value ? ev.target.value : f.sortOrder,
                      }))
                    }
                  >
                    <option value="">Freie Sortierung</option>
                    <option value="1">Platz 1</option>
                    <option value="2">Platz 2</option>
                    <option value="3">Platz 3</option>
                    <option value="4">Platz 4</option>
                    <option value="5">Platz 5</option>
                  </select>
                </label>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Sortierung (aufsteigend)</span>
                  <input className="admin-input" type="number" value={form.sortOrder} onChange={(ev) => setForm((f) => ({ ...f, sortOrder: ev.target.value }))} />
                </label>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Sichtbar ab (optional)</span>
                  <input className="admin-input" type="datetime-local" value={form.startsAt} onChange={(ev) => setForm((f) => ({ ...f, startsAt: ev.target.value }))} />
                </label>
                <label className="admin-form-pair app-news-field--full">
                  <span className="admin-field-label">Sichtbar bis (optional)</span>
                  <input className="admin-input" type="datetime-local" value={form.endsAt} onChange={(ev) => setForm((f) => ({ ...f, endsAt: ev.target.value }))} />
                </label>
              </div>

              <div className="app-news-active-row">
                <div>
                  <div className="app-news-active-row__label">In der App anzeigen</div>
                  <p className="app-news-active-row__hint">
                    {activeSwitchDisabled
                      ? `Limit ${MAX_ACTIVE_APP_NEWS} aktiv — weitere Einträge nur inaktiv, oder zuerst eine andere Neuigkeit deaktivieren.`
                      : "Nur aktive Einträge im gültigen Zeitfenster erscheinen in der App."}
                  </p>
                </div>
                <label className={`app-news-switch ${activeSwitchDisabled ? "app-news-switch--disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    disabled={activeSwitchDisabled}
                    onChange={(ev) => setForm((f) => ({ ...f, isActive: ev.target.checked }))}
                  />
                  <span className="app-news-switch__slider" aria-hidden="true" />
                </label>
              </div>
            </section>
          </form>
        </div>

        <aside className="app-news-sidebar">
          <h2 className="app-news-sidebar__title">Alle Einträge</h2>
          {loading ? <p className="admin-muted">Lädt…</p> : null}
          <div className="app-news-list">
            {items.map((it) => (
              <article key={it.id} className={`app-news-list-card ${it.isActive ? "app-news-list-card--active" : ""}`}>
                <div className="app-news-list-card__top">
                  <div className="app-news-list-card__title">{it.title || "(ohne Titel)"}</div>
                  <span className={`app-news-pill ${it.isActive ? "app-news-pill--on" : "app-news-pill--off"}`}>
                    {it.isActive ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>
                <p className="app-news-list-card__body">{it.body}</p>
                <dl className="app-news-list-card__meta">
                  <div>
                    <dt>Zielgruppe</dt>
                    <dd>{audienceLabel(it.audience)}</dd>
                  </div>
                  <div>
                    <dt>Homepage-Platz</dt>
                    <dd>
                      {Number.isFinite(Number(it.sortOrder)) && Number(it.sortOrder) >= 1 && Number(it.sortOrder) <= 5
                        ? Number(it.sortOrder)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Sortierung</dt>
                    <dd>#{it.sortOrder ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Aktualisiert</dt>
                    <dd>{formatDeDate(it.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="app-news-list-card__actions">
                  <button type="button" className="btn btn-outline" onClick={() => startEdit(it)}>
                    Bearbeiten
                  </button>
                  {it.isActive ? (
                    <button type="button" className="btn btn-outline" onClick={() => void onDeactivate(it.id)}>
                      Deaktivieren
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
