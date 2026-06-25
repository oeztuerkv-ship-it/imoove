import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const UPLOAD_URL = `${API_BASE}/admin/homepage-marketing-assets`;
const HOMEPAGE_URL = `${API_BASE}/admin/homepage-content`;

const defaultPromoBlocks = () => [
  { icon: "🎯", title: "", body: "", isActive: true },
  { icon: "🎫", title: "", body: "", isActive: true },
  { icon: "📱", title: "", body: "", isActive: true },
];

export const defaultNavPromo = () => ({
  label: "Fixpreise",
  href: "/fixpreise/",
  isActive: true,
  badge: "",
  highlight: true,
});

export const defaultFixpreisSection = () => ({
  title: "Festpreis-Fahrten",
  body: "Transparente Pauschalpreise für Ihre Strecke außerhalb des Pflichtfahrgebiets — Grundgebühr plus Kilometer nach ONRODA-Tarif. In der App buchen oder Festpreis-Gutschein über Hotel und Partner.",
  kicker: "Werbung · Festpreis",
  logoUrl: "",
  heroImageUrl: "",
  titleFontSize: "lg",
  bodyFontSize: "md",
  titleColor: "",
  bodyColor: "",
  accentColor: "",
  backgroundColor: "",
  textAlign: "center",
  ctaText: "Jetzt in der App buchen",
  ctaLink: "/#jetzt-buchen",
  secondaryCtaText: "",
  secondaryCtaLink: "",
  promoBlocks: defaultPromoBlocks(),
  isActive: true,
});

export function mergeNavPromo(incoming) {
  const d = defaultNavPromo();
  const p = incoming && typeof incoming === "object" ? incoming : {};
  let href = typeof p.href === "string" && p.href.trim() !== "" ? p.href.trim() : d.href;
  if (href === "#fixpreise" || href === "/fixpreise") href = "/fixpreise/";
  return {
    label: typeof p.label === "string" && p.label.trim() !== "" ? p.label.trim() : d.label,
    href,
    isActive: p.isActive !== false,
    badge: typeof p.badge === "string" ? p.badge.trim() : d.badge,
    highlight: p.highlight !== false,
  };
}

export function mergeFixpreisSection(incoming) {
  const d = defaultFixpreisSection();
  const p = incoming && typeof incoming === "object" ? incoming : {};
  const blocksIn = Array.isArray(p.promoBlocks) ? p.promoBlocks.slice(0, 6) : [];
  const promoBlocks = defaultPromoBlocks().map((row, idx) => {
    const c = blocksIn[idx] || {};
    return {
      icon: c.icon || row.icon,
      title: c.title || row.title,
      body: c.body || row.body,
      isActive: c.isActive !== undefined ? c.isActive !== false : row.isActive,
    };
  });
  return {
    title: typeof p.title === "string" && p.title.trim() !== "" ? p.title.trim() : d.title,
    body: typeof p.body === "string" && p.body.trim() !== "" ? p.body.trim() : d.body,
    kicker: typeof p.kicker === "string" ? p.kicker.trim() : d.kicker,
    logoUrl: typeof p.logoUrl === "string" ? p.logoUrl.trim() : d.logoUrl,
    heroImageUrl: typeof p.heroImageUrl === "string" ? p.heroImageUrl.trim() : d.heroImageUrl,
    titleFontSize: ["sm", "md", "lg", "xl"].includes(p.titleFontSize) ? p.titleFontSize : d.titleFontSize,
    bodyFontSize: ["sm", "md", "lg"].includes(p.bodyFontSize) ? p.bodyFontSize : d.bodyFontSize,
    titleColor: typeof p.titleColor === "string" ? p.titleColor.trim() : d.titleColor,
    bodyColor: typeof p.bodyColor === "string" ? p.bodyColor.trim() : d.bodyColor,
    accentColor: typeof p.accentColor === "string" ? p.accentColor.trim() : d.accentColor,
    backgroundColor: typeof p.backgroundColor === "string" ? p.backgroundColor.trim() : d.backgroundColor,
    textAlign: ["left", "center", "right"].includes(p.textAlign) ? p.textAlign : d.textAlign,
    ctaText: typeof p.ctaText === "string" && p.ctaText.trim() !== "" ? p.ctaText.trim() : d.ctaText,
    ctaLink: typeof p.ctaLink === "string" && p.ctaLink.trim() !== "" ? p.ctaLink.trim() : d.ctaLink,
    secondaryCtaText: typeof p.secondaryCtaText === "string" ? p.secondaryCtaText.trim() : d.secondaryCtaText,
    secondaryCtaLink: typeof p.secondaryCtaLink === "string" ? p.secondaryCtaLink.trim() : d.secondaryCtaLink,
    promoBlocks,
    isActive: p.isActive !== false,
  };
}

