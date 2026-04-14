import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function emptyCompanyForm() {
  return {
    contactName: "",
    supportEmail: "",
    dispoPhone: "",
    logoUrl: "",
    openingHours: "",
    businessNotes: "",
  };
}

export default function ProfilePage() {
  const { token, user, refreshUser } = usePanelAuth();
  const canEdit = hasPerm(user?.permissions, "company.update");

  const [form, setForm] = useState(emptyCompanyForm);
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
        setForm(emptyCompanyForm());
        return;
      }
      const c = data.company;
      setForm({
        contactName: c.contactName ?? "",
        supportEmail: c.supportEmail ?? "",
        dispoPhone: c.dispoPhone ?? "",
        logoUrl: c.logoUrl ?? "",
        openingHours: c.openingHours ?? "",
        businessNotes: c.businessNotes ?? "",
      });
    } catch {
      setErr("Firmendaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  async function onSave(e) {
    e.preventDefault();
    if (!token || !canEdit) return;
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
          contactName: form.contactName,
          supportEmail: form.supportEmail,
          dispoPhone: form.dispoPhone,
          logoUrl: form.logoUrl,
          openingHours: form.openingHours,
          businessNotes: form.businessNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = data?.error;
        if (code === "name_required") setErr("Firmenname darf nicht leer sein.");
        else if (code === "email_invalid") setErr("E-Mail-Adresse ist ungültig.");
        else if (code === "no_changes") setErr("Keine Änderungen zum Speichern.");
        else setErr("Speichern ist fehlgeschlagen.");
        return;
      }
      setOkMsg("Firmendaten wurden gespeichert.");
      if (data.company) {
        const c = data.company;
        setForm({
          contactName: c.contactName ?? "",
          supportEmail: c.supportEmail ?? "",
          dispoPhone: c.dispoPhone ?? "",
          logoUrl: c.logoUrl ?? "",
          openingHours: c.openingHours ?? "",
          businessNotes: c.businessNotes ?? "",
        });
      }
      await refreshUser();
    } catch {
      setErr("Speichern ist fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Profil und Governance</h2>
      <p className="panel-page__lead">
        Stammdaten Ihres Unternehmens aus der Datenbank. Änderungen nur für <strong>Owner</strong> und{" "}
        <strong>Manager</strong>.
      </p>

      <div className="panel-card panel-card--wide">
        <h3 className="panel-card__title">Dein Zugang</h3>
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

      {!loading ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Operative Kontaktdaten (frei änderbar)</h3>
          {!canEdit ? (
            <p className="panel-page__lead">Nur Owner oder Manager dürfen Firmendaten bearbeiten.</p>
          ) : null}

          <form className="panel-rides-form" onSubmit={onSave}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Kontaktperson</span>
                <input
                  value={form.contactName}
                  onChange={(ev) => setForm((f) => ({ ...f, contactName: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="name"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Dispo-Telefon</span>
                <input
                  value={form.dispoPhone}
                  onChange={(ev) => setForm((f) => ({ ...f, dispoPhone: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="tel"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Support-E-Mail</span>
                <input
                  type="email"
                  value={form.supportEmail}
                  onChange={(ev) => setForm((f) => ({ ...f, supportEmail: ev.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Logo-URL</span>
                <input
                  value={form.logoUrl}
                  onChange={(ev) => setForm((f) => ({ ...f, logoUrl: ev.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Öffnungszeiten</span>
                <input
                  value={form.openingHours}
                  onChange={(ev) => setForm((f) => ({ ...f, openingHours: ev.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Interne Notizen</span>
                <input
                  value={form.businessNotes}
                  onChange={(ev) => setForm((f) => ({ ...f, businessNotes: ev.target.value }))}
                  disabled={!canEdit}
                />
              </label>
            </div>
            {canEdit ? (
              <div className="panel-profile-actions">
                <button type="submit" className="panel-btn-primary" disabled={saving}>
                  {saving ? "Speichern …" : "Firmendaten speichern"}
                </button>
                <button type="button" className="panel-btn-secondary" disabled={saving} onClick={() => void loadCompany()}>
                  Zurücksetzen
                </button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      {!loading && company ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Geschützte Stammdaten (nur Admin / Änderungsantrag)</h3>
          <p className="panel-page__lead">
            Firmenname, Rechtsform, Inhaber, Steuerdaten, Konzession, offizielle Anschrift, Rechnungsdaten,
            Vertrags-/Compliance-Status und Limits sind gesperrt.
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Status</span>
            {company.verificationStatus} / {company.complianceStatus} / {company.contractStatus}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Limits</span>
            Fahrer {company.maxDrivers} · Fahrzeuge {company.maxVehicles}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Firma</span>
            {company.name}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Rechtsform</span>
            {company.legalForm || "—"}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Inhaber</span>
            {company.ownerName || "—"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
