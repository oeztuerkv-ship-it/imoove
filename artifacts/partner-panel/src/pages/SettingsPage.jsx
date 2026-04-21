import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { canAccessPartnerCompanyPage, hasPanelModule } from "../lib/panelNavigation.js";

function companyKindLabel(kind) {
  switch (kind) {
    case "taxi":
      return "Taxi / Flotte";
    case "insurer":
      return "Krankenkasse / Versicherer";
    case "hotel":
      return "Hotel";
    case "corporate":
      return "Corporate / Firma";
    case "voucher_client":
      return "Gutschein / Voucher";
    case "general":
    default:
      return "Allgemein";
  }
}

function Ro({ label, value }) {
  const v = value != null && String(value).trim() !== "" ? String(value) : "—";
  return (
    <div className="panel-ro-row">
      <div className="panel-ro-row__k">{label}</div>
      <div className="panel-ro-row__v">{v}</div>
    </div>
  );
}

function Section({ title, children, span2 }) {
  return (
    <div className={`panel-card panel-card--wide${span2 ? " panel-settings-span-2" : ""}`}>
      <h3 className="panel-settings-section-title">{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { token, user, refreshUser } = usePanelAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [company, setCompany] = useState(null);
  const [companyErr, setCompanyErr] = useState("");
  const [companyLoading, setCompanyLoading] = useState(false);

  const loadCompany = useCallback(async () => {
    if (!token || !canAccessPartnerCompanyPage(user?.panelModules)) return;
    setCompanyErr("");
    setCompanyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.company) {
        setCompanyErr("Firmendaten konnten nicht geladen werden.");
        setCompany(null);
        return;
      }
      setCompany(data.company);
    } catch {
      setCompanyErr("Firmendaten konnten nicht geladen werden.");
      setCompany(null);
    } finally {
      setCompanyLoading(false);
    }
  }, [token, user?.panelModules]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  async function onChangePassword(e) {
    e.preventDefault();
    if (!token) return;
    setMsg("");
    if (form.newPassword.length < 10) {
      setMsg("Neues Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    if (form.newPassword !== form.newPasswordRepeat) {
      setMsg("Neues Passwort und Wiederholung stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/me/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        setMsg(
          code === "invalid_current_password"
            ? "Aktuelles Passwort ist nicht korrekt."
            : code === "password_fields_invalid"
              ? "Passwort-Felder ungültig (min. 10 Zeichen)."
              : "Passwort konnte nicht geändert werden.",
        );
        return;
      }
      setMsg("Passwort erfolgreich geändert.");
      setForm({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
      await refreshUser();
    } catch {
      setMsg("Netzwerkfehler beim Passwort-Ändern.");
    } finally {
      setSaving(false);
    }
  }

  const billingLine = hasPanelModule(user?.panelModules, "billing")
    ? "Abrechnung ist in der Seitenleiste freigeschaltet."
    : "Abrechnung ist für Ihren Mandanten nicht freigeschaltet.";
  const fleetLine = hasPanelModule(user?.panelModules, "taxi_fleet")
    ? "Flotte & Fahrer in der Seitenleiste."
    : "Flotte nur für Taxi-Mandanten mit Modul „Flotte & Fahrer“.";
  const codesLine = hasPanelModule(user?.panelModules, "access_codes")
    ? "Freigabe-Codes in der Seitenleiste."
    : "Freigabe-Codes nicht freigeschaltet.";

  const addrLine = [company?.addressLine1, company?.addressLine2].filter(Boolean).join(", ");
  const billingAddr = [company?.billingAddressLine1, company?.billingAddressLine2].filter(Boolean).join(", ");

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Einstellungen</h2>
      <p className="panel-settings-intro">
        Zentrale für Ihr Unternehmen auf Onroda: Sicherheit, Konto, Stammdaten und fachliche Bereiche. Viele Punkte
        verknüpfen mit den Modulen in der Seitenleiste; kritische Vertrags- und Steuerdaten pflegt die Plattform.
      </p>
      {user?.mustChangePassword ? (
        <p className="panel-page__warn">
          Für dieses Konto ist ein Startpasswort gesetzt. Bitte jetzt ein eigenes Passwort vergeben (Bereich
          Sicherheit).
        </p>
      ) : null}

      <div className="panel-settings-grid">
        <Section title="Sicherheit">
          <p className="panel-card__muted" style={{ marginTop: 0 }}>
            Passwort für dieses Panel-Konto.
          </p>
          <form className="panel-rides-form" onSubmit={onChangePassword}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Aktuelles Passwort</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(ev) => setForm((f) => ({ ...f, currentPassword: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Neues Passwort</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={form.newPassword}
                  onChange={(ev) => setForm((f) => ({ ...f, newPassword: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Neues Passwort wiederholen</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={form.newPasswordRepeat}
                  onChange={(ev) => setForm((f) => ({ ...f, newPasswordRepeat: ev.target.value }))}
                  required
                />
              </label>
            </div>
            {msg ? (
              <p className={msg.includes("erfolgreich") ? "panel-page__ok" : "panel-page__warn"}>{msg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary" disabled={saving}>
              {saving ? "Speichern …" : "Passwort speichern"}
            </button>
          </form>
          <p className="panel-settings-placeholder" style={{ marginTop: 14 }}>
            <strong>Zwei-Faktor-Authentisierung (2FA)</strong> und <strong>Login-Historie</strong> sind für das
            Partner-Panel in Vorbereitung. Freischaltung und Auswertung erfolgen mit der ONRODA-Administration.
          </p>
        </Section>

        <Section title="Konto">
          <div className="panel-ro-section">
            <div className="panel-ro-grid">
              <Ro label="Benutzer" value={user?.username} />
              <Ro label="Rolle" value={user?.role} />
              <Ro label="Login-E-Mail" value={user?.email} />
              <Ro label="Unternehmen" value={user?.companyName} />
              <Ro label="Mandanten-Typ" value={companyKindLabel(user?.companyKind)} />
            </div>
          </div>
        </Section>

        <Section title="Unternehmensdaten" span2>
          {companyLoading ? <p className="panel-page__lead">Firmendaten werden geladen …</p> : null}
          {companyErr ? <p className="panel-page__warn">{companyErr}</p> : null}
          {company ? (
            <div className="panel-ro-section">
              <p className="panel-card__muted" style={{ marginTop: 0 }}>
                Anzeige aus der Mandantenakte. Änderungen an Vertrags- und Pflichtfeldern über die Administration bzw.
                „Meine Firma“ (operative und leere Stammdaten).
              </p>
              <h4 className="panel-card__subtitle">Basis</h4>
              <div className="panel-ro-grid">
                <Ro label="Firmenname" value={company.name} />
                <Ro label="Ansprechpartner" value={company.contactName} />
                <Ro label="Geschäftliche E-Mail" value={company.email} />
                <Ro label="Telefon" value={company.phone} />
              </div>
              <h4 className="panel-card__subtitle">Adresse</h4>
              <div className="panel-ro-grid">
                <Ro label="Straße / Zusatz" value={addrLine} />
                <Ro label="PLZ / Ort" value={[company.postalCode, company.city].filter(Boolean).join(" ")} />
                <Ro label="Land" value={company.country} />
              </div>
              <h4 className="panel-card__subtitle">Steuer &amp; Auflagen</h4>
              <div className="panel-ro-grid">
                <Ro label="Steuer-ID" value={company.taxId} />
                <Ro label="USt-IdNr." value={company.vatId} />
                <Ro label="Konzessionsnummer" value={company.concessionNumber} />
              </div>
              <h4 className="panel-card__subtitle">Rechnungsadresse</h4>
              <div className="panel-ro-grid">
                <Ro label="Rechnungsempfänger" value={company.billingName} />
                <Ro label="Straße / Zusatz" value={billingAddr} />
                <Ro label="PLZ / Ort" value={[company.billingPostalCode, company.billingCity].filter(Boolean).join(" ")} />
                <Ro label="Land" value={company.billingCountry} />
              </div>
            </div>
          ) : !companyLoading && !companyErr ? (
            <p className="panel-settings-placeholder">Keine Firmendaten (Modul „Meine Firma“ / Übersicht nicht verfügbar).</p>
          ) : null}
        </Section>

        {user?.companyKind === "taxi" ? (
          <Section title="Betrieb (Taxi)" span2>
            <p className="panel-card__muted" style={{ marginTop: 0 }}>
              Fahrzeuge, Fahrer, Nachweise und Disposition.
            </p>
            <p className="panel-settings-placeholder">
              <strong>Betriebszeiten</strong> und <strong>operative Erreichbarkeit</strong> (inkl. Logo) pflegen Sie unter{" "}
              <strong>Meine Firma</strong>. <strong>Einsatzgebiet</strong> und <strong>Annahme-Modus</strong> (auto /
              manuell) werden mit ONRODA abgestimmt und sind hier noch nicht als Schalter hinterlegt.
            </p>
            <div className="panel-settings-links">
              <span className="panel-settings-pill">{fleetLine}</span>
              <span className="panel-settings-pill">Meine Firma → Öffnungszeiten / Dispo</span>
            </div>
          </Section>
        ) : (
          <Section title="Betrieb" span2>
            <p className="panel-settings-placeholder">
              Mandanten ohne Taxi-Flotte: Fahrtenbuchung und Module richten sich nach Ihrem Vertrag (Hotel, Kasse,
              Corporate …). Details in der Seitenleiste unter Fahrten und Sonderformularen.
            </p>
          </Section>
        )}

        <Section title="Abrechnung" span2>
          <p className="panel-card__muted" style={{ marginTop: 0 }}>
            {billingLine}
          </p>
          <p className="panel-settings-placeholder">
            <strong>Auszahlungsrhythmus</strong>, <strong>Rechnungen</strong> und <strong>Provision</strong> sind
            mandantenindividuell und werden über die Plattform-Administration bzw. den Abrechnungsbereich abgebildet —
            nicht als generische Schalter in diesem Panel.
          </p>
        </Section>

        <Section title="Codes / Gutscheine" span2>
          <p className="panel-card__muted" style={{ marginTop: 0 }}>
            {codesLine}
          </p>
          <p className="panel-settings-placeholder">
            <strong>Verwaltung und Limits</strong> (Gültigkeit, Kontingente, Kostenträger) erfolgen unter{" "}
            <strong>Freigabe-Codes</strong>, sofern freigeschaltet.
          </p>
        </Section>

        <Section title="Benachrichtigungen" span2>
          <p className="panel-settings-placeholder">
            <strong>Push, E-Mail und SMS</strong> für operative Ereignisse sind mandantenabhängig und werden mit
            ONRODA konfiguriert — hier folgen später granulare Schalter, sobald die Anbindung produktiv ist.
          </p>
        </Section>
      </div>
    </div>
  );
}
