import { API_BASE } from "../lib/apiBase.js";

export default function AppOperationalTariffsPage() {
  return (
    <div className="admin-page">
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Tarife &amp; Preise (App / Betrieb)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.55 }}>
          MVP: Detaillierte Konditionen (Grundpreis, Zuschläge, Taxi-Pflichtgebiet, Kurzstrecke) werden sukzessive hier
          gepflegt und in die App ausgespielt. Unverändert stehen die bestehenden Gebiets-Tarife in{" "}
          <strong className="admin-nowrap">Fahrten → Tarife &amp; Preise (Preisregeln &amp; Gebiete)</strong> (technisch{" "}
          <code>fare_areas</code>) — dieselbe Plattform-Konsole, anderer Einstiegsfokus für künftige App-Logik.
        </p>
        <p className="admin-table-sub" style={{ marginTop: 8, lineHeight: 1.55 }}>
          <strong className="admin-nowrap">Taxi:</strong> Pflichtfahrgebiet und rechtssichere Festpreise bleiben an
          euren bestehenden Tarif-/Gebiets-Regeln gebunden — keine doppelte „hart erzwungene“ Festpreis-Logik aus dieser
          Seite.
        </p>
      </div>
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">API-Stand (Lesen)</div>
        <p className="admin-table-sub">
          Kunden-App (öffentlich, kurz cachen): <code>{API_BASE}/app/config</code> — zentrale Struktur inkl.{" "}
          <code>tariffs</code> (Zahlen für Schätzung, ohne Admin-Interna). Legacy:{" "}
          <code>{API_BASE}/public/app-operational</code>.
        </p>
      </div>
    </div>
  );
}
