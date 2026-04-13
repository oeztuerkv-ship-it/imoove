import OnrodaMark from "./OnrodaMark";
import NavGlyph from "./NavGlyph";

const items = [
  { key: "dashboard", label: "Systemstatus", icon: "pulse" },
  { key: "rides", label: "Fahrten", icon: "rides" },
  { key: "companies", label: "Unternehmen", icon: "building" },
  { key: "panel-users", label: "Partner-Zugänge", icon: "people" },
  { key: "access-codes", label: "Zugangscodes", icon: "key" },
  { key: "fares", label: "Tarife & Gebiete", icon: "map" },
  { key: "admin-users", label: "Admin-Zugänge", icon: "people" },
  { key: "settings", label: "Einstellungen", icon: "pulse" },
];

export default function Sidebar({ active, onChange, role = "admin" }) {
  const visibleItems = items.filter((x) => !(role === "service" && (x.key === "fares" || x.key === "admin-users")));
  return (
    <aside className="admin-sidebar">
      <div>
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-mark" aria-hidden>
            <OnrodaMark className="admin-sidebar__mark-img" />
          </div>
          <div>
            <div className="admin-sidebar__logo">ONRODA</div>
            <div className="admin-sidebar__logo-sub">Plattform</div>
          </div>
        </div>

        <div className="admin-sidebar__section-title">Navigation</div>

        <nav className="admin-sidebar__nav" aria-label="Hauptnavigation">
          {visibleItems.map((item) => {
            const isActive = active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={
                  "admin-sidebar__link" + (isActive ? " admin-sidebar__link--active" : "")
                }
              >
                <span
                  className={
                    "admin-sidebar__icon" + (isActive ? " admin-sidebar__icon--active" : "")
                  }
                  aria-hidden
                >
                  <NavGlyph name={item.icon} active={isActive} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__footer-title">Hinweis</div>
        <div className="admin-sidebar__footer-text">
          Diese Oberfläche dient der zentralen Plattformsteuerung. Unternehmen arbeiten in ihrem eigenen Bereich unter
          panel.onroda.de.
        </div>
      </div>
    </aside>
  );
}
