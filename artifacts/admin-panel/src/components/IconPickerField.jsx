import { useMemo, useState } from "react";
import { MARKETING_ICON_LIBRARY } from "../lib/marketingIconLibrary.js";

export default function IconPickerField({ label, value, onChange, allowCustom = true }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => MARKETING_ICON_LIBRARY.find((row) => row.glyph === value), [value]);

  return (
    <label className="admin-form-pair">
      <span className="admin-field-label">{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {allowCustom ? (
          <input
            className="admin-input"
            style={{ maxWidth: 88 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="🚕"
            aria-label={`${label} (frei)`}
          />
        ) : (
          <span className="admin-input" style={{ display: "inline-flex", width: 44, justifyContent: "center" }} aria-hidden="true">
            {value || "—"}
          </span>
        )}
        <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Bibliothek schließen" : "Aus Bibliothek"}
        </button>
        {selected ? <span className="admin-muted" style={{ fontSize: 12 }}>{selected.label}</span> : null}
      </div>
      {open ? (
        <div className="homepage-icon-picker-grid" role="listbox" aria-label="Icon-Bibliothek">
          {MARKETING_ICON_LIBRARY.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`homepage-icon-picker-grid__btn${value === row.glyph ? " is-active" : ""}`}
              title={row.label}
              onClick={() => {
                onChange(row.glyph);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{row.glyph}</span>
              <span className="homepage-icon-picker-grid__label">{row.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}
