import { useCallback, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function defaultMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rideKindLabel(k) {
  const m = { standard: "Normal", medical: "Krankenfahrt", voucher: "Gutschein", company: "Firma" };
  return m[k] ?? k ?? "—";
}

function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Firma",
    insurance: "Kostenträger",
    voucher: "Gutschein",
    third_party: "Dritter",
  };
  return m[k] ?? k ?? "—";
}

function flowLabel(f) {
  const m = { hotel_guest: "Hotel", medical_patient: "Patient H/R", medical_series_leg: "Serie" };
  return m[f] ?? f ?? "—";
}

export default function BillingPage() {
  const { token, user } = usePanelAuth();
  const canRead = hasPerm(user?.permissions, "rides.read");
  const showCodes = hasPanelModule(user?.panelModules, "access_codes");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [rides, setRides] = useState([]);
  const [month, setMonth] = useState(defaultMonthYm);
  const [rideKind, setRideKind] = useState("");
  const [payerKind, setPayerKind] = useState("");
  const [billingReference, setBillingReference] = useState("");
  const [accessCodeId, setAccessCodeId] = useState("");
  const [hasAccessCode, setHasAccessCode] = useState("");
  const [partnerFlow, setPartnerFlow] = useState("");
  const [codeOptions, setCodeOptions] = useState([]);

  const loadCodes = useCallback(async () => {
    if (!token || !showCodes) return;
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.items)) {
        setCodeOptions(data.items);
      }
    } catch {
      /* ignore */
    }
  }, [token, showCodes]);

  function buildQuery() {
    const p = new URLSearchParams();
    p.set("month", month);
    if (rideKind) p.set("rideKind", rideKind);
    if (payerKind) p.set("payerKind", payerKind);
    if (billingReference.trim()) p.set("billingReference", billingReference.trim());
    if (accessCodeId) p.set("accessCodeId", accessCodeId);
    if (hasAccessCode === "yes") p.set("hasAccessCode", "true");
    if (hasAccessCode === "no") p.set("hasAccessCode", "false");
    if (partnerFlow) p.set("partnerFlow", partnerFlow);
    return p.toString();
  }

  async function onLoad() {
    if (!token || !canRead) return;
    setMsg("");
    setLoading(true);
    try {
      await loadCodes();
      const res = await fetch(`${API_BASE}/panel/v1/billing/rides?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setRides([]);
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
      setMsg(`${data.rides?.length ?? 0} Fahrten im Monat ${data.month ?? month}.`);
    } catch {
      setMsg("Netzwerkfehler.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }

  async function onExportCsv() {
    if (!token || !canRead) return;
    try {
      const res = await fetch(`${API_BASE}/panel/v1/billing/rides.csv?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(typeof data?.error === "string" ? data.error : "Export fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onroda-billing-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("Export fehlgeschlagen.");
    }
  }

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Abrechnung</h2>
      <p className="panel-page__lead">
        Monatsübersicht Ihrer Fahrten — Filter nach Code, Referenz, Fahrttyp, Zahler und Buchungsart
        (Hotel / Medizin). Export als CSV für die Buchhaltung.
      </p>
      {!canRead ? (
        <p className="panel-page__warn">Keine Leserechte.</p>
      ) : (
        <>
          <div className="panel-card panel-card--wide">
            <h3 className="panel-card__title">Filter</h3>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Monat</span>
                <input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} />
              </label>
              <label className="panel-rides-form__field">
                <span>Fahrttyp</span>
                <select value={rideKind} onChange={(ev) => setRideKind(ev.target.value)}>
                  <option value="">Alle</option>
                  <option value="standard">Normal</option>
                  <option value="medical">Krankenfahrt</option>
                  <option value="company">Firma</option>
                  <option value="voucher">Gutschein</option>
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Zahler</span>
                <select value={payerKind} onChange={(ev) => setPayerKind(ev.target.value)}>
                  <option value="">Alle</option>
                  <option value="passenger">Fahrgast</option>
                  <option value="company">Firma</option>
                  <option value="insurance">Kostenträger</option>
                  <option value="voucher">Gutschein</option>
                  <option value="third_party">Dritter</option>
                </select>
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Referenz enthält (optional)</span>
                <input
                  value={billingReference}
                  onChange={(ev) => setBillingReference(ev.target.value)}
                  placeholder="Teilstring Kostenstelle / Akte"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Mit Freigabe-Code</span>
                <select value={hasAccessCode} onChange={(ev) => setHasAccessCode(ev.target.value)}>
                  <option value="">Egal</option>
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              {showCodes ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Konkreter Code (optional)</span>
                  <select value={accessCodeId} onChange={(ev) => setAccessCodeId(ev.target.value)}>
                    <option value="">—</option>
                    {codeOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || c.id} ({c.codeType})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="panel-rides-form__field">
                <span>Buchungs-Flow</span>
                <select value={partnerFlow} onChange={(ev) => setPartnerFlow(ev.target.value)}>
                  <option value="">Alle</option>
                  <option value="hotel_guest">Hotel</option>
                  <option value="medical_patient">Patient H/R</option>
                  <option value="medical_series_leg">Serie</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
              <button type="button" className="panel-btn-primary" disabled={loading} onClick={() => void onLoad()}>
                {loading ? "Laden …" : "Anzeigen"}
              </button>
              <button type="button" className="panel-btn-primary" onClick={() => void onExportCsv()}>
                CSV exportieren
              </button>
            </div>
            {msg ? <p className="panel-page__ok" style={{ marginTop: "12px" }}>{msg}</p> : null}
          </div>

          <div className="panel-card panel-card--wide panel-card--table" style={{ marginTop: "1rem" }}>
            <h3 className="panel-card__title">Ergebnis</h3>
            {rides.length === 0 ? (
              <p className="panel-page__lead">Noch keine Daten geladen oder keine Treffer.</p>
            ) : (
              <div className="panel-table-wrap">
                <table className="panel-table">
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
                        <td className="panel-table__muted">{new Date(r.createdAt).toLocaleString("de-DE")}</td>
                        <td className="panel-table__muted">{r.status}</td>
                        <td className="panel-table__muted">{rideKindLabel(r.rideKind)}</td>
                        <td className="panel-table__muted">{payerKindLabel(r.payerKind)}</td>
                        <td className="panel-table__muted">{flowLabel(r.partnerBookingMeta?.flow)}</td>
                        <td className="panel-table__muted">{r.billingReference || "—"}</td>
                        <td>{r.customerName}</td>
                        <td className="panel-table__route">
                          {r.from} → {r.to}
                        </td>
                        <td className="panel-table__muted">{r.estimatedFare}</td>
                        <td className="panel-table__muted">{r.finalFare ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
