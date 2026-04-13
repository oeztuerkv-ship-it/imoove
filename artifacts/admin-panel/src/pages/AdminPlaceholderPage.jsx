export default function AdminPlaceholderPage({ title, intro, bullets = [] }) {
  return (
    <div className="admin-page">
      <section className="admin-panel-card admin-placeholder-card">
        <h2 className="admin-panel-card__title" style={{ fontSize: "1.15rem" }}>
          {title}
        </h2>
        <p className="admin-table-sub" style={{ lineHeight: 1.55, marginTop: 8 }}>
          {intro ||
            "Dieser Bereich ist strukturell vorbereitet. Anbindung an API, PDF-Generator und Buchhaltungs-Exporte können hier angebunden werden."}
        </p>
        {bullets.length > 0 ? (
          <ul className="admin-placeholder-list">
            {bullets.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
