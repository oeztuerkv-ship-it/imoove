import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const UPLOAD_URL = `${API_BASE}/admin/homepage-marketing-assets`;

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

function BrandAssetField({ label, value, onChange, hint }) {
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

  const previewSrc = value
    ? value.startsWith("http")
      ? value
      : `https://www.onroda.de${value.startsWith("/") ? value : `/${value}`}`
    : "";

  return (
    <label className="admin-form-pair">
      <span className="admin-field-label">{label}</span>
      <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="/cms-assets/…" />
      {hint ? <span className="admin-muted" style={{ fontSize: 12 }}>{hint}</span> : null}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <label className="admin-btn admin-btn--secondary" style={{ cursor: uploading ? "wait" : "pointer" }}>
          {uploading ? "Lädt…" : "Hochladen"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico" hidden onChange={(e) => void onFile(e)} />
        </label>
        {previewSrc ? <img src={previewSrc} alt="" style={{ maxHeight: 40, maxWidth: 120, objectFit: "contain" }} /> : null}
      </div>
      {uploadErr ? <span className="admin-muted" style={{ color: "var(--admin-danger, #c00)", fontSize: 12 }}>{uploadErr}</span> : null}
    </label>
  );
}

export default function HomepageSiteBrandingFields({ branding, onChange }) {
  const b = branding ?? { headerLogoUrl: "", faviconUrl: "" };
  return (
    <div className="admin-panel-card" style={{ padding: 12, marginBottom: 10 }}>
      <div className="admin-panel-card__title" style={{ fontSize: 14 }}>Logo &amp; Favicon (global)</div>
      <p className="admin-muted" style={{ marginTop: 0, fontSize: 13 }}>
        Header-Logo und Browser-Icon auf Marketing-Seiten (Startseite, Fixpreise, …).
      </p>
      <BrandAssetField
        label="Header-Logo"
        value={b.headerLogoUrl}
        onChange={(v) => onChange({ ...b, headerLogoUrl: v })}
        hint="Empfohlen: transparentes PNG, ca. 196×74."
      />
      <BrandAssetField
        label="Favicon"
        value={b.faviconUrl}
        onChange={(v) => onChange({ ...b, faviconUrl: v })}
        hint="PNG oder ICO, quadratisch."
      />
    </div>
  );
}
