/** Sticky Speichern-Leiste unten in jedem Onboarding-Block (Admin). */
export default function AdminOnboardingBlockFooter({
  label = "Speichern",
  busy = false,
  type = "submit",
  onClick,
  hint = "",
}) {
  return (
    <div className="admin-onb-block__footer">
      {hint ? <p className="admin-onb-block__footer-hint">{hint}</p> : null}
      <button
        type={type}
        className="admin-onb-btn-save"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? "Speichert …" : label}
      </button>
    </div>
  );
}
