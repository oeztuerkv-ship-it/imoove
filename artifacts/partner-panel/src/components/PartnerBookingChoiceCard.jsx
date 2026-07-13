/**
 * @param {{
 *   active: boolean;
 *   icon: string;
 *   title: string;
 *   description: string;
 *   onClick: () => void;
 * }} props
 */
export default function PartnerBookingChoiceCard({ active, icon, title, description, onClick }) {
  return (
    <button
      type="button"
      className={`partner-booking-choice${active ? " partner-booking-choice--active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="partner-booking-choice__icon" aria-hidden>
        {icon}
      </span>
      <span className="partner-booking-choice__body">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </button>
  );
}
