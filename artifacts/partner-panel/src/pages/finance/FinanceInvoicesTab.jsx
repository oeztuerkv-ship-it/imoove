import { invoiceStatusBadge, ridesToInvoiceRows } from "./financeHelpers.js";

function formatInvoiceDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

/** @param {{ rides: Record<string, unknown>[]; loading: boolean }} props */
export default function FinanceInvoicesTab({ rides, loading }) {
  const rows = ridesToInvoiceRows(rides);

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Rechnungen
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
        Liste aus Fahrten mit Rechnungsbezug (Nummer oder Status). Details und PDF-Erstellung erfolgen weiter unter „Fahrten“, soweit verfügbar.
      </p>
      {loading ? (
        <p className="partner-muted">Laden …</p>
      ) : rows.length === 0 ? (
        <p className="partner-muted">Noch keine Rechnungsdaten in der aktuellen Auswahl.</p>
      ) : (
        <div className="partner-table-wrap">
          <table className="partner-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th>
                <th>Kunde / Kostenträger</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = invoiceStatusBadge(row.status);
                return (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.payer}</td>
                    <td>
                      {typeof row.amount === "number"
                        ? `${row.amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : "—"}
                    </td>
                    <td>
                      <span className={`partner-pill partner-pill--${badge.tone}`}>{badge.label}</span>
                    </td>
                    <td className="partner-muted">{formatInvoiceDate(row.dateIso)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
