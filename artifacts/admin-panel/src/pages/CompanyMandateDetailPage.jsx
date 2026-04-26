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

/**
 * Lese-Modell: `GET /admin/companies/:id/mandate-read` + Fahrtenliste.
 */
export default function CompanyMandateDetailPage({ companyId, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState({ items: [], total: 0, loading: true });

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

  const loadRides = useCallback(() => {
    setRides((p) => ({ ...p, loading: true }));
    const u = new URL(`${API_BASE}/admin/rides`);
    u.searchParams.set("companyId", companyId);
    u.searchParams.set("page", "1");
    u.searchParams.set("pageSize", "20");
    u.searchParams.set("sortCreated", "desc");
    fetch(u.toString(), { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setRides({ items: j.items || [], total: j.total ?? 0, loading: false });
        } else {
          setRides((p) => ({ ...p, loading: false }));
        }
      })
      .catch(() => setRides((p) => ({ ...p, loading: false })));
  }, [companyId]);

  useEffect(() => {
    loadMandate();
  }, [loadMandate]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const c = data?.company;

  return (
    <div className="admin-page" style={{ padding: "0 0 32px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <button type="button" className="admin-btn-refresh" onClick={onBack} style={{ marginBottom: 10 }}>
            ← Zur Mandantenliste
          </button>
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "var(--onroda-red, #b91c1c)" }}>
            {c?.name || "Mandantenzentrale"}
          </h1>
          <p className="admin-table-sub" style={{ margin: "6px 0 0" }}>
            Plattform-Überblick — lesend. Bearbeiten/Sperren folgen als nächster Schritt.
          </p>
        </div>
        <button type="button" className="admin-btn-refresh" onClick={() => { loadMandate(); loadRides(); }} disabled={loading}>
          Aktualisieren
        </button>
      </div>

      {err ? <div className="admin-error-banner" style={{ marginBottom: 16 }}>{err}</div> : null}
      {loading && !c ? <p className="admin-table-sub">Lade Mandantendaten …</p> : null}

      {c && data ? (
        <>
          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Stammdaten & Status</div>
            <div className="admin-mandate-grid">
              <div>
                <div className="admin-table-sub">Mandanten-ID</div>
                <div style={{ fontWeight: 600 }}>{c.id}</div>
              </div>
              <div>
                <div className="admin-table-sub">Modus (Rolle im System)</div>
                <div>{KIND_LABEL[c.company_kind] || c.company_kind}</div>
              </div>
              <div>
                <div className="admin-table-sub">Aktiv</div>
                <div>{c.is_active ? "Ja" : "Nein"}</div>
              </div>
              <div>
                <div className="admin-table-sub">Gesperrt (Plattform)</div>
                <div style={{ color: c.is_blocked ? "#b91c1c" : "inherit" }}>{c.is_blocked ? "Ja" : "Nein"}</div>
              </div>
              <div>
                <div className="admin-table-sub">Verifizierung / Compliance / Vertrag</div>
                <div>
                  {c.verification_status} · {c.compliance_status} · {c.contract_status}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">E-Mail (Stamm)</div>
                <div>{c.email || "—"}</div>
              </div>
              <div>
                <div className="admin-table-sub">Stadt</div>
                <div>{c.city || "—"}</div>
              </div>
              <div>
                <div className="admin-table-sub">IBAN (Auszahlung)</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{c.bank_iban || "—"}</div>
              </div>
            </div>
            {c.business_notes ? (
              <div style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                  Betriebsnotiz / interner Hinweis (Stammdaten)
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.business_notes}</div>
              </div>
            ) : null}
            <p className="admin-table-sub" style={{ marginTop: 12, fontSize: 12 }}>
              Partner-Panel-Module und Krankenkassen-Konfiguration werden technisch getrennt gehalten — keine klinischen Inhalte.
            </p>
          </section>

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Kennzahlen (Fahrten & Umsatz)</div>
            <div className="admin-mandate-kpi">
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.total ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Fahrten gesamt</div>
              </div>
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
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(data.rides?.revenueCompletedGross)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz (abgeschlossen, Brutto-Fahrpreis)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(data.financials?.openPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">Offene Onroda-Provision (noch nicht ausgeglichen)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.financials?.openSettlementsCount ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Offene Abrechnungsläufe (Sammelposten)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(data.kpi?.monthlyRevenue)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz laufender Kalendermonat (abgeschlossen)</div>
              </div>
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
                  <div className="admin-mandate-kpi__val">{data.taxi.driversReady}</div>
                  <div className="admin-mandate-kpi__lbl">Einsatzbereit (Readiness)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversSuspended}</div>
                  <div className="admin-mandate-kpi__lbl">Gesperrt / inaktiv (grob)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesTotal}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge gesamt</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesPendingReview}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge in Prüfung (Entwurf / Freigabe)</div>
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
                  <div className="admin-mandate-kpi__lbl">Aktive Codes (Mandant)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.hotel.accessCodeRedemptions}</div>
                  <div className="admin-mandate-kpi__lbl">Einlösungen (Summe Nutzungen)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.financials?.openSettlementsCount ?? 0}</div>
                  <div className="admin-mandate-kpi__lbl">Offene Sammelabrechnung (s. Finanzen)</div>
                </div>
              </div>
            </section>
          ) : null}

          {data.insurer ? (
            <section className="admin-panel-card" style={{ marginBottom: 16 }}>
              <div className="admin-panel-card__title">Krankenkasse / medizinischer Mandant (Zählung, ohne Diagnosen)</div>
              <div className="admin-mandate-kpi">
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.medicalRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Art: Krankenfahrt)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.insurancePayerRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Zahler: Krankenkasse)</div>
                </div>
              </div>
              {data.insurer.insurerConfigKeys?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                    Konfigurationsschlüssel (Kostenstellen/Referenzen — technisch)
                  </div>
                  <code style={{ fontSize: 12, lineHeight: 1.5 }}>{data.insurer.insurerConfigKeys.join(", ")}</code>
                </div>
              ) : null}
              {data.insurer.sampleBillingReferences?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>Beispiel Abrechnungsreferenzen (Fahrt-Metadaten)</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {data.insurer.sampleBillingReferences.map((s) => (
                      <li key={s} style={{ fontFamily: "ui-monospace, monospace" }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="admin-table-sub" style={{ marginTop: 10, fontSize: 12 }}>
                Serienfahrten / vollständige Abrechnungs-EPIC: bei Bedarf nächster Ausbau (nur technische Referenzen, keine klinischen Texte).
              </p>
            </section>
          ) : null}

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Dokumentenstatus (Compliance-Dateien)</div>
            <p>
              Gewerbe: <strong>{data.documents?.gewerbeFilePresent ? "Datei hinterlegt" : "fehlt"}</strong> ·
              Versicherung: <strong>{data.documents?.insuranceFilePresent ? "Datei hinterlegt" : "fehlt"}</strong>
            </p>
            <p className="admin-table-sub" style={{ fontSize: 12 }}>Freigabe/Ablehnung der Einzelnachweise bleibt im Bearbeiten-Fluss (folgt).</p>
          </section>

          <section className="admin-panel-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Fahrten (dieser Mandant, jüngste zuerst)</div>
            {rides.loading ? <p className="admin-table-sub">Lade Fahrten …</p> : null}
            {!rides.loading && rides.items.length === 0 ? <p className="admin-table-sub">Keine Fahrten.</p> : null}
            {rides.items.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 640, width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>ID</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>Status</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>Erstellt</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>Von</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>Nach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rides.items.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>{r.id}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>{r.status}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>{fmtDate(r.createdAt)}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>{(r.from || "").slice(0, 40)}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>{(r.to || "").slice(0, 40)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="admin-table-sub" style={{ marginTop: 8 }}>
              Gesamt Treffer: {rides.total} (erste 20)
            </p>
          </section>

          <section className="admin-panel-card">
            <div className="admin-panel-card__title">Verlauf (Panel-Audit, letzte Einträge)</div>
            {!data.panelAudit?.length ? (
              <p className="admin-table-sub">Keine protokollierten Aktionen in diesem Zeitraum.</p>
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
                  </li>
                ))}
              </ul>
            )}
            <p className="admin-table-sub" style={{ marginTop: 10, fontSize: 12 }}>
              Umfasst sichtbare Panel-/Admin-Metadaten; vollständiges Finanz-Audit siehe Finanz-Menü.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
