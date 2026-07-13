import { useState } from "react";

/**
 * Einheitlicher Admin-Block (weiße Karte auf App-Grau), optional aufklappbar.
 * Styling: admin-ui.css → .admin-section-block*
 */
export default function AdminCollapsibleSection({
  title,
  subtitle = "",
  icon = "",
  defaultOpen = true,
  collapsible = true,
  flushBody = false,
  className = "",
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className={`admin-section-block ${className}`.trim()}>
        <div className="admin-section-block__head admin-section-block__head--static">
          <div className="admin-section-block__title-wrap">
            {icon ? (
              <span className="admin-section-block__icon" aria-hidden>
                {icon}
              </span>
            ) : null}
            <div>
              <h2 className="admin-section-block__title">{title}</h2>
              {subtitle ? <p className="admin-section-block__sub">{subtitle}</p> : null}
            </div>
          </div>
        </div>
        <div
          className={`admin-section-block__body${flushBody ? " admin-section-block__body--flush" : ""}`.trim()}
        >
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className={`admin-section-block admin-section-block--collapsible ${className}`.trim()}>
      <button
        type="button"
        className="admin-section-block__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="admin-section-block__head">
          <div className="admin-section-block__title-wrap">
            {icon ? (
              <span className="admin-section-block__icon" aria-hidden>
                {icon}
              </span>
            ) : null}
            <div>
              <h2 className="admin-section-block__title">{title}</h2>
              {subtitle ? <p className="admin-section-block__sub">{subtitle}</p> : null}
            </div>
          </div>
          <span className="admin-section-block__chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </div>
      </button>
      {open ? (
        <div
          className={`admin-section-block__body${flushBody ? " admin-section-block__body--flush" : ""}`.trim()}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
