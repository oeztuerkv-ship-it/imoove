const STEP_ORDER = ["route", "passenger", "payment", "schedule"];

/**
 * @param {{ steps: Record<string, { label: string; done: boolean }>; activeKey: string }} props
 */
export default function PartnerBookingStepper({ steps, activeKey }) {
  return (
    <nav className="partner-booking-stepper" aria-label="Buchungsfortschritt">
      <ol className="partner-booking-stepper__list">
        {STEP_ORDER.map((key, index) => {
          const step = steps[key];
          if (!step) return null;
          const isActive = key === activeKey;
          const isDone = step.done;
          const isLast = index === STEP_ORDER.length - 1;
          return (
            <li
              key={key}
              className={`partner-booking-stepper__item${isDone ? " partner-booking-stepper__item--done" : ""}${isActive ? " partner-booking-stepper__item--active" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="partner-booking-stepper__node" aria-hidden>
                {isDone ? "✓" : index + 1}
              </span>
              <span className="partner-booking-stepper__label">{step.label}</span>
              {!isLast ? <span className="partner-booking-stepper__line" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