async function uploadMarketingAsset(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: adminApiHeaders(),
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data?.url) {
    throw new Error(data?.error || `Upload fehlgeschlagen (${res.status})`);
  }
  return String(data.url);
}

function AssetField({ label, value, onChange, hint }) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr("");
    try {
      const url = await uploadMarketingAsset(file);
      onChange(url);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <label className="admin-form-pair">
      <span className="admin-field-label">{label}</span>
      <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="/cms-assets/… oder https://…" />
      {hint ? <span className="admin-muted" style={{ fontSize: 12 }}>{hint}</span> : null}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <label className="admin-btn admin-btn--secondary" style={{ cursor: uploading ? "wait" : "pointer" }}>
          {uploading ? "Lädt…" : "Bild hochladen"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => void onFile(e)} />
        </label>
        {value ? (
          <img src={value.startsWith("http") ? value : `https://www.onroda.de${value}`} alt="" style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }} />
        ) : null}
      </div>
      {uploadErr ? <span className="admin-muted" style={{ color: "var(--admin-danger, #c00)", fontSize: 12 }}>{uploadErr}</span> : null}
    </label>
  );
}

export default function FixpreisLandingEditor({ navPromo, fixpreisSection, onNavPromoChange, onFixpreisChange }) {
  const [savingNav, setSavingNav] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function savePartial(payload, which) {
    const setSaving = which === "nav" ? setSavingNav : setSavingPage;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(HOMEPAGE_URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Speichern fehlgeschlagen (${res.status})`);
      if (data.item?.navPromo) onNavPromoChange(mergeNavPromo(data.item.navPromo));
      if (data.item?.fixpreisSection) onFixpreisChange(mergeFixpreisSection(data.item.fixpreisSection));
      setMsg(which === "nav" ? "Navigation gespeichert." : "Fixpreise-Seite gespeichert.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function setBlock(idx, patch) {
    const next = [...fixpreisSection.promoBlocks];
    next[idx] = { ...next[idx], ...patch };
    onFixpreisChange({ ...fixpreisSection, promoBlocks: next });
  }

  return (
    <>
      {err ? <div className="admin-error-banner">{err}</div> : null}
      {msg ? <div className="admin-info-banner">{msg}</div> : null}

      <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
        <div className="admin-panel-card__title" style={{ fontSize: 14 }}>Navigation: Fixpreise (Werbung)</div>
        <p className="admin-muted" style={{ marginTop: 0 }}>
          Link in der Kopfzeile — Ziel standardmäßig <code>/fixpreise/</code>. Vorschau:{" "}
          <a href="https://www.onroda.de/fixpreise/" target="_blank" rel="noopener noreferrer">onroda.de/fixpreise</a>
        </p>
        <label className="admin-inline-check">
          <input type="checkbox" checked={navPromo.isActive} onChange={(e) => onNavPromoChange({ ...navPromo, isActive: e.target.checked })} />
          <span>Link in Navigation anzeigen</span>
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Link-Text</span>
          <input className="admin-input" value={navPromo.label} onChange={(e) => onNavPromoChange({ ...navPromo, label: e.target.value })} />
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Ziel-URL</span>
          <input className="admin-input" value={navPromo.href} onChange={(e) => onNavPromoChange({ ...navPromo, href: e.target.value })} placeholder="/fixpreise/" />
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Badge (optional)</span>
          <input className="admin-input" value={navPromo.badge} onChange={(e) => onNavPromoChange({ ...navPromo, badge: e.target.value })} />
        </label>
        <label className="admin-inline-check">
          <input type="checkbox" checked={navPromo.highlight} onChange={(e) => onNavPromoChange({ ...navPromo, highlight: e.target.checked })} />
          <span>Rot hervorheben</span>
        </label>
        <button type="button" className="admin-btn admin-btn--primary" disabled={savingNav} onClick={() => void savePartial({ navPromo }, "nav")}>
          {savingNav ? "Speichert…" : "Navigation speichern"}
        </button>
      </div>

      <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
        <div className="admin-panel-card__title" style={{ fontSize: 14 }}>Werbeseite /fixpreise — Inhalt &amp; Design</div>
        <label className="admin-inline-check">
          <input type="checkbox" checked={fixpreisSection.isActive} onChange={(e) => onFixpreisChange({ ...fixpreisSection, isActive: e.target.checked })} />
          <span>Seite öffentlich anzeigen</span>
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Kicker (kleine Zeile über der Überschrift)</span>
          <input className="admin-input" value={fixpreisSection.kicker} onChange={(e) => onFixpreisChange({ ...fixpreisSection, kicker: e.target.value })} />
        </label>
        <AssetField label="Logo (optional)" value={fixpreisSection.logoUrl} onChange={(v) => onFixpreisChange({ ...fixpreisSection, logoUrl: v })} hint="PNG/JPG/WebP — wird über /cms-assets/ ausgeliefert." />
        <AssetField label="Hero-Bild (optional)" value={fixpreisSection.heroImageUrl} onChange={(v) => onFixpreisChange({ ...fixpreisSection, heroImageUrl: v })} />
        <label className="admin-form-pair">
          <span className="admin-field-label">Überschrift</span>
          <input className="admin-input" value={fixpreisSection.title} onChange={(e) => onFixpreisChange({ ...fixpreisSection, title: e.target.value })} />
        </label>
        <div className="admin-form-grid-2">
          <label className="admin-form-pair">
            <span className="admin-field-label">Überschrift Größe</span>
            <select className="admin-input" value={fixpreisSection.titleFontSize} onChange={(e) => onFixpreisChange({ ...fixpreisSection, titleFontSize: e.target.value })}>
              <option value="sm">Klein</option>
              <option value="md">Mittel</option>
              <option value="lg">Groß</option>
              <option value="xl">Sehr groß</option>
            </select>
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Text Größe</span>
            <select className="admin-input" value={fixpreisSection.bodyFontSize} onChange={(e) => onFixpreisChange({ ...fixpreisSection, bodyFontSize: e.target.value })}>
              <option value="sm">Klein</option>
              <option value="md">Mittel</option>
              <option value="lg">Groß</option>
            </select>
          </label>
        </div>
        <div className="admin-form-grid-2">
          <label className="admin-form-pair">
            <span className="admin-field-label">Ausrichtung</span>
            <select className="admin-input" value={fixpreisSection.textAlign} onChange={(e) => onFixpreisChange({ ...fixpreisSection, textAlign: e.target.value })}>
              <option value="left">Links</option>
              <option value="center">Zentriert</option>
              <option value="right">Rechts</option>
            </select>
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Akzentfarbe (Buttons, Kicker)</span>
            <input className="admin-input" value={fixpreisSection.accentColor} onChange={(e) => onFixpreisChange({ ...fixpreisSection, accentColor: e.target.value })} placeholder="#EF1D26 oder leer = ONRODA-Rot" />
          </label>
        </div>
        <div className="admin-form-grid-2">
          <label className="admin-form-pair">
            <span className="admin-field-label">Überschrift Farbe</span>
            <input className="admin-input" value={fixpreisSection.titleColor} onChange={(e) => onFixpreisChange({ ...fixpreisSection, titleColor: e.target.value })} placeholder="optional, z. B. #0f172a" />
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Textfarbe</span>
            <input className="admin-input" value={fixpreisSection.bodyColor} onChange={(e) => onFixpreisChange({ ...fixpreisSection, bodyColor: e.target.value })} placeholder="optional" />
          </label>
        </div>
        <label className="admin-form-pair">
          <span className="admin-field-label">Hintergrundfarbe</span>
          <input className="admin-input" value={fixpreisSection.backgroundColor} onChange={(e) => onFixpreisChange({ ...fixpreisSection, backgroundColor: e.target.value })} placeholder="optional, z. B. #fff8f7" />
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Fließtext</span>
          <textarea className="admin-textarea" rows={4} value={fixpreisSection.body} onChange={(e) => onFixpreisChange({ ...fixpreisSection, body: e.target.value })} />
        </label>
        <div className="admin-form-grid-2">
          <label className="admin-form-pair">
            <span className="admin-field-label">Haupt-Button Text</span>
            <input className="admin-input" value={fixpreisSection.ctaText} onChange={(e) => onFixpreisChange({ ...fixpreisSection, ctaText: e.target.value })} />
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Haupt-Button Ziel</span>
            <input className="admin-input" value={fixpreisSection.ctaLink} onChange={(e) => onFixpreisChange({ ...fixpreisSection, ctaLink: e.target.value })} />
          </label>
        </div>
        <div className="admin-form-grid-2">
          <label className="admin-form-pair">
            <span className="admin-field-label">Zweit-Button Text (optional)</span>
            <input className="admin-input" value={fixpreisSection.secondaryCtaText} onChange={(e) => onFixpreisChange({ ...fixpreisSection, secondaryCtaText: e.target.value })} />
          </label>
          <label className="admin-form-pair">
            <span className="admin-field-label">Zweit-Button Ziel</span>
            <input className="admin-input" value={fixpreisSection.secondaryCtaLink} onChange={(e) => onFixpreisChange({ ...fixpreisSection, secondaryCtaLink: e.target.value })} />
          </label>
        </div>

        <div className="admin-panel-card" style={{ padding: 12, marginTop: 12 }}>
          <div className="admin-panel-card__title" style={{ fontSize: 13 }}>Werbe-Boxen (max. 3)</div>
          {fixpreisSection.promoBlocks.map((block, idx) => (
            <div key={`fpb-${idx}`} className="admin-panel-card" style={{ padding: 10, marginTop: 8 }}>
              <div className="admin-form-grid-2">
                <label className="admin-form-pair">
                  <span className="admin-field-label">Icon</span>
                  <input className="admin-input" value={block.icon} onChange={(e) => setBlock(idx, { icon: e.target.value })} />
                </label>
                <label className="admin-inline-check">
                  <input type="checkbox" checked={block.isActive} onChange={(e) => setBlock(idx, { isActive: e.target.checked })} />
                  <span>Aktiv</span>
                </label>
              </div>
              <label className="admin-form-pair">
                <span className="admin-field-label">Titel</span>
                <input className="admin-input" value={block.title} onChange={(e) => setBlock(idx, { title: e.target.value })} />
              </label>
              <label className="admin-form-pair">
                <span className="admin-field-label">Text</span>
                <textarea className="admin-textarea" rows={2} value={block.body} onChange={(e) => setBlock(idx, { body: e.target.value })} />
              </label>
            </div>
          ))}
        </div>

        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 12 }} disabled={savingPage} onClick={() => void savePartial({ fixpreisSection }, "page")}>
          {savingPage ? "Speichert…" : "Fixpreise-Seite speichern"}
        </button>
      </div>
    </>
  );
}
