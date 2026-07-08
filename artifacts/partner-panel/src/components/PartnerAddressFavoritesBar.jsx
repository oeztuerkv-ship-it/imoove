/**
 * Gespeicherte Adress-Favoriten — Klick auf Start oder Ziel übernimmt die Adresse.
 */
export default function PartnerAddressFavoritesBar({ favorites, onApply, onRemove }) {
  if (!Array.isArray(favorites) || favorites.length === 0) return null;

  return (
    <div className="partner-address-favorites" aria-label="Adress-Favoriten">
      <div className="partner-address-favorites__head">
        <span className="partner-address-favorites__title">Favoriten</span>
        <span className="partner-address-favorites__hint">Klick auf Start oder Ziel übernimmt die Adresse</span>
      </div>
      <ul className="partner-address-favorites__list">
        {favorites.map((fav) => (
          <li key={fav.id} className="partner-address-favorites__item">
            <span className="partner-address-favorites__label" title={`${fav.street} ${fav.houseNo}, ${fav.plz}`}>
              {fav.label}
            </span>
            <div className="partner-address-favorites__actions">
              <button
                type="button"
                className="partner-address-favorites__apply partner-address-favorites__apply--from"
                onClick={() => onApply("from", fav)}
              >
                Start
              </button>
              <button
                type="button"
                className="partner-address-favorites__apply partner-address-favorites__apply--to"
                onClick={() => onApply("to", fav)}
              >
                Ziel
              </button>
              <button
                type="button"
                className="partner-address-favorites__remove"
                onClick={() => onRemove(fav.id)}
                aria-label={`${fav.label} entfernen`}
                title="Favorit entfernen"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
