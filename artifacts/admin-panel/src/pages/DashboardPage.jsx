import { useEffect, useState } from "react";

const STATS_URL = "https://onroda.de/api/admin/stats";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    offene: 0,
    laufend: 0,
    erledigt: 0,
    unternehmer: 0,
    fahrer: 0,
    partner: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(STATS_URL);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !data?.stats) {
        throw new Error("Ungültige Antwort");
      }

      setStats({
        offene: data.stats.offene ?? 0,
        laufend: data.stats.laufend ?? 0,
        erledigt: data.stats.erledigt ?? 0,
        unternehmer: data.stats.unternehmer ?? 0,
        fahrer: data.stats.fahrer ?? 0,
        partner: data.stats.partner ?? 0,
      });
    } catch (err) {
      console.error("Dashboard stats error:", err);
      setError("Statistiken konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="admin-info-banner">Lade Dashboard ...</div>;
  }

  if (error) {
    return <div className="admin-error-banner">{error}</div>;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.topRow}>
        <div style={styles.heroCard}>
          <div>
            <div style={styles.heroLabel}>Systemstatus</div>
            <h2 style={styles.heroTitle}>Onroda Live-Übersicht</h2>
            <p style={styles.heroText}>
              Hier siehst du den aktuellen Stand von Fahrten, Unternehmern,
              Fahrern und Partnern auf einen Blick.
            </p>
          </div>

          <button type="button" className="admin-btn-pill" onClick={loadStats}>
            Neu laden
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Offene Fahrten</div>
          <div style={styles.cardValue}>{stats.offene}</div>
          <div style={styles.cardSub}>Aktuell offen im System</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Laufende Fahrten</div>
          <div style={styles.cardValue}>{stats.laufend}</div>
          <div style={styles.cardSub}>Gerade aktiv unterwegs</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Erledigte Fahrten</div>
          <div style={styles.cardValue}>{stats.erledigt}</div>
          <div style={styles.cardSub}>Bereits abgeschlossen</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Unternehmer</div>
          <div style={styles.cardValue}>{stats.unternehmer}</div>
          <div style={styles.cardSub}>Aktive Firmen im Panel</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Fahrer</div>
          <div style={styles.cardValue}>{stats.fahrer}</div>
          <div style={styles.cardSub}>Registrierte Fahrer</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Partner</div>
          <div style={styles.cardValue}>{stats.partner}</div>
          <div style={styles.cardSub}>Verknüpfte Partnerkonten</div>
        </div>
      </div>

      <div style={styles.bottomGrid}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Betriebsübersicht</h3>
            <span style={styles.panelBadge}>Live</span>
          </div>

          <div style={styles.metricList}>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Offene Buchungen</span>
              <strong style={styles.metricValue}>{stats.offene}</strong>
            </div>

            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Laufende Fahrten</span>
              <strong style={styles.metricValue}>{stats.laufend}</strong>
            </div>

            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Abgeschlossene Fahrten</span>
              <strong style={styles.metricValue}>{stats.erledigt}</strong>
            </div>

            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Aktive Unternehmer</span>
              <strong style={styles.metricValue}>{stats.unternehmer}</strong>
            </div>
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Nächste Module</h3>
            <span style={styles.panelBadgeMuted}>Plan</span>
          </div>

          <div style={styles.todoList}>
            <div style={styles.todoItem}>Live-Karte mit Fahrerstatus</div>
            <div style={styles.todoItem}>Event-Feed für kritische Meldungen</div>
            <div style={styles.todoItem}>Heutiger Umsatz & Provisionen</div>
            <div style={styles.todoItem}>Partner- und Dokumentenmodul</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  topRow: {
    display: "flex",
  },

  heroCard: {
    width: "100%",
    background: "var(--onroda-bg-elevated)",
    border: "1px solid var(--onroda-border)",
    borderRadius: 24,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },

  heroLabel: {
    fontSize: 13,
    color: "var(--onroda-text-muted)",
    marginBottom: 8,
    fontWeight: 500,
  },

  heroTitle: {
    margin: 0,
    fontSize: 28,
    color: "var(--onroda-text-primary)",
    fontWeight: 600,
  },

  heroText: {
    margin: "10px 0 0 0",
    color: "var(--onroda-text-secondary)",
    lineHeight: 1.6,
    maxWidth: 680,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },

  card: {
    background: "var(--onroda-bg-elevated)",
    borderRadius: 20,
    padding: 22,
    border: "1px solid var(--onroda-border)",
  },

  cardLabel: {
    color: "var(--onroda-text-secondary)",
    fontSize: 14,
    marginBottom: 12,
  },

  cardValue: {
    fontSize: 38,
    fontWeight: 600,
    color: "var(--onroda-text-primary)",
    lineHeight: 1.1,
  },

  cardSub: {
    marginTop: 10,
    color: "var(--onroda-text-muted)",
    fontSize: 13,
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },

  panel: {
    background: "var(--onroda-bg-elevated)",
    borderRadius: 20,
    padding: 22,
    border: "1px solid var(--onroda-border)",
  },

  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },

  panelTitle: {
    margin: 0,
    color: "var(--onroda-text-primary)",
    fontSize: 18,
    fontWeight: 600,
  },

  panelBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    background: "#17311f",
    color: "#9ed9af",
    border: "1px solid var(--onroda-border)",
  },

  panelBadgeMuted: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    background: "var(--onroda-bg-control)",
    color: "var(--onroda-text-secondary)",
    border: "1px solid var(--onroda-border)",
  },

  metricList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    background: "var(--onroda-bg-control)",
    border: "1px solid var(--onroda-border)",
  },

  metricLabel: {
    color: "var(--onroda-text-secondary)",
    fontSize: 14,
  },

  metricValue: {
    color: "var(--onroda-text-primary)",
    fontSize: 15,
    fontWeight: 600,
  },

  todoList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  todoItem: {
    padding: "12px 14px",
    borderRadius: 14,
    background: "var(--onroda-bg-control)",
    border: "1px solid var(--onroda-border)",
    color: "var(--onroda-text-secondary)",
    fontSize: 14,
    lineHeight: 1.5,
  },

};
