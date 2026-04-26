import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/homepage-content`;
const FAQ_URL = `${API_BASE}/admin/homepage-faq`;
const HOW_URL = `${API_BASE}/admin/homepage-how`;
const TRUST_URL = `${API_BASE}/admin/homepage-trust`;

const defaultSection2 = () => [
  { icon: "🚕", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
  { icon: "🏢", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
  { icon: "🏨", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
  { icon: "🏥", title: "", body: "", ctaText: "", ctaLink: "", isActive: false },
];

const defaultServices = () => [
  { icon: "⏱", title: "", body: "", isActive: true },
  { icon: "📅", title: "", body: "", isActive: true },
  { icon: "🧾", title: "", body: "", isActive: true },
];

const defaultManifest = () => [
  { num: "1", icon: "📍", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
  { num: "2", icon: "⚡", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
  { num: "3", icon: "🤝", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
  { num: "4", icon: "🛡", title: "", body: "", ctaText: "", ctaLink: "", isActive: true },
];

function mergeSection2(incoming) {
  const d = defaultSection2();
  const arr = Array.isArray(incoming) ? incoming.slice(0, 4) : [];
  return d.map((row, idx) => {
    const c = arr[idx] || {};
    return {
      icon: c.icon || row.icon,
      title: c.title || row.title,
      body: c.body || row.body,
      ctaText: c.ctaText || row.ctaText,
      ctaLink: c.ctaLink || row.ctaLink,
      isActive: c.isActive !== undefined ? c.isActive !== false : row.isActive,
    };
  });
}

function mergeServices(incoming) {
  const d = defaultServices();
  const arr = Array.isArray(incoming) ? incoming.slice(0, 3) : [];
  return d.map((row, idx) => {
    const c = arr[idx] || {};
    return {
      icon: c.icon || row.icon,
      title: c.title || row.title,
      body: c.body || row.body,
      isActive: c.isActive !== undefined ? c.isActive !== false : row.isActive,
    };
  });
}

function mergeManifest(incoming) {
  const d = defaultManifest();
  const arr = Array.isArray(incoming) ? incoming.slice(0, 4) : [];
  return d.map((row, idx) => {
    const c = arr[idx] || {};
    return {
      num: c.num != null && String(c.num).trim() !== "" ? String(c.num).trim() : row.num,
      icon: c.icon || row.icon,
      title: c.title || row.title,
      body: c.body || row.body,
      ctaText: c.ctaText || row.ctaText,
      ctaLink: c.ctaLink || row.ctaLink,
      isActive: c.isActive !== undefined ? c.isActive !== false : row.isActive,
    };
  });
}

export default function HomepageContentPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [form, setForm] = useState({
    section2Title: "",
    section2Cards: defaultSection2(),
    servicesKicker: "",
    servicesTitle: "",
    servicesSubline: "",
    servicesCards: defaultServices(),
    manifestKicker: "",
    manifestTitle: "",
    manifestSubline: "",
    manifestCards: defaultManifest(),
    heroHeadline: "",
    heroSubline: "",
    cta1Text: "",
    cta1Link: "",
    cta2Text: "",
    cta2Link: "",
    noticeText: "",
    noticeActive: false,
  });
  const [faqItems, setFaqItems] = useState([]);
  const [howItems, setHowItems] = useState([]);
  const [trustItems, setTrustItems] = useState([]);
  const [faqDraft, setFaqDraft] = useState({ question: "", answer: "", sortOrder: 10, isActive: true });
  const [howDraft, setHowDraft] = useState({ icon: "1", title: "", body: "", sortOrder: 10, isActive: true });
  const [trustDraft, setTrustDraft] = useState({
    value: "",
    label: "",
    description: "",
    sortOrder: 10,
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Laden fehlgeschlagen (${res.status})`);
      const item = data.item || {};
      setForm({
        section2Title: item.section2Title || "",
        section2Cards: mergeSection2(item.section2Cards),
        servicesKicker: item.servicesKicker || "",
        servicesTitle: item.servicesTitle || "",
        servicesSubline: item.servicesSubline || "",
        servicesCards: mergeServices(item.servicesCards),
        manifestKicker: item.manifestKicker || "",
        manifestTitle: item.manifestTitle || "",
        manifestSubline: item.manifestSubline || "",
        manifestCards: mergeManifest(item.manifestCards),
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

  const loadModules = useCallback(async () => {
    try {
      const [faqRes, howRes, trustRes] = await Promise.all([
        fetch(FAQ_URL, { headers: adminApiHeaders() }),
        fetch(HOW_URL, { headers: adminApiHeaders() }),
        fetch(TRUST_URL, { headers: adminApiHeaders() }),
      ]);
      const faq = await faqRes.json().catch(() => ({}));
      const how = await howRes.json().catch(() => ({}));
      const trust = await trustRes.json().catch(() => ({}));
      if (faqRes.ok && faq?.ok && Array.isArray(faq.items)) setFaqItems(faq.items);
      if (howRes.ok && how?.ok && Array.isArray(how.items)) setHowItems(how.items);
      if (trustRes.ok && trust?.ok && Array.isArray(trust.items)) setTrustItems(trust.items);
    } catch {
      // keep page editable even if module endpoints fail
    }
  }, []);

  async function createModuleItem(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Erstellen fehlgeschlagen (${res.status})`);
  }

  async function patchModuleItem(url, id, payload) {
    const res = await fetch(`${url}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern fehlgeschlagen (${res.status})`);
  }

  async function deleteModuleItem(url, id) {
    const res = await fetch(`${url}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminApiHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Löschen fehlgeschlagen (${res.status})`);
  }

  useEffect(() => {
    void load();
    void loadModules();
  }, [load, loadModules]);

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
          servicesKicker: form.servicesKicker,
          servicesTitle: form.servicesTitle,
          servicesSubline: form.servicesSubline,
          servicesCards: form.servicesCards,
          manifestKicker: form.manifestKicker,
          manifestTitle: form.manifestTitle,
          manifestSubline: form.manifestSubline,
          manifestCards: form.manifestCards,
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
            <span className="admin-field-label">Section 2 Titel (Für wen)</span>
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

          <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 14 }}>Leistungen (Services, #services)</div>
            <div className="admin-form-vertical">
              <label className="admin-form-pair">
                <span className="admin-field-label">Kicker (kleine Zeile)</span>
                <input
                  className="admin-input"
                  value={form.servicesKicker}
                  onChange={(e) => setForm((p) => ({ ...p, servicesKicker: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Titel</span>
                <input
                  className="admin-input"
                  value={form.servicesTitle}
                  onChange={(e) => setForm((p) => ({ ...p, servicesTitle: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Unterzeile</span>
                <input
                  className="admin-input"
                  value={form.servicesSubline}
                  onChange={(e) => setForm((p) => ({ ...p, servicesSubline: e.target.value }))}
                />
              </label>
              {form.servicesCards.map((card, idx) => (
                <div key={`svc-${idx}`} className="admin-panel-card" style={{ padding: 12 }}>
                  <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Service {idx + 1}</div>
                  <div className="admin-form-grid-2">
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Icon</span>
                      <input
                        className="admin-input"
                        value={card.icon}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.servicesCards];
                            next[idx] = { ...next[idx], icon: e.target.value };
                            return { ...p, servicesCards: next };
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
                            const next = [...p.servicesCards];
                            next[idx] = { ...next[idx], isActive: e.target.checked };
                            return { ...p, servicesCards: next };
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
                          const next = [...p.servicesCards];
                          next[idx] = { ...next[idx], title: e.target.value };
                          return { ...p, servicesCards: next };
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
                          const next = [...p.servicesCards];
                          next[idx] = { ...next[idx], body: e.target.value };
                          return { ...p, servicesCards: next };
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 14 }}>ONRODA Manifest (#manifest)</div>
            <div className="admin-form-vertical">
              <label className="admin-form-pair">
                <span className="admin-field-label">Kicker</span>
                <input
                  className="admin-input"
                  value={form.manifestKicker}
                  onChange={(e) => setForm((p) => ({ ...p, manifestKicker: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Titel</span>
                <input
                  className="admin-input"
                  value={form.manifestTitle}
                  onChange={(e) => setForm((p) => ({ ...p, manifestTitle: e.target.value }))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Unterzeile (rot hervorgehoben)</span>
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={form.manifestSubline}
                  onChange={(e) => setForm((p) => ({ ...p, manifestSubline: e.target.value }))}
                />
              </label>
              {form.manifestCards.map((card, idx) => (
                <div key={`man-${idx}`} className="admin-panel-card" style={{ padding: 12 }}>
                  <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Punkt {idx + 1}</div>
                  <div className="admin-form-grid-2">
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Nummer (Anzeige)</span>
                      <input
                        className="admin-input"
                        value={card.num}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.manifestCards];
                            next[idx] = { ...next[idx], num: e.target.value };
                            return { ...p, manifestCards: next };
                          })
                        }
                      />
                    </label>
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Icon</span>
                      <input
                        className="admin-input"
                        value={card.icon}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.manifestCards];
                            next[idx] = { ...next[idx], icon: e.target.value };
                            return { ...p, manifestCards: next };
                          })
                        }
                      />
                    </label>
                    <label className="admin-inline-check" style={{ gridColumn: "1 / -1" }}>
                      <input
                        type="checkbox"
                        checked={card.isActive}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.manifestCards];
                            next[idx] = { ...next[idx], isActive: e.target.checked };
                            return { ...p, manifestCards: next };
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
                          const next = [...p.manifestCards];
                          next[idx] = { ...next[idx], title: e.target.value };
                          return { ...p, manifestCards: next };
                        })
                      }
                    />
                  </label>
                  <label className="admin-form-pair">
                    <span className="admin-field-label">Text</span>
                    <textarea
                      className="admin-textarea"
                      rows={3}
                      value={card.body}
                      onChange={(e) =>
                        setForm((p) => {
                          const next = [...p.manifestCards];
                          next[idx] = { ...next[idx], body: e.target.value };
                          return { ...p, manifestCards: next };
                        })
                      }
                    />
                  </label>
                  <div className="admin-form-grid-2">
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Link-Text</span>
                      <input
                        className="admin-input"
                        value={card.ctaText}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.manifestCards];
                            next[idx] = { ...next[idx], ctaText: e.target.value };
                            return { ...p, manifestCards: next };
                          })
                        }
                      />
                    </label>
                    <label className="admin-form-pair">
                      <span className="admin-field-label">Link-Ziel</span>
                      <input
                        className="admin-input"
                        value={card.ctaLink}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...p.manifestCards];
                            next[idx] = { ...next[idx], ctaLink: e.target.value };
                            return { ...p, manifestCards: next };
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

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Homepage FAQ (modular)</div>
        <div className="admin-form-vertical">
          {faqItems.map((item) => (
            <div key={item.id} className="admin-panel-card" style={{ padding: 12 }}>
              <div className="admin-form-grid-2">
                <label className="admin-form-pair">
                  <span className="admin-field-label">Reihenfolge</span>
                  <input
                    className="admin-input"
                    type="number"
                    value={item.sortOrder ?? 0}
                    onChange={(e) =>
                      setFaqItems((p) => p.map((x) => (x.id === item.id ? { ...x, sortOrder: Number(e.target.value || 0) } : x)))
                    }
                  />
                </label>
                <label className="admin-inline-check">
                  <input
                    type="checkbox"
                    checked={item.isActive !== false}
                    onChange={(e) =>
                      setFaqItems((p) => p.map((x) => (x.id === item.id ? { ...x, isActive: e.target.checked } : x)))
                    }
                  />
                  <span>Aktiv</span>
                </label>
              </div>
              <label className="admin-form-pair">
                <span className="admin-field-label">Frage</span>
                <input
                  className="admin-input"
                  value={item.question || ""}
                  onChange={(e) => setFaqItems((p) => p.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)))}
                />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Antwort</span>
                <textarea
                  className="admin-textarea"
                  rows={3}
                  value={item.answer || ""}
                  onChange={(e) => setFaqItems((p) => p.map((x) => (x.id === item.id ? { ...x, answer: e.target.value } : x)))}
                />
              </label>
              <div className="admin-toolbar-row">
                <button
                  className="admin-btn-primary"
                  type="button"
                  onClick={async () => {
                    try {
                      await patchModuleItem(FAQ_URL, item.id, item);
                      setOkMsg("FAQ gespeichert.");
                      await loadModules();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "FAQ speichern fehlgeschlagen");
                    }
                  }}
                >
                  FAQ speichern
                </button>
                <button
                  className="admin-btn-refresh"
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteModuleItem(FAQ_URL, item.id);
                      await loadModules();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "FAQ löschen fehlgeschlagen");
                    }
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
          <div className="admin-panel-card" style={{ padding: 12 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Neue FAQ</div>
            <label className="admin-form-pair">
              <span className="admin-field-label">Frage</span>
              <input className="admin-input" value={faqDraft.question} onChange={(e) => setFaqDraft((p) => ({ ...p, question: e.target.value }))} />
            </label>
            <label className="admin-form-pair">
              <span className="admin-field-label">Antwort</span>
              <textarea className="admin-textarea" rows={3} value={faqDraft.answer} onChange={(e) => setFaqDraft((p) => ({ ...p, answer: e.target.value }))} />
            </label>
            <button
              className="admin-btn-primary"
              type="button"
              onClick={async () => {
                try {
                  await createModuleItem(FAQ_URL, faqDraft);
                  setFaqDraft({ question: "", answer: "", sortOrder: 10, isActive: true });
                  await loadModules();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "FAQ erstellen fehlgeschlagen");
                }
              }}
            >
              FAQ hinzufügen
            </button>
          </div>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">So funktioniert ONRODA (3 Schritte)</div>
        <div className="admin-form-vertical">
          {howItems.map((item) => (
            <div key={item.id} className="admin-panel-card" style={{ padding: 12 }}>
              <div className="admin-form-grid-2">
                <label className="admin-form-pair">
                  <span className="admin-field-label">Icon</span>
                  <input className="admin-input" value={item.icon || ""} onChange={(e) => setHowItems((p) => p.map((x) => (x.id === item.id ? { ...x, icon: e.target.value } : x)))} />
                </label>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Reihenfolge</span>
                  <input className="admin-input" type="number" value={item.sortOrder ?? 0} onChange={(e) => setHowItems((p) => p.map((x) => (x.id === item.id ? { ...x, sortOrder: Number(e.target.value || 0) } : x)))} />
                </label>
              </div>
              <label className="admin-form-pair">
                <span className="admin-field-label">Titel</span>
                <input className="admin-input" value={item.title || ""} onChange={(e) => setHowItems((p) => p.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))} />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Text</span>
                <textarea className="admin-textarea" rows={2} value={item.body || ""} onChange={(e) => setHowItems((p) => p.map((x) => (x.id === item.id ? { ...x, body: e.target.value } : x)))} />
              </label>
              <label className="admin-inline-check">
                <input type="checkbox" checked={item.isActive !== false} onChange={(e) => setHowItems((p) => p.map((x) => (x.id === item.id ? { ...x, isActive: e.target.checked } : x)))} />
                <span>Aktiv</span>
              </label>
              <div className="admin-toolbar-row">
                <button className="admin-btn-primary" type="button" onClick={async () => { try { await patchModuleItem(HOW_URL, item.id, item); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "Schritt speichern fehlgeschlagen"); } }}>Schritt speichern</button>
                <button className="admin-btn-refresh" type="button" onClick={async () => { try { await deleteModuleItem(HOW_URL, item.id); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "Schritt löschen fehlgeschlagen"); } }}>Löschen</button>
              </div>
            </div>
          ))}
          <div className="admin-panel-card" style={{ padding: 12 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Neuer Schritt</div>
            <div className="admin-form-grid-2">
              <input className="admin-input" value={howDraft.icon} onChange={(e) => setHowDraft((p) => ({ ...p, icon: e.target.value }))} />
              <input className="admin-input" type="number" value={howDraft.sortOrder} onChange={(e) => setHowDraft((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))} />
            </div>
            <input className="admin-input" value={howDraft.title} onChange={(e) => setHowDraft((p) => ({ ...p, title: e.target.value }))} />
            <textarea className="admin-textarea" rows={2} value={howDraft.body} onChange={(e) => setHowDraft((p) => ({ ...p, body: e.target.value }))} />
            <button className="admin-btn-primary" type="button" onClick={async () => { try { await createModuleItem(HOW_URL, howDraft); setHowDraft({ icon: "1", title: "", body: "", sortOrder: 10, isActive: true }); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "Schritt erstellen fehlgeschlagen"); } }}>Schritt hinzufügen</button>
          </div>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Trust-Zahlen (KPI-Kacheln)</div>
        <div className="admin-form-vertical">
          {trustItems.map((item) => (
            <div key={item.id} className="admin-panel-card" style={{ padding: 12 }}>
              <label className="admin-form-pair">
                <span className="admin-field-label">Zahl / Value</span>
                <input className="admin-input" value={item.value || ""} onChange={(e) => setTrustItems((p) => p.map((x) => (x.id === item.id ? { ...x, value: e.target.value } : x)))} />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Label</span>
                <input className="admin-input" value={item.label || ""} onChange={(e) => setTrustItems((p) => p.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)))} />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Beschreibung</span>
                <textarea className="admin-textarea" rows={2} value={item.description || ""} onChange={(e) => setTrustItems((p) => p.map((x) => (x.id === item.id ? { ...x, description: e.target.value } : x)))} />
              </label>
              <div className="admin-form-grid-2">
                <input className="admin-input" type="number" value={item.sortOrder ?? 0} onChange={(e) => setTrustItems((p) => p.map((x) => (x.id === item.id ? { ...x, sortOrder: Number(e.target.value || 0) } : x)))} />
                <label className="admin-inline-check">
                  <input type="checkbox" checked={item.isActive !== false} onChange={(e) => setTrustItems((p) => p.map((x) => (x.id === item.id ? { ...x, isActive: e.target.checked } : x)))} />
                  <span>Aktiv</span>
                </label>
              </div>
              <div className="admin-toolbar-row">
                <button className="admin-btn-primary" type="button" onClick={async () => { try { await patchModuleItem(TRUST_URL, item.id, item); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "KPI speichern fehlgeschlagen"); } }}>KPI speichern</button>
                <button className="admin-btn-refresh" type="button" onClick={async () => { try { await deleteModuleItem(TRUST_URL, item.id); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "KPI löschen fehlgeschlagen"); } }}>Löschen</button>
              </div>
            </div>
          ))}
          <div className="admin-panel-card" style={{ padding: 12 }}>
            <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Neue KPI</div>
            <input className="admin-input" value={trustDraft.value} placeholder="Zahl / Wert" onChange={(e) => setTrustDraft((p) => ({ ...p, value: e.target.value }))} />
            <input className="admin-input" value={trustDraft.label} placeholder="Label" onChange={(e) => setTrustDraft((p) => ({ ...p, label: e.target.value }))} />
            <textarea className="admin-textarea" rows={2} value={trustDraft.description} placeholder="Beschreibung" onChange={(e) => setTrustDraft((p) => ({ ...p, description: e.target.value }))} />
            <button className="admin-btn-primary" type="button" onClick={async () => { try { await createModuleItem(TRUST_URL, trustDraft); setTrustDraft({ value: "", label: "", description: "", sortOrder: 10, isActive: true }); await loadModules(); } catch (e) { setError(e instanceof Error ? e.message : "KPI erstellen fehlgeschlagen"); } }}>KPI hinzufügen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
