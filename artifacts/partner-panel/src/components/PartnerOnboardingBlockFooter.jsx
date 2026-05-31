/** Sticky Speichern-Leiste unten in jedem Onboarding-Block (Partner). */
export default function PartnerOnboardingBlockFooter({
  label = "Speichern",
  busy = false,
  type = "submit",
  onClick,
  hint = "",
}) {
  return (
    <div className="partner-onb-block__footer">
      {hint ? <p className="partner-onb-block__footer-hint">{hint}</p> : null}
      <button
        type={type}
        className="partner-btn-primary partner-onb-block__save"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? "Speichert …" : label}
      </button>
    </div>
  );
}
