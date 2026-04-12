import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function emptyCompanyForm() {
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
    vatId: "",
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
        name: c.name ?? "",
        contactName: c.contactName ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        addressLine1: c.addressLine1 ?? "",
        addressLine2: c.addressLine2 ?? "",
        postalCode: c.postalCode ?? "",
        city: c.city ?? "",
        country: c.country ?? "",
        vatId: c.vatId ?? "",
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
          name: form.name,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          postalCode: form.postalCode,
          city: form.city,
          country: form.country,
          vatId: form.vatId,
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
          name: c.name ?? "",
          contactName: c.contactName ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          addressLine1: c.addressLine1 ?? "",
          addressLine2: c.addressLine2 ?? "",
          postalCode: c.postalCode ?? "",
          city: c.city ?? "",
          country: c.country ?? "",
          vatId: c.vatId ?? "",
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
      <h2 className="panel-page__title">Profil und Firma</h2>
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
          <h3 className="panel-card__title">Unternehmensdaten</h3>
          {!canEdit ? (
            <p className="panel-page__lead">Nur Owner oder Manager dürfen Firmendaten bearbeiten.</p>
          ) : null}

          <form className="panel-rides-form" onSubmit={onSave}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Firmenname</span>
                <input
                  value={form.name}
                  onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                  required
                  disabled={!canEdit}
                  autoComplete="organization"
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Ansprechpartner</span>
                <input
                  value={form.contactName}
                  onChange={(ev) => setForm((f) => ({ ...f, contactName: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="name"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Straße, Hausnummer</span>
                <input
                  value={form.addressLine1}
                  onChange={(ev) => setForm((f) => ({ ...f, addressLine1: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="street-address"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Adresszusatz</span>
                <input
                  value={form.addressLine2}
                  onChange={(ev) => setForm((f) => ({ ...f, addressLine2: ev.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>PLZ</span>
                <input
                  value={form.postalCode}
                  onChange={(ev) => setForm((f) => ({ ...f, postalCode: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="postal-code"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Ort</span>
                <input
                  value={form.city}
                  onChange={(ev) => setForm((f) => ({ ...f, city: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="address-level2"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Land</span>
                <input
                  value={form.country}
                  onChange={(ev) => setForm((f) => ({ ...f, country: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="country-name"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Telefon (Firma)</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="tel"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>E-Mail (Firma)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                  disabled={!canEdit}
                  autoComplete="email"
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>USt-IdNr. / Steuernummer (optional)</span>
                <input
                  value={form.vatId}
                  onChange={(ev) => setForm((f) => ({ ...f, vatId: ev.target.value }))}
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
    </div>
  );
}
