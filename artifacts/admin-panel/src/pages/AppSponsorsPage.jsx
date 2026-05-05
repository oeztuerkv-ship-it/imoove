import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/app-sponsors`;

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "customer", label: "Kunden" },
  { value: "driver", label: "Fahrer" },
];

const CATEGORY_OPTIONS = [
  { value: "sponsor", label: "Sponsor" },
  { value: "partner", label: "Partner" },
  { value: "angebot", label: "Angebot" },
  { value: "event", label: "Event" },
];

function emptyForm() {
  return {
    title: "",
    description: "",
    imageUrl: "",
    logoUrl: "",
    externalUrl: "",
    buttonText: "Zur Webseite",
    qrCodeUrl: "",
    qrFromLink: true,
    category: "partner",
    audience: "all",
    isActive: true,
    sortOrder: "0",
    startsAt: "",
    endsAt: "",
  };
}

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  if (typeof data?.error === "string" && data.error) return data.error;
  return `HTTP ${res.status}`;
}

export default function AppSponsorsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [teaserTitleCustomer, setTeaserTitleCustomer] = useState("");
  const [teaserBodyCustomer, setTeaserBodyCustomer] = useState("");
  const [teaserTitleDriver, setTeaserTitleDriver] = useState("");
  const [teaserBodyDriver, setTeaserBodyDriver] = useState("");
  const [teaserSaving, setTeaserSaving] = useState(false);

  const mode = useMemo(() => (editingId ? "edit" : "create"), [editingId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(BASE);
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      setItems(Array.isArray(data.items) ? data.items : []);
      const cfgRes = await adminFetch(`${API_BASE}/admin/app-operational`);
      const { data: cfgData } = await readJson(cfgRes);
      if (cfgRes.ok && cfgData?.ok) {
        const msg = cfgData?.config?.messages && typeof cfgData.config.messages === "object" ? cfgData.config.messages : {};
        const fallbackTitle = typeof msg.sponsorsTeaserTitleDe === "string" ? msg.sponsorsTeaserTitleDe : "Exklusive Angebote";
        const fallbackBody =
          typeof msg.sponsorsTeaserBodyDe === "string"
            ? msg.sponsorsTeaserBodyDe
            : "Entdecke Partner, Aktionen und Angebote in deiner Nähe.";
        setTeaserTitleCustomer(
          typeof msg.sponsorsTeaserTitleCustomerDe === "string" ? msg.sponsorsTeaserTitleCustomerDe : fallbackTitle,
        );
        setTeaserBodyCustomer(
          typeof msg.sponsorsTeaserBodyCustomerDe === "string" ? msg.sponsorsTeaserBodyCustomerDe : fallbackBody,
        );
        setTeaserTitleDriver(
          typeof msg.sponsorsTeaserTitleDriverDe === "string" ? msg.sponsorsTeaserTitleDriverDe : "Exklusive Angebote für Fahrer",
        );
        setTeaserBodyDriver(
          typeof msg.sponsorsTeaserBodyDriverDe === "string"
            ? msg.sponsorsTeaserBodyDriverDe
            : "Rabatte, Partneraktionen und exklusive Vorteile für deinen Alltag.",
        );
      }
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

  function cancelEdit() {
    setEditingId("");
    setForm(emptyForm());
    setError("");
  }

  function startEdit(it) {
    setEditingId(it.id);
    setForm({
      title: it.title ?? "",
      description: it.description ?? "",
      imageUrl: it.imageUrl ?? "",
      logoUrl: it.logoUrl ?? "",
      externalUrl: it.externalUrl ?? "",
      buttonText: it.buttonText ?? "Zur Webseite",
      qrCodeUrl: it.qrCodeUrl ?? "",
      qrFromLink: !!it.qrFromLink,
      category: it.category ?? "partner",
      audience: it.audience ?? "all",
      isActive: !!it.isActive,
      sortOrder: String(it.sortOrder ?? 0),
      startsAt: toLocalDatetimeValue(it.startsAt),
      endsAt: toLocalDatetimeValue(it.endsAt),
    });
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const title = form.title.trim();
      const description = form.description.trim();
      if (!title || !description) throw new Error("Titel und Beschreibung sind Pflicht.");
      const body = {
        title,
        description,
        imageUrl: form.imageUrl.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        externalUrl: form.externalUrl.trim() || null,
        buttonText: form.buttonText.trim() || null,
        qrCodeUrl: form.qrCodeUrl.trim() || null,
        qrFromLink: !!form.qrFromLink,
        category: form.category,
        audience: form.audience,
        isActive: !!form.isActive,
        sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      const url = editingId ? `${BASE}/${encodeURIComponent(editingId)}` : BASE;
      const method = editingId ? "PATCH" : "POST";
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      await loadItems();
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(id) {
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      await loadItems();
      if (editingId === id) cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function saveTeaserBlock() {
    setTeaserSaving(true);
    setError("");
    try {
      const res = await adminFetch(`${API_BASE}/admin/app-operational`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: {
            sponsorsTeaserTitleCustomerDe: teaserTitleCustomer.trim() || "Exklusive Angebote",
            sponsorsTeaserBodyCustomerDe: teaserBodyCustomer.trim() || "Entdecke Partner, Aktionen und Angebote in deiner Nähe.",
            sponsorsTeaserTitleDriverDe: teaserTitleDriver.trim() || "Exklusive Angebote für Fahrer",
            sponsorsTeaserBodyDriverDe:
              teaserBodyDriver.trim() || "Rabatte, Partneraktionen und exklusive Vorteile für deinen Alltag.",
            sponsorsTeaserTitleDe: teaserTitleCustomer.trim() || "Exklusive Angebote",
            sponsorsTeaserBodyDe: teaserBodyCustomer.trim() || "Entdecke Partner, Aktionen und Angebote in deiner Nähe.",
          },
        }),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setTeaserSaving(false);
    }
  }

  return (
    <div className="admin-page admin-page--loose app-news-page">
      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Exklusive Angebote</div>
        <p className="admin-table-sub">
          Eigenständiger Bereich neben App-Neuigkeiten. Mobile nutzt <code>GET /api/app/sponsors</code> (max 10 aktiv).
        </p>
      </div>
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Homepage-Hinweisblock (getrennt nach App)</div>
        <p className="admin-table-sub">
          Auf der Startseite wird nur ein allgemeiner Hinweis gezeigt. Einzelne Angebote erscheinen erst auf der nächsten Seite <code>/sponsors</code>.
        </p>
        <div className="app-news-section__grid" style={{ marginTop: 10 }}>
          <label className="admin-form-pair app-news-field--full">
            <span className="admin-field-label">Kunden-App: Titel</span>
            <input className="admin-input" value={teaserTitleCustomer} onChange={(e) => setTeaserTitleCustomer(e.target.value)} />
          </label>
          <label className="admin-form-pair app-news-field--full">
            <span className="admin-field-label">Kunden-App: Kurztext</span>
            <textarea className="admin-textarea" rows={3} value={teaserBodyCustomer} onChange={(e) => setTeaserBodyCustomer(e.target.value)} />
          </label>
          <label className="admin-form-pair app-news-field--full">
            <span className="admin-field-label">Fahrer-App: Titel</span>
            <input className="admin-input" value={teaserTitleDriver} onChange={(e) => setTeaserTitleDriver(e.target.value)} />
          </label>
          <label className="admin-form-pair app-news-field--full">
            <span className="admin-field-label">Fahrer-App: Kurztext</span>
            <textarea className="admin-textarea" rows={3} value={teaserBodyDriver} onChange={(e) => setTeaserBodyDriver(e.target.value)} />
          </label>
        </div>
        <button type="button" className="btn btn-red" onClick={() => void saveTeaserBlock()} disabled={teaserSaving}>
          {teaserSaving ? "Speichert…" : "Hinweisblock speichern"}
        </button>
      </div>

      <div className="app-news-layout">
        <div className="app-news-main">
          <form onSubmit={onSubmit} className="app-news-form">
            <div className="app-news-form__head">
              <h2 className="app-news-form__title">{mode === "edit" ? "Sponsor bearbeiten" : "Neuen Sponsor anlegen"}</h2>
              <div className="app-news-form__actions">
                <button type="submit" className="btn btn-red" disabled={saving}>{saving ? "…" : mode === "edit" ? "Speichern" : "Anlegen"}</button>
                {editingId ? <button type="button" className="btn btn-outline" onClick={cancelEdit}>Abbrechen</button> : null}
              </div>
            </div>

            <div className="app-news-section__grid">
              <label className="admin-form-pair app-news-field--full"><span className="admin-field-label">Titel</span><input className="admin-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
              <label className="admin-form-pair app-news-field--full"><span className="admin-field-label">Beschreibung</span><textarea className="admin-textarea" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Bild-URL</span><input className="admin-input" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Logo-URL (optional)</span><input className="admin-input" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Externer Link (https)</span><input className="admin-input" value={form.externalUrl} onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Button-Text</span><input className="admin-input" value={form.buttonText} onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">QR-Code URL (optional)</span><input className="admin-input" value={form.qrCodeUrl} onChange={(e) => setForm((f) => ({ ...f, qrCodeUrl: e.target.value }))} disabled={form.qrFromLink} /></label>
              <label className="admin-form-pair" style={{ alignSelf: "end" }}><span className="admin-field-label">QR aus Link erzeugen</span><input type="checkbox" checked={form.qrFromLink} onChange={(e) => setForm((f) => ({ ...f, qrFromLink: e.target.checked }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Kategorie</span><select className="admin-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="admin-form-pair"><span className="admin-field-label">Zielgruppe</span><select className="admin-select" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>{AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="admin-form-pair"><span className="admin-field-label">Sortierung</span><input className="admin-input" type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Startdatum</span><input className="admin-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></label>
              <label className="admin-form-pair"><span className="admin-field-label">Enddatum</span><input className="admin-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} /></label>
              <label className="admin-form-pair" style={{ alignSelf: "end" }}><span className="admin-field-label">Aktiv</span><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} /></label>
            </div>
          </form>
        </div>
        <aside className="app-news-sidebar">
          <h2 className="app-news-sidebar__title">Einträge</h2>
          {loading ? <p className="admin-muted">Lädt…</p> : null}
          <div className="app-news-list">
            {items.map((it) => (
              <article key={it.id} className={`app-news-list-card ${it.isActive ? "app-news-list-card--active" : ""}`}>
                <div className="app-news-list-card__top">
                  <div className="app-news-list-card__title">{it.title || "(ohne Titel)"}</div>
                  <span className={`app-news-pill ${it.isActive ? "app-news-pill--on" : "app-news-pill--off"}`}>{it.isActive ? "Aktiv" : "Inaktiv"}</span>
                </div>
                <p className="app-news-list-card__body">{it.description}</p>
                <div className="app-news-list-card__actions">
                  <button type="button" className="btn btn-outline" onClick={() => startEdit(it)}>Bearbeiten</button>
                  {it.isActive ? <button type="button" className="btn btn-outline" onClick={() => void onDeactivate(it.id)}>Deaktivieren</button> : null}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
