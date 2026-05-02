import { complianceOverviewCopy } from "../../lib/partnerComplianceBucket.js";
import { formatDateDe, pScheinMeta } from "./fleetPanelHelpers.js";

function daysUntilIsoDate(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.ceil((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

/**
 * Nur Übersicht und Warnhinweise — keine Uploads (Pflege weiter unter Hauptnavigation „Dokumente“ / Fahrzeug-Fahrer-Tabs).
 *
 * @param {{
 *   dash: Record<string, unknown> | null;
 *   drivers: Record<string, unknown>[];
 *   vehicles: Record<string, unknown>[];
 *   company: Record<string, unknown> | null;
 *   loadingCompany: boolean;
 * }} props
 */
export default function FleetDocumentsTab({ dash, drivers, vehicles, company, loadingCompany }) {
  const compliance = complianceOverviewCopy(company);

  const pScheinSoon = (drivers ?? []).filter((d) => {
    const m = pScheinMeta(d.pScheinExpiry);
    if (m.tone === "danger" || m.tone === "warn") return true;
    const days = daysUntilIsoDate(d.pScheinExpiry);
    return days !== null && days >= 0 && days <= 30;
  });

  const huSoon = (vehicles ?? []).filter((v) => {
    const days = daysUntilIsoDate(v.nextInspectionDate);
    return days !== null && days >= 0 && days <= 60;
  });

  const vehiclesNeedAttention = (vehicles ?? []).filter((v) =>
    ["draft", "pending_approval", "rejected", "blocked"].includes(String(v.approvalStatus ?? "")),
  );

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Dokumente &amp; Nachweise (Übersicht)
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
        Hier sehen Sie nur eine kompakte Warnübersicht zur Flotte. Gewerbe-, Versicherungs- und sonstige Unternehmensnachweise laden und pflegen Sie unter der
        Hauptnavigation „Dokumente“. Fahrzeug-PDFs und P-Schein-Uploads bleiben bei den jeweiligen Tabs „Fahrzeuge“ bzw. „Fahrer“.
      </p>

      <div className="partner-stack partner-stack--tight" style={{ gap: 16 }}>
        <div className="partner-card" style={{ padding: 16, borderRadius: 12, border: "1px solid var(--partner-border-subtle, rgba(0,0,0,.08))" }}>
          <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
            Unternehmens-Compliance
          </h3>
          {loadingCompany ? (
            <p className="partner-muted" style={{ margin: 0 }}>
              Status wird geladen …
            </p>
          ) : (
            <>
              <p className="partner-muted" style={{ margin: "0 0 8px" }}>
                <span className={`partner-pill partner-pill--${compliance.tone === "ok" ? "ok" : compliance.tone === "pending" ? "warn" : "missing"}`}>
                  {compliance.label}
                </span>
              </p>
              <p style={{ margin: 0, lineHeight: 1.45, fontSize: 14 }}>{compliance.text}</p>
            </>
          )}
        </div>

        <div className="partner-card" style={{ padding: 16, borderRadius: 12, border: "1px solid var(--partner-border-subtle, rgba(0,0,0,.08))" }}>
          <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
            P-Schein &amp; Fahrer
          </h3>
          {dash ? (
            <p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
              <strong>{Number(dash.pScheinExpiringWithin30Days ?? 0)}</strong> Fahrer mit P-Schein-Ablauf innerhalb von 30 Tagen (laut Dashboard-Zählung).
            </p>
          ) : (
            <p className="partner-muted" style={{ margin: "0 0 8px" }}>
              Kennzahl noch nicht geladen.
            </p>
          )}
          {pScheinSoon.length === 0 ? (
            <p className="partner-muted" style={{ margin: 0 }}>
              Keine auffälligen P-Schein-Daten in der aktuellen Liste (nach Filter ggf. leer).
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
              {pScheinSoon.slice(0, 12).map((d) => (
                <li key={d.id}>
                  {d.firstName} {d.lastName}: {pScheinMeta(d.pScheinExpiry).label}
                </li>
              ))}
              {pScheinSoon.length > 12 ? <li className="partner-muted">… und weitere ({pScheinSoon.length - 12})</li> : null}
            </ul>
          )}
        </div>

        <div className="partner-card" style={{ padding: 16, borderRadius: 12, border: "1px solid var(--partner-border-subtle, rgba(0,0,0,.08))" }}>
          <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
            Fahrzeugnachweise &amp; HU
          </h3>
          {vehiclesNeedAttention.length === 0 ? (
            <p className="partner-muted" style={{ margin: "0 0 8px" }}>
              Keine Fahrzeuge mit offenem Genehmigungsstatus in der Liste.
            </p>
          ) : (
            <p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
              <strong>{vehiclesNeedAttention.length}</strong> Fahrzeug(e) mit Status Entwurf, in Prüfung, abgelehnt oder gesperrt — Details unter Tab „Fahrzeuge“.
            </p>
          )}
          {huSoon.length === 0 ? (
            <p className="partner-muted" style={{ margin: 0 }}>
              Keine HU-Termine in den nächsten 60 Tagen erkannt (oder keine Daten).
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
              {huSoon.map((v) => (
                <li key={v.id}>
                  {v.licensePlate}: HU bis {formatDateDe(v.nextInspectionDate)}
                  {(() => {
                    const days = daysUntilIsoDate(v.nextInspectionDate);
                    return days !== null && days <= 30 ? ` — in ${days} Tag(en)` : "";
                  })()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
