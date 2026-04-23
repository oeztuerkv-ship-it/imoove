import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";

/**
 * Felder, die die Partner-API grundsätzlich per PATCH /panel/v1/company anbietet
 * (Einschränkungen: profileLocked, nur leere DB-Felder bei „Basis“ — Speichern hier nicht implementiert).
 */
const PATCHABLE_FIELD_KEYS = new Set([
  "name",
  "contactName",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "postalCode",
  "city",
  "country",
  "legalForm",
  "ownerName",
  "concessionNumber",
  "taxId",
  "bankIban",
  "supportEmail",
  "dispoPhone",
  "logoUrl",
  "openingHours",
]);

function displayValue(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "" ? "" : s;
}

/** @param {{ label: string; value: unknown; patchable: boolean; hint?: string }} props */
function FieldRow({ label, value, patchable, hint }) {
  return (
    <p className="panel-card__row" style={{ alignItems: "flex-start" }}>
      <span className="panel-card__k" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{label}</span>
        {patchable ? (
          <span
            className="panel-pill"
            style={{ fontSize: "0.72rem", fontWeight: 700, alignSelf: "flex-start", opacity: 0.85 }}
            title="Speichern folgt in einem späteren Schritt; Regeln laut API (u. a. profileLocked, nur leere Basis-Felder)."
          >
            später bearbeitbar
          </span>
        ) : (
          <span
            className="panel-pill panel-pill--warn"
            style={{ fontSize: "0.72rem", fontWeight: 700, alignSelf: "flex-start", opacity: 0.9 }}
            title="In GET /panel/v1/company enthalten; Änderung im Partner-Panel nicht über PATCH /panel/v1/company vorgesehen."
          >
            nur Anzeige
          </span>
        )}
      </span>
      <span style={{ fontWeight: 600, wordBreak: "break-word" }}>
        {displayValue(value) || "—"}
        {hint ? (
          <span className="panel-card__muted" style={{ display: "block", fontSize: "0.78rem", marginTop: 4, fontWeight: 400 }}>
            {hint}
          </span>
        ) : null}
      </span>
    </p>
  );
}

