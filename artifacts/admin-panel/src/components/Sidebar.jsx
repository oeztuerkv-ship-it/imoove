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
    <aside style={styles.sidebar}>
      <div>
        <div style={styles.brandRow}>
          <div style={styles.brandIcon}>O</div>
          <div>
            <div style={styles.logo}>Onroda</div>
            <div style={styles.logoSub}>Admin Panel</div>
          </div>
        </div>

        <div style={styles.sectionTitle}>Navigation</div>

        <nav style={styles.nav}>
          {items.map((item) => {
            const isActive = active === item.key;

            return (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                style={{
                  ...styles.link,
                  ...(isActive ? styles.linkActive : {}),
                }}
              >
                <span
                  style={{
                    ...styles.icon,
                    ...(isActive ? styles.iconActive : {}),
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div style={styles.footer}>
        <div style={styles.footerTitle}>Onroda Admin</div>
        <div style={styles.footerText}>
          Fahrten, Unternehmer, Fahrer und Abrechnung zentral verwalten.
        </div>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 270,
    minHeight: "100vh",
    background: "#1e1f20",
    borderRight: "1px solid rgba(255,255,255,0.05)",
    padding: 22,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    color: "#d1d5db",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "#e3e3e3",
    color: "#131314",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 18,
  },
  logo: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0.2,
    color: "#e3e3e3",
    lineHeight: 1.1,
  },
  logoSub: {
    color: "#c4c7c5",
    fontSize: 13,
    marginTop: 3,
  },
  sectionTitle: {
    fontSize: 11,
    color: "#8e918f",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 10,
    fontWeight: 500,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  link: {
    border: "1px solid transparent",
    background: "transparent",
    color: "#c4c7c5",
    borderRadius: 16,
    padding: "12px 14px",
    textAlign: "left",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "all 0.2s ease",
  },
  linkActive: {
    background: "#282a2d",
    color: "#e3e3e3",
    borderColor: "rgba(255,255,255,0.05)",
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#282a2d",
    color: "#8e918f",
    fontSize: 14,
    flexShrink: 0,
  },
  iconActive: {
    background: "#e3e3e3",
    color: "#131314",
  },
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.05)",
    paddingTop: 16,
  },
  footerTitle: {
    fontWeight: 600,
    marginBottom: 6,
    color: "#e3e3e3",
  },
  footerText: {
    color: "#c4c7c5",
    fontSize: 13,
    lineHeight: 1.5,
  },
};
