import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const KIND_LABEL = {
  taxi: "Taxi",
  hotel: "Hotel",
  insurer: "Krankenkasse (Mandant)",
  medical: "Krankenfahrt (Mandant)",
  general: "Sonstige",
  corporate: "Unternehmen",
  voucher_client: "Gutschein",
};

const NA = "Noch nicht hinterlegt";

function s(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function fmtText(v) {
  const t = s(v);
  return t || NA;
}

function eur(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(x);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtDateDay(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function boolJaNein(v) {
  if (v === true) return "Ja";
  if (v === false) return "Nein";
  return NA;
}

function fmtAuditMeta(meta) {
  if (meta == null || typeof meta !== "object") return null;
  try {
    const j = JSON.stringify(meta);
    if (j.length > 280) return `${j.slice(0, 280)}…`;
    return j;
  } catch {
    return null;
  }
}

/**
 * Lese-Modell: `GET /admin/companies/:id/mandate-read` inkl. letzter Fahrten.
 */
export default function CompanyMandateDetailPage({ companyId, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const loadMandate = useCallback(() => {
    setLoading(true);
    setErr("");
    fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/mandate-read`, {
      headers: adminApiHeaders(),
    })
      .then((res) => {
        if (res.status === 404) {
          setErr("Mandant nicht gefunden.");
          return null;
        }
        if (!res.ok) {
          setErr("Daten konnten nicht geladen werden.");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.ok) {
          setData(json);
        }
        setLoading(false);
      })
      .catch(() => {
        setErr("Netzwerkfehler.");
        setLoading(false);
      });
  }, [companyId]);

  useEffect(() => {
    loadMandate();
  }, [loadMandate]);

  const c = data?.company;
  const f = data?.financials;
  const isInsurerLike = c && (c.company_kind === "insurer" || c.company_kind === "medical");
  const docs = data?.documents;

  return (
    <div className="admin-page" style={{ padding: "0 0 32px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <button type="button" className="admin-btn-refresh" onClick={onBack} style={{ marginBottom: 10 }}>
            ← Zur Mandantenliste
          </button>
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "var(--onroda-red, #b91c1c)" }}>
            {c?.name || "Mandantenzentrale"}
          </h1>
          <p className="admin-table-sub" style={{ margin: "6px 0 0" }}>
            Plattform-Überblick (lesend). Keine klinischen Inhalte / Diagnosen.
          </p>
        </div>
        <button type="button" className="admin-btn-refresh" onClick={() => loadMandate()} disabled={loading}>
          Aktualisieren
        </button>
      </div>

      {err ? <div className="admin-error-banner" style={{ marginBottom: 16 }}>{err}</div> : null}
      {loading && !c ? <p className="admin-table-sub">Lade Mandantendaten …</p> : null}

      {c && data ? (
        <>
          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Stammdaten</div>
            <div className="admin-mandate-grid admin-mandate-grid--dense">
              <div>
                <div className="admin-table-sub">Firmenname</div>
                <div style={{ fontWeight: 600 }}>{fmtText(c.name)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Unternehmensart (company_kind)</div>
                <div>{KIND_LABEL[c.company_kind] || fmtText(c.company_kind)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Vertragsstatus</div>
                <div>{fmtText(c.contract_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Verifizierungsstatus</div>
                <div>{fmtText(c.verification_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Compliance-Status</div>
                <div>{fmtText(c.compliance_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Aktiv / Plattform-Sperre</div>
                <div>
                  {boolJaNein(c.is_active)} / <span style={{ color: c.is_blocked ? "#b91c1c" : "inherit" }}>{c.is_blocked ? "Gesperrt" : "Nicht gesperrt"}</span>
                </div>
              </div>
              <div>
                <div className="admin-table-sub">Ansprechpartner</div>
                <div>{fmtText(c.contact_name)}</div>
              </div>
              <div>
                <div className="admin-table-sub">E-Mail (Stamm)</div>
                <div>{fmtText(c.email)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Support-/Buchungs-E-Mail</div>
                <div>{fmtText(c.support_email)}</div>
              </div>
              <div>
                <div className="admin-table-sub">E-Mail (Abrechnungskonto, falls gepflegt)</div>
                <div>{data.billingAccountEmail ? data.billingAccountEmail : NA}</div>
              </div>
              <div>
                <div className="admin-table-sub">Telefon (Stamm)</div>
                <div>{fmtText(c.phone)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Disponent (Telefon)</div>
                <div>{fmtText(c.dispo_phone)}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="admin-table-sub">Adresse</div>
                <div>
                  {(() => {
                    const parts = [c.address_line1, c.address_line2, c.postal_code, c.city, c.country]
                      .map(s)
                      .filter(Boolean);
                    if (!parts.length) return NA;
                    return parts.join(", ");
                  })()}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="admin-table-sub">Rechnungsadresse</div>
                <div>
                  {(() => {
                    const name = s(c.billing_name);
                    const a1 = s(c.billing_address_line1);
                    const a2 = s(c.billing_address_line2);
                    const pc = s(c.billing_postal_code);
                    const city = s(c.billing_city);
                    const ctry = s(c.billing_country);
                    const line = [name, a1, a2, [pc, city].filter(Boolean).join(" "), ctry]
                      .filter(Boolean)
                      .join(", ");
                    return line || NA;
                  })()}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">USt-Id / Steuer-ID</div>
                <div>
                  {s(c.vat_id) || NA}
                  {s(c.tax_id) ? (
                    <span>
                      {s(c.vat_id) ? " · " : ""}
                      St.-Nr.: {c.tax_id}
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">Konzessions-/Ordnungsnr. (Stamm)</div>
                <div>{fmtText(c.concession_number)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Rechtsform / Inhaber</div>
                <div>
                  {s(c.legal_form) || NA}
                  {s(c.owner_name) ? ` · Inhaber: ${c.owner_name}` : ""}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">IBAN (Auszahlung)</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{fmtText(c.bank_iban)}</div>
              </div>
              <div>
                <div className="admin-table-sub">BIC</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{fmtText(c.bank_bic)}</div>
              </div>
            </div>
            {c.business_notes ? (
              <div style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                  Betriebsnotiz
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.business_notes}</div>
              </div>
            ) : null}
          </section>

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Abrechnung / Einnahmen</div>
            <div className="admin-mandate-kpi" style={{ marginBottom: 12 }}>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.revenueCompletedGrossAllTime)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz gesamt (abgeschlossen, Brutto Fahrpreis)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.revenueCompletedGrossCurrentMonth)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz laufender Monat (abgeschlossen, UTC)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.totalPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">ONRODA-Provision gesamt (Buchung)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.onrodaCommissionCurrentMonthEur)}</div>
                <div className="admin-mandate-kpi__lbl">ONRODA-Provision aktueller Monat (Fahrt-Anlage, UTC)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.openPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">Offene Onroda-Provision (noch nicht ausgeglichen)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.paidPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">Ausgeglichene / bezahlte Onroda-Provision (Buchung)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.total ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Fahrten gesamt</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.ridesCountCurrentMonth ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Fahrten (Anlage) aktueller Monat (UTC)</div>
              </div>
            </div>
            <p className="admin-table-sub" style={{ fontSize: 12 }}>
              Offene Sammelabrechnung: {f?.openSettlementsCount ?? 0} (Status draft/issued/approved). Werte stammen
              aus Fahrten- und `ride_financials`-Buch; ohne harte Zahlungseingänge, falls noch nicht befüllt.
            </p>
          </section>

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Fahrten im Überblick (Status)</div>
            <div className="admin-mandate-kpi">
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.openPipeline ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Offen (Warteschlange)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.active ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Aktiv (unterwegs)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.completed ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Abgeschlossen</div>
              </div>
              {c.company_kind === "hotel" ? (
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{eur(data.kpi?.voucherLimitAvailable)}</div>
                  <div className="admin-mandate-kpi__lbl">Gutschein-Restkontingent (Hotel-Codes)</div>
                </div>
              ) : null}
            </div>
          </section>

          {data.taxi ? (
            <section className="admin-panel-card" style={{ marginBottom: 16 }}>
              <div className="admin-panel-card__title">Taxi · Flotte (Plattform-Sicht)</div>
              <div className="admin-mandate-kpi">
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversTotal}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrer gesamt</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversActive}</div>
                  <div className="admin-mandate-kpi__lbl">Aktiv (Zugang aktiv)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversReady}</div>
                  <div className="admin-mandate-kpi__lbl">Einsatzbereit (Readiness)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversSuspended}</div>
                  <div className="admin-mandate-kpi__lbl">Gesperrt (Zugang)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.pScheinDeficient}</div>
                  <div className="admin-mandate-kpi__lbl">P-Schein: Nachweis/ Datum / Ablauf offen</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesTotal}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge gesamt</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesApproved}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge freigegeben</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesPendingReview}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge in Prüfung</div>
                </div>
              </div>
            </section>
          ) : null}

          {data.hotel ? (
            <section className="admin-panel-card" style={{ marginBottom: 16 }}>
              <div className="admin-panel-card__title">Hotel · Zugangscodes</div>
              <div className="admin-mandate-kpi">
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.hotel.accessCodesActive}</div>
                  <div className="admin-mandate-kpi__lbl">Aktive Codes</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.hotel.accessCodeRedemptions}</div>
                  <div className="admin-mandate-kpi__lbl">Einlösungen (Nutzungen)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{f?.openSettlementsCount ?? 0}</div>
                  <div className="admin-mandate-kpi__lbl">Offene Sammelabrechnung (s. Finanzen)</div>
                </div>
              </div>
            </section>
          ) : null}

          {data.insurer ? (
            <section className="admin-panel-card" style={{ marginBottom: 16 }}>
              <div className="admin-panel-card__title">Krankenkasse / Kassen-Mandant (Zählung, ohne Diagnosen)</div>
              <div className="admin-mandate-kpi">
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.medicalRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Art: Krankenfahrt)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.insurancePayerRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Zahler: Kasse/Insurance)</div>
                </div>
              </div>
              {data.insurer.insurerConfigKeys?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                    Konfiguration (technische Keys, o. h. Diagnose-Felder)
                  </div>
                  <code style={{ fontSize: 12, lineHeight: 1.5 }}>{data.insurer.insurerConfigKeys.join(", ")}</code>
                </div>
              ) : null}
              {data.insurer.sampleBillingReferences?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>Beispiel-Referenzen (Abrechnung)</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {data.insurer.sampleBillingReferences.map((s) => (
                      <li key={s} style={{ fontFamily: "ui-monospace, monospace" }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Dokumente (Zusammenfassung)</div>
            <ul className="admin-mandate-doclist">
              <li>
                <strong>Gewerbenachweis (Unternehmen):</strong>{" "}
                {docs?.gewerbeFilePresent ? "Datei hinterlegt" : NA}
              </li>
              <li>
                <strong>Versicherung (Unternehmen):</strong>{" "}
                {docs?.insuranceFilePresent ? "Datei hinterlegt" : NA}
              </li>
              <li>
                <strong>Konzession / Nummer in Stammdaten:</strong>{" "}
                {docs?.companyConcessionTextPresent ? s(c.concession_number) : NA}
              </li>
              {data.taxi ? (
                <>
                  <li>
                    <strong>P-Schein (Fahrer):</strong> {docs.pScheinDriversWithDocument ?? 0} mit hochgeladenem
                    Nachweis, {docs.pScheinDriversWithIssue ?? 0} mit offenem Ablauf/Nachweis-Problem
                  </li>
                  <li>
                    <strong>Fahrzeugnachweise:</strong> {docs.vehiclesWithUploadedDocs ?? 0} von{" "}
                    {docs.vehiclesTotalForDocs ?? 0} Fahrzeugen mindestens ein Dokument
                  </li>
                </>
              ) : null}
            </ul>
            <p className="admin-table-sub" style={{ fontSize: 12 }}>
              Fahrer: P-Schein-Logik wie Einsatzbereitschaft; Fahrzeuge: JSON-Upload-Liste in der Flotte.
            </p>
          </section>

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Letzte Fahrten (max. 20, jüngste zuerst)</div>
            {isInsurerLike ? (
              <p className="admin-table-sub" style={{ marginBottom: 8 }}>
                Krankenkasse: sichtbar sind Fahrt, Kostenstelle, Referenz, Status und Betrag – keine medizinischen
                Befunde.
              </p>
            ) : null}
            {!(data.recentRides && data.recentRides.length) ? (
              <p className="admin-table-sub">Keine Fahrten.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 880, width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th className="admin-mandate-th">Status</th>
                      <th className="admin-mandate-th">Anlage / Datum</th>
                      <th className="admin-mandate-th">Start</th>
                      <th className="admin-mandate-th">Ziel</th>
                      <th className="admin-mandate-th">Betrag</th>
                      <th className="admin-mandate-th">Zahlungsart</th>
                      <th className="admin-mandate-th">Fahrer</th>
                      <th className="admin-mandate-th">Kostenstelle / Ref.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRides.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-mandate-td">{r.status}</td>
                        <td className="admin-mandate-td">{fmtDateDay(r.createdAt)}</td>
                        <td className="admin-mandate-tdMono">{r.fromLabel}</td>
                        <td className="admin-mandate-tdMono">{r.toLabel}</td>
                        <td className="admin-mandate-td">{eur(r.amountEur)}</td>
                        <td className="admin-mandate-td">{r.paymentMethod || NA}</td>
                        <td className="admin-mandate-td">{r.driverLabel || NA}</td>
                        <td className="admin-mandate-td">
                          {r.costCenterId || "—"} / {r.billingReference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-panel-card">
            <div className="admin-panel-card__title">Verlauf / Audit (Panel, letzte Einträge)</div>
            {!data.panelAudit?.length ? (
              <p className="admin-table-sub">Keine protokollierten Einträge.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {data.panelAudit.map((a) => (
                  <li
                    key={a.id}
                    style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13, lineHeight: 1.45 }}
                  >
                    <strong>{fmtDate(a.createdAt)}</strong> — {a.action}
                    {a.subjectType ? (
                      <span className="admin-table-sub" style={{ marginLeft: 8 }}>
                        ({a.subjectType}
                        {a.subjectId ? `: ${a.subjectId}` : ""})
                      </span>
                    ) : null}
                    {fmtAuditMeta(a.meta) ? (
                      <div
                        className="admin-mandate-audit-meta"
                        style={{ marginTop: 4, fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                      >
                        {fmtAuditMeta(a.meta)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="admin-table-sub" style={{ marginTop: 10, fontSize: 12 }}>
              Umfasst sichtbare Panel-Metadaten (Aktion, Betroffener, ggf. Meta). Eigene Onroda-Plattform-Log-Ausbauten
              können ergänzen.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
