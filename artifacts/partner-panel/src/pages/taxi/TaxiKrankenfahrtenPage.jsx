import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import { hasPanelModule } from "../../lib/panelNavigation.js";
import {
  deriveMedicalOperationsStats,
  getPartnerMeta,
  medicalOpenOperationsCount,
  medicalRides,
  rideStatusLabelDe,
} from "../../dashboard/dashboardHelpers.js";
import { filterMedicalRides, formatMoney, rideFareAmount } from "../finance/financeHelpers.js";

const STORAGE_KEY = "onrodaPanelJwt";

function panelHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatDeDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  } catch {
    return "—";
  }
}

/** Datenschutz: keine Klarnamen; Referenz oder gekürzte ID. */
function caseLabel(ride) {
  const ref = typeof ride.billingReference === "string" ? ride.billingReference.trim() : "";
  if (ref) return ref.length > 32 ? `${ref.slice(0, 29)}…` : ref;
  const id = String(ride.id ?? "").trim();
  return id ? `Fahrt …${id.slice(-6)}` : "—";
}

function payerShort(ride) {
  const m = getPartnerMeta(ride);
  const ins = typeof m.insurance_name === "string" ? m.insurance_name.trim() : "";
  if (ins) return ins.length > 40 ? `${ins.slice(0, 37)}…` : ins;
  return "—";
}

function muster4RowStatus(ride) {
  const m = getPartnerMeta(ride);
  const sig = m.signature_done === true || Boolean(m.signature_signed_at);
  const doc = Boolean(m.transport_document_uploaded_at);
  if (sig && doc) return { label: "Vollständig", tone: "ok" };
  if (doc || sig) return { label: "Teilweise", tone: "warn" };
  return { label: "Fehlt / offen", tone: "missing" };
}

function invoiceStatusDe(ride) {
  const m = getPartnerMeta(ride);
  const s = String(m?.invoice_status ?? "").toLowerCase();
  if (s === "paid" || s === "bezahlt") return "Bezahlt";
  if (s === "sent" || s === "versendet") return "Gesendet / in Prüfung";
  if (s === "created") return "Rechnung erstellt";
  if (s === "draft") return "Entwurf";
  if (s === "cancelled" || s === "storniert") return "Storniert";
  return s ? s : "Offen";
}

function seriesStatusDe(s) {
  const x = String(s ?? "").toLowerCase();
  if (x === "active") return "Aktiv";
  if (x === "completed") return "Abgeschlossen";
  if (x === "cancelled") return "Beendet";
  return s || "—";
}

/** @param {{ patientReference?: string; billingReference?: string | null; id?: string }} row */
function seriesPrivacyLabel(row) {
  const br = typeof row.billingReference === "string" ? row.billingReference.trim() : "";
  if (br) return br.length > 28 ? `${br.slice(0, 25)}…` : br;
  const id = String(row.id ?? "").trim();
  return id ? `Serie ${id.slice(-8)}` : "—";
}

