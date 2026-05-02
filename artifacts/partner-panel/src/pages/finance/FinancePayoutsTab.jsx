import { derivePayoutSummary, formatMoney, maskIban } from "./financeHelpers.js";

/** @param {{ rides: Record<string, unknown>[]; company: Record<string, unknown> | null; loading: boolean }} props */
export default function FinancePayoutsTab({ rides, company, loading }) {
  const summary = derivePayoutSummary(rides);
  const iban = typeof company?.bankIban === "string" ? company.bankIban : "";

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          Auszahlungen
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          Auszahlungsbeträge werden aus den Fahrt-Metadaten gelesen, sobald eine Rechnung erzeugt wurde. Es gibt keine separate Auszahlungs-API — bei Abweichungen
          bitte Support kontaktieren.
        </p>
        {loading ? (
          <p className="partner-muted">Laden …</p>
        ) : (
          <ul className="partner-finance-dl">
            <li>
              <span className="partner-finance-dl__k">Letzte Auszahlung (bezahlt)</span>
              <span className="partner-finance-dl__v">{summary.lastPaidDisplay}</span>
            </li>
            <li>
              <span className="partner-finance-dl__k">Ausstehende Auszahlung (Summe)</span>
              <span className="partner-finance-dl__v">{formatMoney(summary.pendingSum)}</span>
            </li>
            <li>
              <span className="partner-finance-dl__k">Auszahlungsstatus</span>
              <span className="partner-finance-dl__v">
                {summary.pendingCount > 0
                  ? `${summary.pendingCount} Position(en) mit ausstehendem Auszahlungsbetrag (Rechnung nicht bezahlt)`
                  : "Keine ausstehenden Beträge in der aktuellen Datengrundlage"}
              </span>
            </li>
          </ul>
        )}
      </div>

      <div className="partner-card partner-card--section partner-card--hint">
        <h3 className="partner-card__title">Bankverbindung</h3>
        <p className="partner-muted" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
          Für Auszahlungen muss eine gültige IBAN in den Firmendaten hinterlegt sein (Einstellungen / Stammdaten).
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {iban ? <>Hinterlegte IBAN (Auszug): {maskIban(iban)}</> : <span className="partner-muted">Keine IBAN in den Firmendaten gefunden.</span>}
        </p>
      </div>
    </div>
  );
}
