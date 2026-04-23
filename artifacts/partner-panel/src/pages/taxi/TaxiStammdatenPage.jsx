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

function buildPatch(company, form, profileLocked) {
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

function FieldRow({ label, value, patchable, hint }) {
  return (
    <div className="partner-kv-row">
      <div className="partner-kv-k">
        <span>{label}</span>
        {patchable ? (
          <span
            className="partner-pill partner-pill--soft"
            title="Kann geändert werden, sofern die Voraussetzungen im Konto erfüllt sind."
          >
            später bearbeitbar
          </span>
        ) : (
          <span className="partner-pill partner-pill--hold" title="Nur Anzeige; Änderungen nur über Onroda.">
            nur Anzeige
          </span>
        )}
      </div>
      <div className="partner-kv-v">
        {displayValue(value) || "—"}
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, disabled, maxLength, type = "text", multiline, wide }) {
  return (
    <label className={wide ? "partner-form-field partner-form-field--span2" : "partner-form-field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          className="partner-input"
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
          rows={3}
        />
      ) : (
        <input
          className="partner-input"
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
            `Die Basis-Stammdaten sind gesperrt. Änderungen nur über Onroda oder den vereinbarten Änderungsantrag bei der Plattform.${hint}`,
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
    <div className="partner-stack partner-stack--tight">
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Unternehmen</p>
        <h1 className="partner-page-title">Stammdaten</h1>
        <p className="partner-page-lead">
          Ihre im System hinterlegten Unternehmensdaten. Geändert werden nur die Felder, die für Ihren Zugang freigeschaltet
          sind. Sperrungen wichtiger Kernstammdaten und die Freigabe weiterer Anpassungen klären Sie bitte{" "}
          <strong>über Onroda</strong>.
        </p>
      </div>

      {!canPatch ? <p className="partner-state-warn">Für Ihr Konto ist die Bearbeitung der Stammdaten in diesem Bereich nicht freigeschaltet.</p> : null}

      {canPatch && !editing && c && !loading ? (
        <div className="partner-form-toolbar">
          <button type="button" className="partner-btn-primary" onClick={startEdit}>
            Bearbeiten
          </button>
        </div>
      ) : null}
      {editing && canPatch ? (
        <form className="partner-form-toolbar" onSubmit={onSave}>
          <button type="submit" className="partner-btn-primary" disabled={saving}>
            {saving ? "Speichert …" : "Speichern"}
          </button>
          <button type="button" className="partner-btn-secondary" onClick={cancelEdit} disabled={saving}>
            Abbrechen
          </button>
        </form>
      ) : null}

      <div className="partner-card partner-card--section">
        <p className="partner-muted" style={{ margin: 0 }}>
          <strong>Hinweise neben den Feldern:</strong> „Später bearbeitbar“ = Sie können den Wert hier setzen, sobald die
          Voraussetzungen erfüllt sind. „Nur Anzeige“ = keine Selbständerung in dieser Maske. Für sensiblere Anpassungen
          (z.&nbsp;B. Rechnungs-/USt-relevant) den <strong>Änderungsprozess über Onroda</strong> nutzen.
        </p>
      </div>

      {loading ? <p className="partner-state-loading">Firmendaten werden geladen …</p> : null}
      {err ? <p className="partner-state-error">{err}</p> : null}
      {saveMsg ? <p className="partner-state-ok">{saveMsg}</p> : null}

      {c?.profileLocked ? (
        <div className="partner-card partner-card--section partner-card--hint">
          <h2 className="partner-card__title">Basis-Stammdaten gesperrt</h2>
          <p className="partner-muted" style={{ margin: 0 }}>
            Die wichtigsten Unternehmens- und Adressdaten in „Firmenbasis“ und „Betriebsadresse“ sind gesperrt und können hier
            nicht geändert werden. Operative Angaben (Support, Dispo, Logo, Öffnungszeiten) und die <strong>Erstbefüllung</strong>{" "}
            von Konzession, Steuernummer und IBAN (falls noch leer) sind weiterhin möglich, sofern Ihr Konto das erlaubt.
          </p>
        </div>
      ) : null}

      {c && !loading && !editing ? (
        <>
          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 1</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Firmenbasis
            </h2>
            <div className="partner-kv-block">
              <FieldRow label="Firmenname" value={c.name} patchable={PATCHABLE.has("name")} />
              <FieldRow label="Unternehmensart" value={c.companyKind} patchable={false} />
              <FieldRow label="Rechtsform" value={c.legalForm} patchable={PATCHABLE.has("legalForm")} />
              <FieldRow label="Inhaber / GF" value={c.ownerName} patchable={PATCHABLE.has("ownerName")} />
              <FieldRow label="Konzession" value={c.concessionNumber} patchable={PATCHABLE.has("concessionNumber")} />
              <FieldRow label="Steuernummer" value={c.taxId} patchable={PATCHABLE.has("taxId")} />
              <FieldRow label="USt-IdNr." value={c.vatId} patchable={false} hint="Änderung nur über Onroda / Plattform." />
              <FieldRow label="Mandanten-ID" value={c.id} patchable={false} hint="Keine manuelle Bearbeitung." />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 2</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Betriebsadresse
            </h2>
            <div className="partner-kv-block">
              <FieldRow label="Straße, Zeile 1" value={c.addressLine1} patchable={PATCHABLE.has("addressLine1")} />
              <FieldRow label="Adresszusatz" value={c.addressLine2} patchable={PATCHABLE.has("addressLine2")} />
              <FieldRow label="PLZ" value={c.postalCode} patchable={PATCHABLE.has("postalCode")} />
              <FieldRow label="Ort" value={c.city} patchable={PATCHABLE.has("city")} />
              <FieldRow label="Land" value={c.country} patchable={PATCHABLE.has("country")} />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 3</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Operative Erreichbarkeit
            </h2>
            <div className="partner-kv-block">
              <FieldRow label="Ansprechpartner" value={c.contactName} patchable={PATCHABLE.has("contactName")} />
              <FieldRow label="E-Mail (Betrieb)" value={c.email} patchable={PATCHABLE.has("email")} />
              <FieldRow label="Telefon (Betrieb)" value={c.phone} patchable={PATCHABLE.has("phone")} />
              <FieldRow label="Support-E-Mail" value={c.supportEmail} patchable={PATCHABLE.has("supportEmail")} />
              <FieldRow label="Dispo-Telefon" value={c.dispoPhone} patchable={PATCHABLE.has("dispoPhone")} />
              <FieldRow label="Firmenlogo (Link)" value={c.logoUrl} patchable={PATCHABLE.has("logoUrl")} />
              <FieldRow label="Öffnungszeiten (Text)" value={c.openingHours} patchable={PATCHABLE.has("openingHours")} />
              <FieldRow label="Betriebsnotizen" value={c.businessNotes} patchable={false} hint="Nur Anzeige; Anpassung über Onroda." />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 4</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Rechnung &amp; Zahlung
            </h2>
            <p className="partner-muted" style={{ margin: "0 0 12px" }}>
              Rechnungsstamm: in der Regel nur Anzeige; Anpassung über Onroda.
            </p>
            <div className="partner-kv-block">
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
                hint="Erstbefüllung, wenn bisher leer, im Bearbeiten-Modus."
              />
              <FieldRow label="BIC" value={c.bankBic} patchable={false} />
              <FieldRow label="Kostenstelle" value={c.costCenter} patchable={false} />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 5</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Mandats- / Systemstatus
            </h2>
            <p className="partner-muted" style={{ margin: "0 0 12px" }}>
              Reine Anzeige.
            </p>
            <div className="partner-kv-block">
              <FieldRow label="Basis-Stammdaten gesperrt" value={c.profileLocked ? "ja" : "nein"} patchable={false} />
              <FieldRow label="Mandant aktiv" value={c.isActive ? "ja" : "nein"} patchable={false} />
              <FieldRow label="Gesperrt" value={c.isBlocked ? "ja" : "nein"} patchable={false} />
              <FieldRow label="Verifizierung" value={c.verificationStatus} patchable={false} />
              <FieldRow label="Compliance" value={c.complianceStatus} patchable={false} />
              <FieldRow label="Vertragsstatus" value={c.contractStatus} patchable={false} />
              <FieldRow label="Gewerbenachweis hinterlegt" value={c.hasComplianceGewerbe ? "ja" : "nein"} patchable={false} />
              <FieldRow
                label="Versicherungsnachweis hinterlegt"
                value={c.hasComplianceInsurance ? "ja" : "nein"}
                patchable={false}
              />
              <FieldRow label="Max. Fahrer" value={c.maxDrivers} patchable={false} />
              <FieldRow label="Max. Fahrzeuge" value={c.maxVehicles} patchable={false} />
            </div>
          </div>
        </>
      ) : null}

      {c && !loading && editing && canPatch ? (
        <div className="partner-form">
          <h2 className="partner-kvlist-title" style={{ margin: "0 0 8px" }}>
            Bearbeiten
          </h2>
          {profileLocked ? (
            <p className="partner-state-warn" style={{ marginTop: 0 }}>
              Basis-„Kern“-Felder (Name, Adresse, Ansprechdaten) sind <strong>gesperrt</strong> — Eingabefelder dazu sind
              deaktiviert. Weitere Anpassungen über <strong>Onroda</strong>.
            </p>
          ) : null}

          <div className="partner-card partner-card--section" style={{ marginTop: 16 }}>
            <h3 className="partner-card__title">Operativ (jeweils anpassbar)</h3>
            <div className="partner-form-grid">
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
                wide
                label="Öffnungszeiten"
                value={form.openingHours}
                onChange={setF("openingHours")}
                maxLength={MAX.line}
                multiline
              />
            </div>
          </div>

          <div className="partner-card partner-card--section" style={{ marginTop: 16 }}>
            <h3 className="partner-card__title">Firmenbasis &amp; Ansprech/Adresse (Kern, nur leere Felder, außer bei Sperre)</h3>
            <div className="partner-form-grid partner-form-grid--2-2">
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
            </div>
            <p className="partner-form-mono">
              Deaktiviert = entweder schon in der Datenbank befüllt oder (bei Sperre) kein Self-Service-Ändern mehr. Korrektur
              feststehender Werte: Onroda / vereinbarter Änderungsantrag.
            </p>
          </div>

          <div className="partner-card partner-card--section" style={{ marginTop: 16 }}>
            <h3 className="partner-card__title">Konzession, Steuernummer, IBAN (nur Erstbefüllung, wenn bisher leer)</h3>
            <p className="partner-form-mono">Auch bei gesperrten Basisdaten: einmalig ausfüllbar, wenn ein Feld bisher leer war.</p>
            <div className="partner-form-grid">
              {["concessionNumber", "taxId", "bankIban"].map((k) => {
                const inG = extraGaps.includes(k);
                const label =
                  k === "concessionNumber" ? "Konzession" : k === "taxId" ? "Steuernummer" : "IBAN (Eindeutigkeit / Erstbelegung)";
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
            </div>
            {!extraGaps.length ? (
              <p className="partner-form-mono">Alle drei Felder sind bereits hinterlegt — weitere Korrekturen bitte über Onroda.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
