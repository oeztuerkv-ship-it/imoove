import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import { hasPanelModule } from "../../lib/panelNavigation.js";
import { PARTNER_SUPPORT_EMAIL } from "../../lib/partnerSupportEmail.js";
import { complianceBucketFromCompany, complianceKpiLabelAndClass } from "../../lib/partnerComplianceBucket.js";

function mailtoStammChangeRequest(company) {
  const id = company?.id != null ? String(company.id) : "";
  const sub = encodeURIComponent(`Stammdaten-Änderung Taxi-Panel (${id || "Mandant"})`);
  const body = encodeURIComponent(
    `Guten Tag,\n\nbitte folgende Änderung an unseren Taxi-Stammdaten (Mandanten-ID: ${id || "—"}):\n\n[Bitte kurz beschreiben]\n\nMit freundlichen Grüßen`,
  );
  return `mailto:${PARTNER_SUPPORT_EMAIL}?subject=${sub}&body=${body}`;
}

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

/** Immer im Bearbeiten-Modus änderbar (kein Zusatzlabel in der Ansicht). */
const OPERATIVE_ALWAYS_EDIT_KEYS = new Set(["supportEmail", "dispoPhone", "logoUrl", "openingHours"]);

/** Erstbefüllung wenn leer; nach Wert-Setzung nur noch per Anfrage (Server: nur `isDbEmpty`). */
const EXTRA_FIRST_FILL_KEYS = new Set(["concessionNumber", "taxId", "bankIban"]);

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

/**
 * Badge in der Nur-Lese-Tabelle: leer + frei editierbar → kein Badge.
 * Gesetzt bzw. gesperrt → „Änderung nur über Anfrage möglich“.
 * Nicht im Panel änderbar → „Nur Anzeige“.
 */
function fieldReadOnlyBadge(fieldKey, company) {
  if (!company || fieldKey == null) return null;

  if (!PATCHABLE.has(fieldKey)) {
    return {
      className: "partner-pill partner-pill--soft partner-pill--sentence",
      text: "Nur Anzeige",
      title: "Keine Selbständerung in dieser Maske.",
    };
  }

  if (OPERATIVE_ALWAYS_EDIT_KEYS.has(fieldKey)) {
    return null;
  }

  const profileLocked = Boolean(company.profileLocked);

  if (EXTRA_FIRST_FILL_KEYS.has(fieldKey)) {
    if (isEmptyField(company[fieldKey])) return null;
    return {
      className: "partner-pill partner-pill--request partner-pill--sentence",
      text: "Änderung nur über Anfrage möglich",
      title: "Wert ist gesetzt. Anpassung nur über den Änderungsprozess bei Onroda.",
    };
  }

  if (BASICS_LOCK_KEYS.has(fieldKey)) {
    if (profileLocked) {
      return {
        className: "partner-pill partner-pill--request partner-pill--sentence",
        text: "Änderung nur über Anfrage möglich",
        title: "Basisdaten sind gesperrt. Änderung nur über den Änderungsprozess bei Onroda.",
      };
    }
    if (basicsGaps(company).includes(fieldKey)) return null;
    return {
      className: "partner-pill partner-pill--request partner-pill--sentence",
      text: "Änderung nur über Anfrage möglich",
      title: "Wert ist gesetzt. Weitere Änderung nur über den Änderungsprozess bei Onroda.",
    };
  }

  return null;
}

