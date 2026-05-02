/**
 * Horizontale Tabs für Einstellungen (Enterprise / Bolt-Philosophie, ONRODA-Branding).
 */
export default function SettingsTabs({ tabs, activeId, onChange }) {
  return (
    <div className="partner-settings-tabs" role="tablist" aria-label="Einstellungen Abschnitte">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeId === t.id}
          id={`settings-tab-${t.id}`}
          className={
            activeId === t.id
              ? "partner-settings-tabs__btn partner-settings-tabs__btn--active"
              : "partner-settings-tabs__btn"
          }
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
