import { defaultHomepageSectionTheme } from "../lib/homepageSectionThemeDefaults.js";

export default function HomepageSectionThemeFields({ title, theme, onChange }) {
  const t = theme ?? defaultHomepageSectionTheme();

  function patch(p) {
    onChange({ ...t, ...p });
  }

  return (
    <div className="admin-panel-card" style={{ padding: 12, marginTop: 8 }}>
      <div className="admin-panel-card__title" style={{ fontSize: 13 }}>{title} — Design</div>
      <div className="admin-form-grid-2">
        <label className="admin-form-pair">
          <span className="admin-field-label">Überschrift Größe</span>
          <select className="admin-input" value={t.titleFontSize} onChange={(e) => patch({ titleFontSize: e.target.value })}>
            <option value="sm">Klein</option>
            <option value="md">Mittel</option>
            <option value="lg">Groß</option>
            <option value="xl">Sehr groß</option>
          </select>
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Text Größe</span>
          <select className="admin-input" value={t.bodyFontSize} onChange={(e) => patch({ bodyFontSize: e.target.value })}>
            <option value="sm">Klein</option>
            <option value="md">Mittel</option>
            <option value="lg">Groß</option>
          </select>
        </label>
      </div>
      <div className="admin-form-grid-2">
        <label className="admin-form-pair">
          <span className="admin-field-label">Ausrichtung</span>
          <select className="admin-input" value={t.textAlign} onChange={(e) => patch({ textAlign: e.target.value })}>
            <option value="left">Links</option>
            <option value="center">Zentriert</option>
            <option value="right">Rechts</option>
          </select>
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Akzentfarbe</span>
          <input className="admin-input" value={t.accentColor} onChange={(e) => patch({ accentColor: e.target.value })} placeholder="optional" />
        </label>
      </div>
      <div className="admin-form-grid-2">
        <label className="admin-form-pair">
          <span className="admin-field-label">Überschrift Farbe</span>
          <input className="admin-input" value={t.titleColor} onChange={(e) => patch({ titleColor: e.target.value })} placeholder="optional" />
        </label>
        <label className="admin-form-pair">
          <span className="admin-field-label">Textfarbe</span>
          <input className="admin-input" value={t.bodyColor} onChange={(e) => patch({ bodyColor: e.target.value })} placeholder="optional" />
        </label>
      </div>
      <label className="admin-form-pair">
        <span className="admin-field-label">Hintergrundfarbe</span>
        <input className="admin-input" value={t.backgroundColor} onChange={(e) => patch({ backgroundColor: e.target.value })} placeholder="optional" />
      </label>
    </div>
  );
}