function FieldRow({ label, value, company, fieldKey, hint }) {
  const badge = company && fieldKey != null ? fieldReadOnlyBadge(fieldKey, company) : null;
  return (
    <div className="partner-kv-row">
      <div className="partner-kv-k">
        <span>{label}</span>
        {badge ? (
          <span className={badge.className} title={badge.title}>
            {badge.text}
          </span>
        ) : null}
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

export default function TaxiStammdatenPage({ onOpenStammSupportRequest }) {
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
  const openStammSupport = () => {
    if (typeof onOpenStammSupportRequest !== "function" || !c) return;
    const id = c.id != null ? String(c.id) : "";
    onOpenStammSupportRequest({
      category: "stammdaten",
      title: `Stammdaten-Änderung (${id || "Mandant"})`,
      body: `Guten Tag,\n\nwir bitten um folgende Änderung an unseren Taxi-Stammdaten (Mandanten-ID: ${id || "—"}):\n\n`,
    });
  };
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
          <strong>Hinweise neben den Feldern:</strong> Ohne Zusatz = im Modus „Bearbeiten“ hier änderbar bzw. einmalig
          befüllbar, solange das Feld noch leer ist. <strong>Änderung nur über Anfrage möglich</strong> = Wert ist gesetzt oder
          die Basisdaten sind gesperrt; Anpassung nur über den Änderungsprozess bei Onroda. <strong>Nur Anzeige</strong> =
          kein Selbst-Service in dieser Maske.
        </p>
      </div>

      {loading ? <p className="partner-state-loading">Firmendaten werden geladen …</p> : null}
      {err ? <p className="partner-state-error">{err}</p> : null}
      {saveMsg ? <p className="partner-state-ok">{saveMsg}</p> : null}

      {canPatch && c && !loading ? (
        <div className="partner-card partner-card--section">
          <h2 className="partner-card__title">Änderung bei gesperrten oder gesetzten Feldern</h2>
          <p className="partner-muted" style={{ margin: "0 0 16px" }}>
            Zeilen mit dem Hinweis <strong>Änderung nur über Anfrage möglich</strong> können Sie in dieser Maske nicht
            selbst anpassen. Nutzen Sie eine Anfrage im Panel oder die E-Mail — die Mandanten-ID können wir vorbelegen.
          </p>
          <div className="partner-action-row">
            {typeof onOpenStammSupportRequest === "function" ? (
              <button type="button" className="partner-btn-primary" onClick={openStammSupport}>
                Änderung im Panel anfragen
              </button>
            ) : null}
            <a className="partner-btn-secondary" href={mailtoStammChangeRequest(c)}>
              Änderung per E-Mail
            </a>
            <a className="partner-btn-secondary" href={`mailto:${PARTNER_SUPPORT_EMAIL}`}>
              Nur Kontakt ({PARTNER_SUPPORT_EMAIL})
            </a>
          </div>
        </div>
      ) : null}

      {c?.profileLocked ? (
        <div className="partner-card partner-card--section partner-card--hint">
          <h2 className="partner-card__title">Basis-Stammdaten gesperrt</h2>
          <p className="partner-muted" style={{ margin: 0 }}>
            Die wichtigsten Unternehmens- und Adressdaten in „Firmenbasis“ und „Betriebsadresse“ sind gesperrt und können hier
            nicht geändert werden. Operative Angaben (Support, Dispo, Logo, Öffnungszeiten) und die <strong>Erstbefüllung</strong>{" "}
            von Konzession, Steuernummer und IBAN (falls noch leer) sind weiterhin möglich, sofern Ihr Konto das erlaubt.
          </p>
          {canPatch ? (
            <div className="partner-action-row" style={{ marginTop: 16 }}>
              {typeof onOpenStammSupportRequest === "function" ? (
                <button type="button" className="partner-btn-primary" onClick={openStammSupport}>
                  Änderung im Panel anfragen
                </button>
              ) : null}
              <a className="partner-btn-secondary" href={mailtoStammChangeRequest(c)}>
                Änderung per E-Mail
              </a>
            </div>
          ) : null}
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
              <FieldRow label="Firmenname" value={c.name} company={c} fieldKey="name" />
              <FieldRow label="Unternehmensart" value={c.companyKind} company={c} fieldKey="companyKind" />
              <FieldRow label="Rechtsform" value={c.legalForm} company={c} fieldKey="legalForm" />
              <FieldRow label="Inhaber / GF" value={c.ownerName} company={c} fieldKey="ownerName" />
              <FieldRow label="Konzession" value={c.concessionNumber} company={c} fieldKey="concessionNumber" />
              <FieldRow label="Steuernummer" value={c.taxId} company={c} fieldKey="taxId" />
              <FieldRow label="USt-IdNr." value={c.vatId} company={c} fieldKey="vatId" hint="Änderung nur über Onroda / Plattform." />
              <FieldRow label="Mandanten-ID" value={c.id} company={c} fieldKey="id" hint="Keine manuelle Bearbeitung." />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 2</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Betriebsadresse
            </h2>
            <div className="partner-kv-block">
              <FieldRow label="Straße, Zeile 1" value={c.addressLine1} company={c} fieldKey="addressLine1" />
              <FieldRow label="Adresszusatz" value={c.addressLine2} company={c} fieldKey="addressLine2" />
              <FieldRow label="PLZ" value={c.postalCode} company={c} fieldKey="postalCode" />
              <FieldRow label="Ort" value={c.city} company={c} fieldKey="city" />
              <FieldRow label="Land" value={c.country} company={c} fieldKey="country" />
            </div>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Abschnitt 3</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
              Operative Erreichbarkeit
            </h2>
            <div className="partner-kv-block">
              <FieldRow label="Ansprechpartner" value={c.contactName} company={c} fieldKey="contactName" />
              <FieldRow label="E-Mail (Betrieb)" value={c.email} company={c} fieldKey="email" />
              <FieldRow label="Telefon (Betrieb)" value={c.phone} company={c} fieldKey="phone" />
              <FieldRow label="Support-E-Mail" value={c.supportEmail} company={c} fieldKey="supportEmail" />
              <FieldRow label="Dispo-Telefon" value={c.dispoPhone} company={c} fieldKey="dispoPhone" />
              <FieldRow label="Firmenlogo (Link)" value={c.logoUrl} company={c} fieldKey="logoUrl" />
              <FieldRow label="Öffnungszeiten (Text)" value={c.openingHours} company={c} fieldKey="openingHours" />
              <FieldRow label="Betriebsnotizen" value={c.businessNotes} company={c} fieldKey="businessNotes" hint="Anpassung über Onroda." />
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
              <FieldRow label="Rechnungsname" value={c.billingName} company={c} fieldKey="billingName" />
              <FieldRow label="Rechnung Straße, Zeile 1" value={c.billingAddressLine1} company={c} fieldKey="billingAddressLine1" />
              <FieldRow label="Rechnung Adresszusatz" value={c.billingAddressLine2} company={c} fieldKey="billingAddressLine2" />
              <FieldRow label="Rechnung PLZ" value={c.billingPostalCode} company={c} fieldKey="billingPostalCode" />
              <FieldRow label="Rechnung Ort" value={c.billingCity} company={c} fieldKey="billingCity" />
              <FieldRow label="Rechnung Land" value={c.billingCountry} company={c} fieldKey="billingCountry" />
              <FieldRow label="IBAN" value={c.bankIban} company={c} fieldKey="bankIban" />
              <FieldRow label="BIC" value={c.bankBic} company={c} fieldKey="bankBic" />
              <FieldRow label="Kostenstelle" value={c.costCenter} company={c} fieldKey="costCenter" />
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
              <FieldRow label="Basis-Stammdaten gesperrt" value={c.profileLocked ? "ja" : "nein"} company={c} fieldKey="__profileLockedDisplay" />
              <FieldRow label="Mandant aktiv" value={c.isActive ? "ja" : "nein"} company={c} fieldKey="__isActiveDisplay" />
              <FieldRow label="Gesperrt" value={c.isBlocked ? "ja" : "nein"} company={c} fieldKey="__isBlockedDisplay" />
              <FieldRow label="Verifizierung" value={c.verificationStatus} company={c} fieldKey="__verificationDisplay" />
              <FieldRow
                label="Compliance (Freigabe)"
                value={complianceKpiLabelAndClass(complianceBucketFromCompany(c)).label}
                company={c}
                fieldKey="__complianceDisplay"
                hint={`Systemstatus: ${c.complianceStatus ?? "—"}`}
              />
              <FieldRow label="Vertragsstatus" value={c.contractStatus} company={c} fieldKey="__contractDisplay" />
              <FieldRow label="Gewerbenachweis hinterlegt" value={c.hasComplianceGewerbe ? "ja" : "nein"} company={c} fieldKey="__gewerbeDisplay" />
              <FieldRow
                label="Versicherungsnachweis hinterlegt"
                value={c.hasComplianceInsurance ? "ja" : "nein"}
                company={c}
                fieldKey="__insuranceDisplay"
              />
              <FieldRow label="Max. Fahrer" value={c.maxDrivers} company={c} fieldKey="__maxDriversDisplay" />
              <FieldRow label="Max. Fahrzeuge" value={c.maxVehicles} company={c} fieldKey="__maxVehiclesDisplay" />
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
            <h3 className="partner-card__title">Firmenbasis &amp; Ansprech/Adresse (Kern)</h3>
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
              Leere Felder können Sie hier einmalig befüllen (wenn nicht deaktiviert). Ist ein Wert schon gesetzt oder sind die
              Basisdaten gesperrt, gilt: <strong>Änderung nur über Anfrage bei Onroda</strong>.
            </p>
            <div className="partner-action-row" style={{ marginTop: 12 }}>
              {typeof onOpenStammSupportRequest === "function" ? (
                <button type="button" className="partner-btn-primary partner-btn-primary--sm" onClick={openStammSupport}>
                  Änderung im Panel
                </button>
              ) : null}
              <a className="partner-btn-secondary partner-btn-primary--sm" href={mailtoStammChangeRequest(c)}>
                E-Mail
              </a>
            </div>
          </div>

          <div className="partner-card partner-card--section" style={{ marginTop: 16 }}>
            <h3 className="partner-card__title">Konzession, Steuernummer, IBAN (Erstbefüllung)</h3>
            <p className="partner-form-mono">
              Solange ein Feld noch leer ist, können Sie es hier setzen (auch bei gesperrten Basisdaten). Nach dem Speichern
              eines Werts: <strong>Änderung nur über Anfrage bei Onroda</strong>.
            </p>
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
              <p className="partner-form-mono">Alle drei Felder sind befüllt — weitere Anpassungen nur über Anfrage bei Onroda.</p>
            ) : null}
            {!extraGaps.length ? (
              <div className="partner-action-row" style={{ marginTop: 12 }}>
                {typeof onOpenStammSupportRequest === "function" ? (
                  <button type="button" className="partner-btn-primary partner-btn-primary--sm" onClick={openStammSupport}>
                    Änderung im Panel
                  </button>
                ) : null}
                <a className="partner-btn-secondary partner-btn-primary--sm" href={mailtoStammChangeRequest(c)}>
                  E-Mail
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