export default function TaxiKrankenfahrtenPage() {
  const { token, user } = usePanelAuth();
  const canRead = Array.isArray(user?.permissions) && user.permissions.includes("rides.read");
  const hasRidesList = hasPanelModule(user?.panelModules, "rides_list");
  const hasSeriesMod = hasPanelModule(user?.panelModules, "recurring_rides");

  const [tab, setTab] = useState("overview");
  const [rides, setRides] = useState([]);
  const [ridesErr, setRidesErr] = useState("");
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const [series, setSeries] = useState([]);
  const [seriesNote, setSeriesNote] = useState("");

  const loadRides = useCallback(async () => {
    if (!token || !canRead || !hasRidesList) return;
    setRidesErr("");
    setRidesLoaded(false);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/rides`, { headers: panelHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setRidesErr(typeof data?.error === "string" ? data.error : "Fahrten konnten nicht geladen werden.");
        setRides([]);
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {
      setRidesErr("Netzwerkfehler.");
      setRides([]);
    } finally {
      setRidesLoaded(true);
    }
  }, [token, canRead, hasRidesList]);

  const loadSeries = useCallback(async () => {
    if (!token || !canRead || !hasSeriesMod) {
      setSeries([]);
      setSeriesNote(!hasSeriesMod ? "Serienfahrten sind für Ihr Konto nicht freigeschaltet." : "");
      return;
    }
    setSeriesNote("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/partner-ride-series`, { headers: panelHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setSeries([]);
        setSeriesNote("Serienliste konnte nicht geladen werden.");
        return;
      }
      setSeries(Array.isArray(data.items) ? data.items : []);
    } catch {
      setSeries([]);
      setSeriesNote("Serienliste: Netzwerkfehler.");
    }
  }, [token, canRead, hasSeriesMod]);

  useEffect(() => {
    void loadRides();
    void loadSeries();
  }, [loadRides, loadSeries]);

  const medical = useMemo(() => medicalRides(rides), [rides]);
  const stats = useMemo(() => deriveMedicalOperationsStats(rides), [rides]);
  const openMedicalCount = useMemo(() => medicalOpenOperationsCount(rides), [rides]);

  const openCases = useMemo(() => {
    return medical.filter((r) => {
      const inv = String(getPartnerMeta(r).invoice_status ?? "").toLowerCase();
      return inv !== "paid" && inv !== "cancelled" && inv !== "storniert";
    });
  }, [medical]);

  const waitingDocsCount = useMemo(() => {
    let n = 0;
    for (const r of medical) {
      const m = getPartnerMeta(r);
      const ready = m.billing_ready === true || m.billingStatus?.ready === true;
      if (!ready) n += 1;
    }
    return n;
  }, [medical]);

  const billingWaitingKasse = useMemo(() => {
    return medical.filter((r) => {
      const m = getPartnerMeta(r);
      const ready = m.billing_ready === true || m.billingStatus?.ready === true;
      const inv = String(m.invoice_status ?? "").toLowerCase();
      return ready && (!inv || inv === "draft");
    });
  }, [medical]);

  const billingInvoicePrepared = useMemo(() => {
    return medical.filter((r) => {
      const inv = String(getPartnerMeta(r).invoice_status ?? "").toLowerCase();
      return inv === "created";
    });
  }, [medical]);

  const billingSent = useMemo(() => {
    return medical.filter((r) => {
      const inv = String(getPartnerMeta(r).invoice_status ?? "").toLowerCase();
      return inv === "sent" || inv === "versendet";
    });
  }, [medical]);

  if (!canRead || !hasRidesList) {
    return (
      <div className="partner-stack partner-stack--tight">
        <p className="partner-state-warn" style={{ margin: 0 }}>
          Krankenfahrten sind hier nicht verfügbar (fehlende Berechtigung oder Modul).
        </p>
      </div>
    );
  }

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Krankenfahrten</p>
        <h1 className="partner-page-title">Abrechnung &amp; Überblick</h1>
        <p className="partner-page-lead">
          Übersicht aus Ihren vorhandenen Krankenfahrten und Serien — ohne neue Schnittstellen. Keine Diagnosedaten.
        </p>
      </div>

      {ridesErr ? <p className="partner-state-error">{ridesErr}</p> : null}

      <div className="partner-pill-tabs" role="tablist" aria-label="Krankenfahrten">
        {[
          { id: "overview", label: "Übersicht" },
          { id: "open", label: "Offene Fälle" },
          { id: "muster4", label: "Muster 4" },
          { id: "series", label: "Serienfahrten" },
          { id: "billing", label: "Abrechnung" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "partner-pill-tabs__btn partner-pill-tabs__btn--active" : "partner-pill-tabs__btn"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="partner-finance-kpi-grid">
          <div className="partner-finance-kpi-card">
            <p className="partner-finance-kpi-card__title">Offene Krankenfahrten</p>
            <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(openMedicalCount)}</p>
            <p className="partner-finance-kpi-card__hint">Ohne bezahlte oder stornierte Rechnung (vereinfacht).</p>
          </div>
          <div className="partner-finance-kpi-card">
            <p className="partner-finance-kpi-card__title">Wartende Unterlagen</p>
            <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(waitingDocsCount)}</p>
            <p className="partner-finance-kpi-card__hint">Noch nicht abrechnungsbereit.</p>
          </div>
          <div className="partner-finance-kpi-card">
            <p className="partner-finance-kpi-card__title">Wartende Abrechnung</p>
            <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(stats.waitingBilling)}</p>
            <p className="partner-finance-kpi-card__hint">Aus bestehenden Fahrtfeldern.</p>
          </div>
          <div className="partner-finance-kpi-card">
            <p className="partner-finance-kpi-card__title">Rechnungen in Prüfung</p>
            <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(stats.invoicesInReview)}</p>
            <p className="partner-finance-kpi-card__hint">Status gesendet / erstellt.</p>
          </div>
        </div>
      ) : null}

      {tab === "open" ? (
        <div className="partner-card partner-card--section">
          <h2 className="partner-card__title" style={{ marginTop: 0 }}>
            Offene Fälle
          </h2>
          {!ridesLoaded ? (
            <p className="partner-muted">Laden …</p>
          ) : openCases.length === 0 ? (
            <p className="partner-muted">Keine offenen Krankenfahrten in den geladenen Daten.</p>
          ) : (
            <div className="partner-table-wrap">
              <table className="partner-table">
                <thead>
                  <tr>
                    <th>Fall / Referenz</th>
                    <th>Abholung</th>
                    <th>Ziel</th>
                    <th>Kostenträger</th>
                    <th>Status Fahrt</th>
                  </tr>
                </thead>
                <tbody>
                  {openCases.map((r) => (
                    <tr key={r.id}>
                      <td>{caseLabel(r)}</td>
                      <td className="partner-muted">{formatDeDate(r.scheduledAt || r.createdAt)}</td>
                      <td className="partner-muted" style={{ maxWidth: 220 }}>
                        {typeof r.to === "string" ? r.to : "—"}
                      </td>
                      <td>{payerShort(r)}</td>
                      <td>
                        <span className="partner-pill partner-pill--soft">{rideStatusLabelDe(r.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "muster4" ? (
        <div className="partner-card partner-card--section">
          <h2 className="partner-card__title" style={{ marginTop: 0 }}>
            Muster 4 / Nachweise
          </h2>
          <p className="partner-muted" style={{ marginTop: 0 }}>
            Status aus vorhandenen Feldern (Unterschrift, Transportnachweis). Keine OCR.
          </p>
          {!ridesLoaded ? (
            <p className="partner-muted">Laden …</p>
          ) : medical.length === 0 ? (
            <p className="partner-muted">Keine Krankenfahrten geladen.</p>
          ) : (
            <div className="partner-table-wrap">
              <table className="partner-table">
                <thead>
                  <tr>
                    <th>Fall</th>
                    <th>Muster-4 Status</th>
                    <th>Unterschrift</th>
                    <th>Transportnachweis</th>
                  </tr>
                </thead>
                <tbody>
                  {medical.map((r) => {
                    const st = muster4RowStatus(r);
                    const m = getPartnerMeta(r);
                    return (
                      <tr key={r.id}>
                        <td>{caseLabel(r)}</td>
                        <td>
                          <span className={`partner-pill partner-pill--${st.tone === "ok" ? "ok" : st.tone === "warn" ? "warn" : "missing"}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="partner-muted">{m.signature_done === true || m.signature_signed_at ? "OK" : "offen"}</td>
                        <td className="partner-muted">{m.transport_document_uploaded_at ? "hochgeladen" : "fehlt"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "series" ? (
        <div className="partner-card partner-card--section">
          <h2 className="partner-card__title" style={{ marginTop: 0 }}>
            Serienfahrten
          </h2>
          {seriesNote ? <p className="partner-muted">{seriesNote}</p> : null}
          {!hasSeriesMod ? null : series.length === 0 ? (
            <p className="partner-muted">Keine aktiven Serien gefunden.</p>
          ) : (
            <div className="partner-table-wrap">
              <table className="partner-table">
                <thead>
                  <tr>
                    <th>Serie</th>
                    <th>Zeitraum</th>
                    <th>Fahrten</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => {
                    const from = formatDeDate(s.validFrom);
                    const until = formatDeDate(s.validUntil);
                    const meta = s.meta && typeof s.meta === "object" ? s.meta : {};
                    const nextIso = typeof meta.nextRideAt === "string" ? meta.nextRideAt : typeof meta.nextLegAt === "string" ? meta.nextLegAt : "";
                    return (
                      <tr key={s.id}>
                        <td>{seriesPrivacyLabel(s)}</td>
                        <td className="partner-muted">
                          {from} – {until}
                          {nextIso ? (
                            <>
                              <br />
                              <span style={{ fontSize: 12 }}>Nächste: {formatDeDate(nextIso)}</span>
                            </>
                          ) : null}
                        </td>
                        <td>{String(s.totalRides ?? "—")}</td>
                        <td>
                          <span className="partner-pill partner-pill--soft">{seriesStatusDe(s.status)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="partner-stack partner-stack--tight">
          <div className="partner-finance-kpi-grid partner-finance-kpi-grid--compact">
            <div className="partner-finance-kpi-card">
              <p className="partner-finance-kpi-card__title">Wartende Kassenabrechnung</p>
              <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(billingWaitingKasse.length)}</p>
            </div>
            <div className="partner-finance-kpi-card">
              <p className="partner-finance-kpi-card__title">Rechnung vorbereitet</p>
              <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(billingInvoicePrepared.length)}</p>
            </div>
            <div className="partner-finance-kpi-card">
              <p className="partner-finance-kpi-card__title">Rechnung gesendet</p>
              <p className="partner-finance-kpi-card__value">{!ridesLoaded ? "…" : String(billingSent.length)}</p>
            </div>
            <div className="partner-finance-kpi-card">
              <p className="partner-finance-kpi-card__title">Status Krankenkasse</p>
              <p className="partner-finance-kpi-card__value partner-finance-kpi-card__value--sub">Aus Rechnungsstatus</p>
              <p className="partner-finance-kpi-card__hint">Keine separate KK-Schnittstelle.</p>
            </div>
          </div>
          <div className="partner-card partner-card--section">
            <h3 className="partner-card__title">Fälle mit Abrechnungsstatus</h3>
            {!ridesLoaded ? (
              <p className="partner-muted">Laden …</p>
            ) : filterMedicalRides(rides).length === 0 ? (
              <p className="partner-muted">Keine Krankenfahrten.</p>
            ) : (
              <div className="partner-table-wrap">
                <table className="partner-table">
                  <thead>
                    <tr>
                      <th>Fall</th>
                      <th>Betrag</th>
                      <th>Abrechnungsbereit</th>
                      <th>Rechnung</th>
                      <th>KK / Kostenträger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterMedicalRides(rides).map((r) => {
                      const m = getPartnerMeta(r);
                      const ready = m?.billing_ready === true || m?.billingStatus?.ready === true;
                      return (
                        <tr key={r.id}>
                          <td>{caseLabel(r)}</td>
                          <td>{formatMoney(rideFareAmount(r))}</td>
                          <td>{ready ? "ja" : "nein"}</td>
                          <td>{invoiceStatusDe(r)}</td>
                          <td>{payerShort(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="partner-card partner-card--section partner-card--hint">
        <p className="partner-muted" style={{ margin: 0 }}>
          Datengrundlage: <code style={{ fontSize: "0.85em" }}>GET /panel/v1/rides</code>
          {hasSeriesMod ? (
            <>
              {" "}
              und <code style={{ fontSize: "0.85em" }}>GET /panel/v1/partner-ride-series</code>
            </>
          ) : null}
          . Bei Bedarf Ansicht mit „Daten aktualisieren“ im Browser neu laden.
        </p>
      </div>
    </div>
  );
}
