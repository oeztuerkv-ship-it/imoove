/** @param {{ tab: string; onTabChange: (t: string) => void }} props */
export default function FinanceTabs({ tab, onTabChange }) {
  const tabs = [
    { id: "overview", label: "Übersicht" },
    { id: "invoices", label: "Rechnungen" },
    { id: "payouts", label: "Auszahlungen" },
    { id: "medical", label: "Krankenfahrten" },
    { id: "export", label: "Export" },
  ];
  return (
    <div className="partner-pill-tabs partner-pill-tabs--finance" role="tablist" aria-label="Finanzen">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={tab === t.id ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
          onClick={() => onTabChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
