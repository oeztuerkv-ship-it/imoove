/** @param {{ tab: "drivers" | "vehicles" | "documents"; onTabChange: (t: "drivers" | "vehicles" | "documents") => void }} props */
export default function FleetTabs({ tab, onTabChange }) {
  return (
    <div className="partner-pill-tabs" role="tablist" aria-label="Flottenbereiche">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "drivers"}
        className={tab === "drivers" ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
        onClick={() => onTabChange("drivers")}
      >
        Fahrer
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "vehicles"}
        className={tab === "vehicles" ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
        onClick={() => onTabChange("vehicles")}
      >
        Fahrzeuge
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "documents"}
        className={tab === "documents" ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
        onClick={() => onTabChange("documents")}
      >
        Dokumente
      </button>
    </div>
  );
}
