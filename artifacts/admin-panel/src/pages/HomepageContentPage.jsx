import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/homepage-content`;

export default function HomepageContentPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [form, setForm] = useState({
    section2Title: "",
    section2Cards: [
      { icon: "🚕", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
      { icon: "🏢", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
      { icon: "🏨", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
      { icon: "🏥", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
    ],
    heroHeadline: "",
    heroSubline: "",
    cta1Text: "",
    cta1Link: "",
    cta2Text: "",
    cta2Link: "",
    noticeText: "",
    noticeActive: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Laden fehlgeschlagen (${res.status})`);
      const item = data.item || {};
      const defaults = [
        { icon: "🚕", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
        { icon: "🏢", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
        { icon: "🏨", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
        { icon: "🏥", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
      ];
      const incoming = Array.isArray(item.section2Cards) ? item.section2Cards.slice(0, 4) : [];
      const section2Cards = defaults.map((d, idx) => {
        const c = incoming[idx] || {};
        return {
          icon: c.icon || d.icon,
          title: c.title || d.title,
          body: c.body || d.body,
          ctaText: c.ctaText || d.ctaText,
          ctaLink: c.ctaLink || d.ctaLink,
          isActive: c.isActive !== undefined ? c.isActive !== false : d.isActive,
        };
      });
      setForm({
        section2Title: item.section2Title || "",
        section2Cards,
        heroHeadline: item.heroHeadline || "",
        heroSubline: item.heroSubline || "",
        cta1Text: item.cta1Text || "",
        cta1Link: item.cta1Link || "",
        cta2Text: item.cta2Text || "",
        cta2Link: item.cta2Link || "",
        noticeText: item.noticeText || "",
        noticeActive: item.noticeActive === true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          section2Title: form.section2Title,
          section2Cards: form.section2Cards,
          heroHeadline: form.heroHeadline,
          heroSubline: form.heroSubline,
          cta1Text: form.cta1Text,
          cta1Link: form.cta1Link,
          cta2Text: form.cta2Text,
          cta2Link: form.cta2Link,
          noticeText: form.noticeText,
          noticeActive: !!form.noticeActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern fehlgeschlagen (${res.status})`);
      setOkMsg("Homepage-Inhalte gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      {okMsg ? <div className="admin-info-banner">{okMsg}</div> : null}

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Homepage-Inhalte (Marketing)</div>
        <form className="admin-form-vertical" onSubmit={onSave}>
          <label className="admin-form-pair">
            <span className="admin-field-label">Section 2 Titel (Fuer wen)</span>
            <input
              className="admin-input"
              value={form.section2Title}
              onChange={(e) => setForm((p) => ({ ...p, section2Title: e.target.value }))}
            />
          </label>
          <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 14 }}>Section 2 Boxen (max. 4)</div>
            <div className="admin-form-vertical">
              {form.section2Cards.map((card, idx) => (
                <div key={`s2-card-${idx}`} className="admin-panel-card" style={{ padding: 12 }}>
                  <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Box {idx + 1}</div>
                  <div className="admin-form-grid-2">
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Icon (Emoji)</span>
                      <input
                        className="admin-input"
                        value={card.icon}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.section2Cards];
                            next[idx] = { ...next[idx], icon: e.target.value };
                            return { ...p, section2Cards: next };
                          })
                        }
                      />
                    </label>
                    <label className="admin-inline-check">
                      <input
                        type="checkbox"
                        checked={card.isActive}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.section2Cards];
                            next[idx] = { ...next[idx], isActive: e.target.checked };
                            return { ...p, section2Cards: next };
                          })
                        }
                      />
                      <span>Aktiv</span>
                    </label>
                  </div>
                  <label className="admin-form-pair">
                    <span className="admin-field-label">Titel</span>
                    <input
                      className="admin-input"
                      value={card.title}
                      onChange={(e) =>
                        setForm((p) => {
                          const next = [...p.section2Cards];
                          next[idx] = { ...next[idx], title: e.target.value };
                          return { ...p, section2Cards: next };
                        })
                      }
                    />
                  </label>
                  <label className="admin-form-pair">
                    <span className="admin-field-label">Text</span>
                    <textarea
                      className="admin-textarea"
                      rows={2}
                      value={card.body}
                      onChange={(e) =>
                        setForm((p) => {
                          const next = [...p.section2Cards];
                          next[idx] = { ...next[idx], body: e.target.value };
                          return { ...p, section2Cards: next };
                        })
                      }
                    />
                  </label>
                  <div className="admin-form-grid-2">
                    <label className="admin-form-pair">
                      <span className="admin-field-label">CTA Text</span>
                      <input
                        className="admin-input"
                        value={card.ctaText}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.section2Cards];
                            next[idx] = { ...next[idx], ctaText: e.target.value };
                            return { ...p, section2Cards: next };
                          })
                        }
                      />
                    </label>
                    <label className="admin-form-pair">
                      <span className="admin-field-label">CTA Link</span>
                      <input
                        className="admin-input"
                        value={card.ctaLink}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.section2Cards];
                            next[idx] = { ...next[idx], ctaLink: e.target.value };
                            return { ...p, section2Cards: next };
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <label className="admin-form-pair">
            <span className="admin-field-label">Hero-Headline</span>
            <textarea
              className="admin-textarea"
              rows={3}
              value={form.heroHeadline}
              onChange={(e) => setForm((p) => ({ ...p, heroHeadline: e.target.value }))}
            />
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Hero-Subline</span>
            <textarea
              className="admin-textarea"
              rows={3}
              value={form.heroSubline}
              onChange={(e) => setForm((p) => ({ ...p, heroSubline: e.target.value }))}
            />
          </label>
          <div className="admin-form-grid-2">
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA 1 Text</span>
              <input className="admin-input" value={form.cta1Text} onChange={(e) => setForm((p) => ({ ...p, cta1Text: e.target.value }))} />
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA 1 Link</span>
              <input className="admin-input" value={form.cta1Link} onChange={(e) => setForm((p) => ({ ...p, cta1Link: e.target.value }))} />
            </label>
          </div>
          <div className="admin-form-grid-2">
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA 2 Text</span>
              <input className="admin-input" value={form.cta2Text} onChange={(e) => setForm((p) => ({ ...p, cta2Text: e.target.value }))} />
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">CTA 2 Link</span>
              <input className="admin-input" value={form.cta2Link} onChange={(e) => setForm((p) => ({ ...p, cta2Link: e.target.value }))} />
            </label>
          </div>
          <label className="admin-form-pair">
            <span className="admin-field-label">Hinweis-Zeile Text</span>
            <textarea
              className="admin-textarea"
              rows={2}
              value={form.noticeText}
              onChange={(e) => setForm((p) => ({ ...p, noticeText: e.target.value }))}
            />
          </label>
          <label className="admin-inline-check">
            <input
              type="checkbox"
              checked={form.noticeActive}
              onChange={(e) => setForm((p) => ({ ...p, noticeActive: e.target.checked }))}
            />
            <span>Hinweis-Zeile aktiv</span>
          </label>
          <div className="admin-toolbar-row">
            <button className="admin-btn-primary" type="submit" disabled={saving || loading}>
              {saving ? "Speichern …" : "Speichern"}
            </button>
            <button className="admin-btn-refresh" type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "Lädt …" : "Neu laden"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
