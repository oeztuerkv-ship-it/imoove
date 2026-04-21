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

function emptyBasicsForm() {
  return {
    name: "",
    contactName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    city: "",
    country: "",
    legalForm: "",
    ownerName: "",
  };
}

function isEmptyField(v) {
  return v == null || String(v).trim() === "";
}

/** Felder, die der Partner nur ergänzen darf, wenn sie in der DB noch leer sind. */
function basicsGaps(company) {
  if (!company) return [];
  const keys = [];
  if (isEmptyField(company.name)) keys.push("name");
  if (isEmptyField(company.contactName)) keys.push("contactName");
  if (isEmptyField(company.email)) keys.push("email");
  if (isEmptyField(company.phone)) keys.push("phone");
  if (isEmptyField(company.addressLine1)) keys.push("addressLine1");
  if (isEmptyField(company.addressLine2)) keys.push("addressLine2");
  if (isEmptyField(company.postalCode)) keys.push("postalCode");
  if (isEmptyField(company.city)) keys.push("city");
  if (isEmptyField(company.country)) keys.push("country");
  if (isEmptyField(company.legalForm)) keys.push("legalForm");
  if (isEmptyField(company.ownerName)) keys.push("ownerName");
  return keys;
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
  const [basicsForm, setBasicsForm] = useState(emptyBasicsForm);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBasics, setSavingBasics] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [basicsMsg, setBasicsMsg] = useState("");

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
      setBasicsForm(emptyBasicsForm());
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

  const gaps = basicsGaps(company);

  async function onSaveBasics(e) {
    e.preventDefault();
    if (!token || !canEditOperative || gaps.length === 0) return;
    setErr("");
    setBasicsMsg("");
    setSavingBasics(true);
    const body = {};
    for (const k of gaps) {
      body[k] = basicsForm[k] ?? "";
    }
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = data?.error;
        if (code === "email_invalid") setErr("Geschäftliche E-Mail ist ungültig.");
        else if (code === "no_changes") setErr("Keine ausfüllbaren Änderungen (Felder sind schon gesetzt oder leer gelassen).");
        else if (code === "partner_basics_locked") {
          setErr("Stammdaten sind gesperrt — bitte Änderung bei der Administration beantragen.");
        } else setErr("Speichern ist fehlgeschlagen.");
        return;
      }
      setBasicsMsg("Leere Stammdaten wurden übernommen.");
      if (data.company) {
        setCompany(data.company);
        setBasicsForm(emptyBasicsForm());
      }
      await refreshUser();
    } catch {
      setErr("Speichern ist fehlgeschlagen.");
    } finally {
      setSavingBasics(false);
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

      {!loading && company?.profileLocked ? (
        <div className="panel-card panel-card--wide panel-card--hint">
          <h3 className="panel-card__title">Stammdaten-Änderungen</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Ihre Basis-Stammdaten sind vollständig erfasst und für das Partner-Panel gesperrt. Korrekturen oder Ergänzungen
            beantragen Sie bitte schriftlich (E-Mail an Ihre Ansprechperson bei ONRODA oder über den von der Administration
            genannten Kanal) — nach Freigabe werden die Daten zentral angepasst.
          </p>
        </div>
      ) : null}

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

      {!loading && company && canEditOperative && !company.profileLocked && gaps.length > 0 ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Leere Stammdaten ergänzen</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Felder, die in Ihrer Mandantenakte noch leer sind, können Sie hier selbst eintragen. Sobald alle Basis-Felder
            ausgefüllt und gespeichert sind, sperrt das System die Stammdaten — weitere Korrekturen laufen nur noch über die
            ONRODA-Administration.
          </p>
          {basicsMsg ? <p className="panel-page__ok">{basicsMsg}</p> : null}
          <form className="panel-rides-form" onSubmit={onSaveBasics}>
            <div className="panel-rides-form__grid">
              {gaps.includes("name") ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Firmenname</span>
                  <input
                    value={basicsForm.name}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, name: ev.target.value }))}
                    autoComplete="organization"
                  />
                </label>
              ) : null}
              {gaps.includes("contactName") ? (
                <label className="panel-rides-form__field">
                  <span>Ansprechpartner</span>
                  <input
                    value={basicsForm.contactName}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, contactName: ev.target.value }))}
                    autoComplete="name"
                  />
                </label>
              ) : null}
              {gaps.includes("email") ? (
                <label className="panel-rides-form__field">
                  <span>Geschäftliche E-Mail</span>
                  <input
                    type="email"
                    value={basicsForm.email}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, email: ev.target.value }))}
                    autoComplete="email"
                  />
                </label>
              ) : null}
              {gaps.includes("phone") ? (
                <label className="panel-rides-form__field">
                  <span>Telefon</span>
                  <input
                    value={basicsForm.phone}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, phone: ev.target.value }))}
                    autoComplete="tel"
                  />
                </label>
              ) : null}
              {gaps.includes("legalForm") ? (
                <label className="panel-rides-form__field">
                  <span>Rechtsform</span>
                  <input
                    value={basicsForm.legalForm}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, legalForm: ev.target.value }))}
                  />
                </label>
              ) : null}
              {gaps.includes("ownerName") ? (
                <label className="panel-rides-form__field">
                  <span>Inhaber / Geschäftsführung</span>
                  <input
                    value={basicsForm.ownerName}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, ownerName: ev.target.value }))}
                  />
                </label>
              ) : null}
              {gaps.includes("addressLine1") ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Straße + Hausnummer</span>
                  <input
                    value={basicsForm.addressLine1}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, addressLine1: ev.target.value }))}
                    autoComplete="street-address"
                  />
                </label>
              ) : null}
              {gaps.includes("addressLine2") ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Adresszusatz</span>
                  <input
                    value={basicsForm.addressLine2}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, addressLine2: ev.target.value }))}
                  />
                </label>
              ) : null}
              {gaps.includes("postalCode") ? (
                <label className="panel-rides-form__field">
                  <span>PLZ</span>
                  <input
                    value={basicsForm.postalCode}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, postalCode: ev.target.value }))}
                    autoComplete="postal-code"
                  />
                </label>
              ) : null}
              {gaps.includes("city") ? (
                <label className="panel-rides-form__field">
                  <span>Stadt</span>
                  <input
                    value={basicsForm.city}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, city: ev.target.value }))}
                    autoComplete="address-level2"
                  />
                </label>
              ) : null}
              {gaps.includes("country") ? (
                <label className="panel-rides-form__field">
                  <span>Land</span>
                  <input
                    value={basicsForm.country}
                    onChange={(ev) => setBasicsForm((f) => ({ ...f, country: ev.target.value }))}
                    autoComplete="country-name"
                  />
                </label>
              ) : null}
            </div>
            <div className="panel-profile-actions">
              <button type="submit" className="panel-btn-primary" disabled={savingBasics}>
                {savingBasics ? "Speichern …" : "Leere Felder speichern"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {!loading && company ? (
        <div className="panel-card panel-card--wide panel-card--readonly-master">
          <h3 className="panel-card__title">Stammdaten (nur Anzeige)</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Diese Angaben stammen aus der von der Plattform gepflegten Mandantenakte und sind im Partner-Panel nicht editierbar
            {company.profileLocked ? " (Stammdaten nach Erstvollständigung gesperrt)." : "."}
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
