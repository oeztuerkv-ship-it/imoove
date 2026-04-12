export default function PanelSidebar({ active, onChange, items }) {
  return (
    <aside className="panel-sidebar">
      <div>
        <div className="panel-sidebar__brand">
          <div className="panel-sidebar__brand-icon">O</div>
          <div>
            <div className="panel-sidebar__logo">Onroda</div>
            <div className="panel-sidebar__logo-sub">Unternehmerportal</div>
          </div>
        </div>

        <div className="panel-sidebar__section-title">Navigation</div>

        <nav className="panel-sidebar__nav" aria-label="Hauptnavigation">
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={
                  "panel-sidebar__link" + (isActive ? " panel-sidebar__link--active" : "")
                }
              >
                <span
                  className={
                    "panel-sidebar__icon" + (isActive ? " panel-sidebar__icon--active" : "")
                  }
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="panel-sidebar__footer">
        <div className="panel-sidebar__footer-title">Onroda</div>
        <div className="panel-sidebar__footer-text">Nur Daten deines Unternehmens.</div>
        <a
          className="panel-sidebar__footer-link"
          href="https://onroda.de"
          target="_blank"
          rel="noopener noreferrer"
        >
          Website und Kontakt
        </a>
      </div>
    </aside>
  );
}