export default function TaxiStammdatenPage() {
  const { token } = usePanelAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [company, setCompany] = useState(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setErr("Nicht angemeldet.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.company) {
        setCompany(null);
        setErr(data?.error ? `Firmendaten: ${String(data.error)}` : "Firmendaten konnten nicht geladen werden.");
        return;
      }
      setCompany(data.company);
    } catch {
      setCompany(null);
      setErr("Firmendaten konnten nicht geladen werden (Netzwerk).");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const c = company;

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Stammdaten</h2>
      <p className="panel-page__lead">
        Daten aus <code className="panel-card__muted">GET /panel/v1/company</code> — Übersicht für Ihren Mandanten. Speichern
        und Bearbeitungslogik folgen separat.
      </p>

      <div className="panel-card panel-card--wide" style={{ marginBottom: 12 }}>
        <p className="panel-page__muted panel-page__muted--tight" style={{ margin: 0 }}>
          <strong>Legende:</strong> „<em>später bearbeitbar</em>“ = Feld ist in der API für{" "}
          <code>PATCH /panel/v1/company</code> vorgesehen (mit Plattform-Regeln). „<em>nur Anzeige</em>“ = hier kein
          Selbstservice-PATCH laut aktueller Routen-Definition.
        </p>
      </div>

      {loading ? <p className="panel-page__lead">Firmendaten werden geladen …</p> : null}
      {err ? <p className="panel-page__warn">{err}</p> : null}

      {!loading && c?.profileLocked ? (
        <div className="panel-card panel-card--wide panel-card--hint" style={{ marginBottom: 16 }}>
          <h3 className="panel-card__title">Basis-Stammdaten gesperrt (profileLocked)</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Wenn vollständig erfasst, sperrt das System Änderungen an den markierten Basis-Feldern im Partner-Panel. Anpassungen
            laufen dann über die Plattform-Administration bzw. den vorgesehenen Änderungsprozess — unabhängig von dieser
            Anzeigeseite.
          </p>
        </div>
      ) : null}

      {c && !loading ? (
        <>
          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">1. Firmenbasis</h3>
            <FieldRow label="Firmenname" value={c.name} patchable={PATCHABLE_FIELD_KEYS.has("name")} />
            <FieldRow label="Unternehmensart (companyKind)" value={c.companyKind} patchable={false} />
            <FieldRow label="Rechtsform" value={c.legalForm} patchable={PATCHABLE_FIELD_KEYS.has("legalForm")} />
            <FieldRow label="Inhaber / GF" value={c.ownerName} patchable={PATCHABLE_FIELD_KEYS.has("ownerName")} />
            <FieldRow
              label="Konzession (concessionNumber)"
              value={c.concessionNumber}
              patchable={PATCHABLE_FIELD_KEYS.has("concessionNumber")}
            />
            <FieldRow label="Steuernummer" value={c.taxId} patchable={PATCHABLE_FIELD_KEYS.has("taxId")} />
            <FieldRow
              label="USt-IdNr."
              value={c.vatId}
              patchable={false}
              hint="Kein vorgesehenes PATCH in der aktuellen Partner-Route; Anzeige aus GET."
            />
            <FieldRow
              label="Mandanten-ID"
              value={c.id}
              patchable={false}
              hint="Technische Kennung, keine Bearbeitung im Stammdaten-PATCH vorgesehen."
            />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">2. Betriebsadresse</h3>
            <FieldRow label="Straße, Zeile 1" value={c.addressLine1} patchable={PATCHABLE_FIELD_KEYS.has("addressLine1")} />
            <FieldRow label="Adresszusatz" value={c.addressLine2} patchable={PATCHABLE_FIELD_KEYS.has("addressLine2")} />
            <FieldRow label="PLZ" value={c.postalCode} patchable={PATCHABLE_FIELD_KEYS.has("postalCode")} />
            <FieldRow label="Ort" value={c.city} patchable={PATCHABLE_FIELD_KEYS.has("city")} />
            <FieldRow label="Land" value={c.country} patchable={PATCHABLE_FIELD_KEYS.has("country")} />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">3. Operative Erreichbarkeit</h3>
            <FieldRow label="Ansprechpartner" value={c.contactName} patchable={PATCHABLE_FIELD_KEYS.has("contactName")} />
            <FieldRow label="E-Mail (Betrieb)" value={c.email} patchable={PATCHABLE_FIELD_KEYS.has("email")} />
            <FieldRow label="Telefon (Betrieb)" value={c.phone} patchable={PATCHABLE_FIELD_KEYS.has("phone")} />
            <FieldRow label="Support-E-Mail" value={c.supportEmail} patchable={PATCHABLE_FIELD_KEYS.has("supportEmail")} />
            <FieldRow label="Dispo-Telefon" value={c.dispoPhone} patchable={PATCHABLE_FIELD_KEYS.has("dispoPhone")} />
            <FieldRow label="Logo-URL" value={c.logoUrl} patchable={PATCHABLE_FIELD_KEYS.has("logoUrl")} />
            <FieldRow label="Öffnungszeiten (Text)" value={c.openingHours} patchable={PATCHABLE_FIELD_KEYS.has("openingHours")} />
            <FieldRow
              label="Betriebsnotizen (businessNotes)"
              value={c.businessNotes}
              patchable={false}
              hint="Nicht in PanelCompanyProfilePatch der Partner-Route; nur Anzeige."
            />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">4. Rechnung &amp; Zahlung</h3>
            <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 0 }}>
              Rechnungsstamm/Adresse: Anzeige gemäß API (Pflege außerhalb des Partner-„Stammdaten“-PATCH, falls vorgesehen).
            </p>
            <FieldRow label="Rechnungsname" value={c.billingName} patchable={false} />
            <FieldRow label="Rechnung Straße, Zeile 1" value={c.billingAddressLine1} patchable={false} />
            <FieldRow label="Rechnung Adresszusatz" value={c.billingAddressLine2} patchable={false} />
            <FieldRow label="Rechnung PLZ" value={c.billingPostalCode} patchable={false} />
            <FieldRow label="Rechnung Ort" value={c.billingCity} patchable={false} />
            <FieldRow label="Rechnung Land" value={c.billingCountry} patchable={false} />
            <FieldRow
              label="IBAN"
              value={c.bankIban}
              patchable={PATCHABLE_FIELD_KEYS.has("bankIban")}
              hint="Nur einmal dargestellt; ggf. nachziehbar, wenn bisher leer (API-Regel)."
            />
            <FieldRow label="BIC" value={c.bankBic} patchable={false} />
            <FieldRow
              label="Kostenstelle (aus Mandanten-Metadaten)"
              value={c.costCenter}
              patchable={false}
              hint="Abgeleitet, kein direkter PATCH in der Partner-Route."
            />
          </div>

          <div className="panel-card panel-card--wide">
            <h3 className="panel-card__title">5. Mandats- / Systemstatus</h3>
            <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 0 }}>
              Reine Anzeige. Nachweise-Gewerbe / -Versicherung nur als vorhanden/nicht (kein Dokumenten-Modul).
            </p>
            <FieldRow label="Basis-Stammdaten gesperrt (profileLocked)" value={c.profileLocked ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Mandant aktiv (isActive)" value={c.isActive ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Gesperrt (isBlocked)" value={c.isBlocked ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Verifizierung" value={c.verificationStatus} patchable={false} />
            <FieldRow label="Compliance (Status)" value={c.complianceStatus} patchable={false} />
            <FieldRow label="Vertragsstatus" value={c.contractStatus} patchable={false} />
            <FieldRow
              label="Gewerbenachweis hinterlegt (hasComplianceGewerbe)"
              value={c.hasComplianceGewerbe ? "ja" : "nein"}
              patchable={false}
            />
            <FieldRow
              label="Versicherungsnachweis hinterlegt (hasComplianceInsurance)"
              value={c.hasComplianceInsurance ? "ja" : "nein"}
              patchable={false}
            />
            <FieldRow label="Max. Fahrer (Kontingent)" value={c.maxDrivers} patchable={false} />
            <FieldRow label="Max. Fahrzeuge (Kontingent)" value={c.maxVehicles} patchable={false} />
          </div>
        </>
      ) : null}
    </div>
  );
}
