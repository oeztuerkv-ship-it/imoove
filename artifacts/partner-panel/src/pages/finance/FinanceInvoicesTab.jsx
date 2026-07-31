import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../../lib/apiBase.js";
import { invoiceStatusBadge, ridesToInvoiceRows } from "./financeHelpers.js";

function formatInvoiceDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function isWeeklyCommissionInvoice(inv) {
  return inv?.metadataSource === "cash_card_netting_weekly_commission";
}

/**
 * @param {{
 *   rides: Record<string, unknown>[];
 *   loading: boolean;
 *   token?: string | null;
 *   focusInvoiceId?: string | null;
 *   onConsumeFocus?: () => void;
 * }} props
 */
export default function FinanceInvoicesTab({ rides, loading, token, focusInvoiceId = null, onConsumeFocus }) {
  const rideRows = useMemo(() => ridesToInvoiceRows(rides), [rides]);
  const [panelInvoices, setPanelInvoices] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelErr, setPanelErr] = useState("");
  const focusRef = useRef(null);

  const loadPanelInvoices = useCallback(async () => {
    if (!token) {
      setPanelInvoices([]);
      return;
    }
    setPanelLoading(true);
    setPanelErr("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setPanelErr("Rechnungen konnten nicht geladen werden.");
        setPanelInvoices([]);
        return;
      }
      setPanelInvoices(Array.isArray(data.invoices) ? data.invoices : []);
    } catch {
      setPanelErr("Rechnungen konnten nicht geladen werden.");
      setPanelInvoices([]);
    } finally {
      setPanelLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPanelInvoices();
  }, [loadPanelInvoices]);

  useEffect(() => {
    if (!focusInvoiceId || panelLoading) return;
    const el = focusRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (typeof onConsumeFocus === "function") onConsumeFocus();
  }, [focusInvoiceId, panelLoading, panelInvoices, onConsumeFocus]);

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          ONRODA-Rechnungen
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          Monats- und Provisionsrechnungen an Ihr Unternehmen. Offene Provisionsnachzahlungen (Bar-/Karten-Netting)
          erscheinen hier mit Zahlungsziel.
        </p>
        {panelLoading ? <p className="partner-muted">Laden …</p> : null}
        {panelErr ? <p className="partner-state-warn">{panelErr}</p> : null}
        {!panelLoading && !panelErr && panelInvoices.length === 0 ? (
          <p className="partner-muted">Noch keine ONRODA-Rechnungen für Ihr Unternehmen.</p>
        ) : null}
        {!panelLoading && panelInvoices.length > 0 ? (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Rechnungsnr.</th>
                  <th>Zeitraum</th>
                  <th>Betrag</th>
                  <th>Fällig</th>
                  <th>Status</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {panelInvoices.map((inv) => {
                  const focused = focusInvoiceId && inv.id === focusInvoiceId;
                  const badge = invoiceStatusBadge(inv.workflowStatus || inv.status || inv.paymentStatus);
                  return (
                    <tr
                      key={inv.id}
                      ref={focused ? focusRef : undefined}
                      className={focused ? "partner-table__row--focus" : undefined}
                    >
                      <td>
                        {inv.invoiceNumber || "—"}
                        {isWeeklyCommissionInvoice(inv) ? (
                          <span className="partner-pill partner-pill--warn" style={{ marginLeft: 8 }}>
                            Provision
                          </span>
                        ) : null}
                      </td>
                      <td className="partner-muted">
                        {inv.periodFrom || "—"} – {inv.periodTo || "—"}
                      </td>
                      <td>{formatMoney(inv.totalGross)}</td>
                      <td className="partner-muted">{inv.dueDate || "—"}</td>
                      <td>
                        <span className={`partner-pill partner-pill--${badge.tone}`}>
                          {inv.statusLabelDe || badge.label}
                        </span>
                      </td>
                      <td>
                        {inv.pdfAvailable && token ? (
                          <a
                            className="partner-link-btn"
                            href={`${API_BASE}/panel/v1/invoices/${encodeURIComponent(inv.id)}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              void (async () => {
                                try {
                                  const res = await fetch(
                                    `${API_BASE}/panel/v1/invoices/${encodeURIComponent(inv.id)}/pdf`,
                                    { headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  if (!res.ok) return;
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  window.open(url, "_blank", "noopener,noreferrer");
                                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                                } catch {
                                  /* ignore */
                                }
                              })();
                            }}
                          >
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          Fahrten mit Rechnungsbezug
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          Aus Fahrten mit Rechnungsbezug in der aktuellen Monatsauswahl. Route aus Start-/Ziel der Fahrt.
        </p>
        {loading ? (
          <p className="partner-muted">Laden …</p>
        ) : rideRows.length === 0 ? (
          <p className="partner-muted">Noch keine Rechnungsdaten in der aktuellen Auswahl.</p>
        ) : (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Rechnungsnr.</th>
                  <th>Fahrt</th>
                  <th>Kunde / Kostenträger</th>
                  <th>Betrag</th>
                  <th>Status</th>
                  <th>Datum</th>
                </tr>
              </thead>
              <tbody>
                {rideRows.map((row) => {
                  const badge = invoiceStatusBadge(row.status);
                  return (
                    <tr key={row.id}>
                      <td>{row.number}</td>
                      <td className="partner-muted" style={{ maxWidth: 220 }}>
                        {row.rideRoute ?? "—"}
                      </td>
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
    </div>
  );
}
