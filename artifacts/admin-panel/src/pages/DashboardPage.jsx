import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;

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
      const res = await fetch(STATS_URL, { headers: adminApiHeaders() });
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
    <div className="admin-dashboard">
      <div className="admin-dashboard__top">
        <div className="admin-dashboard__hero">
          <div>
            <div className="admin-dashboard__hero-label">Systemstatus</div>
            <h2 className="admin-dashboard__hero-title">Onroda Live-Übersicht</h2>
            <p className="admin-dashboard__hero-text">
              Hier siehst du den aktuellen Stand von Fahrten, Unternehmern,
              Fahrern und Partnern auf einen Blick.
            </p>
          </div>

          <button type="button" className="admin-btn-refresh" onClick={loadStats}>
            Neu laden
          </button>
        </div>
      </div>

      <div className="admin-dashboard__grid">
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Offene Fahrten</div>
          <div className="admin-dashboard__card-value">{stats.offene}</div>
          <div className="admin-dashboard__card-sub">Aktuell offen im System</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Laufende Fahrten</div>
          <div className="admin-dashboard__card-value">{stats.laufend}</div>
          <div className="admin-dashboard__card-sub">Gerade aktiv unterwegs</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Erledigte Fahrten</div>
          <div className="admin-dashboard__card-value">{stats.erledigt}</div>
          <div className="admin-dashboard__card-sub">Bereits abgeschlossen</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Unternehmer</div>
          <div className="admin-dashboard__card-value">{stats.unternehmer}</div>
          <div className="admin-dashboard__card-sub">Aktive Firmen im Panel</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Fahrer</div>
          <div className="admin-dashboard__card-value">{stats.fahrer}</div>
          <div className="admin-dashboard__card-sub">Registrierte Fahrer</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Partner</div>
          <div className="admin-dashboard__card-value">{stats.partner}</div>
          <div className="admin-dashboard__card-sub">Verknüpfte Partnerkonten</div>
        </div>
      </div>

      <div className="admin-dashboard__bottom">
        <div className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3 className="admin-dashboard__panel-title">Betriebsübersicht</h3>
            <span className="admin-dashboard__badge">Live</span>
          </div>

          <div className="admin-dashboard__metric-list">
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Offene Buchungen</span>
              <strong className="admin-dashboard__metric-value">{stats.offene}</strong>
            </div>

            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Laufende Fahrten</span>
              <strong className="admin-dashboard__metric-value">{stats.laufend}</strong>
            </div>

            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Abgeschlossene Fahrten</span>
              <strong className="admin-dashboard__metric-value">{stats.erledigt}</strong>
            </div>

            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Aktive Unternehmer</span>
              <strong className="admin-dashboard__metric-value">{stats.unternehmer}</strong>
            </div>
          </div>
        </div>

        <div className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3 className="admin-dashboard__panel-title">Nächste Module</h3>
            <span className="admin-dashboard__badge admin-dashboard__badge--muted">
              Plan
            </span>
          </div>

          <div className="admin-dashboard__todo-list">
            <div className="admin-dashboard__todo-item">Live-Karte mit Fahrerstatus</div>
            <div className="admin-dashboard__todo-item">Event-Feed für kritische Meldungen</div>
            <div className="admin-dashboard__todo-item">Heutiger Umsatz & Provisionen</div>
            <div className="admin-dashboard__todo-item">Partner- und Dokumentenmodul</div>
          </div>
        </div>
      </div>
    </div>
  );
}
