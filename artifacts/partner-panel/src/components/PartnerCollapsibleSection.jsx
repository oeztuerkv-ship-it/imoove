import { useState } from "react";

/** Aufklappbarer Block — Partner-Arbeitsplatz (analog AdminCollapsibleSection). */
export default function PartnerCollapsibleSection({
  title,
  subtitle = "",
  defaultOpen = true,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="partner-collapsible">
      <button type="button" className="partner-collapsible__toggle" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2 className="partner-collapsible__title">{title}</h2>
          {subtitle ? <p className="partner-collapsible__sub">{subtitle}</p> : null}
        </div>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="partner-collapsible__body">{children}</div> : null}
    </section>
  );
}
