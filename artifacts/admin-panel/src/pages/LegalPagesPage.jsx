import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/legal-pages`;

const TABS = [
  { slug: "agb", label: "AGB", livePath: "/agb" },
  { slug: "datenschutz", label: "Datenschutz", livePath: "/datenschutz" },
  { slug: "impressum", label: "Impressum", livePath: "/impressum" },
];

function emptyForm() {
  return { pageTitle: "", standLabel: "", bodyHtml: "" };
}

export default function LegalPagesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [activeSlug, setActiveSlug] = useState("agb");
  const [pages, setPages] = useState({});
  const [form, setForm] = useState(emptyForm());

  const activeTab = useMemo(() => TABS.find((t) => t.slug === activeSlug) ?? TABS[0], [activeSlug]);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Laden fehlgeschlagen (${res.status})`);
      const map = {};
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (item?.slug) {
          map[item.slug] = {
            pageTitle: item.pageTitle ?? "",
            standLabel: item.standLabel ?? "",
            bodyHtml: item.bodyHtml ?? "",
            updatedAt: item.updatedAt ?? null,
          };
        }
      }
      setPages(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    const p = pages[activeSlug];
    if (p) {
      setForm({
        pageTitle: p.pageTitle,
        standLabel: p.standLabel,
        bodyHtml: p.bodyHtml,
      });
    } else {
      setForm(emptyForm());
    }
    setOkMsg("");
  }, [activeSlug, pages]);

  const save = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`${URL}/${activeSlug}`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern fehlgeschlagen (${res.status})`);
      setOkMsg(`${activeTab.label} gespeichert. Live unter onroda.de${activeTab.livePath} (ca. 1 Min. Cache).`);
      await loadPages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Rechtstexte</h1>
        <p className="admin-page-subtitle">
          AGB, Datenschutz und Impressum für onroda.de — ohne Code-Deploy bearbeiten. Änderungen sind nach dem Speichern
          auf der Website sichtbar (Browser-Cache ggf. hart aktualisieren).
        </p>
      </header>

      {error ? <div className="admin-alert admin-alert--error">{error}</div> : null}
      {okMsg ? <div className="admin-alert admin-alert--success">{okMsg}</div> : null}

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-tab-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              className={activeSlug === tab.slug ? "admin-btn-primary" : "admin-btn-refresh"}
              onClick={() => setActiveSlug(tab.slug)}
              disabled={loading}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="admin-muted">Lade Rechtstexte…</p>
      ) : (
        <div className="admin-panel-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <h2 className="admin-panel-card__title" style={{ margin: 0 }}>
              {activeTab.label}
            </h2>
            <a
              className="admin-btn-refresh"
              href={`https://onroda.de${activeTab.livePath}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Vorschau (Live)
            </a>
          </div>

          <label className="admin-form-pair">
            <span className="admin-field-label">Seitentitel (Browser-Tab)</span>
            <input
              className="admin-input"
              value={form.pageTitle}
              onChange={(e) => setForm((p) => ({ ...p, pageTitle: e.target.value }))}
            />
          </label>

          <label className="admin-form-pair">
            <span className="admin-field-label">Stand (z. B. Juni 2026)</span>
            <input
              className="admin-input"
              value={form.standLabel}
              onChange={(e) => setForm((p) => ({ ...p, standLabel: e.target.value }))}
              placeholder="Optional — nur Metadatum im Admin, nicht automatisch im HTML eingefügt"
            />
          </label>

          <label className="admin-form-pair">
            <span className="admin-field-label">HTML-Inhalt (innerhalb der Karte)</span>
            <p className="admin-muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
              Vollständiger Inhalt inkl. Überschrift, Absätze und Footer-Links. Kein Markdown — direktes HTML wie bisher in den
              Static-Dateien.
            </p>
            <textarea
              className="admin-textarea"
              rows={22}
              value={form.bodyHtml}
              onChange={(e) => setForm((p) => ({ ...p, bodyHtml: e.target.value }))}
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <button className="admin-btn-primary" type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Speichert…" : `${activeTab.label} speichern`}
            </button>
            <button className="admin-btn-refresh" type="button" onClick={() => void loadPages()} disabled={saving}>
              Verwerfen / neu laden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
