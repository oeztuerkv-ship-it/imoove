import { filterMedicalRides, formatMoney, getPartnerMeta, payerKindLabel, rideFareAmount } from "./financeHelpers.js";

function invoiceLine(meta) {
  if (!meta) return "—";
  const s = typeof meta.invoice_status === "string" ? meta.invoice_status : "draft";
  const map = {
    draft: "Entwurf",
    created: "Erstellt",
    sent: "Versendet",
    paid: "Bezahlt",
  };
  return map[s] ?? s;
}

/** @param {{ rides: Record<string, unknown>[]; loading: boolean }} props */
export default function FinanceMedicalTab({ rides, loading }) {
  const medical = filterMedicalRides(rides);
  const waitingBilling = medical.filter((r) => {
    const m = getPartnerMeta(r);
    const ready = m?.billing_ready === true || m?.billingStatus?.ready === true;
    return !ready;
  });
  const waitingSettlement = medical.filter((r) => {
    const m = getPartnerMeta(r);
    const st = String(m?.invoice_status ?? "").toLowerCase();
    return st !== "paid" && st !== "cancelled" && st !== "storniert";
  });

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section partner-card--hint">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          Krankenfahrten &amp; Kassenabrechnung (Vorbereitung)
        </h2>
        <p className="partner-muted" style={{ margin: 0, lineHeight: 1.55, maxWidth: 800 }}>
          Dieser Bereich strukturiert den späteren Ausbau (Kostenübernahme, Kassenstatus, Muster&nbsp;4). Es gibt aktuell{" "}
          <strong>keine automatische Kassen-Schnittstelle oder OCR</strong> — Angaben basieren auf den vorhandenen Fahrtfeldern.
        </p>
        <p className="partner-muted" style={{ margin: "12px 0 0", lineHeight: 1.55, maxWidth: 800 }}>
          <strong>Muster&nbsp;4 / Krankentransport:</strong> Sofern papierbasierte Nachweise erforderlich sind, dokumentieren Sie diese wie mit dem Taxifahrer
          vereinbart; eine digitale Muster&nbsp;4-Verarbeitung ist hier noch nicht angebunden.
        </p>
      </div>

      <div className="partner-finance-kpi-grid partner-finance-kpi-grid--compact">
        <div className="partner-finance-kpi-card">
          <p className="partner-finance-kpi-card__title">Krankenfahrten gesamt</p>
          <p className="partner-finance-kpi-card__value">{loading ? "…" : String(medical.length)}</p>
          <p className="partner-finance-kpi-card__hint">In der geladenen Auswahl.</p>
        </div>
        <div className="partner-finance-kpi-card">
          <p className="partner-finance-kpi-card__title">Wartende Abrechnung</p>
          <p className="partner-finance-kpi-card__value">{loading ? "…" : String(waitingBilling.length)}</p>
          <p className="partner-finance-kpi-card__hint">Noch nicht „billing-ready“.</p>
        </div>
        <div className="partner-finance-kpi-card">
          <p className="partner-finance-kpi-card__title">Rechnung / Kasse offen</p>
          <p className="partner-finance-kpi-card__value">{loading ? "…" : String(waitingSettlement.length)}</p>
          <p className="partner-finance-kpi-card__hint">Ohne bezahlte/stornierte Rechnung.</p>
        </div>
      </div>

      <div className="partner-card partner-card--section">
        <h3 className="partner-card__title">Übersicht Krankenfahrten</h3>
        {loading ? (
          <p className="partner-muted">Laden …</p>
        ) : medical.length === 0 ? (
          <p className="partner-muted">Noch keine Krankenfahrten in der aktuellen Auswahl.</p>
        ) : (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Kunde</th>
                  <th>Kostenträger</th>
                  <th>Zahler</th>
                  <th>Betrag</th>
                  <th>Abrechnung bereit</th>
                  <th>Rechnungsstatus</th>
                  <th>Kassenstatus</th>
                </tr>
              </thead>
              <tbody>
                {medical.map((r) => {
                  const m = getPartnerMeta(r);
                  const ready = m?.billing_ready === true || m?.billingStatus?.ready === true;
                  const insurer = typeof m?.insurance_name === "string" ? m.insurance_name : "—";
                  const inv = invoiceLine(m);
                  const kasse =
                    inv === "Bezahlt" ? "Abgeschlossen (intern)" : ready ? "Bereit zur Rechnungserstellung" : "Nachweise / Freigabe offen";
                  return (
                    <tr key={r.id}>
                      <td className="partner-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString("de-DE") : "—"}</td>
                      <td>{typeof r.customerName === "string" ? r.customerName : "—"}</td>
                      <td>{insurer}</td>
                      <td>{payerKindLabel(r.payerKind)}</td>
                      <td>{formatMoney(rideFareAmount(r))}</td>
                      <td>
                        <span className={`partner-pill partner-pill--${ready ? "ok" : "missing"}`}>{ready ? "Ja" : "Nein"}</span>
                      </td>
                      <td>{inv}</td>
                      <td className="partner-muted" style={{ maxWidth: 220, fontSize: 12, lineHeight: 1.35 }}>
                        {kasse}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
