import { useState } from "react";

export default function CollapsibleCard({ title, children, defaultOpen = true, style = {} }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16, ...style }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", width: "100%", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, gap: 10 }}
      >
        <span className="admin-panel-card__title" style={{ margin: 0 }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "rgba(0,0,0,0.35)", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}
