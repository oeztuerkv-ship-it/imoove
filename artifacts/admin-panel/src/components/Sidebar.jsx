const items = [
  { key: "dashboard", label: "Dashboard", icon: "◫" },
  { key: "rides", label: "Fahrten", icon: "↗" },
  { key: "partners", label: "Partner", icon: "◇" },
  { key: "companies", label: "Unternehmer", icon: "▣" },
  { key: "drivers", label: "Fahrer", icon: "◉" },
  { key: "fares", label: "Tarife", icon: "◌" },
  { key: "billing", label: "Abrechnung", icon: "◈" },
  { key: "settings", label: "Einstellungen", icon: "⚙" },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="admin-sidebar">
      <div>
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-icon">O</div>
          <div>
            <div className="admin-sidebar__logo">Onroda</div>
            <div className="admin-sidebar__logo-sub">Superadmin</div>
          </div>
        </div>

        <div className="admin-sidebar__section-title">Navigation</div>

        <nav className="admin-sidebar__nav" aria-label="Hauptnavigation">
          {items.map((item) => {
            const isActive = active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={
                  "admin-sidebar__link" +
                  (isActive ? " admin-sidebar__link--active" : "")
                }
              >
                <span
                  className={
                    "admin-sidebar__icon" +
                    (isActive ? " admin-sidebar__icon--active" : "")
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

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__footer-title">Onroda Admin</div>
        <div className="admin-sidebar__footer-text">
          Fahrten, Unternehmer, Fahrer und Abrechnung zentral verwalten.
        </div>
      </div>
    </aside>
  );
}
