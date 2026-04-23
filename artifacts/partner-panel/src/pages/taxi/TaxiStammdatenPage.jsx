import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import { hasPanelModule } from "../../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

/**
 * Muss exakt der Server-`BASICS_PATCH_KEYS` + Sperrlogik entsprechen: diese Keys triggern
 * `partner_basics_locked`, sobald `profileLocked` im Backend gesetzt ist.
 */
const BASICS_LOCK_KEYS = new Set([
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
]);

const MAX = { short: 120, line: 500, name: 200, url: 2048 };

const PATCHABLE = new Set([
  ...BASICS_LOCK_KEYS,
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

function isEmptyField(v) {
  return v == null || String(v).trim() === "";
}

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

function extraFillGaps(company) {
  if (!company) return [];
  const g = [];
  if (isEmptyField(company.concessionNumber)) g.push("concessionNumber");
  if (isEmptyField(company.taxId)) g.push("taxId");
  if (isEmptyField(company.bankIban)) g.push("bankIban");
  return g;
}

function clip(s, max) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function strEq(a, b) {
  return displayValue(a) === displayValue(b);
}

function isValidEmail(s) {
  const t = String(s ?? "").trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function emptyEditForm() {
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
    concessionNumber: "",
    taxId: "",
    bankIban: "",
    supportEmail: "",
    dispoPhone: "",
    logoUrl: "",
    openingHours: "",
  };
}

function formFromCompany(company) {
  const e = emptyEditForm();
  if (!company) return e;
  for (const k of Object.keys(e)) {
    e[k] = company[k] != null ? String(company[k]) : "";
  }
  return e;
}

/** Baut den PATCH-Body: nur geänderte, fachlich erlaubte Keys (Server validiert final). */
function buildPatch(company, form, profileLocked) {
  /** @type {Record<string, string>} */
  const patch = {};

  for (const k of ["supportEmail", "dispoPhone", "logoUrl", "openingHours"]) {
    const c = k === "logoUrl" ? MAX.url : k === "openingHours" ? MAX.line : MAX.short;
    if (!strEq(form[k], company?.[k])) {
      patch[k] = clip(form[k], c);
    }
  }

  if (!profileLocked) {
    for (const k of BASICS_LOCK_KEYS) {
      if (!basicsGaps(company).includes(k)) continue;
      if (strEq(form[k], company?.[k])) continue;
      const c = k === "addressLine1" || k === "addressLine2" ? MAX.line : k === "name" ? MAX.name : MAX.short;
      patch[k] = clip(form[k], c);
    }
  }

  for (const k of ["concessionNumber", "taxId", "bankIban"]) {
    if (!isEmptyField(company?.[k])) continue;
    if (strEq(form[k], company?.[k])) continue;
    if (isEmptyField(form[k])) continue;
    patch[k] = clip(form[k], MAX.short);
  }

  return patch;
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
            title="Per PATCH, sofern API-Regeln erfüllt."
          >
            später bearbeitbar
          </span>
        ) : (
          <span
            className="panel-pill panel-pill--warn"
            style={{ fontSize: "0.72rem", fontWeight: 700, alignSelf: "flex-start", opacity: 0.9 }}
            title="Kein Self-Service-PATCH in der Partner-Route."
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

function LabeledInput({ label, value, onChange, disabled, maxLength, type = "text", multiline }) {
  return (
    <label className="panel-rides-form__field" style={{ display: "block" }}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
          rows={3}
          className="panel-rides-form__input"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
        />
      )}
    </label>
  );
}

export default function TaxiStammdatenPage() {
  const { token, user, refreshUser } = usePanelAuth();
  const canPatch = hasPerm(user?.permissions, "company.update") && hasPanelModule(user?.panelModules, "company_profile");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyEditForm());

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setErr("Nicht angemeldet.");
      return;
    }
    setErr("");
    setSaveMsg("");
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
  const profileLocked = Boolean(c?.profileLocked);
  const gaps = useMemo(() => (c ? basicsGaps(c) : []), [c]);
  const extraGaps = useMemo(() => (c ? extraFillGaps(c) : []), [c]);

  const startEdit = () => {
    if (!c || !canPatch) return;
    setForm(formFromCompany(c));
    setErr("");
    setSaveMsg("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setErr("");
    setSaveMsg("");
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!token || !c) return;
    setErr("");
    setSaveMsg("");

    const body = buildPatch(c, form, profileLocked);
    if (Object.keys(body).length === 0) {
      setErr("Keine anwendbaren Änderungen — nichts zu speichern.");
      return;
    }

    if (body.email !== undefined && !isValidEmail(body.email)) {
      setErr("Geschäftliche E-Mail: ungültiges Format.");
      return;
    }
    if (body.supportEmail !== undefined && !isValidEmail(body.supportEmail)) {
      setErr("Support-E-Mail: ungültiges Format (oder leer lassen).");
      return;
    }

    setSaving(true);
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
        if (code === "partner_basics_locked") {
          const hint = typeof data?.hint === "string" && data.hint.trim() ? ` ${data.hint}` : "";
          setErr(
            `Basis-Stammdaten sind gesperrt — Änderung nur über die Plattform-Administration oder einen vorgesehenen Änderungsantrag (Change-Request).${hint}`,
          );
        } else if (code === "email_invalid") {
          setErr("E-Mail ungültig (Serverprüfung).");
        } else if (code === "no_changes") {
          setErr("Keine anwendbaren Änderungen (z. B. schon befüllt oder leer).");
        } else if (code === "company_not_found") {
          setErr("Unternehmen nicht gefunden.");
        } else {
          setErr("Speichern fehlgeschlagen.");
        }
        return;
      }
      if (data.company) {
        setCompany(data.company);
      } else {
        await load();
      }
      setEditing(false);
      setSaveMsg("Stammdaten gespeichert.");
      void refreshUser?.();
    } catch {
      setErr("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const setF = (k) => (ev) => {
    setForm((f) => ({ ...f, [k]: ev.target.value }));
  };

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Stammdaten</h2>
      <p className="panel-page__lead">
        Quelle: <code className="panel-card__muted">GET /panel/v1/company</code> — Bearbeiten mit{" "}
        <code className="panel-card__muted">PATCH /panel/v1/company</code> (nur geänderte, erlaubte Felder).
      </p>

      {!canPatch ? (
        <p className="panel-page__warn">
          Ihr Konto hat kein Recht/Modul für „Stammdaten ändern“ (Berechtigung <code>company.update</code> und Modul{" "}
          <code>company_profile</code>).
        </p>
      ) : null}

      {canPatch && !editing && c && !loading ? (
        <p style={{ marginBottom: 12 }}>
          <button type="button" className="panel-btn" onClick={startEdit}>
            Bearbeiten
          </button>
        </p>
      ) : null}
      {editing && canPatch ? (
        <form onSubmit={onSave} style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="submit" className="panel-btn" disabled={saving} style={{ fontWeight: 800 }}>
            {saving ? "Speichert …" : "Speichern"}
          </button>
          <button type="button" className="panel-btn" onClick={cancelEdit} disabled={saving}>
            Abbrechen
          </button>
        </form>
      ) : null}

      <div className="panel-card panel-card--wide" style={{ marginBottom: 12 }}>
        <p className="panel-page__muted panel-page__muted--tight" style={{ margin: 0 }}>
          <strong>Legende Anzeigemodus:</strong> „später bearbeitbar“ = per PATCH vorgesehen. „nur Anzeige“ = kein
          Self-Service-Feld. Änderungsbedarf an rechnungs- oder umsatzsteuerrelevanten Feldern, die hier nicht per PATCH
          laufen: <strong>Änderungsprozess / Plattform (Change-Request)</strong> — kein vollständiger Antrags-Assistent
          in dieser Seite.
        </p>
      </div>

      {loading ? <p className="panel-page__lead">Firmendaten werden geladen …</p> : null}
      {err ? <p className="panel-page__warn">{err}</p> : null}
      {saveMsg ? <p className="panel-page__ok">{saveMsg}</p> : null}

      {c?.profileLocked ? (
        <div className="panel-card panel-card--wide panel-card--hint" style={{ marginBottom: 16 }}>
          <h3 className="panel-card__title">profileLocked: Basis-Felder gesperrt</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Die Felder in den Abschnitten „Firmenbasis“ und „Betriebsadresse“ (Kern) können bei aktiver Sperre nicht per
            Basis-PATCH geändert werden. Operative Felder (Support, Dispo, Logo, Öffnungszeiten) und die Erstbefüllung von
            Konzession / Steuernr. / IBAN (wenn bisher leer) bleiben dagegen in der Regel anwendbar.
          </p>
        </div>
      ) : null}

      {c && !loading && !editing ? (
        <>
          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">1. Firmenbasis</h3>
            <FieldRow label="Firmenname" value={c.name} patchable={PATCHABLE.has("name")} />
            <FieldRow label="Unternehmensart (companyKind)" value={c.companyKind} patchable={false} />
            <FieldRow label="Rechtsform" value={c.legalForm} patchable={PATCHABLE.has("legalForm")} />
            <FieldRow label="Inhaber / GF" value={c.ownerName} patchable={PATCHABLE.has("ownerName")} />
            <FieldRow
              label="Konzession (concessionNumber)"
              value={c.concessionNumber}
              patchable={PATCHABLE.has("concessionNumber")}
            />
            <FieldRow label="Steuernummer" value={c.taxId} patchable={PATCHABLE.has("taxId")} />
            <FieldRow
              label="USt-IdNr."
              value={c.vatId}
              patchable={false}
              hint="Kein PATCH in der Partner-Route; ggf. Änderung über Plattform."
            />
            <FieldRow
              label="Mandanten-ID"
              value={c.id}
              patchable={false}
              hint="Keine manuelle Bearbeitung."
            />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">2. Betriebsadresse</h3>
            <FieldRow label="Straße, Zeile 1" value={c.addressLine1} patchable={PATCHABLE.has("addressLine1")} />
            <FieldRow label="Adresszusatz" value={c.addressLine2} patchable={PATCHABLE.has("addressLine2")} />
            <FieldRow label="PLZ" value={c.postalCode} patchable={PATCHABLE.has("postalCode")} />
            <FieldRow label="Ort" value={c.city} patchable={PATCHABLE.has("city")} />
            <FieldRow label="Land" value={c.country} patchable={PATCHABLE.has("country")} />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">3. Operative Erreichbarkeit</h3>
            <FieldRow label="Ansprechpartner" value={c.contactName} patchable={PATCHABLE.has("contactName")} />
            <FieldRow label="E-Mail (Betrieb)" value={c.email} patchable={PATCHABLE.has("email")} />
            <FieldRow label="Telefon (Betrieb)" value={c.phone} patchable={PATCHABLE.has("phone")} />
            <FieldRow label="Support-E-Mail" value={c.supportEmail} patchable={PATCHABLE.has("supportEmail")} />
            <FieldRow label="Dispo-Telefon" value={c.dispoPhone} patchable={PATCHABLE.has("dispoPhone")} />
            <FieldRow label="Logo-URL" value={c.logoUrl} patchable={PATCHABLE.has("logoUrl")} />
            <FieldRow label="Öffnungszeiten (Text)" value={c.openingHours} patchable={PATCHABLE.has("openingHours")} />
            <FieldRow
              label="Betriebsnotizen (businessNotes)"
              value={c.businessNotes}
              patchable={false}
              hint="Nicht im Partner-PATCH; ggf. Plattform."
            />
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">4. Rechnung &amp; Zahlung</h3>
            <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 0 }}>
              Rechnungsstamm: in der Regel Anzeige; Anpassung außerhalb des hierigen PATCHs — siehe Plattform.
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
              patchable={PATCHABLE.has("bankIban")}
              hint="Erstbefüllung, wenn bisher leer, siehe Erstbefüllung-Block im Bearbeiten-Modus."
            />
            <FieldRow label="BIC" value={c.bankBic} patchable={false} />
            <FieldRow label="Kostenstelle" value={c.costCenter} patchable={false} />
          </div>

          <div className="panel-card panel-card--wide">
            <h3 className="panel-card__title">5. Mandats- / Systemstatus</h3>
            <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 0 }}>
              Reine Anzeige. Kein Dokumenten-Modul.
            </p>
            <FieldRow label="Basis-Stammdaten gesperrt (profileLocked)" value={c.profileLocked ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Mandant aktiv" value={c.isActive ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Gesperrt" value={c.isBlocked ? "ja" : "nein"} patchable={false} />
            <FieldRow label="Verifizierung" value={c.verificationStatus} patchable={false} />
            <FieldRow label="Compliance" value={c.complianceStatus} patchable={false} />
            <FieldRow label="Vertragsstatus" value={c.contractStatus} patchable={false} />
            <FieldRow
              label="Gewerbenachweis hinterlegt"
              value={c.hasComplianceGewerbe ? "ja" : "nein"}
              patchable={false}
            />
            <FieldRow
              label="Versicherungsnachweis hinterlegt"
              value={c.hasComplianceInsurance ? "ja" : "nein"}
              patchable={false}
            />
            <FieldRow label="Max. Fahrer" value={c.maxDrivers} patchable={false} />
            <FieldRow label="Max. Fahrzeuge" value={c.maxVehicles} patchable={false} />
          </div>
        </>
      ) : null}

      {c && !loading && editing && canPatch ? (
        <div className="panel-rides-form" style={{ maxWidth: 900 }}>
          <h3 className="panel-page__title" style={{ fontSize: "1.1rem", marginTop: 0 }}>
            Bearbeiten
          </h3>
          {profileLocked ? (
            <p className="panel-page__warn">
              Basis-„Kern“-Felder (Name, Adresse, Ansprechdaten) sind <strong>gesperrt</strong> — Eingabefelder dazu sind
              deaktiviert. Sofern nötig: <strong>Plattform / Change-Request</strong>.
            </p>
          ) : null}

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h4 className="panel-card__title">Operativ (jeweils anpassbar)</h4>
            <div className="panel-rides-form__grid">
              <LabeledInput
                label="Support-E-Mail"
                type="email"
                value={form.supportEmail}
                onChange={setF("supportEmail")}
                maxLength={MAX.short}
              />
              <LabeledInput label="Dispo-Telefon" value={form.dispoPhone} onChange={setF("dispoPhone")} maxLength={MAX.short} />
              <LabeledInput label="Logo-URL" value={form.logoUrl} onChange={setF("logoUrl")} maxLength={MAX.url} />
              <LabeledInput
                label="Öffnungszeiten"
                value={form.openingHours}
                onChange={setF("openingHours")}
                maxLength={MAX.line}
                multiline
              />
            </div>
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h4 className="panel-card__title">Firmenbasis &amp; Ansprech/Adresse (Kern, nur leere Felder, außer bei Sperre)</h4>
            {[
              { k: "name", l: "Firmenname" },
              { k: "legalForm", l: "Rechtsform" },
              { k: "ownerName", l: "Inhaber / GF" },
              { k: "contactName", l: "Ansprechpartner" },
              { k: "email", l: "E-Mail (Betrieb)", type: "email" },
              { k: "phone", l: "Telefon" },
            ].map(({ k, l, type }) => {
              const inGap = gaps.includes(k);
              const disabled = !inGap || profileLocked;
              return (
                <LabeledInput
                  key={k}
                  label={l}
                  type={type || "text"}
                  value={form[k]}
                  onChange={setF(k)}
                  disabled={disabled}
                  maxLength={k === "name" ? MAX.name : MAX.short}
                />
              );
            })}
            {["addressLine1", "addressLine2", "postalCode", "city", "country"].map((k) => {
              const inGap = gaps.includes(k);
              const disabled = !inGap || profileLocked;
              const labels = {
                addressLine1: "Straße, Zeile 1",
                addressLine2: "Adresszusatz",
                postalCode: "PLZ",
                city: "Ort",
                country: "Land",
              };
              return (
                <LabeledInput
                  key={k}
                  label={labels[k]}
                  value={form[k]}
                  onChange={setF(k)}
                  disabled={disabled}
                  maxLength={k === "addressLine1" || k === "addressLine2" ? MAX.line : MAX.short}
                />
              );
            })}
            <p className="panel-page__muted" style={{ fontSize: "0.86rem" }}>
              Deaktiviert = entweder schon in der Datenbank befüllt oder (bei Sperre) kein Self-Service-Ändern mehr. Für
              Korrektur feststehender Werte: Plattform / Change-Request.
            </p>
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h4 className="panel-card__title">Konzession, Steuernummer, IBAN (nur Erstbefüllung, wenn bisher leer)</h4>
            <p className="panel-page__muted" style={{ fontSize: "0.86rem" }}>
              Laut API auch bei <code>profileLocked</code> anwendbar, solange der jeweilige DB-Wert leer war.
            </p>
            {["concessionNumber", "taxId", "bankIban"].map((k) => {
              const inG = extraGaps.includes(k);
              const label =
                k === "concessionNumber" ? "Konzession" : k === "taxId" ? "Steuernummer" : "IBAN (eindeutig, Erstbelegung)";
              return (
                <LabeledInput
                  key={k}
                  label={label}
                  value={form[k]}
                  onChange={setF(k)}
                  disabled={!inG}
                  maxLength={MAX.short}
                />
              );
            })}
            {!extraGaps.length ? (
              <p className="panel-page__muted" style={{ fontSize: "0.86rem" }}>
                Alle drei Felder sind bereits hinterlegt — keine weitere Self-Service-Änderung per diesem Endpunkt.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
