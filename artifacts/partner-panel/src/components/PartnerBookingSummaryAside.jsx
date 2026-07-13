const ICON = {
  fare: "💶",
  distance: "📏",
  duration: "⏱",
  payer: "💳",
  passenger: "👤",
  dispatch: "🚖",
  route: "📍",
};

/**
 * @param {{
 *   summaryFare: string;
 *   distanceKm: string;
 *   durationMinutes: string;
 *   routeReady: boolean;
 *   hasRouteInputs: boolean;
 *   fromFull: string;
 *   toFull: string;
 *   companyPays: boolean;
 *   paymentMethod: string;
 *   passengerLabel: string;
 *   scheduleLabel: string;
 *   payerConfirmed: boolean;
 *   onPayerConfirmedChange: (v: boolean) => void;
 *   companyPaysConfirmText: string;
 *   scheduleConfirmText: string;
 *   creating: boolean;
 *   routing: boolean;
 *   canSubmit: boolean;
 *   submitLabel: string;
 *   formId: string;
 * }} props
 */
export default function PartnerBookingSummaryAside({
  summaryFare,
  distanceKm,
  durationMinutes,
  routeReady,
  hasRouteInputs,
  fromFull,
  toFull,
  companyPays,
  paymentMethod,
  passengerLabel,
  scheduleLabel,
  payerConfirmed,
  onPayerConfirmedChange,
  companyPaysConfirmText,
  scheduleConfirmText,
  creating,
  routing,
  canSubmit,
  submitLabel,
  formId,
}) {
  return (
    <aside className="partner-booking-aside partner-booking-aside--saas" aria-label="Buchungsübersicht">
      <div className="partner-booking-summary partner-booking-summary--saas">
        <h3 className="partner-booking-summary__title">Zusammenfassung</h3>

        <div className="partner-booking-summary__hero">
          <div className="partner-booking-summary__price-block">
            <span className="partner-booking-summary__price-label">Geschätzter Preis</span>
            <strong className="partner-booking-summary__price-value">{summaryFare}</strong>
          </div>
          {routeReady ? (
            <div className="partner-booking-summary__metrics">
              <span className="partner-booking-summary__metric">
                <span aria-hidden>{ICON.distance}</span>
                {distanceKm} km
              </span>
              <span className="partner-booking-summary__metric">
                <span aria-hidden>{ICON.duration}</span>
                {durationMinutes} Min.
              </span>
            </div>
          ) : (
            <p className="partner-booking-summary__pending">
              {routing ? "Route wird berechnet …" : "Route eingeben für Preis"}
            </p>
          )}
        </div>

        <div className="partner-booking-summary__divider" aria-hidden />

        <ul className="partner-booking-summary__rows">
          <li>
            <span className="partner-booking-summary__row-icon" aria-hidden>
              {ICON.route}
            </span>
            <div>
              <span className="partner-booking-summary__row-label">Route</span>
              <span className="partner-booking-summary__row-value">
                {hasRouteInputs ? `${fromFull} → ${toFull}` : "Noch offen"}
              </span>
            </div>
          </li>
          <li>
            <span className="partner-booking-summary__row-icon" aria-hidden>
              {ICON.passenger}
            </span>
            <div>
              <span className="partner-booking-summary__row-label">Fahrgast</span>
              <span className="partner-booking-summary__row-value">{passengerLabel}</span>
            </div>
          </li>
          <li>
            <span className="partner-booking-summary__row-icon" aria-hidden>
              {ICON.payer}
            </span>
            <div>
              <span className="partner-booking-summary__row-label">Zahlung</span>
              <span className="partner-booking-summary__row-value">
                {companyPays ? "Ihr Unternehmen · Rechnung" : `Fahrgast zahlt · ${paymentMethod}`}
              </span>
            </div>
          </li>
          <li>
            <span className="partner-booking-summary__row-icon" aria-hidden>
              {ICON.dispatch}
            </span>
            <div>
              <span className="partner-booking-summary__row-label">Disposition</span>
              <span className="partner-booking-summary__row-value">{scheduleLabel}</span>
            </div>
          </li>
        </ul>

        <label className="partner-confirm-line partner-confirm-line--saas">
          <input
            type="checkbox"
            checked={payerConfirmed}
            onChange={(ev) => onPayerConfirmedChange(ev.target.checked)}
          />
          <span>
            Ich bestätige: {companyPaysConfirmText} {scheduleConfirmText}
          </span>
        </label>

        <button
          type="submit"
          form={formId}
          className="panel-btn-primary partner-booking-submit partner-booking-submit--saas"
          disabled={creating || routing || !canSubmit}
        >
          {creating ? "Wird gebucht …" : routing ? "Route wird berechnet …" : submitLabel}
        </button>

        {!payerConfirmed ? (
          <p className="partner-booking-summary__hint">Bitte Zahlungsregelung bestätigen.</p>
        ) : null}
      </div>
    </aside>
  );
}
