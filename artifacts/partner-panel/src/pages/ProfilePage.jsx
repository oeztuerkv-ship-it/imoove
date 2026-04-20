import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function emptyOperativeForm() {
  return {
    supportEmail: "",
    dispoPhone: "",
    logoUrl: "",
    openingHours: "",
  };
}

function companyKindLabel(kind) {
  switch (kind) {
    case "taxi":
      return "Taxi / Flotte";
    case "voucher_client":
      return "Gutscheinkunde";
    case "insurer":
      return "Krankenkasse / Versicherer";
    case "hotel":
      return "Hotel";
    case "corporate":
      return "Firmenkunde / Corporate";
    case "general":
    default:
      return "Allgemein";
  }
}

function RoSection({ title, children }) {
  return (
    <section className="panel-ro-section">
      <h4 className="panel-ro-section__title">{title}</h4>
      <div className="panel-ro-grid">{children}</div>
    </section>
  );
}

function RoRow({ label, value, multiline }) {
  const v = value != null && String(value).trim() !== "" ? String(value) : "—";
  return (
    <div className={`panel-ro-row${multiline ? " panel-ro-row--multiline" : ""}`}>
      <div className="panel-ro-row__k">{label}</div>
      <div className="panel-ro-row__v">{multiline && v !== "—" ? <span className="panel-ro-row__pre">{v}</span> : v}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { token, user, refreshUser } = usePanelAuth();
  const canEditOperative = hasPerm(user?.permissions, "company.update");

  const [form, setForm] = useState(emptyOperativeForm);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const loadCompany = useCallback(async () => {
    if (!token) return;
    setErr("");
    setOkMsg("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.company) {
        setErr("Firmendaten konnten nicht geladen werden.");
        setForm(emptyOperativeForm());
        setCompany(null);
        return;
      }
      const c = data.company;
      setCompany(c);
      setForm({
        supportEmail: c.supportEmail ?? "",
        dispoPhone: c.dispoPhone ?? "",
        logoUrl: c.logoUrl ?? "",
        openingHours: c.openingHours ?? "",
      });
    } catch {
      setErr("Firmendaten konnten nicht geladen werden.");
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  async function onSave(e) {
    e.preventDefault();
    if (!token || !canEditOperative) return;
    setErr("");
    setOkMsg("");
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supportEmail: form.supportEmail,
          dispoPhone: form.dispoPhone,
          logoUrl: form.logoUrl,
          openingHours: form.openingHours,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = data?.error;
        if (code === "email_invalid") setErr("Support-E-Mail ist ungültig.");
        else if (code === "no_changes") setErr("Keine Änderungen zum Speichern.");
        else setErr("Speichern ist fehlgeschlagen.");
        return;
      }
      setOkMsg("Operative Angaben wurden gespeichert.");
      if (data.company) {
        const c = data.company;
        setCompany(c);
        setForm({
          supportEmail: c.supportEmail ?? "",
          dispoPhone: c.dispoPhone ?? "",
          logoUrl: c.logoUrl ?? "",
          openingHours: c.openingHours ?? "",
        });
      }
      await refreshUser();
    } catch {
      setErr("Speichern ist fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const billingStreet = [company?.billingAddressLine1, company?.billingAddressLine2].filter(Boolean).join(", ");

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Meine Firma</h2>
      <p className="panel-page__lead">
        Stammdaten Ihres Unternehmens — vollständig einsehbar. Änderungen an Pflicht- und Vertragsdaten erfolgen durch die
        ONRODA-Administration.
      </p>

      <div className="panel-card panel-card--wide">
        <h3 className="panel-card__title">Ihr Zugang</h3>
        <p className="panel-card__row">
          <span className="panel-card__k">Benutzer</span> {user?.username ?? "—"}
        </p>
        <p className="panel-card__row">
          <span className="panel-card__k">Rolle</span> {user?.role ?? "—"}
        </p>
        <p className="panel-card__row">
          <span className="panel-card__k">E-Mail (Login)</span> {user?.email || "—"}
        </p>
      </div>

      {loading ? <p className="panel-page__lead">Firmendaten werden geladen …</p> : null}
      {err ? <p className="panel-page__warn">{err}</p> : null}
      {okMsg ? <p className="panel-page__ok">{okMsg}</p> : null}

      {!loading && company ? (
        <div className="panel-card panel-card--wide panel-card--readonly-master">
          <h3 className="panel-card__title">Stammdaten (nur Anzeige)</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Diese Angaben stammen aus der von der Plattform gepflegten Mandantenakte und sind im Partner-Panel nicht editierbar.
          </p>

          <RoSection title="Basisdaten">
            <RoRow label="Firmenname" value={company.name} />
            <RoRow label="Mandanten-ID" value={company.id} />
            <RoRow label="Rechtsform" value={company.legalForm} />
            <RoRow label="Inhaber / Geschäftsführung" value={company.ownerName} />
            <RoRow label="Ansprechpartner" value={company.contactName} />
          </RoSection>

          <RoSection title="Kontakt (geschäftlich)">
            <RoRow label="E-Mail" value={company.email} />
            <RoRow label="Telefon" value={company.phone} />
          </RoSection>

          <RoSection title="Betriebsadresse">
            <RoRow label="Straße + Hausnummer" value={company.addressLine1} />
            <RoRow label="Adresszusatz" value={company.addressLine2} />
            <RoRow label="PLZ" value={company.postalCode} />
            <RoRow label="Stadt" value={company.city} />
            <RoRow label="Land" value={company.country} />
          </RoSection>

          <RoSection title="Abrechnung">
            <RoRow label="Rechnungsname / Rechnungsempfänger" value={company.billingName} />
            <RoRow label="Rechnung: Straße + Zusatz" value={billingStreet} />
            <RoRow label="Rechnung: PLZ" value={company.billingPostalCode} />
            <RoRow label="Rechnung: Ort" value={company.billingCity} />
            <RoRow label="Rechnung: Land" value={company.billingCountry} />
            <RoRow label="Kostenstelle" value={company.costCenter} />
          </RoSection>

          <RoSection title="Bank / Zahlung">
            <RoRow label="IBAN" value={company.bankIban} />
            <RoRow label="BIC" value={company.bankBic} />
            <RoRow label="Bankname" value="— (noch kein separates Datenfeld)" />
          </RoSection>

          <RoSection title="Steuer / Pflichtangaben">
            <RoRow label="Steuer-ID" value={company.taxId} />
            <RoRow label="USt-IdNr." value={company.vatId} />
          </RoSection>

          <RoSection title="Taxi / Unternehmen">
            <RoRow label="Unternehmensart" value={companyKindLabel(company.companyKind)} />
            <RoRow label="Konzessionsnummer" value={company.concessionNumber} />
            <RoRow label="Genehmigung / Lizenz (Vermerk)" value={company.businessNotes} multiline />
          </RoSection>

          <RoSection title="Status &amp; Limits (Plattform)">
            <RoRow
              label="Verifizierung / Compliance / Vertrag"
              value={`${company.verificationStatus} · ${company.complianceStatus} · ${company.contractStatus}`}
            />
            <RoRow label="Mandant gesperrt" value={company.isBlocked ? "Ja" : "Nein"} />
            <RoRow label="Max. Fahrer / Fahrzeuge" value={`${company.maxDrivers} / ${company.maxVehicles}`} />
            <RoRow label="Gewerbe-Nachweis hinterlegt" value={company.hasComplianceGewerbe ? "Ja" : "Nein"} />
            <RoRow label="Versicherungs-Nachweis hinterlegt" value={company.hasComplianceInsurance ? "Ja" : "Nein"} />
          </RoSection>
        </div>
      ) : null}

      {!loading ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Operative Erreichbarkeit (änderbar)</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Zusätzliche Kontaktwege und Darstellung — für Owner/Manager mit Berechtigung „company.update“.
          </p>
          {!canEditOperative ? <p className="panel-page__lead">Sie haben keine Berechtigung, diese Felder zu bearbeiten.</p> : null}

          <form className="panel-rides-form" onSubmit={onSave}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Dispo-Telefon</span>
                <input
                  value={form.dispoPhone}
                  onChange={(ev) => setForm((f) => ({ ...f, dispoPhone: ev.target.value }))}
                  disabled={!canEditOperative}
                  autoComplete="tel"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Support-E-Mail</span>
                <input
                  type="email"
                  value={form.supportEmail}
                  onChange={(ev) => setForm((f) => ({ ...f, supportEmail: ev.target.value }))}
                  disabled={!canEditOperative}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Logo-URL</span>
                <input
                  value={form.logoUrl}
                  onChange={(ev) => setForm((f) => ({ ...f, logoUrl: ev.target.value }))}
                  disabled={!canEditOperative}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Öffnungszeiten</span>
                <input
                  value={form.openingHours}
                  onChange={(ev) => setForm((f) => ({ ...f, openingHours: ev.target.value }))}
                  disabled={!canEditOperative}
                />
              </label>
            </div>
            {canEditOperative ? (
              <div className="panel-profile-actions">
                <button type="submit" className="panel-btn-primary" disabled={saving}>
                  {saving ? "Speichern …" : "Speichern"}
                </button>
                <button type="button" className="panel-btn-secondary" disabled={saving} onClick={() => void loadCompany()}>
                  Zurücksetzen
                </button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
