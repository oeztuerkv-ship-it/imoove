const items = [
  { key: "dashboard", label: "Plattform-Übersicht", icon: "◫" },
  { key: "rides", label: "Alle Fahrten", icon: "↗" },
  { key: "companies", label: "Alle Unternehmen", icon: "▣" },
  { key: "panel-users", label: "Partner-Zugänge", icon: "◎" },
  { key: "drivers", label: "Fahrer", icon: "◉" },
  { key: "fares", label: "Tarife & Gebiete", icon: "◌" },
  { key: "billing", label: "Abrechnung", icon: "◈" },
  { key: "partners", label: "Unternehmer-Portal", icon: "◇" },
  { key: "settings", label: "System", icon: "⚙" },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="admin-sidebar">
      <div>
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-icon" aria-hidden>
            O
          </div>
          <div>
            <div className="admin-sidebar__logo">Onroda</div>
            <div className="admin-sidebar__logo-sub">Zentrale Systemsteuerung</div>
          </div>
        </div>

        <div className="admin-sidebar__section-title">Plattform</div>

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
        <div className="admin-sidebar__footer-title">Operator-Konsole</div>
        <div className="admin-sidebar__footer-text">
          Vollständiger Zugriff auf alle Mandanten und Systemdaten — nicht dasselbe wie das Unternehmer-Portal.
        </div>
      </div>
    </aside>
  );
}
