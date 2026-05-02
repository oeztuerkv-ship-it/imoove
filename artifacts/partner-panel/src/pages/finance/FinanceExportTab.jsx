import { flowLabel, payerKindLabel, rideKindLabel } from "./financeHelpers.js";

/** @param {Record<string, unknown>} props */
export default function FinanceExportTab({
  rides,
  month,
  setMonth,
  rideKind,
  setRideKind,
  payerKind,
  setPayerKind,
  billingReference,
  setBillingReference,
  hasAccessCode,
  setHasAccessCode,
  accessCodeId,
  setAccessCodeId,
  partnerFlow,
  setPartnerFlow,
  codeOptions,
  showCodes,
  loading,
  msg,
  onLoad,
  onExportCsv,
}) {
  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          Daten laden &amp; CSV-Export
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          Monatsfilter und CSV-Export (bestehendes Billing). Die Monatsübersicht erhalten Sie über den gewählten Zeitraum und den CSV-Download — Endpoint{" "}
          <code style={{ fontSize: "0.85em" }}>GET /panel/v1/billing/rides.csv</code>.
        </p>
        <div className="partner-form-grid" style={{ marginBottom: 12 }}>
          <label className="partner-form-field">
            <span>Monat</span>
            <input className="partner-input" type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} />
          </label>
          <label className="partner-form-field">
            <span>Fahrttyp</span>
            <select className="partner-input" value={rideKind} onChange={(ev) => setRideKind(ev.target.value)}>
              <option value="">Alle</option>
              <option value="standard">Normal</option>
              <option value="medical">Krankenfahrt</option>
              <option value="company">Firma</option>
              <option value="voucher">Gutschein</option>
            </select>
          </label>
          <label className="partner-form-field">
            <span>Zahler</span>
            <select className="partner-input" value={payerKind} onChange={(ev) => setPayerKind(ev.target.value)}>
              <option value="">Alle</option>
              <option value="passenger">Fahrgast</option>
              <option value="company">Firma</option>
              <option value="insurance">Kostenträger</option>
              <option value="voucher">Gutschein</option>
              <option value="third_party">Dritter</option>
            </select>
          </label>
          <label className="partner-form-field partner-form-field--span2">
            <span>Referenz enthält (optional)</span>
            <input
              className="partner-input"
              value={billingReference}
              onChange={(ev) => setBillingReference(ev.target.value)}
              placeholder="Teilstring Kostenstelle / Akte"
            />
          </label>
          <label className="partner-form-field">
            <span>Mit Freigabe-Code</span>
            <select className="partner-input" value={hasAccessCode} onChange={(ev) => setHasAccessCode(ev.target.value)}>
              <option value="">Egal</option>
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
          {showCodes ? (
            <label className="partner-form-field partner-form-field--span2">
              <span>Konkreter Code (optional)</span>
              <select className="partner-input" value={accessCodeId} onChange={(ev) => setAccessCodeId(ev.target.value)}>
                <option value="">—</option>
                {codeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.id} ({c.codeType})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="partner-form-field">
            <span>Buchungs-Flow</span>
            <select className="partner-input" value={partnerFlow} onChange={(ev) => setPartnerFlow(ev.target.value)}>
              <option value="">Alle</option>
              <option value="hotel_guest">Hotel</option>
              <option value="medical_patient">Patient H/R</option>
              <option value="medical_series_leg">Serie</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="partner-btn-primary" disabled={loading} onClick={() => void onLoad()}>
            {loading ? "Laden …" : "Daten laden"}
          </button>
          <button type="button" className="partner-btn-secondary" onClick={() => void onExportCsv()}>
            CSV exportieren
          </button>
        </div>
        {msg ? (
          <p className="partner-state-ok" style={{ marginTop: 12 }}>
            {msg}
          </p>
        ) : null}
      </div>

      <div className="partner-card partner-card--section partner-card--hint">
        <h3 className="partner-card__title">Spaltenhinweis (Rohdaten)</h3>
        <p className="partner-muted" style={{ margin: 0, lineHeight: 1.5 }}>
          In Tabellen anderer Tabs: Typ = {rideKindLabel("standard")} / Krankenfahrt, Zahler = {payerKindLabel("insurance")}, Flow = {flowLabel("medical_patient")}{" "}
          usw., wie in der CSV.
        </p>
      </div>

      <div className="partner-card partner-card--section">
        <h3 className="partner-card__title">Ergebnis (Rohfahrten)</h3>
        {loading ? (
          <p className="partner-muted">Laden …</p>
        ) : !rides?.length ? (
          <p className="partner-muted">Noch keine Daten geladen oder keine Treffer.</p>
        ) : (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Status</th>
                  <th>Typ</th>
                  <th>Zahler</th>
                  <th>Flow</th>
                  <th>Referenz</th>
                  <th>Kunde</th>
                  <th>Route</th>
                  <th>geschätzt</th>
                  <th>final</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((r) => (
                  <tr key={r.id}>
                    <td className="partner-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString("de-DE") : "—"}</td>
                    <td className="partner-muted">{r.status}</td>
                    <td className="partner-muted">{rideKindLabel(r.rideKind)}</td>
                    <td className="partner-muted">{payerKindLabel(r.payerKind)}</td>
                    <td className="partner-muted">{flowLabel(r.partnerBookingMeta?.flow)}</td>
                    <td className="partner-muted">{r.billingReference || "—"}</td>
                    <td>{r.customerName}</td>
                    <td className="partner-muted" style={{ maxWidth: 220 }}>
                      {r.from} → {r.to}
                    </td>
                    <td className="partner-muted">{r.estimatedFare}</td>
                    <td className="partner-muted">{r.finalFare ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
