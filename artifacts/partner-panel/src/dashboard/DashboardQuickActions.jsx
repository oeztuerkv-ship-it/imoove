import { getDashboardFleetQuickActionIds, getGlobalCreateMenuItems } from "../taxi/globalCreateActions.js";

const TITLE_OVERRIDE = {
  create_ride: "Fahrt erstellen",
  add_driver: "Fahrer hinzufügen",
  add_vehicle: "Fahrzeug hinzufügen",
  create_medical_round: "Krankenfahrt erstellen",
  create_voucher_code: "Gutscheincode erstellen",
};

/** @param {{ user: object; onQuickCreate: (id: string) => void }} props */
export default function DashboardQuickActions({ user, onQuickCreate }) {
  const allowed = new Set(getDashboardFleetQuickActionIds());
  const items = getGlobalCreateMenuItems(user).filter((x) => allowed.has(x.id));

  if (items.length === 0) return null;

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Schnellaktionen
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
        Dieselben Aktionen wie über das Plus-Menü oben — ohne eigene Navigationslogik.
      </p>
      <div className="partner-dashboard-quick-grid">
        {items.map((row) => (
          <button key={row.id} type="button" className="partner-dashboard-quick-card" onClick={() => onQuickCreate(row.id)}>
            <span className="partner-dashboard-quick-card__title">{TITLE_OVERRIDE[row.id] ?? row.label}</span>
            <span className="partner-dashboard-quick-card__hint">Öffnen …</span>
          </button>
        ))}
      </div>
    </div>
  );
}
